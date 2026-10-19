"""Conversion base de donnees <-> instantane JSON du magasin EduNeum.

`snapshot()` produit le meme objet que le localStorage d'origine
(js/core/store.js) : le front-end continue donc de fonctionner sans etre
reecrit. `restore()` enregistre un instantsane recu du front-end.
"""
from django.db import transaction

from . import models
from .seed import PARAMETRES_DEFAUT, SEQUENCEUR_DEFAUT


def _parametres_complets(donnees):
    """Fusionne les reglages stockes par-dessus les valeurs par defaut : une
    base partielle ne prive jamais le front-end du bareme d'appreciation ou de
    la moyenne de passage (sinon les pages Parametres/Bulletins restent vides)."""
    resultat = dict(PARAMETRES_DEFAUT)
    resultat.update(donnees or {})
    return resultat


def _sequenceur_complet(sequenceur):
    resultat = dict(SEQUENCEUR_DEFAUT)
    resultat.update(sequenceur or {})
    return resultat


# Sections par defaut (FR/EN) : la section est une entite a part entiere.
SECTIONS_DEFAUT = [
    {'id': 'sec-fr', 'nom': 'Francophone'},
    {'id': 'sec-en', 'nom': 'Anglophone'},
]


# ---------------------------------------------------------------------------
# Base de donnees -> instantane JSON
# ---------------------------------------------------------------------------
def snapshot():
    annees = []
    for an in models.Annee.objects.all():
        annees.append({
            'id': an.id, 'libelle': an.libelle, 'active': an.active,
            'cloturee': an.cloturee, 'dateDebut': an.dateDebut, 'dateFin': an.dateFin,
            'trimestres': [
                {
                    'id': t.id, 'libelle': t.libelle, 'numero': t.numero,
                    'dateDebut': t.dateDebut, 'dateFin': t.dateFin,
                    'ouvert': t.ouvert, 'valide': t.valide,
                }
                for t in an.trimestres.all()
            ],
        })

    sequences = [
        {
            'id': s.id, 'anneeId': s.annee_id, 'trimestreId': s.trimestre_id,
            'numero': s.numero, 'libelle': s.libelle,
            'dateDebut': s.dateDebut, 'dateFin': s.dateFin,
            'ouverte': s.ouverte, 'verrouillee': s.verrouillee, 'validee': s.validee,
        }
        for s in models.Sequence.objects.all()
    ]

    sections = [
        {'id': s.id, 'nom': s.nom}
        for s in models.Section.objects.all()
    ]

    classes = [
        {
            'id': c.id, 'nom': c.nom, 'niveau': c.niveau, 'cycle': c.cycle,
            'section': c.section, 'sectionId': c.sectionId_id,
            'effectifMax': c.effectifMax,
            'anneeId': c.annee_id, 'archive': c.archive,
        }
        for c in models.Classe.objects.all()
    ]

    matieres = [
        {'id': m.id, 'code': m.code, 'nom': m.nom, 'noteMax': m.noteMax, 'archive': m.archive}
        for m in models.Matiere.objects.all()
    ]

    eleves = [
        {
            'id': e.id, 'matricule': e.matricule, 'nom': e.nom, 'prenom': e.prenom,
            'dateNaissance': e.dateNaissance, 'lieuNaissance': e.lieuNaissance,
            'sexe': e.sexe, 'telephone': e.telephone, 'telephoneParent': e.telephoneParent,
            'contactTuteur': e.contactTuteur, 'aptitude': e.aptitude, 'redoublant': e.redoublant,
            'photo': e.photo, 'archive': e.archive, 'dateCreation': e.dateCreation,
        }
        for e in models.Eleve.objects.all()
    ]

    enseignants = [
        {
            'id': p.id, 'matricule': p.matricule, 'nom': p.nom, 'prenom': p.prenom,
            'fonction': p.fonction, 'email': p.email, 'dateNaissance': p.dateNaissance,
            'telephone': p.telephone, 'archive': p.archive, 'dateCreation': p.dateCreation,
        }
        for p in models.Enseignant.objects.all()
    ]

    coefficients = [
        {'classeId': c.classe_id, 'matiereId': c.matiere_id, 'coefficient': c.coefficient}
        for c in models.Coefficient.objects.all()
    ]

    inscriptions = [
        {
            'id': i.id, 'eleveId': i.eleve_id, 'classeId': i.classe_id,
            'anneeId': i.annee_id, 'dateInscription': i.dateInscription,
            'statut': i.statut, 'archive': i.archive,
        }
        for i in models.Inscription.objects.all()
    ]

    affectations = [
        {
            'id': a.id, 'classeId': a.classe_id, 'matiereId': a.matiere_id,
            'enseignantId': a.enseignant_id, 'anneeId': a.annee_id, 'archive': a.archive,
        }
        for a in models.Affectation.objects.all()
    ]

    profs_principaux = [
        {'id': p.id, 'classeId': p.classe_id, 'enseignantId': p.enseignant_id, 'anneeId': p.annee_id}
        for p in models.ProfPrincipal.objects.all()
    ]

    affectations_censeurs = [
        {
            'id': a.id, 'classeId': a.classe_id, 'enseignantId': a.enseignant_id,
            'anneeId': a.annee_id,
        }
        for a in models.AffectationCenseur.objects.all()
    ]

    notes = [
        {
            'id': n['id'], 'sequenceId': n['sequence_id'], 'eleveId': n['eleve_id'],
            'classeId': n['classe_id'], 'matiereId': n['matiere_id'], 'valeur': n['valeur'],
            'statut': n['statut'], 'remarque': n['remarque'],
            'appreciation': n['appreciation'] or n['remarque'],
            'dateSaisie': n['dateSaisie'] or n['modifieLe'],
            'modifiePar': n['modifiePar'] or None, 'modifieLe': n['modifieLe'] or None,
        }
        for n in models.Note.objects.values(
            'id', 'sequence_id', 'eleve_id', 'classe_id', 'matiere_id', 'valeur',
            'statut', 'remarque', 'appreciation', 'dateSaisie', 'modifiePar', 'modifieLe')
    ]

    absences = []
    for a in models.Absence.objects.all():
        item = {
            'id': a.id, 'eleveId': a.eleve_id, 'classeId': a.classe_id,
            'anneeId': a.annee_id, 'date': a.date, 'periode': a.periode,
            'motif': a.motif, 'archive': a.archive,
            'modifiePar': a.modifiePar or None, 'modifieLe': a.modifieLe or None,
        }
        if a.sequence_id:
            item.update({'sequenceId': a.sequence_id, 'heures': a.heures,
                         'justifiees': a.justifiees, 'nonJustifiees': a.nonJustifiees})
        absences.append(item)

    sanctions = [
        {
            'id': s.id, 'sequenceId': s.sequence_id, 'eleveId': s.eleve_id,
            'classeId': s.classe_id, 'type': s.type, 'duree': s.duree, 'motif': s.motif,
            'modifiePar': s.modifiePar or None, 'modifieLe': s.modifieLe or None, 'archive': s.archive,
        }
        for s in models.Sanction.objects.all()
    ]

    disciplines = [
        {
            'id': d.id, 'eleveId': d.eleve_id, 'sequenceId': d.sequence_id,
            'heures_nj': d.heures_nj, 'heures_j': d.heures_j,
            'avertissement': d.avertissement, 'blame': d.blame,
            'exclusion_jours': d.exclusion_jours,
        }
        for d in models.Discipline.objects.all()
    ]

    migrations = [
        {
            'id': m.id, 'type': m.type, 'eleveId': m.eleve_id,
            'deClasseId': m.deClasse_id, 'versClasseId': m.versClasse_id,
            'anneeId': m.annee_id, 'decision': m.decision or None, 'motif': m.motif,
            'auteurId': m.auteurId or None, 'date': m.date,
        }
        for m in models.MigrationEleve.objects.all()
    ]

    decisions = [
        {
            'id': d.id, 'eleveId': d.eleve_id, 'anneeId': d.annee_id,
            'decision': d.decision, 'moyenneAnnuelle': d.moyenneAnnuelle,
            'modifiePar': d.modifiePar or None, 'modifieLe': d.modifieLe or None,
        }
        for d in models.Decision.objects.all()
    ]

    appreciations = [
        {
            'id': a.id, 'eleveId': a.eleve_id, 'classeId': a.classe_id,
            'anneeId': a.annee_id, 'periode': a.periode, 'texte': a.texte,
            'conduite': a.conduite, 'auteurId': a.auteurId or None, 'date': a.date,
        }
        for a in models.Appreciation.objects.all()
    ]

    bulletins_valides = [
        {
            'id': b.id, 'cle': b.cle, 'classeId': b.classe_id, 'anneeId': b.annee_id,
            'periode': b.periode, 'date': b.date, 'validePar': b.validePar or None,
        }
        for b in models.BulletinValide.objects.all()
    ]

    journal = [
        {
            'id': j.id, 'date': j.date, 'action': j.action, 'cible': j.cible or None,
            'details': j.details or None, 'auteurId': j.auteurId or None,
        }
        for j in models.JournalEntry.objects.all()
    ]

    sms_log = [
        {
            'id': s.id, 'destinataire': s.destinataire, 'message': s.message,
            'date': s.date, 'statut': s.statut, 'modifiePar': s.modifiePar or None,
        }
        for s in models.SmsLog.objects.all()
    ]

    param = models.Parametres.charger()
    return {
        'version': 4,
        'annees': annees,
        'sections': sections,
        'classes': classes,
        'matieres': matieres,
        'eleves': eleves,
        'enseignants': enseignants,
        'coefficients': coefficients,
        'inscriptions': inscriptions,
        'affectations': affectations,
        'affectationsCenseurs': affectations_censeurs,
        'sequences': sequences,
        'notes': notes,
        'absences': absences,
        'sanctions': sanctions,
        'disciplines': disciplines,
        'migrations': migrations,
        'profsPrincipaux': profs_principaux,
        'decisions': decisions,
        'appreciations': appreciations,
        'bulletinsValides': bulletins_valides,
        'journal': journal,
        'smsLog': sms_log,
        'parametres': _parametres_complets(param.donnees),
        'sequenceur': _sequenceur_complet(param.sequenceur),
    }


