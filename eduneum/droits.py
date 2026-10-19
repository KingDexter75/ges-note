"""Controle d'acces cote serveur (miroir de js/core/acces.js).

Le magasin du navigateur n'etait controle que cote client : un utilisateur
determine pouvait forcer un POST /api/store/ avec n'importe quel instantane.
Ce module rejoue la meme matrice de droits cote serveur, mais par DIFF : il
compare l'instantane soumis a l'etat reel de la base et n'analyse que les
collections reellement modifiees. C'est indispensable car deux collections
techniques changent a chaque ecriture, quel que soit le role :

* « journal »  : chaque mutation ajoute une entree d'audit (append-only) ;
* « sequenceur » : chaque creation incremente un compteur d'identifiants.

Sans ce traitement special, une simple saisie de note par un enseignant
serait refusee a cause de ces traces.
"""
import json

from . import models
from . import snapshot as _snapshot

ADMIN = 'admin'
DIRECTION = 'direction'
CENSEUR = 'censeur'
SURVEILLANT = 'surveillant'
ENSEIGNANT = 'enseignant'

# --- Matrice identique a acces.js : module -> roles autorises a ECRIRE -------
MODULES_ECRITURE = {
    'admin_annees': {ADMIN, DIRECTION},
    'admin_classes': {ADMIN, DIRECTION},
    'admin_matieres': {ADMIN, DIRECTION},
    'admin_eleves': {ADMIN, DIRECTION},
    'admin_personnel': {ADMIN, DIRECTION},
    'admin_inscriptions': {ADMIN, DIRECTION},
    'admin_migrations': {ADMIN, DIRECTION},
    'admin_affectations': {ADMIN, DIRECTION},
    'admin_notes': {ADMIN},
    'admin_bulletins': {ADMIN, DIRECTION},
    'admin_statistiques': {ADMIN, DIRECTION},
    'admin_assiduite': {ADMIN, DIRECTION, SURVEILLANT},
    'admin_rapports': {ADMIN, DIRECTION},
    'admin_vie_scolaire': {ADMIN, DIRECTION},
    'admin_journal': {ADMIN, DIRECTION},
    'admin_parametres': {ADMIN, DIRECTION},
    'censeur_assiduite': {CENSEUR, ADMIN, DIRECTION, SURVEILLANT},
    'censeur_vie_scolaire': {CENSEUR, ADMIN, DIRECTION},
    # La direction n'ecrit pas les notes (lecture seule sur ce module).
    'teacher_saisie': {ENSEIGNANT, ADMIN},
    'teacher_ma_classe': {ENSEIGNANT},
}

LIBELLES = {
    'admin_annees': 'Années scolaires', 'admin_classes': 'Classes',
    'admin_matieres': 'Matières', 'admin_eleves': 'Élèves',
    'admin_personnel': 'Personnel', 'admin_inscriptions': 'Inscriptions',
    'admin_migrations': 'Migrations', 'admin_affectations': 'Affectations',
    'admin_notes': 'Notes', 'admin_bulletins': 'Bulletins',
    'admin_statistiques': 'Statistiques', 'admin_assiduite': 'Assiduité',
    'admin_rapports': 'Rapports', 'admin_vie_scolaire': 'Vie scolaire',
    'admin_journal': 'Journal d\'audit', 'admin_parametres': 'Paramètres',
    'teacher_saisie': 'Saisie des notes', 'teacher_ma_classe': 'Ma classe',
}

# --- Collection d'instantane -> modules autorises a l'ecrire -----------------
# Une collection peut etre alimentee par plusieurs ecrans (ex. les
# appreciations viennent de « teacher_ma_classe » pour le professeur
# principal ET de « admin_bulletins » pour l'administration) : le role est
# accepte s'il apparait dans l'un des modules listes.
COLLECTIONS = {
    'annees': {'admin_annees'},
    'sections': {'admin_classes'},
    'classes': {'admin_classes'},
    'matieres': {'admin_matieres'},
    'coefficients': {'admin_matieres'},
    'eleves': {'admin_eleves'},
    'enseignants': {'admin_personnel'},
    'inscriptions': {'admin_inscriptions'},
    'affectations': {'admin_affectations'},
    'profsPrincipaux': {'admin_affectations'},
    'affectationsCenseurs': {'admin_affectations'},
    'sequences': {'admin_annees'},
    'notes': {'teacher_saisie', 'admin_notes'},
    'absences': {'admin_assiduite'},
    'sanctions': {'admin_vie_scolaire'},
    'disciplines': {'admin_vie_scolaire'},
    'migrations': {'admin_migrations'},
    'decisions': {'admin_bulletins'},
    'appreciations': {'admin_bulletins', 'teacher_ma_classe'},
    'bulletinsValides': {'admin_bulletins'},
    'smsLog': {'admin_parametres'},
    'parametres': {'admin_parametres'},
    'sequenceur': {'admin_parametres'},
    'journal': {'admin_journal'},
}

