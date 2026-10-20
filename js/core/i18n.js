/* EduNeum - Traduction FR/EN de l'interface.

   Les libelles traduisibles portent data-i18n="cle" ; ce module remplace
   leur contenu au chargement et a chaque changement de langue. Les
   variantes html / placeholder / title / aria evitent de dupliquer un
   element uniquement pour changer un attribut.

   La langue est memorisee dans localStorage : elle vaut pour toutes les
   pages de l'application. La page de connexion n'est PAS branchee ici,
   elle conserve son propre selecteur en sessionStorage — un mot de passe
   saisi ne doit pas changer de langue au milieu d'une meme session. */
(function (global) {
  'use strict';

  var CLE = 'eduneum.lang';

  var DICTIONNAIRES = {
    fr: {
      /* ---chrome--- */
      'chrome.langue': 'Langue',
      'chrome.langue.fr': 'Français',
      'chrome.langue.en': 'Anglais',
      'chrome.theme': 'Thème',
      'chrome.theme.clair': 'Thème clair',
      'chrome.theme.sombre': 'Thème sombre',
      'chrome.fil': 'Fil d’Ariane',
      'chrome.annee': 'Année scolaire',
      'chrome.profil': 'Mon profil',
      'chrome.deconnexion': 'Déconnexion',
      'chrome.lectureSeule': 'Consultation seule',
      'chrome.espaceEnseignant': 'Espace enseignant',
      'chrome.administration': 'Administration',

      /* ---rôles--- */
      'role.admin': 'Administrateur',
      'role.censeur': 'Censeur',
      'role.enseignant': 'Enseignant',

      /* ---menu (par route)--- */
      'route.teacher_dashboard': 'Tableau de bord',
      'route.teacher_classes': 'Mes classes',
      'route.teacher_saisie': 'Saisie des notes',
      'route.teacher_ma_classe': 'Ma classe',
      'route.teacher_rapports': 'Rapports',
      'route.teacher_profil': 'Profil',
      'route.admin_dashboard': 'Tableau de bord',
      'route.admin_annees': 'Année scolaire',
      'route.admin_classes': 'Classes',
      'route.admin_matieres': 'Matières',
      'route.admin_eleves': 'Élèves',
      'route.admin_personnel': 'Personnel et enseignants',
      'route.admin_inscriptions': 'Inscriptions',
      'route.admin_migrations': 'Migrations',
      'route.admin_affectations': 'Affectations',
      'route.admin_notes': 'Notes (suivi)',
      'route.admin_bulletins': 'Bulletins',
      'route.admin_statistiques': 'Statistiques',
      'route.admin_assiduite': 'Assiduité',
      'route.admin_rapports': 'Rapports',
      'route.admin_vie_scolaire': 'Vie scolaire',
      'route.admin_journal': 'Journal d’audit',
      'route.admin_parametres': 'Paramètres',

      /* ---vocabulaire commun--- */
      'commun.classe': 'Classe',
      'commun.classes': 'Classes',
      'commun.matiere': 'Matière',
      'commun.matieres': 'Matières',
      'commun.sequence': 'Séquence',
      'commun.sequences': 'Séquences',
      'commun.trimestre': 'Trimestre',
      'commun.trimestres': 'Trimestres',
      'commun.eleve': 'Élève',
      'commun.eleves': 'Élèves',
      'commun.effectif': 'Effectif',
      'commun.notes': 'Notes',
      'commun.note': 'Note',
      'commun.moyenne': 'Moyenne',
      'commun.moyennes': 'Moyennes',
      'commun.minimum': 'Minimum',
      'commun.maximum': 'Maximum',
      'commun.repartition': 'Répartition',
      'commun.presents': 'Présents',
      'commun.absents': 'Absents',
      'commun.assiduite': 'Assiduité',
      'commun.actions': 'Actions',
      'commun.rapports': 'Rapports',
      'commun.statistiques': 'Statistiques',
      'commun.annee': 'Année',
      'commun.total': 'Total',
      'commun.aucuneDonnee': 'Aucune donnée à afficher.',
      'commun.chargement': 'Chargement…',
      'commun.exporter': 'Exporter',
      'commun.imprimer': 'Imprimer',
      'commun.fermer': 'Fermer',
      'commun.annuler': 'Annuler',
      'commun.valider': 'Valider',
      'commun.enregistrer': 'Enregistrer',
      'commun.rechercher': 'Rechercher…',
      'commun.trier': 'Trier',
      'commun.aucunResultat': 'Aucun résultat.',
      'commun.resultats': '{n} résultat(s)',
      'commun.remarque': 'Remarque',
      'commun.statut': 'Statut',
      'commun.nom': 'Nom',
      'commun.prenom': 'Prénom',
      'commun.matricule': 'Matricule',
      'commun.date': 'Date',
      'commun.type': 'Type',
      'commun.vide': '—',
      'commun.nonNote': 'Non noté',
      'commun.nonSaisi': 'Non saisi',
      'commun.abs': 'ABS',
      'commun.presente': 'Présent',
      'commun.absent': 'Absent',
      'commun.justifiee': 'Absence justifiée',
      'commun.injustifiee': 'Absence injustifiée',

      /* ---vie scolaire--- */
      'vie.cible': 'Élève concerné',
      'vie.typeIncident': 'Type d’incident',
      'vie.gravity': 'Gravité',
      'vie.circonstances': 'Circonstances',
      'vie.sanction': 'Sanction',
      'vie.resolu': 'Résolu',
      'vie.ouvrirIncident': 'Signaler un incident',
      'vie.historique': 'Historique',
      'vie.aucunIncident': 'Aucun incident signalé.',

      /* ---tableau de bord / accueil--- */
      'accueil.bienvenue': 'Bonjour, {nom}',
      'accueil.session': 'Session {annee}',
      'accueil.aucuneDonnee': 'Aucune donnée à afficher pour le moment.',

      /* ---saisie des notes--- */
      'saisie.titre': 'Saisie des notes',
      'saisie.sousTitre': 'Gestion académique • Enregistrement des résultats',
      'saisie.selectionnerClasse': 'Sélectionner une classe',
      'saisie.selectionnerMatiere': 'Sélectionner une matière',
      'saisie.selectionnerSequence': 'Sélectionner une séquence',
      'saisie.charger': 'Charger la liste',
      'saisie.chargerTitre': 'Sélectionnez une classe, une matière et une séquence',
      'saisie.moyenne': 'Calculer la moyenne',
      'saisie.exporter': 'Exporter CSV',
      'saisie.annulerModifs': 'Annuler les modifications',
      'saisie.enregistrer': 'Enregistrer les notes',
      'saisie.derniereNotes': 'Dernières notes saisies',
      'saisie.aucuneListe': 'Aucune liste chargée',
      'saisie.sequenceChargee': 'Aucune séquence chargée',
      'saisie.progression': '{saisis}/{total} élèves saisis ({pct}%)',
      'saisie.aucuneAffectation': 'Aucune affectation ne vous est attribuée cette année : la saisie est impossible. Contactez l’administration.',
      'saisie.aucuneAnnee': 'Aucune année scolaire active : la saisie des notes est indisponible.',
      'saisie.effectifInscriptions': 'Effectif géré depuis le module Inscriptions.',

      /* ---rapports (enseignant)--- */
      'rapport.titre': 'Rapports',
      'rapport.sousTitre': 'Résultats par classe et par séquence',
      'rapport.choisirClasse': 'Classe',
      'rapport.choisirSequence': 'Séquence',
      'rapport.choisirMatiere': 'Matière',
      'rapport.aucuneClasse': 'Sélectionnez une classe',
      'rapport.aucuneSequence': 'Sélectionnez une séquence',
      'rapport.repartitionNotes': 'Répartition des notes',
      'rapport.resultatsEleves': 'Résultats des élèves',
      'rapport.aucuneNote': 'Aucune note enregistrée pour cette séquence.',
      'rapport.aucuneAffectation': 'Aucune affectation ne vous est attribuée cette année.',
      'rapport.exporterPdf': 'Exporter en PDF',
      'rapport.exporterXlsx': 'Exporter en Excel',
      'rapport.imprimer': 'Imprimer',
      'rapport.repartitionSexe': 'Répartition par sexe',
      'rapport.garcons': 'Garçons',
      'rapport.filles': 'Filles',
      'rapport.tauxReussite': 'Taux de réussite',
      'rapport.tauxTotal': 'Total',
      'rapport.seuilReussite': 'Réussite : note ≥ la moitié de la note maximale',

      /* ---assiduité--- */
      'assiduite.appel': 'Appel',
      'assiduite.presents': 'Présents',
      'assiduite.absents': 'Absents',

      /* ---statistiques--- */
      'stats.aucuneDonnee': 'Aucune statistique disponible pour ces filtres.',

      /* ---tableau de bord enseignant--- */
      'tdb.titre': 'Mon tableau de bord',
      'tdb.sousTitre': 'Vue d’ensemble de mes classes',
      'tdb.bienvenue': 'Bonjour, {nom}',
      'tdb.aucuneAffectation': 'Aucune affectation ne vous est attribuée cette année.',
      'tdb.mesClasses': 'Mes classes',
      'tdb.elevesSuivis': 'Élèves suivis',
      'tdb.sequencesASaisir': 'Séquences à saisir',
      'tdb.tauxSaisie': 'Taux de saisie',
      'tdb.effectif': '{n} élèves • {saisies}/{total} notes',
      'tdb.saisir': 'Saisir',
      'tdb.rapport': 'Rapport',
      'tdb.derniereActions': 'Dernières actions',
      'tdb.rappels': 'Rappels',
      'tdb.sequenceComplete': 'Saisie complète',
      'tdb.sequenceEnCours': 'Saisie en cours',
      'tdb.sequenceVide': 'Aucune note saisie',
      'tdb.aucuneSequence': 'Aucune séquence ouverte pour le trimestre en cours.',
      'tdb.aucuneAction': 'Aucune note saisie pour le moment.',
      'tdb.noteSaisie': 'Note saisie — {eleve}',
      'tdb.rappelEnCours': '{n} séquence(s) encore à saisir',
      'tdb.rappelAJour': 'Toutes vos saisies sont à jour.',
      'tdb.rappelFerme': '{n} séquence(s) verrouillée(s) ou close(s).',
      'tdb.ouvrirSaisie': 'Saisie des notes',
      'tdb.ouvrirRapports': 'Rapports',
      'tdb.ouvrirClasses': 'Mes classes',

      /* ---profils / messages--- */
      'msg.anneeConsulee': 'Année scolaire : {annee}',
      'msg.consultationSeule': '{annee} : consultation en lecture seule.',
      'msg.exportPrete': 'Export généré.',
      'msg.impression': 'Ouverture de l’impression…',
      'msg.langueChangee': 'Langue : Français'
    },

    en: {
      'chrome.langue': 'Language',
      'chrome.langue.fr': 'French',
      'chrome.langue.en': 'English',
      'chrome.theme': 'Theme',
      'chrome.theme.clair': 'Light theme',
      'chrome.theme.sombre': 'Dark theme',
      'chrome.fil': 'Breadcrumb',
      'chrome.annee': 'School year',
      'chrome.profil': 'My profile',
      'chrome.deconnexion': 'Log out',
      'chrome.lectureSeule': 'Read-only',
      'chrome.espaceEnseignant': 'Teacher area',
      'chrome.administration': 'Administration',

      'role.admin': 'Administrator',
      'role.censeur': 'Censor',
      'role.enseignant': 'Teacher',

      'route.teacher_dashboard': 'Dashboard',
      'route.teacher_classes': 'My classes',
      'route.teacher_saisie': 'Grade entry',
      'route.teacher_ma_classe': 'My class',
      'route.teacher_rapports': 'Reports',
      'route.teacher_profil': 'Profile',
      'route.admin_dashboard': 'Dashboard',
      'route.admin_annees': 'School year',
      'route.admin_classes': 'Classes',
      'route.admin_matieres': 'Subjects',
      'route.admin_eleves': 'Students',
      'route.admin_personnel': 'Staff and teachers',
      'route.admin_inscriptions': 'Enrolments',
      'route.admin_migrations': 'Migrations',
      'route.admin_affectations': 'Assignments',
      'route.admin_notes': 'Grades (tracking)',
      'route.admin_bulletins': 'Report cards',
      'route.admin_statistiques': 'Statistics',
      'route.admin_assiduite': 'Attendance',
      'route.admin_rapports': 'Reports',
      'route.admin_vie_scolaire': 'Student life',
      'route.admin_journal': 'Audit log',
      'route.admin_parametres': 'Settings',

      'commun.classe': 'Class',
      'commun.classes': 'Classes',
      'commun.matiere': 'Subject',
      'commun.matieres': 'Subjects',
      'commun.sequence': 'Sequence',
      'commun.sequences': 'Sequences',
      'commun.trimestre': 'Term',
      'commun.trimestres': 'Terms',
      'commun.eleve': 'Student',
      'commun.eleves': 'Students',
      'commun.effectif': 'Enrolment',
      'commun.notes': 'Grades',
      'commun.note': 'Grade',
      'commun.moyenne': 'Average',
      'commun.moyennes': 'Averages',
      'commun.minimum': 'Minimum',
      'commun.maximum': 'Maximum',
      'commun.repartition': 'Distribution',
      'commun.presents': 'Present',
      'commun.absents': 'Absent',
      'commun.assiduite': 'Attendance',
      'commun.actions': 'Actions',
      'commun.rapports': 'Reports',
      'commun.statistiques': 'Statistics',
      'commun.annee': 'Year',
      'commun.total': 'Total',
      'commun.aucuneDonnee': 'Nothing to display.',
      'commun.chargement': 'Loading…',
      'commun.exporter': 'Export',
      'commun.imprimer': 'Print',
      'commun.fermer': 'Close',
      'commun.annuler': 'Cancel',
      'commun.valider': 'Validate',
      'commun.enregistrer': 'Save',
      'commun.rechercher': 'Search…',
      'commun.trier': 'Sort',
      'commun.aucunResultat': 'No result.',
      'commun.resultats': '{n} result(s)',
      'commun.remarque': 'Comment',
      'commun.statut': 'Status',
      'commun.nom': 'Last name',
      'commun.prenom': 'First name',
      'commun.matricule': 'Student ID',
      'commun.date': 'Date',
      'commun.type': 'Type',
      'commun.vide': '—',
      'commun.nonNote': 'Not graded',
      'commun.nonSaisi': 'Not entered',
      'commun.abs': 'ABS',
      'commun.presente': 'Present',
      'commun.absent': 'Absent',
      'commun.justifiee': 'Justified absence',
      'commun.injustifiee': 'Unjustified absence',

      'vie.cible': 'Student concerned',
      'vie.typeIncident': 'Incident type',
      'vie.gravity': 'Severity',
      'vie.circonstances': 'Circumstances',
      'vie.sanction': 'Sanction',
      'vie.resolu': 'Resolved',
      'vie.ouvrirIncident': 'Report an incident',
      'vie.historique': 'History',
      'vie.aucunIncident': 'No incident reported.',

      'accueil.bienvenue': 'Hello, {nom}',
      'accueil.session': 'Year {annee}',
      'accueil.aucuneDonnee': 'Nothing to display for now.',

      'saisie.titre': 'Grade entry',
      'saisie.sousTitre': 'Academic management • Results recording',
      'saisie.selectionnerClasse': 'Select a class',
      'saisie.selectionnerMatiere': 'Select a subject',
      'saisie.selectionnerSequence': 'Select a sequence',
      'saisie.charger': 'Load the list',
      'saisie.chargerTitre': 'Select a class, a subject and a sequence',
      'saisie.moyenne': 'Compute average',
      'saisie.exporter': 'Export CSV',
      'saisie.annulerModifs': 'Discard changes',
      'saisie.enregistrer': 'Save grades',
      'saisie.derniereNotes': 'Latest grades entered',
      'saisie.aucuneListe': 'No list loaded',
      'saisie.sequenceChargee': 'No sequence loaded',
      'saisie.progression': '{saisis}/{total} students entered ({pct}%)',
      'saisie.aucuneAffectation': 'No assignment is attributed to you this year: entry is impossible. Contact the administration.',
      'saisie.aucuneAnnee': 'No active school year: grade entry is unavailable.',
      'saisie.effectifInscriptions': 'Enrolment is managed from the Enrolments module.',

      'rapport.titre': 'Reports',
      'rapport.sousTitre': 'Results by class and sequence',
      'rapport.choisirClasse': 'Class',
      'rapport.choisirSequence': 'Sequence',
      'rapport.choisirMatiere': 'Subject',
      'rapport.aucuneClasse': 'Select a class',
      'rapport.aucuneSequence': 'Select a sequence',
      'rapport.repartitionNotes': 'Grade distribution',
      'rapport.resultatsEleves': 'Student results',
      'rapport.aucuneNote': 'No grade recorded for this sequence.',
      'rapport.aucuneAffectation': 'No assignment is attributed to you this year.',
      'rapport.exporterPdf': 'Export as PDF',
      'rapport.exporterXlsx': 'Export to Excel',
      'rapport.imprimer': 'Print',
      'rapport.repartitionSexe': 'Breakdown by gender',
      'rapport.garcons': 'Boys',
      'rapport.filles': 'Girls',
      'rapport.tauxReussite': 'Pass rate',
      'rapport.tauxTotal': 'Total',
      'rapport.seuilReussite': 'Pass mark: grade ≥ half of the maximum grade',

      'assiduite.appel': 'Attendance',
      'assiduite.presents': 'Present',
      'assiduite.absents': 'Absent',

      'stats.aucuneDonnee': 'No statistics available for these filters.',

      /* ---tableau de bord enseignant--- */
      'tdb.titre': 'My dashboard',
      'tdb.sousTitre': 'Overview of my classes',
      'tdb.bienvenue': 'Hello, {name}',
      'tdb.aucuneAffectation': 'No assignment is attributed to you this year.',
      'tdb.mesClasses': 'My classes',
      'tdb.elevesSuivis': 'Students followed',
      'tdb.sequencesASaisir': 'Sequences to enter',
      'tdb.tauxSaisie': 'Entry rate',
      'tdb.effectif': '{n} students • {saisies}/{total} grades',
      'tdb.saisir': 'Enter',
      'tdb.rapport': 'Report',
      'tdb.derniereActions': 'Latest actions',
      'tdb.rappels': 'Reminders',
      'tdb.sequenceComplete': 'Entry complete',
      'tdb.sequenceEnCours': 'Entry in progress',
      'tdb.sequenceVide': 'No grade entered',
      'tdb.aucuneSequence': 'No open sequence for the current term.',
      'tdb.aucuneAction': 'No grade entered yet.',
      'tdb.noteSaisie': 'Grade entered — {eleve}',
      'tdb.rappelEnCours': '{n} sequence(s) still to be entered',
      'tdb.rappelAJour': 'All your entries are up to date.',
      'tdb.rappelFerme': '{n} sequence(s) locked or closed.',
      'tdb.ouvrirSaisie': 'Grade entry',
      'tdb.ouvrirRapports': 'Reports',
      'tdb.ouvrirClasses': 'My classes',

      'msg.anneeConsulee': 'School year: {annee}',
      'msg.consultationSeule': '{annee}: read-only.',
      'msg.exportPrete': 'Export generated.',
      'msg.impression': 'Opening the print dialog…',
      'msg.langueChangee': 'Language: English'
    }
  };

  function lire() {
    var v = null;
    try { v = localStorage.getItem(CLE); } catch (e) { }
    return v === 'en' ? 'en' : 'fr';
  }
  function ecrire(v) {
    try { localStorage.setItem(CLE, v === 'en' ? 'en' : 'fr'); } catch (e) { }
  }

  function langue() { return lire(); }

  /* Interpolation {nom} et {0} : un libelle traduisible garde ses
     parametres au lieu d'etre duplique en deux chaines. */
  function t(cle, valeurs) {
    var lang = lire();
    var dico = DICTIONNAIRES[lang] || DICTIONNAIRES.fr;
    var s = dico[cle];
    if (s === undefined) s = (DICTIONNAIRES.fr[cle] !== undefined ? DICTIONNAIRES.fr[cle] : cle);
    if (!valeurs) return s;
    return s.replace(/\{(\w+)\}/g, function (m, nom) {
      return valeurs[nom] !== undefined ? valeurs[nom] : m;
    });
  }

  /* Applique les traductions presentes dans le DOM. Silencieux : une cle
     absente laisse le texte original, la page reste toujours lisible. */
  function appliquer(racine) {
    var r = racine || document;
    var lang = lire();
    var n = 0;

    r.querySelectorAll('[data-i18n]').forEach(function (node) {
      var cle = node.getAttribute('data-i18n');
      var s = (DICTIONNAIRES[lang] || {})[cle];
      if (s === undefined) return;
      /* On ne touche pas un noeud dont le contenu a ete rempli par une
         vue : il porte alors data-i18n-skip. */
      if (node.hasAttribute('data-i18n-skip')) return;
      node.textContent = s;
      n++;
    });
    r.querySelectorAll('[data-i18n-html]').forEach(function (node) {
      var s = (DICTIONNAIRES[lang] || {})[node.getAttribute('data-i18n-html')];
      if (s === undefined) return;
      node.innerHTML = s;
      n++;
    });
    r.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
      var s = (DICTIONNAIRES[lang] || {})[node.getAttribute('data-i18n-placeholder')];
      if (s === undefined) return;
      node.setAttribute('placeholder', s);
    });
    r.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      var s = (DICTIONNAIRES[lang] || {})[node.getAttribute('data-i18n-title')];
      if (s === undefined) return;
      node.setAttribute('title', s);
    });
    r.querySelectorAll('[data-i18n-aria]').forEach(function (node) {
      var s = (DICTIONNAIRES[lang] || {})[node.getAttribute('data-i18n-aria')];
      if (s === undefined) return;
      node.setAttribute('aria-label', s);
    });

    if (r === document) {
      document.documentElement.setAttribute('lang', lang);
      majSelecteur();
    }
    return n;
  }

  /* Le selecteur de langue : les boutons existent deja dans les maquettes
     (#lang-fr / #lang-en), il suffisait de les brancher. */
  function majSelecteur() {
    var fr = document.getElementById('lang-fr');
    var en = document.getElementById('lang-en');
    if (!fr && !en) return;
    var lang = lire();
    if (fr) {
      fr.classList.toggle('bg-accent', lang === 'fr');
      fr.classList.toggle('text-white', lang === 'fr');
      fr.classList.toggle('shadow-md', lang === 'fr');
      fr.classList.toggle('text-gray-500', lang !== 'fr');
      fr.setAttribute('aria-pressed', lang === 'fr' ? 'true' : 'false');
    }
    if (en) {
      en.classList.toggle('bg-accent', lang === 'en');
      en.classList.toggle('text-white', lang === 'en');
      en.classList.toggle('shadow-md', lang === 'en');
      en.classList.toggle('text-gray-500', lang !== 'en');
      en.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
    }
  }

  var branche = false;
  function definir(lang) {
    ecrire(lang);
    appliquer();
    var E = global.EduNeum;
    /* Le layout reconstruit le menu et le bandeau : on le retrace pour que
       le changement de langue s'applique aussi a ces elements laves. */
    if (E && E.layout && typeof E.layout.monterMenu === 'function') {
      E.layout.monterMenu();
      if (typeof E.layout.rafraichirBandeau === 'function') E.layout.rafraichirBandeau();
      appliquer();
    }
    if (E && E.ui && E.ui.toast) E.ui.toast(t('msg.langueChangee'), 'info');

    /* Les pages dont le contenu est construit par JavaScript (tableaux,
       indicateurs, listes) l'ont ecrit avec t() : appliquer() ne peut pas
       le retraduire, car ce texte n'est pas dans un attribut data-i18n. On
       les previent donc, et elles se rendent a nouveau en gardant leurs
       selections. */
    try {
      document.dispatchEvent(new CustomEvent('eduneum:langue', { detail: { lang: lang } }));
    } catch (e) { /* CustomEvent absent : ces pages resteront dans l'ancienne langue. */ }
  }

  function init() {
    /* La connexion a son propre selecteur : on ne le branche pas deux fois. */
    var E = global.EduNeum;
    var surConnexion = E && E.routes && E.routes.currentRouteKey
      && E.routes.currentRouteKey() === 'connexion';
    if (surConnexion) return;

    if (!branche) {
      branche = true;
      ['fr', 'en'].forEach(function (lang) {
        var b = document.getElementById('lang-' + lang);
        if (!b) return;
        b.addEventListener('click', function () {
          if (lire() === lang) return;
          definir(lang);
        });
      });
    }
    /* Applique au chargement. Les modules qui construisent leur contenu
       apres coup appellent eux-memes t() ou appliquer() : on n'ecoute
       pas le clic global, cela retraduirait tout le DOM en boucle. */
    appliquer();
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.i18n = {
    langue: langue, t: t, appliquer: appliquer, definir: definir,
    DICTIONNAIRES: DICTIONNAIRES
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