# ---------------------------------------------------------------------------
# Instantane JSON -> base de donnees
# ---------------------------------------------------------------------------
def _texte(v):
    return '' if v is None else str(v)


def _bool(v):
    return bool(v)


def _nombre(v):
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _entier(v, defaut=0):
    n = _nombre(v)
    return int(n) if n is not None else defaut


def _bulk_creer(model, objets, taille=500):
    """Insertion groupee : un instantane de test peut contenir des dizaines de
    milliers de notes, une creation ligne a ligne serait tres lente."""
    for debut in range(0, len(objets), taille):
        model.objects.bulk_create(objets[debut:debut + taille])


def _wipe():
    # Ordre inverse des dependances.
    models.JournalEntry.objects.all().delete()
    models.SmsLog.objects.all().delete()
    models.BulletinValide.objects.all().delete()
    models.Appreciation.objects.all().delete()
    models.Decision.objects.all().delete()
    models.MigrationEleve.objects.all().delete()
    models.Discipline.objects.all().delete()
    models.Sanction.objects.all().delete()
    models.Absence.objects.all().delete()
    models.Note.objects.all().delete()
    models.AffectationCenseur.objects.all().delete()
    models.ProfPrincipal.objects.all().delete()
    models.Affectation.objects.all().delete()
    models.Inscription.objects.all().delete()
    models.Coefficient.objects.all().delete()
    models.Sequence.objects.all().delete()
    models.Trimestre.objects.all().delete()
    models.Classe.objects.all().delete()
    models.Section.objects.all().delete()
    models.Matiere.objects.all().delete()
    models.Eleve.objects.all().delete()
    models.Enseignant.objects.all().delete()
    models.Annee.objects.all().delete()
    models.Parametres.objects.all().delete()