# Collections techniques : modifiees par toute ecriture, sans role impose.
JOURNAL = 'journal'
SEQUENCEUR = 'sequenceur'


def _refus(motif):
    return {'ok': False, 'motif': motif}


def _texte(v):
    return '' if v is None else str(v).strip()


def _canon(v):
    """Forme canonique d'une valeur, pour comparer base serveur et client.

    JSON ne distingue pas 12 de 12.0 : un FloatField Django relu a 12.0 part
    vers le navigateur en 12.0, y revient en 12, et la ligne semblait donc
    modifiee a chaque enregistrement. C'est ce faux diff qui faisait refuser
    l'ecriture des « Notes » a un surveillant general qui n'enregistrait que
    des absences. On normalise donc les nombres (int et float confondus).

    On traite aussi None et la chaine vide comme equivalents : selon le
    champ, un texte vide revient tantot None, tantot '' (ex. date et periode
    d'une absence saisie par sequence), ce qui produisait le meme faux diff.
    """
    if v is None or v == '':
        return '""'
    if isinstance(v, bool):
        return json.dumps(v)
    if isinstance(v, (int, float)):
        return 'n:%r' % float(v)
    return json.dumps(v, sort_keys=True, ensure_ascii=False, default=str)


# ---------------------------------------------------------------------------
# Detection des changements par comparaison a l'etat serveur
# ---------------------------------------------------------------------------
def _ligne_identique(ligne_db, ligne_soumis):
    """Compare deux lignes sur les seules cles presentes en base.

    Les cles supplementaires du client (calculees a l'affichage) sont
    ignorees : on ne veut pas prendre une simple relecture pour une
    modification, ce qui declencherait un faux refus de droits.
    """
    if not isinstance(ligne_soumis, dict):
        return False
    for cle, valeur in ligne_db.items():
        if _canon(ligne_soumis.get(cle)) != _canon(valeur):
            return False
    return True


def _diffs(data, courant):
    """Renvoie {collection: diff} pour les collections dont le contenu
    differe de l'etat serveur. diff = {ajoutes, modifies, supprimes,
    soumis, actuel} (ensembles d'identifiants) pour les listes."""
    diffs = {}
    for cle in COLLECTIONS:
        soumis = data.get(cle)
        actuel = courant.get(cle)
        if cle in ('parametres', SEQUENCEUR):
            if soumis is not None and _canon(soumis) != _canon(actuel):
                diffs[cle] = {'modifie': True}
            continue
        if not isinstance(soumis, list):
            continue
        if cle == 'coefficients':
            # Pas d'identifiant : comparaison ensembliste.
            a = sorted(_canon(x) for x in (actuel or []))
            s = sorted(_canon(x) for x in soumis)
            if a != s:
                diffs[cle] = {'modifie': True}
            continue
        idx_a = {_texte(x.get('id')): x for x in (actuel or [])}
        idx_s = {_texte(x.get('id')): x for x in soumis}
        ajoutes = set(idx_s) - set(idx_a)
        supprimes = set(idx_a) - set(idx_s)
        modifies = set()
        for k in set(idx_a) & set(idx_s):
            if not _ligne_identique(idx_a[k], idx_s[k]):
                modifies.add(k)
        if ajoutes or supprimes or modifies:
            diffs[cle] = {
                'ajoutes': ajoutes, 'supprimes': supprimes,
                'modifies': modifies, 'soumis': idx_s, 'actuel': idx_a,
            }
    return diffs


