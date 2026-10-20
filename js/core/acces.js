/* EduNeum - Garde d'acces centralisee (refus par defaut).

   AVERTISSEMENT
   Cette version est 100 % statique : les verifications vivent dans le
   navigateur et sont donc contournables (console du navigateur, edition de
   localStorage). Elles reorganisent et protigent l'INTERFACE comme demandé,
   mais ne remplacent pas un controle serveur. Un deploiement reel exige de
   rejouer cette meme matrice cote serveur.

   Toute ecriture passe par store.js, qui appelle verifierEcriture() avant de
   modifier la base : ajouter une donnee sans passer par cette matrice est donc
   impossible par accident. */
(function (global) {
  'use strict';

  function core() { return global.EduNeum || {}; }

  /* ------------------------------------------------------------------ */
  /* Matrice des droits : un module declare qui peut le lire et l'ecrire. */
  /* ------------------------------------------------------------------ */
  var ADMIN = 'admin', DIRECTION = 'direction', CENSEUR = 'censeur',
    SURVEILLANT = 'surveillant', ENSEIGNANT = 'enseignant';
  var ADMIN_SEUL = [ADMIN, DIRECTION];
  var TOUS_LIRE = [ADMIN, DIRECTION, CENSEUR, ENSEIGNANT, SURVEILLANT];

  var DROITS = {
    /* --- administrateur (et direction, qui a les memes droits) --- */
    admin_dashboard:    { lire: [ADMIN, DIRECTION, CENSEUR, SURVEILLANT], ecrire: [ADMIN, DIRECTION] },
    admin_annees:       { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_classes:      { lire: [ADMIN, DIRECTION, CENSEUR, SURVEILLANT], ecrire: ADMIN_SEUL },
    admin_matieres:     { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_eleves:       { lire: TOUS_LIRE, ecrire: ADMIN_SEUL },
    admin_personnel:    { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_inscriptions: { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_migrations:   { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_affectations: { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_affectations_sg: { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_notes:        { lire: [ADMIN, DIRECTION, CENSEUR, ENSEIGNANT], ecrire: [ADMIN] },
    admin_bulletins:    { lire: TOUS_LIRE, ecrire: ADMIN_SEUL },
    admin_statistiques: { lire: [ADMIN, DIRECTION, CENSEUR], ecrire: ADMIN_SEUL },
    admin_assiduite:    { lire: [ADMIN, DIRECTION, CENSEUR, SURVEILLANT], ecrire: [ADMIN, DIRECTION, SURVEILLANT] },
    admin_rapports:     { lire: [ADMIN, DIRECTION, CENSEUR], ecrire: ADMIN_SEUL },
    admin_vie_scolaire: { lire: [ADMIN, DIRECTION, CENSEUR], ecrire: ADMIN_SEUL },
    admin_journal:      { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },
    admin_parametres:   { lire: ADMIN_SEUL, ecrire: ADMIN_SEUL },

    /* --- censeur --- */
    censeur_dashboard:   { lire: [CENSEUR, ADMIN, DIRECTION], ecrire: [CENSEUR, ADMIN, DIRECTION] },
    censeur_vie_scolaire:{ lire: [CENSEUR, ADMIN, DIRECTION], ecrire: [CENSEUR, ADMIN, DIRECTION] },
    censeur_assiduite:   { lire: [CENSEUR, ADMIN, DIRECTION, SURVEILLANT], ecrire: [CENSEUR, ADMIN, DIRECTION, SURVEILLANT] },
    censeur_eleves:      { lire: [CENSEUR, ADMIN, DIRECTION, SURVEILLANT], ecrire: [] },
    censeur_classes:     { lire: [CENSEUR, ADMIN, DIRECTION, SURVEILLANT], ecrire: [] },
    censeur_notes:       { lire: [CENSEUR, ADMIN, DIRECTION], ecrire: [] },
    censeur_rapports:    { lire: [CENSEUR, ADMIN, DIRECTION], ecrire: [] },
    censeur_statistiques:{ lire: [CENSEUR, ADMIN, DIRECTION], ecrire: [] },
    censeur_profil:      { lire: [CENSEUR, ADMIN, DIRECTION, SURVEILLANT], ecrire: [CENSEUR, ADMIN, DIRECTION, SURVEILLANT] },

    /* --- enseignant --- */
    teacher_dashboard: { lire: [ENSEIGNANT], ecrire: [ENSEIGNANT] },
    teacher_classes:   { lire: [ENSEIGNANT], ecrire: [] },
    /* La direction n'ecrit pas les notes : seul l'admin gere les sujets ;
       l'enseignant reste maitre de sa saisie. */
    teacher_saisie:    { lire: [ENSEIGNANT, ADMIN, DIRECTION], ecrire: [ENSEIGNANT, ADMIN] },
    /* Saisie couplee (les sequences d'un trimestre en une passe) : memes
       droits que la saisie simple. */
    teacher_saisie_couplee: { lire: [ENSEIGNANT, ADMIN, DIRECTION], ecrire: [ENSEIGNANT, ADMIN] },
    teacher_rapports:  { lire: [ENSEIGNANT, ADMIN, DIRECTION], ecrire: [] },
    teacher_ma_classe: { lire: [ENSEIGNANT], ecrire: [ENSEIGNANT] },
    teacher_profil:    { lire: [ENSEIGNANT, ADMIN, DIRECTION, CENSEUR, SURVEILLANT], ecrire: [ENSEIGNANT, ADMIN, DIRECTION, CENSEUR, SURVEILLANT] }
  };

  /* Libelles lisibles des modules : un message de refus doit nommer
     l'ecran refuse, pas sa cle technique. */
  var LIBELLES = {
    admin_dashboard: 'Tableau de bord', admin_annees: 'Années scolaires',
    admin_classes: 'Classes', admin_matieres: 'Matières', admin_eleves: 'Élèves',
    admin_personnel: 'Personnel', admin_inscriptions: 'Inscriptions',
    admin_migrations: 'Migrations', admin_affectations: 'Affectations',
    admin_affectations_sg: 'Affectations — Surveillants',
    admin_notes: 'Notes', admin_bulletins: 'Bulletins', admin_statistiques: 'Statistiques',
    admin_assiduite: 'Assiduité', admin_rapports: 'Rapports',
    admin_vie_scolaire: 'Vie scolaire', admin_journal: 'Journal d\'audit',
    admin_parametres: 'Paramètres',
    censeur_dashboard: 'Tableau de bord Censeur', censeur_vie_scolaire: 'Vie Scolaire',
    censeur_assiduite: 'Assiduité', censeur_eleves: 'Élèves',
    censeur_classes: 'Classes', censeur_notes: 'Notes (suivi)',
    censeur_rapports: 'Rapports', censeur_statistiques: 'Statistiques',
    censeur_profil: 'Mon Profil',
    teacher_dashboard: 'Tableau de bord enseignant', teacher_classes: 'Mes classes',
    teacher_saisie: 'Saisie des notes', teacher_rapports: 'Mes rapports',
    teacher_saisie_couplee: 'Saisie couplée',
    teacher_ma_classe: 'Ma classe', teacher_profil: 'Mon profil'
  };
  function libelleDe(mod) { return LIBELLES[mod] || mod; }

  /* Modules qu'un enseignant ne doit jamais voir, meme par URL directe. */
  var INTERDITS_ENSEIGNANT = [
    'admin_annees', 'admin_matieres', 'admin_personnel', 'admin_inscriptions',
    'admin_migrations', 'admin_affectations', 'admin_journal', 'admin_parametres',
    'censeur_dashboard', 'censeur_vie_scolaire', 'censeur_assiduite', 'censeur_eleves',
    'censeur_classes', 'censeur_notes', 'censeur_rapports', 'censeur_statistiques', 'censeur_profil'
  ];

  function session() {
    return core().auth ? core().auth.session() : null;
  }
  function role() {
    var s = session();
    return s ? s.role : null;
  }
  function estAdmin() { return role() === ADMIN; }
  function estDirection() { return role() === DIRECTION; }
  function estCenseur() { return role() === CENSEUR; }
  function estSurveillant() { return role() === SURVEILLANT; }
  function estEnseignant() { return role() === ENSEIGNANT; }
  /* La direction dispose des memes privileges que l'administrateur. */
  function estAdminOuDirection() { return estAdmin() || estDirection(); }

  function moduleCourant() {
    return core().routes ? core().routes.currentRouteKey() : null;
  }

  function droitsDe(mod) { return DROITS[mod] || null; }

  /* --------------------------- Lectures -------------------------------- */
  function peutLire(mod) {
    if (!session()) return false;
    var d = droitsDe(mod);
    if (!d) return false;                       /* refus par defaut */
    return d.lire.indexOf(role()) !== -1;
  }

  /* --------------------------- Ecritures ------------------------------- */
  /* La gestion du calendrier (admin_annees) commande l'etat des annees
     elles-memes : activer ou geler une annee inactive doit rester possible
     quelle que soit l'annee consultee. Sans cette exemption, une annee
     inactive rendrait cette page inecritable — cercle vicieux : on ne
     pourrait plus jamais l'activer. */
  function peutEcrire(mod) {
    if (!session()) return false;
    var d = droitsDe(mod);
    if (!d) return false;
    if (d.ecrire.indexOf(role()) === -1) return false;
    if (mod === 'admin_annees') return true;
    return anneeConsultable();
  }

  /* Une annee passee est consultable mais plus modifiable. */
  /* L'annee de REFERENCE est celle affichee dans la page (celle choisie dans
     le selecteur de l'en-tete), et non l'annee active en base. Sans cette
     distinction, consulter une annee passee resterait insensible a la
     lecture seule alors que l'admin y travaille. */
  function anneeConsultee() {
    if (core().layout && typeof core().layout.anneeChoisie === 'function') {
      var choisie = core().layout.anneeChoisie();
      if (choisie) return choisie;
    }
    return core().store ? core().store.anneeActive() : null;
  }

  /* Une annee passee ou cloturee est consultable, jamais modifiable.
     Cette regle vaut pour TOUT le monde, administrateur compris : c'est
     l'historique qui garantit la fiabilite des moyennes. */
  function anneeConsultable() {
    var an = anneeConsultee();
    if (!an) return true;
    return !an.cloturee && an.active !== false;
  }

  function anneeVerrouillee() {
    var an = anneeConsultee();
    if (!an) return false;
    return !!an.cloturee || an.active === false;
  }

  function messageRefus(mod, action) {
    var s = session();
    if (!s) return 'Connexion requise.';
    if (!anneeConsultable()) {
      var an = anneeConsultee();
      return 'Année scolaire « ' + (an ? an.libelle : '?') + ' » : ' +
        (action || 'cette action') + ' impossible, elle est en lecture seule.';
    }
    /* On nomme le role et le module plutot qu'un « Acces refuse » opaque :
       un refus incompris conduit a contourner la regle. */
    var roleLisible = { admin: 'administrateur', direction: 'direction', censeur: 'censeur', surveillant: 'surveillant général', enseignant: 'enseignant' }[role()] || role();
    return 'Le rôle « ' + roleLisible + ' » n\'a pas le droit ' + (action || 'd\'effectuer cette action') +
      ' sur « ' + libelleDe(mod) + ' ».';
  }

  /* ------------------------------------------------------------------ */
  /* Gardes appelables en tete de page ET dans le store.                */
  /* ------------------------------------------------------------------ */
  var refusEnCours = false;

  function signaler(message) {
    if (global.EduNeum && global.EduNeum.ui && global.EduNeum.ui.toast) {
      global.EduNeum.ui.toast(message, 'erreur');
    }
    if (global.EduNeum && global.EduNeum.store) {
      global.EduNeum.store.journaliser('acces.refus', moduleCourant(), message, null);
    }
  }

  /* A appeler en tete de chaque page. Renvoie false si acces refuse. */
  function exiger(mod) {
    if (!session()) return exigerConnexion();
    if (peutLire(mod)) return true;
    refuser(mod, 'lire ce module');
    return false;
  }

  function exigerEcriture(mod) {
    if (!exiger(mod)) return false;
    if (peutEcrire(mod)) return true;
    refuser(mod, 'modifier ce module');
    return false;
  }

  function exigerConnexion() {
    if (refusEnCours) return false;
    refusEnCours = true;
    var cible = core().routes && core().routes.currentPath();
    var r = core().routes && core().routes.resolve('connexion');
    var q = cible ? '?suite=' + encodeURIComponent(cible) : '';
    location.replace(r + q);
    return false;
  }

  function refuser(mod, action) {
    if (refusEnCours) return;
    refusEnCours = true;
    signaler(messageRefus(mod, action));
    setTimeout(function () {
      var s = session();
      var d = s ? core().routes.resolve(s.role === 'enseignant' ? 'teacher_dashboard' : 'admin_dashboard')
        : core().routes.resolve('connexion');
      location.replace(d);
    }, 900);
  }

  /* ------------------------------------------------------------------ */
  /* Controle de ressources : au-dela de la page, sur la donnee visee.   */
  /* ------------------------------------------------------------------ */
  var S = function () { return core().store; };

  function anneeIdCiblee() {
    var an = core().layout ? core().layout.anneeChoisie() : (S() ? S().anneeActive() : null);
    return an ? an.id : null;
  }

  /* Un enseignant ne voit que les classes de ses affectations, plus la
     classe dont il est professeur principal. */
  /* Le professeur principal est porte par la collection profsPrincipaux
     (une ligne par classe et par annee), pas par un champ sur la classe. */
  function ppDeClasse(classeId) {
    var ligne = S().all('profsPrincipaux').filter(function (p) {
      return p.classeId === classeId && p.anneeId === anneeIdCiblee();
    })[0];
    return ligne ? ligne.enseignantId : null;
  }

  function mesClasses() {
    var s = session();
    if (!s) return [];
    /* Administrateur, direction et censeur encadrent TOUTES les classes de
       l'annee : ils n'ont pas d'affectations propres. */
    if (estAdmin() || estDirection() || estCenseur()) {
      return S().classesDe(anneeIdCiblee()).map(function (c) { return c.id; });
    }
    /* Le surveillant general (SG) ne voit que les classes qui lui sont
       attribuees (collection affectationsCenseurs, saisie sur la page
       Affectations par l'administration). */
    if (estSurveillant()) {
      if (!s.enseignantId) return [];
      var sid = s.enseignantId, an = anneeIdCiblee();
      return S().classesDe(an).filter(function (c) {
        return S().all('affectationsCenseurs').some(function (a) {
          return a.classeId === c.id && a.enseignantId === sid && a.anneeId === an;
        });
      }).map(function (c) { return c.id; });
    }
    if (!s.enseignantId) return [];
    var ids = {};
    S().affectationsDeEnseignant(s.enseignantId, anneeIdCiblee()).forEach(function (a) { ids[a.classeId] = 1; });
    var an2 = anneeIdCiblee();
    S().all('profsPrincipaux').forEach(function (p) {
      if (p.enseignantId === s.enseignantId && p.anneeId === an2) ids[p.classeId] = 1;
    });
    return Object.keys(ids);
  }

  function peutVoirClasse(classeId) {
    if (estAdmin() || estDirection() || estCenseur()) return true;
    if (estSurveillant()) return mesClasses().indexOf(classeId) !== -1;
    if (estEnseignant()) return mesClasses().indexOf(classeId) !== -1;
    return false;
  }

  /* Un enseignant ne lit et n'ecrit que les notes de SES affectations.
     L'admin gere les sujets ; la direction n'ecrit aucune note. */
  function peutVoirNotesDe(classeId, matiereId) {
    if (estAdmin() || estDirection()) return true;
    var s = session();
    if (!s || !s.enseignantId) return false;
    if (matiereId) return S().peutSaisir(s.enseignantId, classeId, matiereId, anneeIdCiblee());
    /* consultation seule : n'importe quelle matiere de SES classes */
    return peutVoirClasse(classeId);
  }

  function peutEcrireNotesDe(classeId, matiereId) {
    if (!peutEcrire('teacher_saisie')) return false;
    if (estAdmin()) return true;
    var s = session();
    if (!s || !s.enseignantId) return false;
    return S().peutSaisir(s.enseignantId, classeId, matiereId, anneeIdCiblee());
  }

  function estPPDe(classeId) {
    var s = session();
    if (!s || !s.enseignantId) return false;
    return ppDeClasse(classeId) === s.enseignantId;
  }

  function peutVoirEleve(eleveId) {
    if (estAdmin() || estDirection() || estCenseur() || estSurveillant()) return true;
    if (estEnseignant()) return peutVoirClasse(S().classeDeEleve(eleveId, anneeIdCiblee()));
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Verification avant ecriture : appele par le store.                  */
  /* Renvoie { ok: bool, motif: string }.                              */
  /* ------------------------------------------------------------------ */
  function verifierEcriture(mod, contexte) {
    if (!session()) return refuserEcriture('Connexion requise.');
    var d = droitsDe(mod);
    if (!d) return refuserEcriture('Module non déclaré dans la matrice d\'accès : ' + mod);
    if (d.ecrire.indexOf(role()) === -1) return refuserEcriture(messageRefus(mod, 'd\'effectuer cette modification'));
    /* Exemption identique a peutEcrire() : la page Annees scolaires gere
       l'etat des annees elles-memes, activer ou degeler une annee inactive
       doit rester possible quelle que soit l'annee consultee. Sans elle, la
       PREMIERE activation est impossible : sur une base vide, l'unique annee
       (creee inactive) est aussi celle que la page consulte, donc verdict
       « lecture seule » — cercle vicieux. */
    if (mod !== 'admin_annees' && !anneeConsultable()) {
      var an = anneeConsultee();
      var libelle = an ? an.libelle : 'cette année scolaire';
      return refuserEcriture(an && an.cloturee
        ? 'Année scolaire « ' + libelle + ' » clôturée : modification impossible.'
        : 'Année scolaire « ' + libelle + ' » en lecture seule : consultable mais non modifiable. ' +
          'Reprenez l\'année active pour effectuer une modification.');
    }
    var motif = verifierContexte(contexte);
    if (motif) return refuserEcriture(motif);
    return { ok: true };
  }

  function refuserEcriture(motif) {
    if (global.EduNeum && global.EduNeum.ui) global.EduNeum.ui.toast(motif, 'erreur');
    return { ok: false, motif: motif };
  }

  /* Regles metier specifiques, verifiees AVANT toute ecriture. */
  function verifierContexte(ctx) {
    if (!ctx) return null;
    if (ctx.classeId && !peutVoirClasse(ctx.classeId)) return 'Classe hors de vos affectations.';
    if (ctx.notesDe && !peutEcrireNotesDe(ctx.classeId, ctx.matiereId)) {
      return 'Vous n\'êtes pas affecté à cette classe/matière.';
    }
    if (ctx.sequenceId) {
      var seq = S().sequenceParId(ctx.sequenceId);
      if (!seq) return 'Séquence introuvable.';
      if (seq.verrouillee) return 'Séquence verrouillée : modification impossible.';
      if (!seq.ouverte) return 'Séquence fermée : modification impossible.';
      var trim = S().trimestreDeSequence(seq.id);
      if (trim && !trim.ouvert) return 'Trimestre clôturé : modification impossible.';
    }
    return null;
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.acces = {
    DROITS: DROITS, LIBELLES: LIBELLES, libelleDe: libelleDe,
    INTERDITS_ENSEIGNANT: INTERDITS_ENSEIGNANT,
    session: session, role: role,
    estAdmin: estAdmin, estDirection: estDirection, estCenseur: estCenseur,
    estSurveillant: estSurveillant, estEnseignant: estEnseignant,
    estAdminOuDirection: estAdminOuDirection,
    moduleCourant: moduleCourant, droitsDe: droitsDe,
    peutLire: peutLire, peutEcrire: peutEcrire,
    exiger: exiger, exigerEcriture: exigerEcriture,
    refuser: refuser, signaler: signaler, messageRefus: messageRefus,
    anneeConsultable: anneeConsultable, anneeConsultee: anneeConsultee, anneeVerrouillee: anneeVerrouillee,
    mesClasses: mesClasses, ppDeClasse: ppDeClasse,
    peutVoirClasse: peutVoirClasse,
    peutVoirNotesDe: peutVoirNotesDe, peutEcrireNotesDe: peutEcrireNotesDe,
    estPPDe: estPPDe, peutVoirEleve: peutVoirEleve,
    verifierEcriture: verifierEcriture
  };
})(window);