@transaction.atomic
def _restore_complet(data):
    if not isinstance(data, dict):
        raise ValueError("L'instantane doit etre un objet JSON.")

    _wipe()

    sections = data.get('sections') or SECTIONS_DEFAUT
    for s in sections:
        models.Section.objects.create(id=_texte(s.get('id')), nom=_texte(s.get('nom')))
    # Index nom -> id et id valides, pour rattacher chaque classe a sa section.
    section_par_nom = {(s.get('nom') or '').strip().lower(): _texte(s.get('id')) for s in sections}
    sections_valides = {_texte(s.get('id')) for s in sections}
    section_defaut = _texte(sections[0].get('id')) if sections else None

    def _section_pour(c):
        sid = _texte(c.get('sectionId'))
        if sid and sid in sections_valides:
            return sid
        nom = (_texte(c.get('section')) or 'francophone').strip().lower()
        return section_par_nom.get(nom, section_defaut)

    for a in data.get('annees', []):
        models.Annee.objects.create(
            id=_texte(a.get('id')), libelle=_texte(a.get('libelle')),
            active=_bool(a.get('active')), cloturee=_bool(a.get('cloturee')),
            dateDebut=_texte(a.get('dateDebut')), dateFin=_texte(a.get('dateFin')),
        )
        for t in a.get('trimestres', []):
            models.Trimestre.objects.create(
                id=_texte(t.get('id')), annee_id=_texte(a.get('id')),
                libelle=_texte(t.get('libelle')), numero=_entier(t.get('numero'), 1),
                dateDebut=_texte(t.get('dateDebut')), dateFin=_texte(t.get('dateFin')),
                ouvert=_bool(t.get('ouvert')), valide=_bool(t.get('valide')),
            )

    for m in data.get('matieres', []):
        models.Matiere.objects.create(
            id=_texte(m.get('id')), code=_texte(m.get('code')), nom=_texte(m.get('nom')),
            noteMax=_entier(m.get('noteMax'), 20), archive=_bool(m.get('archive')),
        )

    for c in data.get('classes', []):
        models.Classe.objects.create(
            id=_texte(c.get('id')), nom=_texte(c.get('nom')), niveau=_texte(c.get('niveau')),
            cycle=_texte(c.get('cycle')), section=_texte(c.get('section')) or 'francophone',
            sectionId_id=_section_pour(c),
            effectifMax=_entier(c.get('effectifMax'), 30), annee_id=_texte(c.get('anneeId')),
            archive=_bool(c.get('archive')),
        )

    _bulk_creer(models.Eleve, [
        models.Eleve(
            id=_texte(e.get('id')), matricule=_texte(e.get('matricule')), nom=_texte(e.get('nom')),
            prenom=_texte(e.get('prenom')), dateNaissance=_texte(e.get('dateNaissance')),
            lieuNaissance=_texte(e.get('lieuNaissance')), sexe=_texte(e.get('sexe')),
            telephone=_texte(e.get('telephone')), telephoneParent=_texte(e.get('telephoneParent')),
            contactTuteur=_texte(e.get('contactTuteur')),
            aptitude=_texte(e.get('aptitude')) or 'A',
            redoublant=_texte(e.get('redoublant')) or 'N',
            photo=_texte(e.get('photo')), archive=_bool(e.get('archive')),
            dateCreation=_texte(e.get('dateCreation')),
        )
        for e in data.get('eleves', [])
    ])

    for p in data.get('enseignants', []):
        models.Enseignant.objects.create(
            id=_texte(p.get('id')), matricule=_texte(p.get('matricule')), nom=_texte(p.get('nom')),
            prenom=_texte(p.get('prenom')), fonction=_texte(p.get('fonction')) or 'enseignant',
            email=_texte(p.get('email')), dateNaissance=_texte(p.get('dateNaissance')),
            telephone=_texte(p.get('telephone')), archive=_bool(p.get('archive')),
            dateCreation=_texte(p.get('dateCreation')),
        )

    for s in data.get('sequences', []):
        models.Sequence.objects.create(
            id=_texte(s.get('id')), annee_id=_texte(s.get('anneeId')),
            trimestre_id=_texte(s.get('trimestreId')), numero=_entier(s.get('numero'), 1),
            libelle=_texte(s.get('libelle')), dateDebut=_texte(s.get('dateDebut')),
            dateFin=_texte(s.get('dateFin')), ouverte=_bool(s.get('ouverte')),
            verrouillee=_bool(s.get('verrouillee')), validee=_bool(s.get('validee')),
        )

    for c in data.get('coefficients', []):
        models.Coefficient.objects.create(
            classe_id=_texte(c.get('classeId')), matiere_id=_texte(c.get('matiereId')),
            coefficient=_entier(c.get('coefficient'), 0),
        )

    _bulk_creer(models.Inscription, [
        models.Inscription(
            id=_texte(i.get('id')), eleve_id=_texte(i.get('eleveId')),
            classe_id=_texte(i.get('classeId')), annee_id=_texte(i.get('anneeId')),
            dateInscription=_texte(i.get('dateInscription')),
            statut=_texte(i.get('statut')) or 'active', archive=_bool(i.get('archive')),
        )
        for i in data.get('inscriptions', [])
    ])

    _bulk_creer(models.Affectation, [
        models.Affectation(
            id=_texte(a.get('id')), classe_id=_texte(a.get('classeId')),
            matiere_id=_texte(a.get('matiereId')), enseignant_id=_texte(a.get('enseignantId')),
            annee_id=_texte(a.get('anneeId')), archive=_bool(a.get('archive')),
        )
        for a in data.get('affectations', [])
    ])

    for p in data.get('profsPrincipaux', []):
        models.ProfPrincipal.objects.create(
            id=_texte(p.get('id')), classe_id=_texte(p.get('classeId')),
            enseignant_id=_texte(p.get('enseignantId')), annee_id=_texte(p.get('anneeId')),
        )

    for a in data.get('affectationsCenseurs', []):
        models.AffectationCenseur.objects.create(
            id=_texte(a.get('id')), classe_id=_texte(a.get('classeId')),
            enseignant_id=_texte(a.get('enseignantId')), annee_id=_texte(a.get('anneeId')),
        )

    _bulk_creer(models.Note, [
        models.Note(
            id=_texte(n.get('id')), sequence_id=_texte(n.get('sequenceId')),
            eleve_id=_texte(n.get('eleveId')), classe_id=_texte(n.get('classeId')),
            matiere_id=_texte(n.get('matiereId')), valeur=_nombre(n.get('valeur')),
            statut=_texte(n.get('statut')) or 'note', remarque=_texte(n.get('remarque')),
            appreciation=_texte(n.get('appreciation')) or _texte(n.get('remarque')),
            dateSaisie=_texte(n.get('dateSaisie')) or _texte(n.get('modifieLe')),
            modifiePar=_texte(n.get('modifiePar')), modifieLe=_texte(n.get('modifieLe')),
        )
        for n in data.get('notes', [])
    ])

    _bulk_creer(models.Absence, [
        models.Absence(
            id=_texte(a.get('id')), sequence_id=_texte(a.get('sequenceId')) or None,
            eleve_id=_texte(a.get('eleveId')), classe_id=_texte(a.get('classeId')) or None,
            annee_id=_texte(a.get('anneeId')) or None, date=_texte(a.get('date')),
            periode=_texte(a.get('periode')), motif=_texte(a.get('motif')),
            heures=_nombre(a.get('heures')), justifiees=_nombre(a.get('justifiees')),
            nonJustifiees=_nombre(a.get('nonJustifiees')),
            modifiePar=_texte(a.get('modifiePar')), modifieLe=_texte(a.get('modifieLe')),
            archive=_bool(a.get('archive')),
        )
        for a in data.get('absences', [])
    ])

    for s in data.get('sanctions', []):
        models.Sanction.objects.create(
            id=_texte(s.get('id')), sequence_id=_texte(s.get('sequenceId')) or None,
            eleve_id=_texte(s.get('eleveId')), classe_id=_texte(s.get('classeId')) or None,
            type=_texte(s.get('type')), duree=_nombre(s.get('duree')), motif=_texte(s.get('motif')),
            modifiePar=_texte(s.get('modifiePar')), modifieLe=_texte(s.get('modifieLe')),
            archive=_bool(s.get('archive')),
        )

    for d in data.get('disciplines', []):
        models.Discipline.objects.create(
            id=_texte(d.get('id')), eleve_id=_texte(d.get('eleveId')),
            sequence_id=_texte(d.get('sequenceId')), heures_nj=_nombre(d.get('heures_nj')) or 0,
            heures_j=_nombre(d.get('heures_j')) or 0,
            avertissement=_bool(d.get('avertissement')), blame=_bool(d.get('blame')),
            exclusion_jours=_entier(d.get('exclusion_jours'), 0),
        )

    for m in data.get('migrations', []):
        models.MigrationEleve.objects.create(
            id=_texte(m.get('id')), type=_texte(m.get('type')), eleve_id=_texte(m.get('eleveId')),
            deClasse_id=_texte(m.get('deClasseId')) or None,
            versClasse_id=_texte(m.get('versClasseId')) or None,
            annee_id=_texte(m.get('anneeId')) or None, decision=_texte(m.get('decision')),
            motif=_texte(m.get('motif')), auteurId=_texte(m.get('auteurId')),
            date=_texte(m.get('date')),
        )

    for d in data.get('decisions', []):
        models.Decision.objects.create(
            id=_texte(d.get('id')), eleve_id=_texte(d.get('eleveId')),
            annee_id=_texte(d.get('anneeId')), decision=_texte(d.get('decision')),
            moyenneAnnuelle=_nombre(d.get('moyenneAnnuelle')),
            modifiePar=_texte(d.get('modifiePar')), modifieLe=_texte(d.get('modifieLe')),
        )

    for a in data.get('appreciations', []):
        models.Appreciation.objects.create(
            id=_texte(a.get('id')), eleve_id=_texte(a.get('eleveId')),
            classe_id=_texte(a.get('classeId')) or None, annee_id=_texte(a.get('anneeId')),
            periode=_texte(a.get('periode')), texte=_texte(a.get('texte')),
            conduite=_nombre(a.get('conduite')), auteurId=_texte(a.get('auteurId')),
            date=_texte(a.get('date')),
        )

    for b in data.get('bulletinsValides', []):
        models.BulletinValide.objects.create(
            id=_texte(b.get('id')), cle=_texte(b.get('cle')),
            classe_id=_texte(b.get('classeId')) or None, annee_id=_texte(b.get('anneeId')) or None,
            periode=_texte(b.get('periode')), date=_texte(b.get('date')),
            validePar=_texte(b.get('validePar')),
        )

    for j in data.get('journal', []):
        models.JournalEntry.objects.create(
            id=_texte(j.get('id')), date=_texte(j.get('date')), action=_texte(j.get('action')),
            cible=_texte(j.get('cible')), details=_texte(j.get('details')),
            auteurId=_texte(j.get('auteurId')),
        )

    for s in data.get('smsLog', []):
        models.SmsLog.objects.create(
            id=_texte(s.get('id')), destinataire=_texte(s.get('destinataire')),
            message=_texte(s.get('message')), date=_texte(s.get('date')),
            statut=_texte(s.get('statut')), modifiePar=_texte(s.get('modifiePar')),
        )

    param = models.Parametres.charger()
    param.donnees = _parametres_complets(data.get('parametres'))
    param.sequenceur = _sequenceur_complet(data.get('sequenceur'))
    param.save()

    return True