# ---------------------------------------------------------------------------
# Portee enseignant
# ---------------------------------------------------------------------------
def _affectations_enseignant(enseignant_id):
    """(classeId, matiereId) de toutes les affectations (non archivees)."""
    if not enseignant_id:
        return set()
    return {
        (_texte(a.classe_id), _texte(a.matiere_id))
        for a in models.Affectation.objects.filter(
            enseignant_id=enseignant_id, archive=False)
    }


def _est_prof_principal(enseignant_id, classe_id, annee_id):
    if not enseignant_id or not classe_id:
        return False
    q = models.ProfPrincipal.objects.filter(
        enseignant_id=enseignant_id, classe_id=classe_id)
    if annee_id:
        q = q.filter(annee_id=annee_id)
    return q.exists()


# ---------------------------------------------------------------------------
# Resolution d'annee / sequence / trimestre
# ---------------------------------------------------------------------------
def _annee_de_classe(classe_id, classes_soumis):
    ligne = classes_soumis.get(_texte(classe_id))
    if ligne is not None:
        return _texte(ligne.get('anneeId'))
    c = models.Classe.objects.filter(id=classe_id).first()
    return _texte(c.annee_id) if c else ''


def _annee_de_sequence(seq_id, seq_soumis):
    ligne = seq_soumis.get(_texte(seq_id))
    if ligne is not None:
        return _texte(ligne.get('anneeId'))
    s = models.Sequence.objects.filter(id=seq_id).first()
    return _texte(s.annee_id) if s else ''


def _annee_cloturee(annee_id):
    if not annee_id:
        return False
    return models.Annee.objects.filter(id=annee_id, cloturee=True).exists()


def _sequence_bloquee(seq_id, seq_soumis):
    """Renvoie un motif si la sequence est verrouillee/fermee/absente."""
    ligne = seq_soumis.get(_texte(seq_id))
    if ligne is not None:
        if ligne.get('verrouillee'):
            return 'Séquence verrouillée : modification impossible.'
        if not ligne.get('ouverte'):
            return 'Séquence fermée : modification impossible.'
        return None
    s = models.Sequence.objects.filter(id=seq_id).first()
    if s is None:
        return 'Séquence introuvable.'
    if s.verrouillee:
        return 'Séquence verrouillée : modification impossible.'
    if not s.ouverte:
        return 'Séquence fermée : modification impossible.'
    return None


def _trimestre_ferme(seq_id, data):
    """Un trimestre non ouvert bloque aussi la saisie."""
    seq = None
    lines = data.get('sequences')
    if isinstance(lines, list):
        for s in lines:
            if isinstance(s, dict) and _texte(s.get('id')) == _texte(seq_id):
                seq = s
                break
    if seq is None:
        obj = models.Sequence.objects.filter(id=seq_id).first()
        trim_id = obj.trimestre_id if obj else ''
    else:
        trim_id = _texte(seq.get('trimestreId'))
    if not trim_id:
        return False
    # Retrouve le trimestre dans les annees soumises puis en base.
    annees = data.get('annees')
    if isinstance(annees, list):
        for an in annees:
            if not isinstance(an, dict):
                continue
            for t in an.get('trimestres') or []:
                if isinstance(t, dict) and _texte(t.get('id')) == _texte(trim_id):
                    return not t.get('ouvert')
    t = models.Trimestre.objects.filter(id=trim_id).first()
    return bool(t and not t.ouvert)


# ---------------------------------------------------------------------------
# Verifications
# ---------------------------------------------------------------------------
def _annees_reactivées(data):
    """Identifiants des annees que la soumission repasse a cloturee=False
    alors qu'elles sont cloturees en base. La reactivation est un acte
    d'administration (seul un role pouvant ecrire sur 'annees' — admin ou
    direction, cf. la matrice a l'etape 1 — peut produire un tel diff) ; on
    fait donc confiance a l'etat soumis pour ces annees, sinon le debit
    verrouillerait les sequences qu'elle debloque dans le meme envoi."""
    en_base = {a.id: a.cloturee
               for a in models.Annee.objects.all()}
    ouvertes = set()
    for a in (data.get('annees') or []):
        if not isinstance(a, dict):
            continue
        an_id = _texte(a.get('id'))
        soumis_ferme = str(a.get('cloturee')).lower() in ('1', 'true', 'yes')
        if an_id and not soumis_ferme and en_base.get(an_id):
            ouvertes.add(an_id)
    return ouvertes