# ---------------------------------------------------------------------------
# Restauration incrementale
# ---------------------------------------------------------------------------
# Le magasin du navigateur renvoie l'instantane *entier* a chaque
# enregistrement. Le jeu de demonstration contient des dizaines de milliers de
# notes : tout effacer puis tout reinserer a chaque modification serait tres
# lent (plusieurs secondes) et ferait croire que rien n'a change. On ne touche
# donc que les lignes reellement ajoutees, modifiees ou supprimees, en
# respectant l'ordre des dependances.
#
# Chaque collection est decrite par (cle JSON, modele, attribut de cle,
# champs) ou chaque champ est (cle JSON, attribut du modele, convertisseur).
def _cibles():
    def conv_section_fabrique(contexte):
        def conv(c):
            sid = _texte(c.get('sectionId'))
            if sid and sid in contexte['sections_valides']:
                return sid
            nom = (_texte(c.get('section')) or 'francophone').strip().lower()
            return contexte['section_par_nom'].get(nom, contexte['section_defaut'])
        return conv

    # La section a besoin du contexte : on renseigne son convertisseur plus bas.
    cibles = [
        ('annees', models.Annee, 'id', [
            ('id', 'id', _texte), ('libelle', 'libelle', _texte), ('active', 'active', _bool),
            ('cloturee', 'cloturee', _bool), ('dateDebut', 'dateDebut', _texte),
            ('dateFin', 'dateFin', _texte)]),
        ('trimestres', models.Trimestre, 'id', [
            ('id', 'id', _texte), ('anneeId', 'annee_id', _texte), ('libelle', 'libelle', _texte),
            ('numero', 'numero', lambda v: _entier(v, 1)), ('dateDebut', 'dateDebut', _texte),
            ('dateFin', 'dateFin', _texte), ('ouvert', 'ouvert', _bool), ('valide', 'valide', _bool)]),
        ('sections', models.Section, 'id', [('id', 'id', _texte), ('nom', 'nom', _texte)]),
        ('matieres', models.Matiere, 'id', [
            ('id', 'id', _texte), ('code', 'code', _texte), ('nom', 'nom', _texte),
            ('noteMax', 'noteMax', lambda v: _entier(v, 20)), ('archive', 'archive', _bool)]),
        ('classes', models.Classe, 'id', [
            ('id', 'id', _texte), ('nom', 'nom', _texte), ('niveau', 'niveau', _texte),
            ('cycle', 'cycle', _texte), ('section', 'section', lambda v: _texte(v) or 'francophone'),
            ('sectionId', 'sectionId_id', None),  # convertisseur rempli plus bas
            ('effectifMax', 'effectifMax', lambda v: _entier(v, 30)),
            ('anneeId', 'annee_id', _texte), ('archive', 'archive', _bool)]),
        ('enseignants', models.Enseignant, 'id', [
            ('id', 'id', _texte), ('matricule', 'matricule', _texte), ('nom', 'nom', _texte),
            ('prenom', 'prenom', _texte), ('fonction', 'fonction', lambda v: _texte(v) or 'enseignant'),
            ('email', 'email', _texte), ('dateNaissance', 'dateNaissance', _texte),
            ('telephone', 'telephone', _texte), ('archive', 'archive', _bool),
            ('dateCreation', 'dateCreation', _texte)]),
        ('eleves', models.Eleve, 'id', [
            ('id', 'id', _texte), ('matricule', 'matricule', _texte), ('nom', 'nom', _texte),
            ('prenom', 'prenom', _texte), ('dateNaissance', 'dateNaissance', _texte),
            ('lieuNaissance', 'lieuNaissance', _texte), ('sexe', 'sexe', _texte),
            ('telephone', 'telephone', _texte), ('telephoneParent', 'telephoneParent', _texte),
            ('contactTuteur', 'contactTuteur', _texte), ('aptitude', 'aptitude', lambda v: _texte(v) or 'A'),
            ('redoublant', 'redoublant', lambda v: _texte(v) or 'N'),
            ('photo', 'photo', _texte),
            ('archive', 'archive', _bool), ('dateCreation', 'dateCreation', _texte)]),
        ('sequences', models.Sequence, 'id', [
            ('id', 'id', _texte), ('anneeId', 'annee_id', _texte), ('trimestreId', 'trimestre_id', _texte),
            ('numero', 'numero', lambda v: _entier(v, 1)), ('libelle', 'libelle', _texte),
            ('dateDebut', 'dateDebut', _texte), ('dateFin', 'dateFin', _texte),
            ('ouverte', 'ouverte', _bool), ('verrouillee', 'verrouillee', _bool),
            ('validee', 'validee', _bool)]),
        ('inscriptions', models.Inscription, 'id', [
            ('id', 'id', _texte), ('eleveId', 'eleve_id', _texte), ('classeId', 'classe_id', _texte),
            ('anneeId', 'annee_id', _texte), ('dateInscription', 'dateInscription', _texte),
            ('statut', 'statut', lambda v: _texte(v) or 'active'), ('archive', 'archive', _bool)]),
        ('affectations', models.Affectation, 'id', [
            ('id', 'id', _texte), ('classeId', 'classe_id', _texte), ('matiereId', 'matiere_id', _texte),
            ('enseignantId', 'enseignant_id', _texte), ('anneeId', 'annee_id', _texte),
            ('archive', 'archive', _bool)]),
        ('profsPrincipaux', models.ProfPrincipal, 'id', [
            ('id', 'id', _texte), ('classeId', 'classe_id', _texte),
            ('enseignantId', 'enseignant_id', _texte), ('anneeId', 'annee_id', _texte)]),
        ('affectationsCenseurs', models.AffectationCenseur, 'id', [
            ('id', 'id', _texte), ('classeId', 'classe_id', _texte),
            ('enseignantId', 'enseignant_id', _texte), ('anneeId', 'annee_id', _texte)]),
        ('notes', models.Note, 'id', [
            ('id', 'id', _texte), ('sequenceId', 'sequence_id', _texte), ('eleveId', 'eleve_id', _texte),
            ('classeId', 'classe_id', _texte), ('matiereId', 'matiere_id', _texte),
            ('valeur', 'valeur', _nombre), ('statut', 'statut', lambda v: _texte(v) or 'note'),
            ('remarque', 'remarque', _texte), ('appreciation', 'appreciation', _texte),
            ('dateSaisie', 'dateSaisie', _texte), ('modifiePar', 'modifiePar', _texte),
            ('modifieLe', 'modifieLe', _texte)]),
        ('absences', models.Absence, 'id', [
            ('id', 'id', _texte), ('sequenceId', 'sequence_id', lambda v: _texte(v) or None),
            ('eleveId', 'eleve_id', _texte), ('classeId', 'classe_id', lambda v: _texte(v) or None),
            ('anneeId', 'annee_id', lambda v: _texte(v) or None), ('date', 'date', _texte),
            ('periode', 'periode', _texte), ('motif', 'motif', _texte),
            ('heures', 'heures', _nombre), ('justifiees', 'justifiees', _nombre),
            ('nonJustifiees', 'nonJustifiees', _nombre), ('modifiePar', 'modifiePar', _texte),
            ('modifieLe', 'modifieLe', _texte), ('archive', 'archive', _bool)]),
        ('sanctions', models.Sanction, 'id', [
            ('id', 'id', _texte), ('sequenceId', 'sequence_id', lambda v: _texte(v) or None),
            ('eleveId', 'eleve_id', _texte), ('classeId', 'classe_id', lambda v: _texte(v) or None),
            ('type', 'type', _texte), ('duree', 'duree', _nombre), ('motif', 'motif', _texte),
            ('modifiePar', 'modifiePar', _texte), ('modifieLe', 'modifieLe', _texte),
            ('archive', 'archive', _bool)]),
        ('disciplines', models.Discipline, 'id', [
            ('id', 'id', _texte), ('eleveId', 'eleve_id', _texte), ('sequenceId', 'sequence_id', _texte),
            ('heures_nj', 'heures_nj', lambda v: _nombre(v) or 0),
            ('heures_j', 'heures_j', lambda v: _nombre(v) or 0),
            ('avertissement', 'avertissement', _bool), ('blame', 'blame', _bool),
            ('exclusion_jours', 'exclusion_jours', lambda v: _entier(v, 0))]),
        ('migrations', models.MigrationEleve, 'id', [
            ('id', 'id', _texte), ('type', 'type', _texte), ('eleveId', 'eleve_id', _texte),
            ('deClasseId', 'deClasse_id', lambda v: _texte(v) or None),
            ('versClasseId', 'versClasse_id', lambda v: _texte(v) or None),
            ('anneeId', 'annee_id', lambda v: _texte(v) or None), ('decision', 'decision', _texte),
            ('motif', 'motif', _texte), ('auteurId', 'auteurId', _texte), ('date', 'date', _texte)]),
        ('decisions', models.Decision, 'id', [
            ('id', 'id', _texte), ('eleveId', 'eleve_id', _texte), ('anneeId', 'annee_id', _texte),
            ('decision', 'decision', _texte), ('moyenneAnnuelle', 'moyenneAnnuelle', _nombre),
            ('modifiePar', 'modifiePar', _texte), ('modifieLe', 'modifieLe', _texte)]),
        ('appreciations', models.Appreciation, 'id', [
            ('id', 'id', _texte), ('eleveId', 'eleve_id', _texte),
            ('classeId', 'classe_id', lambda v: _texte(v) or None), ('anneeId', 'annee_id', _texte),
            ('periode', 'periode', _texte), ('texte', 'texte', _texte),
            ('conduite', 'conduite', _nombre), ('auteurId', 'auteurId', _texte), ('date', 'date', _texte)]),
        ('bulletinsValides', models.BulletinValide, 'id', [
            ('id', 'id', _texte), ('cle', 'cle', _texte),
            ('classeId', 'classe_id', lambda v: _texte(v) or None),
            ('anneeId', 'annee_id', lambda v: _texte(v) or None), ('periode', 'periode', _texte),
            ('date', 'date', _texte), ('validePar', 'validePar', _texte)]),
        ('journal', models.JournalEntry, 'id', [
            ('id', 'id', _texte), ('date', 'date', _texte), ('action', 'action', _texte),
            ('cible', 'cible', _texte), ('details', 'details', _texte), ('auteurId', 'auteurId', _texte)]),
        ('smsLog', models.SmsLog, 'id', [
            ('id', 'id', _texte), ('destinataire', 'destinataire', _texte),
            ('message', 'message', _texte), ('date', 'date', _texte), ('statut', 'statut', _texte),
            ('modifiePar', 'modifiePar', _texte)]),
    ]
    return cibles, conv_section_fabrique


def _normaliser(data):
    """Convertit l'instantane entrant en listes {attribut_modele: valeur}."""
    sections = data.get('sections') or SECTIONS_DEFAUT
    contexte = {
        'section_par_nom': {(s.get('nom') or '').strip().lower(): _texte(s.get('id')) for s in sections},
        'sections_valides': {_texte(s.get('id')) for s in sections},
        'section_defaut': _texte(sections[0].get('id')) if sections else None,
    }
    cibles, conv_section_fabrique = _cibles()
    conv_section = conv_section_fabrique(contexte)

    donnees = {
        'annees': data.get('annees', []),
        # Les trimestres sont imbriques dans leur annee et sans "anneeId" :
        # on rattache chaque trimestre a l'annee qui le contient.
        'trimestres': [dict(t, anneeId=a.get('id'))
                       for a in data.get('annees', []) for t in a.get('trimestres', [])],
        'coefficients': data.get('coefficients', []),
    }
    for cle, _modele, _pk, _champs in cibles:
        if cle in ('annees', 'trimestres'):
            continue
        donnees[cle] = data.get(cle, [])

    return cibles, donnees, conv_section


def _etat_collection(modele, pk, champs, items, conv_section):
    """Prepare une collection : lignes entrantes normalisees et lignes en base.
    Une seule lecture de la base par collection (indispensable avec des
    dizaines de milliers de notes)."""
    attributs = [a for (_j, a, _c) in champs]
    valeurs = [a for a in attributs if a != pk]
    entrant = {}
    for it in items:
        enr = {}
        for (j, a, conv) in champs:
            enr[a] = conv_section(it) if a == 'sectionId_id' else conv(it.get(j))
        entrant[enr[pk]] = enr
    courant = {ligne[0]: ligne[1:] for ligne in modele.objects.values_list(pk, *valeurs)}
    return {'modele': modele, 'pk': pk, 'valeurs': valeurs,
            'entrant': entrant, 'courant': courant}