def _verifier_annees_cloturees(diffs, data, classes_soumis, seq_soumis):
    """Toute ecriture rattachee a une annee cloturee est refusee, quel que
    soit le role (l'historique est en lecture seule). Les annees que la
    soumission reactive explicitement (cloturee=False) echappent a la
    regle : c'est l'acte d'ouvrir l'annee, reserve a l'administration."""
    reactivées = _annees_reactivées(data)
    for cle, diff in diffs.items():
        if cle in ('annees', 'parametres', SEQUENCEUR, JOURNAL):
            continue
        soumis = diff.get('soumis') or {}
        actuel = diff.get('actuel') or {}
        touches = (diff.get('ajoutes', set()) | diff.get('modifies', set()) |
                   diff.get('supprimes', set()))
        for k in touches:
            ligne = soumis.get(k) or actuel.get(k)
            if not isinstance(ligne, dict):
                continue
            an_id = _texte(ligne.get('anneeId'))
            if not an_id and cle == 'notes':
                an_id = _annee_de_classe(ligne.get('classeId'), classes_soumis)
            if not an_id and cle in ('sanctions', 'disciplines'):
                an_id = _annee_de_sequence(ligne.get('sequenceId'), seq_soumis)
            if an_id and an_id not in reactivées and _annee_cloturee(an_id):
                return _refus(
                    'Année scolaire clôturée : toute modification de ses '
                    'données est interdite.')
    return None


def _verifier_notes(diffs, classes_soumis, seq_soumis, data):
    """Séquence verrouillee / trimestre ferme bloquent la saisie de notes."""
    diff = diffs.get('notes')
    if not diff:
        return None
    lignes = diff.get('soumis') or {}
    for k in (diff.get('ajoutes', set()) | diff.get('modifies', set())):
        ligne = lignes.get(k)
        if not isinstance(ligne, dict):
            continue
        motif = _sequence_bloquee(ligne.get('sequenceId'), seq_soumis)
        if motif:
            return _refus(motif)
        if _trimestre_ferme(ligne.get('sequenceId'), data):
            return _refus('Trimestre clôturé : modification impossible.')
    return None


def _verifier_note_enseignant(compte, diffs):
    """Un enseignant ne touche qu'aux notes de SES affectations exactes."""
    diff = diffs.get('notes')
    if not diff or compte.role != ENSEIGNANT:
        return None
    eid = compte.enseignant_id or ''
    if not eid:
        return _refus('Aucune affectation enseignante rattachée à ce compte.')
    autorisees = _affectations_enseignant(eid)
    lignes = diff.get('soumis') or {}
    actuel = diff.get('actuel') or {}
    a_controler = (diff.get('ajoutes', set()) | diff.get('modifies', set()))
    for k in a_controler:
        ligne = lignes.get(k) or {}
        cle = (_texte(ligne.get('classeId')), _texte(ligne.get('matiereId')))
        if cle not in autorisees:
            return _refus(
                'Vous n\'êtes pas affecté à cette classe/matière : saisie de '
                'notes refusée.')
    for k in diff.get('supprimes', set()):
        ligne = actuel.get(k) or {}
        cle = (_texte(ligne.get('classeId')), _texte(ligne.get('matiereId')))
        if cle not in autorisees:
            return _refus('Suppression de note hors de vos affectations.')
    return None


def _verifier_appreciations(compte, diffs):
    """Les appreciations de bulletin sont reservees au professeur principal."""
    diff = diffs.get('appreciations')
    if not diff or compte.role != ENSEIGNANT:
        return None
    eid = compte.enseignant_id or ''
    lignes = diff.get('soumis') or {}
    actuel = diff.get('actuel') or {}
    for k in (diff.get('ajoutes', set()) | diff.get('modifies', set())):
        ligne = lignes.get(k) or {}
        if not _est_prof_principal(eid, ligne.get('classeId'), ligne.get('anneeId')):
            return _refus(
                'Seul le professeur principal de la classe peut définir une '
                'appréciation.')
    for k in diff.get('supprimes', set()):
        ligne = actuel.get(k) or {}
        if not _est_prof_principal(eid, ligne.get('classeId'), ligne.get('anneeId')):
            return _refus('Suppression d\'appréciation hors de votre classe.')
    return None