def _supprimer(etat):
    modele, pk = etat['modele'], etat['pk']
    entrant, courant = etat['entrant'], etat['courant']
    a_supprimer = [k for k in courant if k not in entrant]
    if a_supprimer:
        modele.objects.filter(**{pk + '__in': a_supprimer}).delete()
    etat['courant'] = {k: v for k, v in courant.items() if k in entrant}


def _inserer_mettre_a_jour(etat):
    modele, pk, valeurs = etat['modele'], etat['pk'], etat['valeurs']
    entrant, courant = etat['entrant'], etat['courant']
    a_creer = [enr for k, enr in entrant.items() if k not in courant]
    if a_creer:
        _bulk_creer(modele, [modele(**enr) for enr in a_creer])
    a_maj = []
    for k, enr in entrant.items():
        ligne = courant.get(k)
        if ligne is not None and tuple(enr[a] for a in valeurs) != ligne:
            a_maj.append(enr)
    if a_maj:
        modeles = [modele(**enr) for enr in a_maj]
        modele.objects.bulk_update(modeles, valeurs)


def _synchroniser_coefficients(items):
    """Coefficient n'a pas d'identifiant propre : on les remplace en bloc (peu
    nombreux)."""
    courant = {(c.classe_id, c.matiere_id): c.coefficient for c in models.Coefficient.objects.all()}
    entrant = {(_texte(c.get('classeId')), _texte(c.get('matiereId'))): _entier(c.get('coefficient'), 0)
               for c in items}
    if courant == entrant:
        return
    models.Coefficient.objects.all().delete()
    _bulk_creer(models.Coefficient, [
        models.Coefficient(classe_id=classe, matiere_id=matiere, coefficient=coef)
        for (classe, matiere), coef in entrant.items()
    ])


@transaction.atomic
def restore(data):
    if not isinstance(data, dict):
        raise ValueError("L'instantane doit etre un objet JSON.")
    if not data.get('classes'):
        # Instantane manifestement vide/incoherent : reconstruction complete.
        return _restore_complet(data)

    cibles, donnees, conv_section = _normaliser(data)

    etats = {}
    for cle, modele, pk, champs in cibles:
        etats[cle] = _etat_collection(modele, pk, champs, donnees.get(cle, []), conv_section)

    # 1) Suppressions, des enfants vers les parents.
    for cle, _modele, _pk, _champs in reversed(cibles):
        _supprimer(etats[cle])

    # 2) Ajouts et mises a jour, des parents vers les enfants.
    for cle, _modele, _pk, _champs in cibles:
        _inserer_mettre_a_jour(etats[cle])

    _synchroniser_coefficients(donnees.get('coefficients', []))

    param = models.Parametres.charger()
    param.donnees = _parametres_complets(data.get('parametres'))
    param.sequenceur = _sequenceur_complet(data.get('sequenceur'))
    param.save()
    return True


def wipe_business():
    """Supprime toutes les donnees metier (classes, eleves, notes, annees...).

    Contrairement a _wipe(), les parametres de l'etablissement sont conserves :
    le bouton « Reinitialiser » remet l'application dans un etat vide, sans
    jamais recharger le jeu de demonstration. Les comptes de connexion ne sont
    pas concernes (table separee).
    """
    with transaction.atomic():
        models.JournalEntry.objects.all().delete()
        models.SmsLog.objects.all().delete()
        models.BulletinValide.objects.all().delete()
        models.Appreciation.objects.all().delete()
        models.Decision.objects.all().delete()
        models.MigrationEleve.objects.all().delete()
        models.Discipline.objects.all().delete()
        models.Sanction.objects.all().delete()
        models.Absence.objects.all().delete()
        models.Note.objects.all().delete()
        models.AffectationCenseur.objects.all().delete()
        models.ProfPrincipal.objects.all().delete()
        models.Affectation.objects.all().delete()
        models.Inscription.objects.all().delete()
        models.Coefficient.objects.all().delete()
        models.Sequence.objects.all().delete()
        models.Trimestre.objects.all().delete()
        models.Classe.objects.all().delete()
        models.Section.objects.all().delete()
        models.Matiere.objects.all().delete()
        models.Eleve.objects.all().delete()
        models.Enseignant.objects.all().delete()
        models.Annee.objects.all().delete()
    return True