def _verifier_journal(data, courant):
    """Le journal d'audit est append-only : aucune entree existante ne peut
    etre modifiee. Seules les plus anciennes peuvent disparaitre (rotation
    cote navigateur, plafonnee a 500 entrees)."""
    existants = courant.get(JOURNAL) or []
    soumis = data.get(JOURNAL) or []
    idx_ex = {_texte(j.get('id')): j for j in existants}
    idx_s = {_texte(j.get('id')): j for j in soumis}
    for jid, ligne in idx_s.items():
        if jid in idx_ex and not _ligne_identique(idx_ex[jid], ligne):
            return _refus('Journal d\'audit : entrée modifiée, opération refusée.')
    manquants = [jid for jid in idx_ex if jid not in idx_s]
    if manquants:
        ordre = [_texte(j.get('id')) for j in existants]
        prefixe = set(ordre[:len(manquants)])
        if prefixe != set(manquants):
            return _refus('Journal d\'audit : suppression d\'entrées interdite.')
        if len(existants) < 450 or len(manquants) > 150:
            return _refus('Journal d\'audit : suppression massive interdite.')
    return None


def _verifier_sequenceur(data, courant):
    """Le sequenceur ne peut que croitre : un compteur qui recule est un
    signe de trafiquage des identifiants."""
    ancien = courant.get(SEQUENCEUR) or {}
    nouveau = data.get(SEQUENCEUR) or {}
    if not isinstance(nouveau, dict):
        return _refus('Séquenceur invalide.')
    for cle, valeur in ancien.items():
        try:
            v_old = int(valeur)
        except (TypeError, ValueError):
            continue
        try:
            v_new = int(nouveau.get(cle, v_old))
        except (TypeError, ValueError):
            return _refus('Séquenceur invalide.')
        if v_new < v_old:
            return _refus('Séquenceur d\'identifiants incohérent.')
    return None


# ---------------------------------------------------------------------------
# Point d'entree
# ---------------------------------------------------------------------------
def verifier_ecriture_instantane(compte, data):
    """Renvoie None si la sauvegarde est autorisee, sinon un refus
    {ok: False, motif}. Refus par defaut : toute collection non listee ou
    tout role hors matrice est rejete."""
    role = compte.role
    if role not in (ADMIN, DIRECTION, CENSEUR, SURVEILLANT, ENSEIGNANT):
        return _refus('Rôle non autorisé.')

    courant = _snapshot.snapshot()
    diffs = _diffs(data, courant)

    # 1) Matrice : chaque collection modifiee doit accepter ce role.
    for cle, diff in diffs.items():
        if cle in (JOURNAL, SEQUENCEUR):
            continue
        modules = COLLECTIONS.get(cle)
        if not modules:
            return _refus('Collection non autorisée : %s.' % cle)
        autorise = set()
        for m in modules:
            autorise |= MODULES_ECRITURE.get(m, set())
        if role not in autorise:
            lib = LIBELLES.get(sorted(modules)[0], cle)
            return _refus(
                'Le rôle « %s » n\'a pas le droit d\'écrire sur « %s ».'
                % (role, lib))

    # 2) Collections techniques (jamais bloquantes par role).
    r = _verifier_journal(data, courant)
    if r:
        return r
    r = _verifier_sequenceur(data, courant)
    if r:
        return r

    if not diffs:
        return None  # rien a ecrire : sauvegarde inoffensive

    classes_soumis = {_texte(c.get('id')): c
                      for c in (data.get('classes') or []) if isinstance(c, dict)}
    seq_soumis = {_texte(s.get('id')): s
                  for s in (data.get('sequences') or []) if isinstance(s, dict)}

    # 3) Annees cloturees : lecture seule pour tout le monde.
    r = _verifier_annees_cloturees(diffs, data, classes_soumis, seq_soumis)
    if r:
        return r

    # 4) Sequences verrouillees / trimestres fermes.
    r = _verifier_notes(diffs, classes_soumis, seq_soumis, data)
    if r:
        return r

    # 5) Portee enseignant (notes et appreciations).
    r = _verifier_note_enseignant(compte, diffs)
    if r:
        return r
    r = _verifier_appreciations(compte, diffs)
    if r:
        return r
    return None
