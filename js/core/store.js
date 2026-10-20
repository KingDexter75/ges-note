/* EduNeum - Magasin de donnees centralise.
   Modele : annee scolaire -> classes / inscriptions / affectations / notes / bulletins.
   Les entites permanentes (eleves, enseignants, matieres) sont reutilisees d'une annee a l'autre.
   La base est detenue et persistee par le serveur (Django) : chargement via
   GET /api/bootstrap/, ecriture via POST /api/store/. Le localStorage n'est
   plus utilise. */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Amorcage                                                           */
  /* ------------------------------------------------------------------ */
  /* Base vide : structure minimale identique a l'instantane serveur. Le
     projet n'embarque AUCUN jeu de demonstration ; en mode serveur les
     donnees viennent uniquement de Django (GET /api/bootstrap/). */
  function vide() {
    return {
      version: 4,
      annees: [], sections: [], classes: [], matieres: [], eleves: [],
      enseignants: [], coefficients: [], inscriptions: [], affectations: [],
      affectationsCenseurs: [], sequences: [], notes: [], absences: [],
      migrations: [], profsPrincipaux: [], decisions: [], appreciations: [],
      bulletinsValides: [], journal: [], smsLog: [], sanctions: [], disciplines: [],
      parametres: {}, sequenceur: {}
    };
  }

  /* Compatibilite : l'amorcage local ne fournit plus de donnees de demo. */
  function seed() { return vide(); }

  /* ------------------------------------------------------------------ */
  /* Migrations de schema                                                */
  /*                                                                  */
  /* Le store est versionne. A chaque evolution du modele, on ajoute une */
  /* entree dans MIGRATIONS : elle est appliquee automatiquement au      */
  /* chargement, une seule fois, sur les bases deja creees.             */
  /* ------------------------------------------------------------------ */
  var MIGRATIONS = [
    {
      from: 1, to: 2,
      quoi: 'Appréciations PP, décisions, validations de bulletins, séquenceur étendu',
      appliquer: function (d) {
        d.appreciations = d.appreciations || [];
        d.decisions = d.decisions || [];
        d.bulletinsValides = d.bulletinsValides || [];
        d.absences = d.absences || [];
        ['annee', 'classe', 'matiere', 'enseignant', 'pp', 'decision', 'appreciation', 'bulletinvalide']
          .forEach(function (k) { d.sequenceur[k] = d.sequenceur[k] || 1; });
      }
    },
    {
      from: 2, to: 3,
      quoi: 'Identité des notes : triplet (séquence, élève, matière) + classe renseignée',
      appliquer: function (d) {
        /* Avant cette version, une note était retrouvée par le seul couple
           (séquence, élève) : une classe qui enseigne plusieurs matières ne
           pouvait donc porter qu'une seule note par élève et par séquence.
           Les données existantes sont conservées telles quelles ; on se
           contente de renseigner les champs manquants, et les notes sans
           matière ne sont comptées nulle part. */
        d.notes = d.notes || [];
        d.notes.forEach(function (n) {
          if (n.classeId) return;
          var ins = (d.inscriptions || []).filter(function (i) {
            return i.eleveId === n.eleveId && !i.archive;
          })[0];
          if (ins) n.classeId = ins.classeId;
        });
      }
    },
    {
      from: 3, to: 4,
      quoi: 'Sections (entité), attributions censeur, disciplines par séquence, champs spec (appreciation, dateSaisie, téléphone parent)',
      appliquer: function (d) {
        /* Entités ajoutées pour se conformer à la spécification : section,
           attribution censeur, discipline par séquence. Les champs de
           compatibilité (classe.section, eleve.contactTuteur, note.remarque)
           sont conservés ; on ne fait que compléter l'existant. */
        d.sections = d.sections || [
          { id: 'sec-fr', nom: 'Francophone' },
          { id: 'sec-en', nom: 'Anglophone' }
        ];
        var sectionParNom = { francophone: 'sec-fr', anglophone: 'sec-en' };
        (d.classes || []).forEach(function (c) {
          if (!c.sectionId) c.sectionId = sectionParNom[c.section] || 'sec-fr';
        });
        (d.eleves || []).forEach(function (e) {
          if (e.telephoneParent === undefined) e.telephoneParent = '';
        });
        (d.notes || []).forEach(function (n) {
          if (n.appreciation === undefined) n.appreciation = n.remarque || '';
          if (n.dateSaisie === undefined) n.dateSaisie = n.modifieLe || '';
        });
        d.affectationsCenseurs = d.affectationsCenseurs || [];
        d.disciplines = d.disciplines || [];
        d.sequenceur = d.sequenceur || {};
        ['censeur', 'discipline'].forEach(function (k) { d.sequenceur[k] = d.sequenceur[k] || 1; });
      }
    }
  ];

  function migrer(d) {
    if (!d.version) d.version = 1;
    var appliquees = [];
    MIGRATIONS.forEach(function (m) {
      if (d.version < m.to) {
        m.appliquer(d);
        appliquees.push(m.quoi);
        d.version = m.to;
      }
    });
    if (appliquees.length) {
      d.journal = d.journal || [];
      d.journal.push({
        id: 'migration-schema-' + Date.now(), date: new Date().toISOString(),
        action: 'schema.migration', cible: 'eduneum.db.v1',
        details: appliquees.join(' | '), auteurId: null
      });
    }
    return appliquees;
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* ------------------------------------------------------------------ */
  /* Acces                                                               */
  /* ------------------------------------------------------------------ */
  var db = null;
  var SERVER = !!global.__EDUNEUM_SERVER__;

  /* La base provient de Django (GET /api/bootstrap/), chargee une seule fois
     par page via une requete synchrone. Si l'access token est expire (401),
     on tente UN rafraichissement (POST /api/auth/refresh/) puis on reessaie.
     En mode serveur, aucun repli sur la base d'amorcage : une session
     invalide redirige vers la page de connexion. */
  function rafraichirSession() {
    try {
      var x = new XMLHttpRequest();
      x.open('POST', '/api/auth/refresh/', false);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send('{}');
      return x.status >= 200 && x.status < 300;
    } catch (e) { return false; }
  }

  function chargerServeur() {
    var tentative = 0;
    while (tentative < 2) {
      try {
        var xhr = new XMLHttpRequest();
        /* Parametre anti-cache : sans lui, une reponse deja mise en cache par
           le navigateur peut masquer un enregistrement tout juste effectue
           (l'ecran reafficherait les anciennes valeurs). */
        xhr.open('GET', '/api/bootstrap/?t=' + Date.now(), false);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.send(null);
        if (xhr.status === 401 && tentative === 0 && rafraichirSession()) {
          tentative++;
          continue;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          var rep = JSON.parse(xhr.responseText);
          if (rep && rep.db) {
            if (rep.session) global.__EDUNEUM_SESSION__ = rep.session;
            return rep.db;
          }
        }
        if (xhr.status === 401) return null; // session definitivement invalide
      } catch (e) { /* reseau indisponible : signale plus bas */ }
      return null;
    }
    return null;
  }

  function load() {
    if (db) return db;
    db = chargerServeur();
    if (!db) {
      if (SERVER) {
        /* Plus aucun jeu de demonstration embarque : sans session valide on
           renvoie l'utilisateur vers la connexion. */
        location.replace('/index.html');
        db = seed(); /* empeche les pages de planter pendant la navigation */
        return db;
      }
      db = seed();
    }
    /* Une base ancienne ou partielle peut ne pas porter tous les reglages :
       on comble les cles manquantes AVANT les migrations (qui supposent un
       sequenceur present) pour qu'aucun ecran ne casse faute de bareme. */
    completerParametres(db);
    if (migrer(db).length) save();
    return db;
  }

  /* Complete parametres/sequenceur SANS jamais ecraser une valeur existante :
     garanti un bareme d'appreciation, une moyenne de passage, un arrondi et
     des compteurs d'identifiants, quelle que soit la base servie. */
  function completerParametres(d) {
    if (!d) return d;
    var p = d.parametres = d.parametres || {};
    if (!p.etablissement) p.etablissement = { nom: 'Lycée Bilingue Example', sigle: 'LBE', logo: '', adresse: '', telephone: '' };
    if (p.etablissement.adresse === undefined) p.etablissement.adresse = '';
    if (p.etablissement.telephone === undefined) p.etablissement.telephone = '';
    if (!Array.isArray(p.baremeAppreciation) || !p.baremeAppreciation.length) {
      p.baremeAppreciation = [
        { min: 16, label: 'Excellent travail' }, { min: 14, label: 'Très bon travail' },
        { min: 12, label: 'Bon travail' }, { min: 10, label: 'Ensemble satisfaisant' },
        { min: 8, label: 'Passable' }, { min: 0, label: 'Insuffisant' }
      ];
    }
    if (!Array.isArray(p.baremeAppreciationFrancophone) || !p.baremeAppreciationFrancophone.length) {
      p.baremeAppreciationFrancophone = [
        { min: 16, label: 'Excellent' }, { min: 14, label: 'Très Bien' },
        { min: 12, label: 'Bien' }, { min: 10, label: 'Assez Bien' },
        { min: 8, label: 'Passable' }, { min: 0, label: 'Insuffisant' }
      ];
    }
    if (!Array.isArray(p.baremeCompetences) || !p.baremeCompetences.length) {
      p.baremeCompetences = [
        { min: 16, label: 'Excellent' }, { min: 12, label: 'Acquis' },
        { min: 8, label: 'En cours d\'acquisition' }, { min: 0, label: 'Non Acquis' }
      ];
    }
    if (!Array.isArray(p.gceGradeScale) || !p.gceGradeScale.length) {
      p.gceGradeScale = [
        { min: 75, grade: 'A', label: 'Excellent' }, { min: 70, grade: 'B', label: 'Very Good' },
        { min: 65, grade: 'C', label: 'Good' }, { min: 60, grade: 'D', label: 'Satisfactory' },
        { min: 50, grade: 'E', label: 'Pass' }, { min: 0, grade: 'U', label: 'Fail' }
      ];
    }
    if (p.moyennePassage === undefined) p.moyennePassage = 10;
    if (p.arrondi === undefined) p.arrondi = 2;
    if (!p.sections) {
      p.sections = {
        francophone: { noteMax: 20, appreciationType: 'competences' },
        anglophone: { noteMax: 100, appreciationType: 'gce' }
      };
    }
    var s = d.sequenceur = d.sequenceur || {};
    ['eleve', 'inscription', 'affectation', 'note', 'migration', 'absence', 'journal',
      'annee', 'classe', 'matiere', 'enseignant', 'pp', 'decision', 'appreciation',
      'bulletinvalide'].forEach(function (k) { if (s[k] === undefined) s[k] = 1; });
    return d;
  }

  /* save() est le point de sortie unique vers le stockage.
     Appelee avec un NOM DE MODULE (une chaine), elle applique la meme
     matrice de droits que l'API d'ecriture : une page qui tente
     d'ecrire directement en passant par load()/save() est refusee au
     lieu d'ecrire en douce. La base n'est persistee que cote serveur. */
  function save(mod) {
    /* Toute ecriture invalide l'index des notes : il est reconstruit au
       prochain calcul, a partir des donnees a jour. */
    invaliderIndexNotes();
    /* sans argument : usage interne (journal, migrations) — la base en
       memoire telle quelle ; deja verifie en amont par l'appelant. */
    var estModule = (typeof mod === 'string');
    if (estModule) {
      var A = accesA();
      if (A) {
        var v = A.verifierEcriture(mod, null);
        if (!v.ok) { saveRefusee = v.motif; return false; }
      }
    }
    saveRefusee = null;
    planifierPersistance();
    return true;
  }
  var saveRefusee = null;
  function dernierRefus() { return saveRefusee; }

  /* Persistance serveur : les ecritures rapprochees sont regroupees puis
     envoyees a Django sous la forme d'un instantane complet (POST /api/store/).
     Un envoi de secours (beacon) couvre le cas d'une navigation immediate. */
  var persistTimer = null;
  var persistEnAttente = false;
  function planifierPersistance() {
    persistEnAttente = true;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persisterMaintenant, 200);
  }
  function envoyerPersistance() {
    var charge = JSON.stringify(db);
    return envoyerStore(charge, false);
  }
  function envoyerStore(charge, dejaRafraichi) {
    return fetch('/api/store/', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: charge
    }).then(function (r) {
      if (r && r.ok) { persistEnAttente = false; persistErreurSignalee = false; return true; }
      /* Access token expire : on rafraichit une fois puis on renvoie. */
      if (r && r.status === 401 && !dejaRafraichi && rafraichirSession()) {
        return envoyerStore(charge, true);
      }
      /* 403 : le serveur a refuse selon la matrice de droits — on affiche
         SON motif, pas un generique. */
      if (r && r.status === 403) {
        return r.json().then(function (rep) {
          signalerRefusServeur((rep && rep.motif) || 'Écriture refusée par le serveur.');
          return false;
        }).catch(function () { signalerEchecPersistance(); return false; });
      }
      signalerEchecPersistance(); return false;
    }).catch(function () { signalerEchecPersistance(); return false; });
  }
  function persisterMaintenant() {
    persistTimer = null;
    if (!SERVER || !db) return Promise.resolve(true);
    return envoyerPersistance();
  }
  /* Envoie sans attendre le delai d'inactivite et renvoie une promesse : une
     page qui doit se recharger apres un enregistrement l'attend pour ne pas
     relire d'anciennes valeurs (transaction serveur non terminee). */
  function flush() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    if (!SERVER || !db || !persistEnAttente) return Promise.resolve(true);
    return envoyerPersistance();
  }
  /* Un enregistrement refuse au niveau serveur ne doit pas rester silencieux :
     l'utilisateur croirait que sa modification a ete prise en compte. */
  var persistErreurSignalee = false;
  function signalerEchecPersistance() {
    if (persistErreurSignalee) return;
    persistErreurSignalee = true;
    if (global.EduNeum && global.EduNeum.ui && global.EduNeum.ui.toast) {
      global.EduNeum.ui.toast("Enregistrement impossible : vérifiez votre connexion.", 'erreur');
    }
  }
  /* Refus explicite du serveur (droits, annee cloturee...) : affiche le motif
     renvoye par l'API a chaque tentative, sans debordement de toasts. */
  function signalerRefusServeur(motif) {
    persistErreurSignalee = false;
    if (global.EduNeum && global.EduNeum.ui && global.EduNeum.ui.toast) {
      global.EduNeum.ui.toast('Enregistrement refusé : ' + motif, 'erreur');
    }
  }
  function persisterAvantDechargement() {
    if (!SERVER || !persistEnAttente || !db) return;
    try {
      var blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
      navigator.sendBeacon('/api/store/', blob);
      persistEnAttente = false;
    } catch (e) { /* ignore */ }
  }
  if (global.addEventListener) global.addEventListener('beforeunload', persisterAvantDechargement);

  function nextId(prefix) {
    var d = load();
    var n = d.sequenceur[prefix] = (d.sequenceur[prefix] || 1);
    d.sequenceur[prefix] = n + 1;
    return prefix + n;
  }

  /* En mode serveur, la reinitialisation efface les donnees metier (le
     serveur ne recharge AUCUN jeu de demonstration) : on repart d'une base
     vide en conservant les parametres de l'etablissement. */
  function reset() {
    invaliderIndexNotes();
    if (SERVER) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/reset/', false);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300) { db = null; return true; }
        return false;
      } catch (e) { return false; }
    }
    db = seed(); save();
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Selecteurs                                                          */
  /* ------------------------------------------------------------------ */
  function all(coll) { return load()[coll] || []; }

  function anneeActive() {
    var a = all('annees').filter(function (x) { return x.active && !x.cloturee; });
    return a[0] || all('annees').filter(function (x) { return !x.cloturee; }).slice(-1)[0] || null;
  }

  function anneeParId(id) { return all('annees').filter(function (x) { return x.id === id; })[0] || null; }

  /* ------------------------------------------------------------------ */
  /* Ordre des classes : par NIVEAU (Sixieme -> Terminale pour le
     sous-systeme francophone, Form 1 -> Upper Sixth pour l'anglophone),
     puis alphabetique a niveau egal. Cet ordre s'applique partout ou une
     liste de classes est affichee (selecteurs, tableaux, tableaux de
     bord, rapports, bulletins). */
  var NIVEAUX_PAR_SECTION = {
    francophone: ['Sixième', 'Cinquième', 'Quatrième', 'Troisième', 'Seconde', 'Première', 'Terminale'],
    anglophone: ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower Sixth', 'Upper Sixth']
  };
  function cleNiveau(n) {
    return String(n || '')
      .toLowerCase()
      .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o').replace(/[ûùü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[\s_\-]+/g, '');
  }
  var ORDRE_NIVEAUX = (function () {
    var map = {};
    NIVEAUX_PAR_SECTION.francophone.forEach(function (n, i) { map[cleNiveau(n)] = i; });
    NIVEAUX_PAR_SECTION.anglophone.forEach(function (n, i) { map[cleNiveau(n)] = 100 + i; });
    return map;
  })();

  /* Niveau inconnu ou absent : classes rangees en derniere, par nom. */
  function comparerClasses(a, b) {
    var oa = ORDRE_NIVEAUX[cleNiveau(a && a.niveau)];
    var ob = ORDRE_NIVEAUX[cleNiveau(b && b.niveau)];
    if (oa === undefined) oa = 10000;
    if (ob === undefined) ob = 10000;
    if (oa !== ob) return oa - ob;
    var d = String((a && a.nom) || '').localeCompare(String((b && b.nom) || ''), 'fr',
      { numeric: true, sensitivity: 'base' });
    if (d) return d;
    return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
  }

  function classesDe(anneeId) {
    return all('classes')
      .filter(function (c) { return c.anneeId === anneeId && !c.archive; })
      .sort(comparerClasses);
  }

  function classeParId(id) { return all('classes').filter(function (c) { return c.id === id; })[0] || null; }
  function matiereParId(id) { return all('matieres').filter(function (m) { return m.id === id; })[0] || null; }
  function eleveParId(id) { return all('eleves').filter(function (e) { return e.id === id; })[0] || null; }
  function enseignantParId(id) { return all('enseignants').filter(function (p) { return p.id === id; })[0] || null; }

  /* Section helpers */
  function sectionDeClasse(classeId) {
    var c = classeParId(classeId);
    return c ? c.section || 'francophone' : 'francophone';
  }

  function estSectionFrancophone(classeId) { return sectionDeClasse(classeId) === 'francophone'; }
  function estSectionAnglophone(classeId) { return sectionDeClasse(classeId) === 'anglophone'; }

  function noteMaxPourClasse(classeId) {
    var section = sectionDeClasse(classeId);
    var p = load().parametres;
    if (section === 'anglophone' && p.sections && p.sections.anglophone) return p.sections.anglophone.noteMax || 100;
    return 20;
  }

  function baremeAppreciationPourClasse(classeId) {
    var section = sectionDeClasse(classeId);
    var p = load().parametres;
    if (section === 'francophone') {
      return p.baremeCompetences || p.baremeAppreciationFrancophone || p.baremeAppreciation;
    }
    if (section === 'anglophone') {
      return p.gceGradeScale || p.baremeAppreciation;
    }
    return p.baremeAppreciation;
  }

  function appreciationPourMoyenne(moyenne, classeId) {
    if (moyenne === null || moyenne === undefined) return 'Non renseignée';
    var bareme = baremeAppreciationPourClasse(classeId);
    for (var i = 0; i < bareme.length; i++) {
      if (moyenne >= bareme[i].min) return bareme[i].label;
    }
    return bareme[bareme.length - 1].label;
  }

  function noteVersGCE(noteSur20) {
    if (noteSur20 === null || noteSur20 === undefined) return { grade: 'U', label: 'Fail', points: 0 };
    var sur100 = (noteSur20 / 20) * 100;
    var gce = load().parametres.gceGradeScale;
    for (var i = 0; i < gce.length; i++) {
      if (sur100 >= gce[i].min) return { grade: gce[i].grade, label: gce[i].label, points: sur100 };
    }
    return { grade: 'U', label: 'Fail', points: sur100 };
  }

  function GCEVersNote(grade) {
    var gce = load().parametres.gceGradeScale;
    var g = gce.filter(function (x) { return x.grade === grade; })[0];
    return g ? (g.min / 100) * 20 : null;
  }

  function coefficient(classeId, matiereId) {
    var c = all('coefficients').filter(function (x) { return x.classeId === classeId && x.matiereId === matiereId; })[0];
    return c ? c.coefficient : 0;
  }

  /* definirCoefficient() est defini plus bas, avec l'API d'ecriture centralisee. */

  function matieresDeClasse(classeId) {
    return all('matieres').filter(function (m) {
      return !m.archive && coefficient(classeId, m.id) > 0;
    });
  }

  /* Les eleves d'une salle de classe sont TOUJOURS presents dans l'ordre
     alphabetique (nom, puis prenom) : c'est l'ordre des listes officielles
     et celui que chaque page (saisie, notes, rapports, bulletins) affiche. */
  function comparerEleves(a, b) {
    var na = String((a && a.nom) || '').toLowerCase();
    var nb = String((b && b.nom) || '').toLowerCase();
    var d = na.localeCompare(nb, 'fr', { numeric: true, sensitivity: 'base' });
    if (d) return d;
    return String((a && a.prenom) || '').toLowerCase()
      .localeCompare(String((b && b.prenom) || '').toLowerCase(), 'fr', { numeric: true, sensitivity: 'base' });
  }

  function elevesDeClasse(classeId, anneeId) {
    return all('inscriptions')
      .filter(function (i) { return i.classeId === classeId && i.anneeId === anneeId && !i.archive; })
      .map(function (i) { return eleveParId(i.eleveId); })
      .filter(Boolean)
      .sort(comparerEleves);
  }

  function classeDeEleve(eleveId, anneeId) {
    var i = all('inscriptions').filter(function (x) {
      return x.eleveId === eleveId && x.anneeId === anneeId && !x.archive;
    })[0];
    return i ? classeParId(i.classeId) : null;
  }

  function affectationsDe(anneeId) {
    return all('affectations').filter(function (a) { return a.anneeId === anneeId; });
  }

  /* Combinaisons autorisees : c'est la base des droits de saisie. */
  function affectationsDeEnseignant(enseignantId, anneeId) {
    return affectationsDe(anneeId).filter(function (a) { return a.enseignantId === enseignantId; });
  }

  function peutSaisir(enseignantId, classeId, matiereId, anneeId) {
    return affectationsDe(anneeId).some(function (a) {
      return a.enseignantId === enseignantId && a.classeId === classeId && a.matiereId === matiereId;
    });
  }

  function sequencesDe(anneeId) { return all('sequences').filter(function (s) { return s.anneeId === anneeId; }); }

  function sequencesDeTrimestre(trimestreId) {
    return all('sequences').filter(function (s) { return s.trimestreId === trimestreId; })
      .sort(function (a, b) { return a.numero - b.numero; });
  }

  function sequenceParId(id) { return all('sequences').filter(function (s) { return s.id === id; })[0] || null; }

  function trimestresDe(anneeId) {
    var an = anneeParId(anneeId);
    return an ? an.trimestres.slice().sort(function (a, b) { return a.numero - b.numero; }) : [];
  }

  function trimestreParId(id) {
    var found = null;
    all('annees').forEach(function (an) {
      an.trimestres.forEach(function (t) { if (t.id === id) found = t; });
    });
    return found;
  }

  function trimestreDeSequence(seqId) {
    var s = sequenceParId(seqId);
    return s ? trimestreParId(s.trimestreId) : null;
  }

  /* ------------------------------------------------------------------ */
  /* Notes                                                               */
  /* ------------------------------------------------------------------ */
  /* Une note est identifiee par le triplet (sequence, eleve, matiere) :
     sans la matiere dans la cle, un eleve ne pourrait avoir qu'une seule
     note par sequence et toutes les matieres renverraient la meme valeur. */
  function notesDe(sequenceId, classeId, matiereId) {
    return all('notes').filter(function (n) {
      if (sequenceId && n.sequenceId !== sequenceId) return false;
      if (classeId && n.classeId !== classeId) return false;
      if (matiereId && n.matiereId !== matiereId) return false;
      return true;
    });
  }

  /* Index des notes par triplet (sequence, eleve, matiere). Parcourir
     lineairement toutes les notes a chaque appel etait le principal cout des
     pages de calcul (bulletins, conseils, rapports) : avec des dizaines de
     milliers de notes, un seul bulletin declenchait des millions de
     comparaisons. L'index est construit a la demande puis invalide des
     qu'une ecriture a lieu (save()), donc une note remplacee ou supprimee
     n'est jamais servie perimee. Les notes sont uniques par triplet
     (enregistrerNote met a jour la ligne existante), la table est donc
     exacte. */
  var indexNotes = null;
  var CLE_NOTE = '\u0001';
  function invaliderIndexNotes() { indexNotes = null; }
  function indexerNotes() {
    if (indexNotes) return indexNotes;
    var notes = all('notes');
    var index = {};
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      index[n.sequenceId + CLE_NOTE + n.eleveId + CLE_NOTE + n.matiereId] = n;
    }
    indexNotes = index;
    return index;
  }

  function note(sequenceId, eleveId, matiereId) {
    if (matiereId) {
      return indexerNotes()[sequenceId + CLE_NOTE + eleveId + CLE_NOTE + matiereId] || null;
    }
    /* matiereId facultatif pour les anciens appelants : repli lineaire, rare. */
    return all('notes').filter(function (n) {
      return n.sequenceId === sequenceId && n.eleveId === eleveId;
    })[0] || null;
  }

  /* enregistrerNote() et remarqueNote() sont definis plus bas, dans
     l'API d'ecriture centralisee (ils doivent passer par acces.verifierEcriture). */

  /* Progression de la saisie d'une sequence.
     - matiereId fourni : suivi de la classe pour CETTE matiere,
       total = nombre d'eleves.
     - matiereId absent   : suivi agrege sur toutes les matieres,
       total = eleves x matieres, et une saisie compte par (eleve, matiere).
     Dans les deux cas une matiere non notee ne compte pas comme saisie. */
  function progression(sequenceId, classeId, matiereId) {
    var anneeId = classeDeSequenceAnnee(sequenceId);
    var eleves = elevesDeClasse(classeId, anneeId);
    var notes = notesDe(sequenceId, classeId, matiereId);

    if (matiereId) {
      var vusParEleve = {};
      var saisiesMatiere = notes.filter(function (n) {
        if (n.statut !== 'note') return false;
        if (vusParEleve[n.eleveId]) return false;
        vusParEleve[n.eleveId] = 1;
        return true;
      }).length;
      return { total: eleves.length, saisies: Math.min(saisiesMatiere, eleves.length) };
    }

    var attendu = {};
    eleves.forEach(function (e) {
      matieresDeClasse(classeId).forEach(function (m) { attendu[e.id + '|' + m.id] = 1; });
    });
    var vues = {};
    var saisiesAgrees = 0;
    notes.forEach(function (n) {
      if (n.statut !== 'note') return;
      var cle = n.eleveId + '|' + n.matiereId;
      if (!attendu[cle] || vues[cle]) return;
      vues[cle] = 1;
      saisiesAgrees++;
    });
    var total = Object.keys(attendu).length;
    return { total: total, saisies: Math.min(saisiesAgrees, total) };
  }

  function classeDeSequenceAnnee(sequenceId) {
    var s = sequenceParId(sequenceId);
    return s ? s.anneeId : null;
  }

  /* ------------------------------------------------------------------ */
  /* Journal d'audit                                                     */
  /* ------------------------------------------------------------------ */
  function journaliser(action, cible, details, auteurId) {
    var d = load();
    d.journal.push({
      id: nextId('journal'),
      date: new Date().toISOString(),
      action: action, cible: cible || null,
      details: details || null, auteurId: auteurId || null
    });
    if (d.journal.length > 500) d.journal.splice(0, d.journal.length - 500);
    save();
  }

  function journal(limite) {
    var j = all('journal').slice().reverse();
    return limite ? j.slice(0, limite) : j;
  }

  /* ------------------------------------------------------------------ */
  /* Migrations                                                          */
  /* ------------------------------------------------------------------ */
  /* Les notes deja saisies sont conservees : seule l'inscription bouge. */
  function transfererEleve(eleveId, versClasseId, motif) {
    /* L'annee de travail est celle consultee dans l'en-tete : c'est elle que
       la matrice d'acces autorise a ecrire. `ecrire` refuse de toute facon
       une annee passee ou cloturee, donc les deux notions coincident ici. */
    var an = (accesA() && accesA().anneeConsultee) ? accesA().anneeConsultee() : anneeActive();
    return ecrire('admin_migrations', null, null, function (d) {
      var e = d.eleves.filter(function (x) { return x.id === eleveId; })[0];
      if (!e) return echec('Élève introuvable.');
      var cible = d.classes.filter(function (x) { return x.id === versClasseId; })[0];
      if (!cible) return echec('Classe de destination introuvable.');
      if (cible.anneeId !== an.id) return echec('La classe de destination n\'appartient pas à l\'année active.');

      var ins = d.inscriptions.filter(function (i) {
        return i.eleveId === eleveId && i.anneeId === an.id && !i.archive;
      })[0];
      if (!ins) return echec('Cet élève n\'est inscrit dans aucune classe cette année.');
      if (ins.classeId === versClasseId) return echec('Cet élève est déjà dans cette classe.');
      var depart = d.classes.filter(function (x) { return x.id === ins.classeId; })[0];

      var m = {
        id: nextId('migration'), type: 'transfert', eleveId: eleveId,
        deClasseId: ins.classeId, versClasseId: versClasseId, anneeId: an.id,
        motif: motif || '', auteurId: moi(), date: new Date().toISOString()
      };
      ins.classeId = versClasseId;
      ins.dateMigration = new Date().toISOString().slice(0, 10);
      d.migrations.push(m);
      /* Les notes restent rattachees a leur classe d'origine : l'historique
         de l'eleve dans l'ancienne classe est preserve. */
      return { ok: true, migration: m, de: depart ? depart.nom : ins.classeId, vers: cible.nom };
    });
  }

  /* Passage en fin d'annee : classe N -> classe N+1 en un clic. */
  function passerEnAnneeSuivante(decisions) {
    var an = anneeActive();
    return ecrire('admin_migrations', null, null, function (d) {
      var suivante = d.annees.filter(function (a) { return a.id !== an.id; })
        .sort(function (x, y) { return x.dateDebut < y.dateDebut ? 1 : -1; })[0];
      if (!suivante) return echec('Aucune année scolaire suivante n\'est créée.');
      var classesAnciennes = {}, classesNouvelles = {};
      d.classes.forEach(function (c) {
        if (c.anneeId === an.id) classesAnciennes[c.id] = c;
        if (c.anneeId === suivante.id) classesNouvelles[c.id] = c;
      });
      if (!Object.keys(classesNouvelles).length) {
        return echec('Aucune classe n\'existe pour ' + suivante.libelle + ' : créez-les avant le passage.');
      }
      var faits = [], refus = [];
      decisions.forEach(function (p) {
        var ins = d.inscriptions.filter(function (i) {
          return i.eleveId === p.eleveId && i.anneeId === an.id && !i.archive;
        })[0];
        if (!ins) { refus.push({ eleveId: p.eleveId, motif: 'Non inscrit cette année' }); return; }
        if (!classesAnciennes[ins.classeId]) { refus.push({ eleveId: p.eleveId, motif: 'Classe d\'origine inconnue' }); return; }
        if (p.decision === 'exclu') {
          ins.statut = 'exclu';
          d.migrations.push({
            id: nextId('migration'), type: 'passage', eleveId: p.eleveId, deClasseId: ins.classeId,
            versClasseId: null, anneeId: an.id, decision: 'exclu', motif: 'Exclu de l\'établissement',
            auteurId: moi(), date: new Date().toISOString()
          });
          faits.push(p.eleveId);
          return;
        }
        var cible = p.versClasseId ? classesNouvelles[p.versClasseId] : null;
        if (!cible) { refus.push({ eleveId: p.eleveId, motif: 'Classe de destination absente pour ' + suivante.libelle }); return; }
        d.inscriptions.push({
          id: nextId('inscription'), eleveId: p.eleveId, classeId: cible.id, anneeId: suivante.id,
          dateInscription: new Date().toISOString().slice(0, 10),
          statut: p.decision === 'redouble' ? 'redouble' : 'active', archive: false
        });
        d.migrations.push({
          id: nextId('migration'), type: 'passage', eleveId: p.eleveId, deClasseId: ins.classeId,
          versClasseId: cible.id, anneeId: an.id, decision: p.decision || 'admis',
          motif: 'Passage ' + an.libelle + ' -> ' + suivante.libelle, auteurId: moi(), date: new Date().toISOString()
        });
        ins.statut = p.decision === 'redouble' ? 'redouble' : 'passe';
        faits.push(p.eleveId);
      });
      journaliser('migration.passage', 'annee:' + an.id,
        faits.length + ' élèves passés vers ' + suivante.libelle + ', ' + refus.length + ' refusés', moi());
      return { ok: true, anneeSuivante: suivante, faits: faits, refus: refus };
    });
  }

  function migrationsDe(anneeId) { return all('migrations').filter(function (m) { return m.anneeId === anneeId; }); }

  /* ================================================================== */
  /* API D'ECRITURE CENTRALISEE                                          */
  /*                                                                  */
  /* Toute mutation passe par ecrire() :                               */
  /*   1. acces.verifierEcriture(module, contexte)  -> matrice droits   */
  /*   2. regles metier explicites                                  */
  /*   3. journal d'audit                                            */
  /* Les pages ne doivent PLUS appeler S.load()/S.save() : c'etait       */
  /* jusqu'ici la faille qui permettait d'ecrire sans aucun controle.   */
  /* ================================================================== */

  function accesA() { return global.EduNeum && global.EduNeum.acces ? global.EduNeum.acces : null; }
  function moi() {
    var A = accesA();
    var s = A ? A.session() : null;
    return s ? s.enseignantId : null;
  }

  /* Enveloppe commune : controle d'acces, puis execution, puis audit. */
  function ecrire(mod, ctx, audit, fn) {
    var A = accesA();
    if (A) {
      var v = A.verifierEcriture(mod, ctx);
      if (!v.ok) {
        /* un refus laisse une trace : c'est autant utile qu'une reussite
           pour comprendre l'etat d'un etablissement */
        journaliser('refus.' + mod, null, v.motif, moi());
        return { ok: false, motif: v.motif };
      }
    }
    var res = fn(load());
    /* une regle metier qui refuse doit aussi etre tracee */
    if (res && res.ok === false) journaliser('refus.' + mod, null, res.motif, moi());
    save();
    if (audit) journaliser(audit.action, audit.cible, audit.details, moi());
    if (res && typeof res === 'object' && res.ok === undefined) res.ok = true;
    return res || { ok: true };
  }
  function echec(motif) { return { ok: false, motif: motif }; }

  function unique(d, collection, champ, valeur, ignorerId) {
    return !d[collection].some(function (l) {
      return l[champ] === valeur && l.id !== ignorerId;
    });
  }
  function texte(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  /* --------------------------- Annees scolaires --------------------- */
  function creerAnnee(o) {
    return ecrire('admin_annees', null, null, function (d) {
      if (!texte(o.libelle)) return echec('La libellé de l\'année est obligatoire.');
      if (!unique(d, 'annees', 'libelle', texte(o.libelle))) return echec('Cette année scolaire existe déjà.');
      if (!o.dateDebut || !o.dateFin) return echec('Les dates de début et de fin sont obligatoires.');
      if (o.dateFin <= o.dateDebut) return echec('La date de fin doit être postérieure à la date de début.');
      var id = nextId('annee');
      var nbTrim = o.nbTrimestres || 3;
      var an = {
        id: id, libelle: texte(o.libelle), active: false, cloturee: false,
        dateDebut: o.dateDebut, dateFin: o.dateFin, trimestres: []
      };
      for (var n = 1; n <= nbTrim; n++) {
        an.trimestres.push({
          id: id + '-t' + n, libelle: n + (n === 1 ? 'er' : 'e') + ' trimestre',
          numero: n, dateDebut: '', dateFin: '', ouvert: n === 1, valide: false
        });
      }
      d.annees.push(an);
      /* 2 sequences par trimestre, fermees tant que l'annee n'est pas active */
      an.trimestres.forEach(function (t) {
        [1, 2].forEach(function (s) {
          d.sequences.push({
            id: an.id + '-' + t.id + '-s' + s, anneeId: an.id, trimestreId: t.id,
            numero: s, libelle: 'Séquence ' + s, dateDebut: '', dateFin: '',
            ouverte: false, verrouillee: false, validee: false
          });
        });
      });
      journaliser('annee.creation', 'annee:' + id, an.libelle, moi());
      return { ok: true, id: id };
    });
  }

  /* Une seule annee active a la fois : toute activation cloture l'autre.
     Reactiver une annee cloturee est un degel complet : on retire le
     verrou, on rouvre les trimestres et on debloque les sequences —
     sinon l'annee serait active mais toutes les saisies resteraient
     bloquees. Seul un role pouvant ecrire sur annees (admin/direction)
     y est arrive, le serveur le verifie. */
  function activerAnnee(anneeId) {
    return ecrire('admin_annees', null, null, function (d) {
      var an = d.annees.filter(function (a) { return a.id === anneeId; })[0];
      if (!an) return echec('Année introuvable.');
      var clotureeAvant = !!an.cloturee;
      an.cloturee = false;
      d.annees.forEach(function (a) { a.active = (a.id === anneeId); });
      if (clotureeAvant) {
        an.trimestres.forEach(function (t) { t.ouvert = false; t.valide = false; });
        d.sequences.forEach(function (s) {
          if (s.anneeId === anneeId) { s.ouverte = false; s.verrouillee = false; s.validee = false; }
        });
        journaliser('annee.reactivation', 'annee:' + anneeId, an.libelle, moi());
      } else {
        journaliser('annee.activation', 'annee:' + anneeId, an.libelle, moi());
      }
      return { ok: true, id: anneeId, reactivée: clotureeAvant };
    });
  }

  function cloturerAnnee(anneeId) {
    return ecrire('admin_annees', null, null, function (d) {
      var an = d.annees.filter(function (a) { return a.id === anneeId; })[0];
      if (!an) return echec('Année introuvable.');
      an.cloturee = true; an.active = false;
      an.trimestres.forEach(function (t) { t.ouvert = false; });
      d.sequences.forEach(function (s) { if (s.anneeId === anneeId) { s.ouverte = false; s.verrouillee = true; } });
      journaliser('annee.cloture', 'annee:' + anneeId, an.libelle, moi());
      return { ok: true };
    });
  }

  /* ------------------------ Trimestres et sequences ------------------ */
  /* Dates d'un trimestre ou d'une sequence : sans elles, le calendrier de
     l'annee reste declare mais non exploitable. Les periodes doivent rester
     ordonnees et contenues dans l'annee, sinon la generation des bulletins
     par periode n'a aucun sens. */
function modifierPeriode(type, id, dateDebut, dateFin) {
    return ecrire('admin_annees', null, null, function (d) {
      if (!dateDebut || !dateFin) return echec('Les dates de début et de fin sont obligatoires.');
      if (dateFin < dateDebut) return echec('La date de fin doit suivre la date de début.');
      var an = null;
      if (type === 'trimestre') {
        var t = null;
        d.annees.forEach(function (a) { a.trimestres.forEach(function (x) { if (x.id === id) { t = x; an = a; } }); });
        if (!t) return echec('Trimestre introuvable.');
        if (dateDebut < an.dateDebut || dateFin > an.dateFin) {
          return echec('La période doit rester comprise entre le ' + UI_DATE(an.dateDebut) +
            ' et le ' + UI_DATE(an.dateFin) + ' de l\'année scolaire.');
        }
        t.dateDebut = dateDebut; t.dateFin = dateFin;
        journaliser('trimestre.periode', 'trimestre:' + id, t.libelle + ' ' + dateDebut + ' → ' + dateFin, moi());
        return { ok: true, trimestre: t };
      }
      var s = d.sequences.filter(function (x) { return x.id === id; })[0];
      if (!s) return echec('Séquence introuvable.');
      var trim = null;
      d.annees.forEach(function (a) { a.trimestres.forEach(function (x) { if (x.id === s.trimestreId) { trim = x; an = a; } }); });
      if (trim && trim.dateDebut && (dateDebut < trim.dateDebut || dateFin > trim.dateFin)) {
        return echec('La séquence doit rester comprise dans son trimestre (' +
          UI_DATE(trim.dateDebut) + ' → ' + UI_DATE(trim.dateFin) + ').');
      }
      s.dateDebut = dateDebut; s.dateFin = dateFin;
      journaliser('sequence.periode', 'sequence:' + id, s.libelle + ' ' + dateDebut + ' → ' + dateFin, moi());
      return { ok: true, sequence: s };
    });
  }
function UI_DATE(iso) {
    if (!iso) return '?';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }

function etatTrimestre(trimestreId, ouvert, valide) {
    return ecrire('admin_annees', null, null, function (d) {
      var t = null;
      d.annees.forEach(function (a) {
        a.trimestres.forEach(function (x) { if (x.id === trimestreId) t = x; });
      });
      if (!t) return echec('Trimestre introuvable.');
      if (valide !== undefined) {
        if (t.valide && !valide) return echec('Un trimestre validé ne peut plus être dévalidé.');
        t.valide = !!valide;
        d.sequences.forEach(function (s) {
          if (s.trimestreId === t.id && valide) s.validee = true;
        });
      }
      if (ouvert !== undefined) {
        t.ouvert = !!ouvert;
        if (!ouvert) d.sequences.forEach(function (s) { if (s.trimestreId === t.id) s.ouverte = false; });
      }
      journaliser('trimestre.etat', 'trimestre:' + t.id, JSON.stringify(t), moi());
      return { ok: true, trimestre: t };
    });
  }

  function etatSequence(sequenceId, patch) {
    return ecrire('admin_annees', null, null, function (d) {
      var s = d.sequences.filter(function (x) { return x.id === sequenceId; })[0];
      if (!s) return echec('Séquence introuvable.');
      if (s.validee && (patch.ouverte || patch.verrouillee === false)) {
        return echec('Séquence validée : elle ne peut plus être rouverte ni déverrouillée.');
      }
      ['ouverte', 'verrouillee', 'validee'].forEach(function (k) {
        if (patch[k] !== undefined) s[k] = !!patch[k];
      });
      /* Verrouiller une sequence la ferme aussi. */
      if (s.verrouillee) s.ouverte = false;
      journaliser('sequence.etat', 'sequence:' + s.id, JSON.stringify(patch), moi());
      return { ok: true, sequence: s };
    });
  }

  /* ------------------------------ Classes ---------------------------- */
  /* Retrouve l'identifiant de l'entite Section a partir du nom de
     sous-systeme ('francophone' / 'anglophone'). Le repli sur les id
     historiques garantit le fonctionnement meme si la table des sections
     venait a manquer. */
  function sectionIdPour(d, section) {
    var nom = section === 'anglophone' ? 'anglophone' : 'francophone';
    var sectionTrouvee = (d.sections || []).filter(function (s) {
      return String(s.nom || '').toLowerCase() === nom;
    })[0];
    if (sectionTrouvee) return sectionTrouvee.id;
    return nom === 'anglophone' ? 'sec-en' : 'sec-fr';
  }

  function creerClasse(o) {
    return ecrire('admin_classes', null, null, function (d) {
      if (!texte(o.nom)) return echec('Le nom de la classe est obligatoire.');
      var anId = o.anneeId || (anneeActive() || {}).id;
      if (!anId) return echec('Aucune année scolaire active.');
      if (d.classes.some(function (c) {
        return c.anneeId === anId && c.nom.toLowerCase() === texte(o.nom).toLowerCase() && !c.archive;
      })) return echec('Une classe de ce nom existe déjà pour cette année.');
      /* L'effectif maximum est une capacite indicative : aucune limite haute
         n'est imposee et son depassement ne bloque plus les inscriptions. */
      var max = Number(o.effectifMax) || 30;
      if (max < 1) return echec('L\'effectif maximum doit être supérieur à 0.');
      /* Le sous-systeme choisi doit etre conserve : `section` pilote le bareme
         et la note maximale (20 en francophone, 100 en anglophone), et
         `sectionId` referme la classe sur l'entite Section cote serveur. Sans
         eux, une classe anglophone retombait en francophone des la creation. */
      var section = o.section === 'anglophone' ? 'anglophone' : 'francophone';
      var c = {
        id: nextId('classe'), nom: texte(o.nom), niveau: texte(o.niveau) || 'Non défini',
        cycle: texte(o.cycle) || 'Lycée', section: section, sectionId: sectionIdPour(d, section),
        effectifMax: max, anneeId: anId, archive: false
      };
      d.classes.push(c);
      journaliser('classe.creation', 'classe:' + c.id, c.nom, moi());
      return { ok: true, id: c.id, classe: c };
    });
  }

  function modifierClasse(id, patch) {
    return ecrire('admin_classes', null, null, function (d) {
      var c = d.classes.filter(function (x) { return x.id === id; })[0];
      if (!c) return echec('Classe introuvable.');
      if (patch.nom !== undefined) {
        if (!texte(patch.nom)) return echec('Le nom de la classe est obligatoire.');
        c.nom = texte(patch.nom);
      }
      if (patch.niveau !== undefined) c.niveau = texte(patch.niveau);
      if (patch.cycle !== undefined) c.cycle = texte(patch.cycle);
      if (patch.section !== undefined) {
        var section = patch.section === 'anglophone' ? 'anglophone' : 'francophone';
        c.section = section;
        c.sectionId = sectionIdPour(d, section);
      }
      if (patch.effectifMax !== undefined) {
        var max = Number(patch.effectifMax);
        if (!max || max < 1) return echec('L\'effectif maximum doit être supérieur à 0.');
        c.effectifMax = max;
      }
      journaliser('classe.modification', 'classe:' + id, JSON.stringify(patch), moi());
      return { ok: true, classe: c };
    });
  }

  /* Pas de suppression physique si l'annee porte des notes. */
  function archiverClasse(id) {
    return ecrire('admin_classes', null, null, function (d) {
      var c = d.classes.filter(function (x) { return x.id === id; })[0];
      if (!c) return echec('Classe introuvable.');
      var porteDesNotes = d.notes.some(function (n) { return n.classeId === id; });
      c.archive = true;
      if (porteDesNotes) {
        journaliser('classe.archivage', 'classe:' + id, c.nom + ' (conserve : porte des notes)', moi());
        return { ok: true, conserve: true };
      }
      d.inscriptions.forEach(function (i) { if (i.classeId === id) i.archive = true; });
      journaliser('classe.archivage', 'classe:' + id, c.nom, moi());
      return { ok: true, conserve: false };
    });
  }

  /* ------------------------- Professeur principal -------------------- */
  /* Regle : UNE classe par et par annee, et la classe ne peut avoir qu'un PP. */
  function definirPP(classeId, enseignantId) {
    return ecrire('admin_classes', null, null, function (d) {
      var c = d.classes.filter(function (x) { return x.id === classeId; })[0];
      if (!c) return echec('Classe introuvable.');
      var p = d.enseignants.filter(function (x) { return x.id === enseignantId; })[0];
      if (!p) return echec('Enseignant introuvable.');
      if (p.archive) return echec('Un enseignant archivé ne peut pas être professeur principal.');

      var dejaPP = d.profsPrincipaux.filter(function (x) {
        return x.anneeId === c.anneeId && x.enseignantId === enseignantId && x.classeId !== classeId;
      })[0];
      if (dejaPP) {
        var autre = d.classes.filter(function (x) { return x.id === dejaPP.classeId; })[0];
        return echec('Cet enseignant est déjà professeur principal de « ' + (autre ? autre.nom : dejaPP.classeId) +
          ' » pour ' + (anneeParId(c.anneeId) || {}).libelle + '. Un professeur principal ne dirige qu\'une seule classe par année.');
      }
      d.profsPrincipaux = d.profsPrincipaux.filter(function (x) {
        return !(x.classeId === classeId && x.anneeId === c.anneeId);
      });
      d.profsPrincipaux.push({ id: nextId('pp'), classeId: classeId, enseignantId: enseignantId, anneeId: c.anneeId });
      journaliser('pp.changement', 'classe:' + classeId, p.nom + ' ' + p.prenom, moi());
      return { ok: true };
    });
  }

  /* Enseignants encore disponibles comme PP sur une annee (liste deroulante). */
  function profsDisponiblesPourPP(anneeId) {
    var pris = {};
    all('profsPrincipaux').forEach(function (x) {
      if (x.anneeId === anneeId) pris[x.enseignantId] = x.classeId;
    });
    return all('enseignants').filter(function (p) { return !p.archive; }).map(function (p) {
      return {
        enseignant: p,
        indisponible: !!pris[p.id],
        occupePar: pris[p.id] ? (classeParId(pris[p.id]) || {}).nom : null
      };
    });
  }
  function ppDeClasse(classeId) {
    var x = all('profsPrincipaux').filter(function (p) { return p.classeId === classeId; })[0];
    return x ? x.enseignantId : null;
  }

  /* ---------------- Surveillant general : salles attribuees -------------- */
  /* Une classe peut etre attribuee a un ou plusieurs surveillants generaux :
     la collection affectationsCenseurs porte ces salles. Le SG n'ecrit les
     heures d'absence que sur les classes qui lui sont ainsi attribuees. */
  function attribuerClasseSG(classeId, enseignantId) {
    return ecrire('admin_affectations', null, null, function (d) {
      var c = d.classes.filter(function (x) { return x.id === classeId; })[0];
      if (!c) return echec('Classe introuvable.');
      var p = d.enseignants.filter(function (x) { return x.id === enseignantId; })[0];
      if (!p) return echec('Membre introuvable.');
      if (p.archive) return echec('Un membre archivé ne peut pas être surveillant général.');
      var deja = d.affectationsCenseurs.filter(function (x) {
        return x.classeId === classeId && x.enseignantId === enseignantId && x.anneeId === c.anneeId;
      })[0];
      if (deja) return echec('Cette classe est déjà attribuée à ce surveillant général.');
      d.affectationsCenseurs.push({
        id: nextId('sg'), classeId: classeId, enseignantId: enseignantId, anneeId: c.anneeId
      });
      journaliser('sg.attribution', 'classe:' + classeId, p.nom + ' ' + p.prenom, moi());
      return { ok: true };
    });
  }

  function retirerAttributionSG(id) {
    return ecrire('admin_affectations', null, null, function (d) {
      var a = d.affectationsCenseurs.filter(function (x) { return x.id === id; })[0];
      if (!a) return echec('Attribution introuvable.');
      d.affectationsCenseurs = d.affectationsCenseurs.filter(function (x) { return x.id !== id; });
      journaliser('sg.retrait', 'classe:' + a.classeId, a.enseignantId, moi());
      return { ok: true };
    });
  }
  function attributionsSG(anneeId) {
    return all('affectationsCenseurs').filter(function (a) { return a.anneeId === anneeId; });
  }

  /* ------------------------------ Matieres --------------------------- */
  function creerMatiere(o) {
    return ecrire('admin_matieres', null, null, function (d) {
      if (!texte(o.nom)) return echec('Le nom de la matière est obligatoire.');
      if (!texte(o.code)) return echec('Le code de la matière est obligatoire.');
      if (!unique(d, 'matieres', 'code', texte(o.code).toUpperCase())) return echec('Ce code de matière existe déjà.');
      var max = Number(o.noteMax) || 20;
      if (max < 5 || max > 100) return echec('La note maximale doit être comprise entre 5 et 100.');
      var m = { id: nextId('matiere'), code: texte(o.code).toUpperCase(), nom: texte(o.nom), noteMax: max, archive: false };
      d.matieres.push(m);
      journaliser('matiere.creation', 'matiere:' + m.id, m.nom, moi());
      return { ok: true, id: m.id, matiere: m };
    });
  }

  function modifierMatiere(id, patch) {
    return ecrire('admin_matieres', null, null, function (d) {
      var m = d.matieres.filter(function (x) { return x.id === id; })[0];
      if (!m) return echec('Matière introuvable.');
      if (patch.code !== undefined) {
        if (!unique(d, 'matieres', 'code', texte(patch.code).toUpperCase(), id)) return echec('Ce code de matière existe déjà.');
        m.code = texte(patch.code).toUpperCase();
      }
      if (patch.nom !== undefined) m.nom = texte(patch.nom);
      if (patch.noteMax !== undefined) {
        var max = Number(patch.noteMax);
        if (max < 5 || max > 100) return echec('La note maximale doit être comprise entre 5 et 100.');
        m.noteMax = max;
      }
      journaliser('matiere.modification', 'matiere:' + id, JSON.stringify(patch), moi());
      return { ok: true, matiere: m };
    });
  }

  function archiverMatiere(id) {
    return ecrire('admin_matieres', null, null, function (d) {
      var m = d.matieres.filter(function (x) { return x.id === id; })[0];
      if (!m) return echec('Matière introuvable.');
      m.archive = true;
      d.affectations.forEach(function (a) { if (a.matiereId === id) a.archive = true; });
      journaliser('matiere.archivage', 'matiere:' + id, m.nom, moi());
      return { ok: true };
    });
  }

/* Coefficient PAR CLASSE : meme matiere, coefficient different selon la classe.
     Un coefficient de 0 est valide et signifie « matiere non followee dans
     cette classe » : matieresDeClasse() la masque alors des moyennes et des
     listes de saisie. C'est la seule facon de retirer une matiere sans
     perdre son historique de notes. */
function definirCoefficient(classeId, matiereId, valeur) {
    return ecrire('admin_matieres', null, null, function (d) {
      var c = d.classes.filter(function (x) { return x.id === classeId; })[0];
      if (!c) return echec('Classe introuvable.');
      var m = d.matieres.filter(function (x) { return x.id === matiereId; })[0];
      if (!m) return echec('Matière introuvable.');
      if (valeur === '' || valeur === null || valeur === undefined) {
        return echec('Le coefficient doit être un nombre.');
      }
      var coef = Number(valeur);
      if (isNaN(coef)) return echec('Le coefficient doit être un nombre.');
      if (coef < 0 || coef > 20) return echec('Le coefficient doit être compris entre 0 et 20.');
      if (coef % 1 !== 0) return echec('Le coefficient doit être un nombre entier.');
      var ligne = d.coefficients.filter(function (x) { return x.classeId === classeId && x.matiereId === matiereId; })[0];
      var avant = ligne ? ligne.coefficient : null;
      if (ligne) ligne.coefficient = coef;
      else d.coefficients.push({ classeId: classeId, matiereId: matiereId, coefficient: coef });
      journaliser('coefficient.changement', classeId + '/' + matiereId, String(avant) + ' -> ' + String(coef), moi());
      return { ok: true, coefficient: coef };
    });
  }

  /* ------------------------------- Eleves ---------------------------- */
  function creerEleve(o) {
    return ecrire('admin_eleves', null, null, function (d) {
      var r = controlerEleve(d, o);
      if (r) return r;
      var e = {
        id: nextId('eleve'), matricule: texte(o.matricule), nom: texte(o.nom), prenom: texte(o.prenom),
        dateNaissance: o.dateNaissance || '', lieuNaissance: texte(o.lieuNaissance),
        sexe: o.sexe === 'F' ? 'F' : 'M', telephone: texte(o.telephone),
        telephoneParent: texte(o.telephoneParent), aptitude: o.aptitude === 'I' ? 'I' : 'A',
        redoublant: o.redoublant === 'O' ? 'O' : 'N',
        contactTuteur: texte(o.contactTuteur), photo: o.photo || '',
        archive: false, dateCreation: new Date().toISOString().slice(0, 10)
      };
      d.eleves.push(e);
      journaliser('eleve.creation', 'eleve:' + e.id, e.nom + ' ' + e.prenom, moi());
      return { ok: true, id: e.id, eleve: e };
    });
  }

  function controlerEleve(d, o, ignorerId) {
    if (!texte(o.nom)) return echec('Le nom de l\'élève est obligatoire.');
    if (!texte(o.prenom)) return echec('Le prénom de l\'élève est obligatoire.');
    if (o.matricule && !unique(d, 'eleves', 'matricule', texte(o.matricule), ignorerId)) return echec('Ce matricule est déjà utilisé.');
    if (o.sexe && ['M', 'F'].indexOf(o.sexe) === -1) return echec('Le sexe doit être M ou F.');
    if (o.aptitude && ['A', 'I'].indexOf(o.aptitude) === -1) return echec('L\'aptitude doit être A ou I.');
    if (o.redoublant && ['O', 'N'].indexOf(o.redoublant) === -1) return echec('Le statut de redoublant doit être O ou N.');
    if (o.dateNaissance && !/^\d{4}-\d{2}-\d{2}$/.test(o.dateNaissance)) return echec('La date de naissance est invalide.');
    return null;
  }

  function modifierEleve(id, patch) {
    return ecrire('admin_eleves', null, null, function (d) {
      var e = d.eleves.filter(function (x) { return x.id === id; })[0];
      if (!e) return echec('Élève introuvable.');
      var fusion = {};
      Object.keys(patch).forEach(function (k) { fusion[k] = patch[k]; });
      var r = controlerEleve(d, fusion, id);
      if (r) return r;
      Object.keys(patch).forEach(function (k) { if (patch[k] !== undefined) e[k] = patch[k]; });
      journaliser('eleve.modification', 'eleve:' + id, JSON.stringify(patch), moi());
      return { ok: true, eleve: e };
    });
  }

  /* Archivage, jamais de suppression physique : l'eleve a des notes. */
  function archiverEleve(id) {
    return ecrire('admin_eleves', null, null, function (d) {
      var e = d.eleves.filter(function (x) { return x.id === id; })[0];
      if (!e) return echec('Élève introuvable.');
      e.archive = true;
      journaliser('eleve.archivage', 'eleve:' + id, e.nom + ' ' + e.prenom, moi());
      return { ok: true };
    });
  }

  /* Import en lot : chaque ligne est controlee, la reprise est partielle. */
  function importerEleves(lignes) {
    return ecrire('admin_eleves', null, null, function (d) {
      var crees = [], refus = [];
      lignes.forEach(function (o, i) {
        var r = controlerEleve(d, o);
        if (r) { refus.push({ ligne: i + 1, motif: r.motif }); return; }
        var e = {
            id: nextId('eleve'), matricule: texte(o.matricule), nom: texte(o.nom), prenom: texte(o.prenom),
          dateNaissance: o.dateNaissance || '', lieuNaissance: texte(o.lieuNaissance),
          sexe: o.sexe === 'F' ? 'F' : 'M', telephone: texte(o.telephone),
          telephoneParent: texte(o.telephoneParent), aptitude: o.aptitude === 'I' ? 'I' : 'A',
          redoublant: o.redoublant === 'O' ? 'O' : 'N',
          contactTuteur: texte(o.contactTuteur), photo: '', archive: false,
          dateCreation: new Date().toISOString().slice(0, 10)
        };
        d.eleves.push(e);
        crees.push(e);
      });
      journaliser('eleve.import', 'lot', crees.length + ' créés, ' + refus.length + ' refusés', moi());
      return { ok: true, crees: crees, refus: refus };
    });
  }

  /* --------------------------- Personnel ----------------------------- */
  /* Trois fonctions : enseignant (notes/censeur/PP), direction (admin
     sans notes), surveillant general (SG : absences sur ses classes). */
  var FONCTIONS = ['enseignant', 'direction', 'surveillant'];

  function creerEnseignant(o) {
    return ecrire('admin_personnel', null, null, function (d) {
      if (!texte(o.nom)) return echec('Le nom est obligatoire.');
      if (!texte(o.prenom)) return echec('Le prénom est obligatoire.');
      if (FONCTIONS.indexOf(o.fonction) === -1) return echec('Fonction inconnue.');
      var p = {
        id: nextId('enseignant'), matricule: texte(o.matricule) || 'Vac',
        nom: texte(o.nom), prenom: texte(o.prenom), fonction: o.fonction,
        email: '', dateNaissance: '',
        telephone: texte(o.telephone), archive: false,
        dateCreation: new Date().toISOString().slice(0, 10)
      };
      d.enseignants.push(p);
      journaliser('personnel.creation', 'enseignant:' + p.id, p.nom + ' ' + p.prenom + ' (' + p.fonction + ')', moi());
      return { ok: true, id: p.id, enseignant: p };
    });
  }

  function modifierEnseignant(id, patch) {
    return ecrire('admin_personnel', null, null, function (d) {
      var p = d.enseignants.filter(function (x) { return x.id === id; })[0];
      if (!p) return echec('Membre du personnel introuvable.');
      ['nom', 'prenom', 'telephone'].forEach(function (k) {
        if (patch[k] !== undefined) p[k] = texte(patch[k]);
      });
      if (patch.matricule !== undefined) p.matricule = texte(patch.matricule) || 'Vac';
      if (patch.fonction !== undefined) {
        if (FONCTIONS.indexOf(patch.fonction) === -1) return echec('Fonction inconnue.');
        p.fonction = patch.fonction;
      }
      journaliser('personnel.modification', 'enseignant:' + id, JSON.stringify(patch), moi());
      return { ok: true, enseignant: p };
    });
  }

  function archiverEnseignant(id) {
    return ecrire('admin_personnel', null, null, function (d) {
      var p = d.enseignants.filter(function (x) { return x.id === id; })[0];
      if (!p) return echec('Membre du personnel introuvable.');
      var sesAffectations = d.affectations.filter(function (a) { return a.enseignantId === id && !a.archive; });
      var sesPP = d.profsPrincipaux.filter(function (x) { return x.enseignantId === id; });
      if (sesPP.length) return echec('Ce membre est encore professeur principal : désignez son remplaçant d\'abord.');
      p.archive = true;
      sesAffectations.forEach(function (a) { a.archive = true; });
      journaliser('personnel.archivage', 'enseignant:' + id,
        p.nom + ' ' + p.prenom + ' (' + sesAffectations.length + ' affectation(s) libérée(s))', moi());
      return { ok: true, affectationsLiberees: sesAffectations.length };
    });
  }

  /* --------------------------- Inscriptions -------------------------- */
  /* Regle : un eleve = UNE seule classe par annee. */
  function inscrireEleve(eleveId, classeId, anneeId) {
    return ecrire('admin_inscriptions', null, null, function (d) {
      var e = d.eleves.filter(function (x) { return x.id === eleveId; })[0];
      if (!e) return echec('Élève introuvable.');
      var c = d.classes.filter(function (x) { return x.id === classeId; })[0];
      if (!c) return echec('Classe introuvable.');
      if (c.anneeId !== anneeId) return echec('Cette classe n\'appartient pas à l\'année scolaire choisie.');

      var deja = d.inscriptions.filter(function (i) {
        return i.eleveId === eleveId && i.anneeId === anneeId && !i.archive;
      })[0];
      if (deja) {
        if (deja.classeId === classeId) return echec('Cet élève est déjà inscrit dans cette classe.');
        var autre = d.classes.filter(function (x) { return x.id === deja.classeId; })[0];
        return echec('Cet élève est déjà inscrit en « ' + (autre ? autre.nom : '?') +
          ' » pour cette année. Utilisez le module Migrations pour le transférer.');
      }
      d.inscriptions.push({
        id: nextId('inscription'), eleveId: eleveId, classeId: classeId, anneeId: anneeId,
        dateInscription: new Date().toISOString().slice(0, 10), statut: 'active', archive: false
      });
      journaliser('inscription.creation', 'eleve:' + eleveId, 'vers ' + c.nom, moi());
      return { ok: true };
    });
  }

  function inscrireLot(paires, anneeId) {
    return ecrire('admin_inscriptions', null, null, function (d) {
      var classes = {};
      d.classes.forEach(function (c) { classes[c.id] = c; });
      var inscrits = [], refus = [];
      paires.forEach(function (p, i) {
        var c = classes[p.classeId];
        if (!c) { refus.push({ eleveId: p.eleveId, motif: 'Classe introuvable' }); return; }
        var deja = d.inscriptions.some(function (ins) {
          return ins.eleveId === p.eleveId && ins.anneeId === anneeId && !ins.archive;
        });
        if (deja) { refus.push({ eleveId: p.eleveId, motif: 'Déjà inscrit cette année' }); return; }
        d.inscriptions.push({
          id: nextId('inscription'), eleveId: p.eleveId, classeId: c.id, anneeId: anneeId,
          dateInscription: new Date().toISOString().slice(0, 10), statut: 'active', archive: false
        });
        inscrits.push(p.eleveId);
      });
      journaliser('inscription.lot', 'annee:' + anneeId, inscrits.length + ' inscrits, ' + refus.length + ' refusés', moi());
      return { ok: true, inscrits: inscrits, refus: refus };
    });
  }

  function desinscrireEleve(inscriptionId) {
    return ecrire('admin_inscriptions', null, null, function (d) {
      var i = d.inscriptions.filter(function (x) { return x.id === inscriptionId; })[0];
      if (!i) return echec('Inscription introuvable.');
      var porteDesNotes = d.notes.some(function (n) { return n.eleveId === i.eleveId && n.classeId === i.classeId; });
      if (porteDesNotes) return echec('Des notes existent pour cet élève dans cette classe :_archivez l\'élève plutôt que de le désinscrire._');
      i.archive = true;
      i.statut = 'termine';
      journaliser('inscription.desinscription', 'eleve:' + i.eleveId, i.classeId, moi());
      return { ok: true };
    });
  }

  /* -------------------------- Affectations ---------------------------- */
  /* Regle : un seul enseignant par classe et par matiere. */
  function creerAffectation(classeId, matiereId, enseignantId, anneeId) {
    return ecrire('admin_affectations', null, null, function (d) {
      var c = d.classes.filter(function (x) { return x.id === classeId; })[0];
      if (!c) return echec('Classe introuvable.');
      var p = d.enseignants.filter(function (x) { return x.id === enseignantId; })[0];
      if (!p) return echec('Enseignant introuvable.');
      if (p.archive) return echec('Cet enseignant est archivé.');
      if (p.fonction !== 'enseignant') {
        return echec('Seul un membre ayant la fonction « enseignant » peut être affecté à une matière.');
      }
      if (c.anneeId !== anneeId) return echec('Cette classe n\'appartient pas à l\'année scolaire choisie.');

      var ex = d.affectations.filter(function (a) {
        return a.classeId === classeId && a.matiereId === matiereId && a.anneeId === anneeId && !a.archive;
      })[0];
      if (ex) {
        if (ex.enseignantId === enseignantId) return echec('Cette affectation existe déjà.');
        var autre = d.enseignants.filter(function (x) { return x.id === ex.enseignantId; })[0];
        return echec('Cette matière est déjà affectée à ' + (autre ? autre.prenom + ' ' + autre.nom : '?') +
          ' dans ' + c.nom + '. Une matière ne peut avoir qu\'un seul enseignant par classe.');
      }
      d.affectations.push({
        id: nextId('affectation'), classeId: classeId, matiereId: matiereId,
        enseignantId: enseignantId, anneeId: anneeId, archive: false
      });
      journaliser('affectation.creation', 'affectation:' + classeId + '/' + matiereId,
        p.nom + ' ' + p.prenom, moi());
      return { ok: true };
    });
  }

  function supprimerAffectation(id) {
    return ecrire('admin_affectations', null, null, function (d) {
      var a = d.affectations.filter(function (x) { return x.id === id; })[0];
      if (!a) return echec('Affectation introuvable.');
      var porteDesNotes = d.notes.some(function (n) { return n.classeId === a.classeId && n.matiereId === a.matiereId; });
      if (porteDesNotes) {
        return echec('Des notes existent pour cette affectation : elle ne peut pas être retirée. Archivez-la.');
      }
      a.archive = true;
      journaliser('affectation.suppression', 'affectation:' + id, a.classeId + '/' + a.matiereId, moi());
      return { ok: true };
    });
  }

  /* ------------------------------ Notes ------------------------------ */
  /* Reecrite : passe par la matrice de droits et verifie la sequence. */
  function enregistrerNote(opts) {
    var res = ecrire('teacher_saisie', {
      classeId: opts.classeId, matiereId: opts.matiereId, sequenceId: opts.sequenceId, notesDe: true
    }, null, function (d) {
      var vide = opts.valeur === null || opts.valeur === undefined || opts.valeur === '';
      var seq = d.sequences.filter(function (s) { return s.id === opts.sequenceId; })[0];
      if (!seq) return echec('Séquence introuvable.');
      if (seq.verrouillee) return echec('Séquence verrouillée : la saisie est bloquée.');
      if (!seq.ouverte) return echec('Séquence fermée : la saisie est bloquée.');
      var trim = null;
      d.annees.forEach(function (a) {
        a.trimestres.forEach(function (t) { if (t.id === seq.trimestreId) trim = t; });
      });
      if (trim && !trim.ouvert) return echec('Le trimestre est clôturé : la saisie est bloquée.');

      var m = d.matieres.filter(function (x) { return x.id === opts.matiereId; })[0];
      var max = m ? m.noteMax : 20;
      if (!vide) {
        var n = Number(opts.valeur);
        if (isNaN(n)) return echec('La note doit être un nombre.');
        if (n < 0 || n > max) return echec('La note doit être comprise entre 0 et ' + max + '.');
      }
      var existante = d.notes.filter(function (x) {
        return x.sequenceId === opts.sequenceId && x.eleveId === opts.eleveId && x.matiereId === opts.matiereId;
      })[0];
      var ligne = {
        id: existante ? existante.id : nextId('note'),
        sequenceId: opts.sequenceId, eleveId: opts.eleveId,
        classeId: opts.classeId, matiereId: opts.matiereId,
        /* Number(null) vaut 0 : le cas non note doit etre traite a part */
        valeur: vide ? null : Number(opts.valeur),
        statut: vide ? 'non-note' : 'note',
        remarque: opts.remarque !== undefined ? opts.remarque : (existante ? (existante.remarque || '') : ''),
        modifiePar: moi(), modifieLe: new Date().toISOString()
      };
      if (existante) d.notes[d.notes.indexOf(existante)] = ligne;
      else d.notes.push(ligne);
      return { ok: true, note: ligne };
    });
    if (res.ok) journaliser('note.enregistrement', 'sequence:' + opts.sequenceId,
      'eleve:' + opts.eleveId, moi());
    return res;
  }

  function remarqueNote(sequenceId, eleveId, matiereId, texteRemark) {
    return ecrire('teacher_saisie', { sequenceId: sequenceId, notesDe: true }, null, function (d) {
      var n = d.notes.filter(function (x) {
        return x.sequenceId === sequenceId && x.eleveId === eleveId && (!matiereId || x.matiereId === matiereId);
      })[0];
      if (!n) return echec('Aucune note à commenter pour cet élève.');
      n.remarque = texteRemark || '';
      n.modifieLe = new Date().toISOString();
      return { ok: true, note: n };
    });
  }

  /* Validation d'une sequence : fige les notes, debloque l'impression des bulletins. */
  function validerSequence(sequenceId) {
    return ecrire('admin_annees', null, null, function (d) {
      var s = d.sequences.filter(function (x) { return x.id === sequenceId; })[0];
      if (!s) return echec('Séquence introuvable.');
      var manquantes = d.notes.filter(function (n) {
        return n.sequenceId === sequenceId && n.statut === 'note' ? false : n.sequenceId === sequenceId;
      });
      s.validee = true; s.ouverte = false; s.verrouillee = true;
      journaliser('sequence.validation', 'sequence:' + sequenceId,
        'notes non notées conservées comme telles', moi());
      return { ok: true, sequence: s, nonNotees: manquantes.length };
    });
  }

  /* ----------------------------- Absences ---------------------------- */
  function pointerAbsence(eleveId, classeId, anneeId, date, periode, motif) {
    return ecrire('admin_assiduite', null, null, function (d) {
      var f = date || new Date().toISOString().slice(0, 10);
      var ex = d.absences.filter(function (a) {
        return a.eleveId === eleveId && a.date === f && !a.archive;
      })[0];
      if (ex) { ex.periode = periode; ex.motif = motif || ''; }
      else d.absences.push({
        id: nextId('absence'), eleveId: eleveId, classeId: classeId, anneeId: anneeId,
        date: f, periode: periode, motif: motif || '', archive: false
      });
      journaliser('assiduite.absence', 'eleve:' + eleveId, periode + ' le ' + f, moi());
      return { ok: true };
    });
  }
  function leverAbsence(absenceId) {
    return ecrire('admin_assiduite', null, null, function (d) {
      var a = d.absences.filter(function (x) { return x.id === absenceId; })[0];
      if (!a) return echec('Absence introuvable.');
      a.archive = true;
      journaliser('assiduite.retour', 'eleve:' + a.eleveId, a.date, moi());
      return { ok: true };
    });
  }
  function absencesDe(anneeId) { return all('absences').filter(function (a) { return a.anneeId === anneeId && !a.archive; }); }

  function absencesDeSequence(sequenceId) { return all('absences').filter(function (a) { return a.sequenceId === sequenceId && !a.archive; }); }

  function absenceDe(eleveId, sequenceId) {
    return all('absences').filter(function (a) { return a.eleveId === eleveId && a.sequenceId === sequenceId && !a.archive; })[0] || null;
  }

  function enregistrerAbsence(opts) {
    return ecrire('admin_assiduite', { sequenceId: opts.sequenceId, classeId: opts.classeId }, null, function (d) {
      var seq = d.sequences.filter(function (s) { return s.id === opts.sequenceId; })[0];
      if (!seq) return echec('Séquence introuvable.');
      if (seq.verrouillee) return echec('Séquence verrouillée : modification impossible.');
      var ex = d.absences.filter(function (a) {
        return a.eleveId === opts.eleveId && a.sequenceId === opts.sequenceId && !a.archive;
      })[0];
      var total = Number(opts.heures) || 0;
      var just = Number(opts.justifiees) || 0;
      var nonJust = Number(opts.nonJustifiees) || 0;
      if (total !== just + nonJust) return echec('Le total d\'heures doit être égal à justifiées + non justifiées.');
      var ligne = {
        id: ex ? ex.id : nextId('absence'),
        sequenceId: opts.sequenceId, eleveId: opts.eleveId, classeId: opts.classeId,
        anneeId: seq.anneeId || (ex ? ex.anneeId : '') || '',
        date: ex ? (ex.date || '') : '', periode: ex ? (ex.periode || '') : '',
        heures: total, justifiees: just, nonJustifiees: nonJust,
        motif: opts.motif || '', modifiePar: moi(), modifieLe: new Date().toISOString(), archive: false
      };
      if (ex) d.absences[d.absences.indexOf(ex)] = ligne;
      else d.absences.push(ligne);
      return { ok: true, absence: ligne };
    });
  }

  function sanctionsDe(sequenceId) { return all('sanctions').filter(function (s) { return s.sequenceId === sequenceId && !s.archive; }); }

  function sanctionDe(eleveId, sequenceId) {
    return all('sanctions').filter(function (s) { return s.eleveId === eleveId && s.sequenceId === sequenceId && !s.archive; });
  }

  function enregistrerSanction(opts) {
    return ecrire('admin_vie_scolaire', { sequenceId: opts.sequenceId, classeId: opts.classeId }, null, function (d) {
      var seq = d.sequences.filter(function (s) { return s.id === opts.sequenceId; })[0];
      if (!seq) return echec('Séquence introuvable.');
      if (seq.verrouillee) return echec('Séquence verrouillée : modification impossible.');
      var typesValides = ['avertissement', 'blame', 'exclusion_temporaire', 'exclusion_definitive'];
      if (typesValides.indexOf(opts.type) === -1) return echec('Type de sanction invalide.');
      var ligne = {
        id: nextId('sanction'),
        sequenceId: opts.sequenceId, eleveId: opts.eleveId, classeId: opts.classeId,
        type: opts.type, duree: Number(opts.duree) || 0, motif: opts.motif || '',
        modifiePar: moi(), modifieLe: new Date().toISOString(), archive: false
      };
      d.sanctions = d.sanctions || [];
      d.sanctions.push(ligne);
      journaliser('discipline.sanction', 'eleve:' + opts.eleveId, opts.type, moi());
      return { ok: true, sanction: ligne };
    });
  }

  /* ---------------------------- Decisions ---------------------------- */
  /* admis / redouble / exclu : modifiable par l'administrateur. */
  function definirDecision(eleveId, anneeId, decision, moyenneAnnuelle) {
    return ecrire('admin_bulletins', null, null, function (d) {
      if (['admis', 'redouble', 'exclu', 'en attente'].indexOf(decision) === -1) return echec('Décision inconnue.');
      var ex = d.decisions.filter(function (x) { return x.eleveId === eleveId && x.anneeId === anneeId; })[0];
      var ligne = {
        id: ex ? ex.id : nextId('decision'), eleveId: eleveId, anneeId: anneeId,
        decision: decision, moyenneAnnuelle: moyenneAnnuelle === undefined ? null : Number(moyenneAnnuelle),
        modifiePar: moi(), modifieLe: new Date().toISOString()
      };
      if (ex) d.decisions[d.decisions.indexOf(ex)] = ligne;
      else d.decisions.push(ligne);
      journaliser('decision.modification', 'eleve:' + eleveId, decision, moi());
      return { ok: true, decision: ligne };
    });
  }
  function decisionDe(eleveId, anneeId) {
    return all('decisions').filter(function (x) { return x.eleveId === eleveId && x.anneeId === anneeId; })[0] || null;
  }

  /* -------- Appreciation du professeur principal + validation bulletins */
  function definirAppreciationPP(eleveId, classeId, anneeId, periode, texteAppreciation, conduite) {
    return ecrire('teacher_ma_classe', { classeId: classeId }, null, function (d) {
      var A = accesA();
      if (A && A.role() === 'enseignant' && !A.estPPDe(classeId)) {
        return echec('Seul le professeur principal de cette classe peut saisir son appréciation.');
      }
      if (!texteAppreciation) return echec('L\'appréciation est obligatoire.');
      if (conduite !== undefined && Number(conduite) < 0) return echec('La note de conduite doit être positive.');
      d.appreciations = d.appreciations || [];
      var ex = d.appreciations.filter(function (x) {
        return x.eleveId === eleveId && x.anneeId === anneeId && x.periode === periode;
      })[0];
      var ligne = {
        id: ex ? ex.id : nextId('appreciation'), eleveId: eleveId, classeId: classeId,
        anneeId: anneeId, periode: periode, texte: texteAppreciation,
        conduite: conduite === undefined ? null : Number(conduite),
        auteurId: moi(), date: new Date().toISOString()
      };
      if (ex) d.appreciations[d.appreciations.indexOf(ex)] = ligne;
      else d.appreciations.push(ligne);
      journaliser('appreciation.pp', 'eleve:' + eleveId, periode, moi());
      return { ok: true, appreciation: ligne };
    });
  }
  function appreciationDe(eleveId, anneeId, periode) {
    return (all('appreciations') || []).filter(function (x) {
      return x.eleveId === eleveId && x.anneeId === anneeId && x.periode === periode;
    })[0] || null;
  }

  function validerBulletins(classeId, anneeId, periode) {
    return ecrire('admin_bulletins', null, null, function (d) {
      d.bulletinsValides = d.bulletinsValides || [];
      var cle = classeId + '|' + anneeId + '|' + periode;
      var ex = d.bulletinsValides.filter(function (b) { return b.cle === cle; })[0];
      if (ex) { ex.date = new Date().toISOString(); ex.validePar = moi(); }
      else d.bulletinsValides.push({ id: nextId('bulletinvalide'), cle: cle, classeId: classeId, anneeId: anneeId, periode: periode, date: new Date().toISOString(), validePar: moi() });
      journaliser('bulletin.validation', cle, null, moi());
      return { ok: true };
    });
  }
  function bulletinsValides(classeId, anneeId, periode) {
    return (all('bulletinsValides') || []).some(function (b) {
      return b.cle === classeId + '|' + anneeId + '|' + periode;
    });
  }

  /* ---------------------------- SMS / Notifications ----------------------- */
  /* Point d'entree unique pour l'envoi de SMS. En production, remplacer
     l'implementation par un vrai fournisseur (Orange SMS, MTN, Twilio, etc.).
     Ici on se contente de logger et simuler l'envoi. */
  function envoyerSMS(destinataire, message) {
    return ecrire('admin_parametres', null, null, function (d) {
      var log = {
        id: nextId('sms'), destinataire: destinataire, message: message,
        date: new Date().toISOString(), statut: 'simule', modifiePar: moi()
      };
      d.smsLog = d.smsLog || [];
      d.smsLog.push(log);
      journaliser('sms.envoi', 'tel:' + destinataire, message.substring(0, 50) + '...', moi());
      return { ok: true, sms: log };
    });
  }

  function envoyerSMSResultats(eleveId, anneeId, periode, resume) {
    var e = eleveParId(eleveId);
    if (!e || !e.telephone) return { ok: false, motif: 'Aucun téléphone pour cet élève.' };
    var msg = 'EduNeum: ' + e.nom + ' ' + e.prenom + ' - ' + resume + '. Année ' + anneeId + ' période ' + periode;
    return envoyerSMS(e.telephone, msg);
  }

  function envoyerSMSAbsences(eleveId, anneeId, sequenceId, heuresTotal, nonJustifiees) {
    var e = eleveParId(eleveId);
    if (!e || !e.telephone) return { ok: false, motif: 'Aucun téléphone pour cet élève.' };
    var seq = sequenceParId(sequenceId);
    var msg = 'EduNeum Absences: ' + e.nom + ' ' + e.prenom + ' - ' + heuresTotal + 'h d\'absence (' + nonJustifiees + ' non just.) en ' + (seq ? seq.libelle : sequenceId);
    return envoyerSMS(e.telephone, msg);
  }

  function smsLog() { return all('smsLog') || []; }

  /* --------------------------- Parametres ---------------------------- */
  /* Le logo est stocke en data-URL : pas de fichier externe, donc rien
     n'est casse si le projet est deplace sur une autre machine. */
  function definirEtablissement(o) {
    return ecrire('admin_parametres', null, null, function (d) {
      var nom = texte(o.nom);
      if (!nom) return echec('Le nom de l\'établissement est obligatoire.');
      if (nom.length > 120) return echec('Le nom de l\'établissement est trop long (120 caractères maximum).');
      var sigle = texte(o.sigle).toUpperCase();
      if (sigle.length > 8) return echec('Le sigle ne peut pas dépasser 8 caractères.');
      var logo = texte(o.logo);
      if (logo && logo.indexOf('data:image/') !== 0) {
        return echec('Le logo doit être une image.');
      }
      var adresse = texte(o.adresse);
      if (adresse.length > 160) return echec('L\'adresse est trop longue (160 caractères maximum).');
      var telephone = texte(o.telephone);
      if (telephone.length > 40) return echec('Le téléphone est trop long (40 caractères maximum).');
      d.parametres.etablissement = { nom: nom, sigle: sigle, logo: logo, adresse: adresse, telephone: telephone };
      journaliser('parametres.etablissement', null, nom + (sigle ? ' (' + sigle + ')' : ''), moi());
      return { ok: true, etablissement: d.parametres.etablissement };
    });
  }
  /* Deux initiales de repli : un logo absent ne doit pas laisser un trou. */
  function initialesEtablissement(o) {
    return (texte(o.sigle) || texte(o.nom).split(/\s+/).slice(0, 2).map(function (m) { return m.charAt(0); }).join(''))
      .toUpperCase().slice(0, 3) || '??';
  }

  function definirBaremeAppreciations(bareme) {
    return ecrire('admin_parametres', null, null, function (d) {
      if (!Array.isArray(bareme) || !bareme.length) return echec('Le barème doit contenir au moins un seuil.');
      for (var i = 0; i < bareme.length; i++) {
        if (isNaN(Number(bareme[i].min))) return echec('Seuil de note invalide.');
        if (!texte(bareme[i].label)) return echec('Chaque seuil doit avoir un libellé.');
      }
      var trie = bareme.slice().sort(function (a, b) { return Number(b.min) - Number(a.min); });
      for (var j = 1; j < trie.length; j++) {
        if (Number(trie[j].min) === Number(trie[j - 1].min)) return echec('Deux seuils ont la même valeur.');
      }
      d.parametres.baremeAppreciation = trie.map(function (b) { return { min: Number(b.min), label: texte(b.label) }; });
      journaliser('parametres.bareme', null, JSON.stringify(d.parametres.baremeAppreciation), moi());
      return { ok: true, bareme: d.parametres.baremeAppreciation };
    });
  }
  function definirMoyennePassage(v) {
    return ecrire('admin_parametres', null, null, function (d) {
      var n = Number(v);
      if (isNaN(n) || n < 0 || n > 20) return echec('La moyenne de passage doit être comprise entre 0 et 20.');
      d.parametres.moyennePassage = n;
      journaliser('parametres.passage', null, String(n), moi());
      return { ok: true, valeur: n };
    });
  }
  function definirArrondi(v) {
    return ecrire('admin_parametres', null, null, function (d) {
      var n = Number(v);
      if (isNaN(n) || n < 0 || n > 4) return echec('Le nombre de décimales doit être compris entre 0 et 4.');
      d.parametres.arrondi = n;
      journaliser('parametres.arrondi', null, String(n), moi());
      return { ok: true, valeur: n };
    });
  }
  /* Les reglettes d'ecriture doivent rester COHERENTES entre elles : une page
     qui enregistre moyenne + bareme doit le faire en une seule ecriture, sinon
     un refus au milieu laisserait l'ecran a moitie enregistre. */
  function enregistrerRegles(opts) {
    return ecrire('admin_parametres', null, null, function (d) {
      var p = d.parametres;
      if (opts.moyennePassage !== undefined) {
        var mp = Number(opts.moyennePassage);
        if (isNaN(mp) || mp < 0 || mp > 20) return echec('La moyenne de passage doit être comprise entre 0 et 20.');
        p.moyennePassage = mp;
      }
      if (opts.arrondi !== undefined) {
        var ar = Number(opts.arrondi);
        if (isNaN(ar) || ar < 0 || ar > 4) return echec('Le nombre de décimales doit être compris entre 0 et 4.');
        p.arrondi = ar;
      }
      if (opts.bareme) {
        var b = opts.bareme;
        if (!Array.isArray(b) || !b.length) return echec('Le barème doit contenir au moins un seuil.');
        var trie = b.slice().sort(function (x, y) { return Number(y.min) - Number(x.min); });
        for (var j = 0; j < trie.length; j++) {
          if (isNaN(Number(trie[j].min))) return echec('Seuil de note invalide.');
          if (!texte(trie[j].label)) return echec('Chaque seuil doit garder son libellé.');
          if (j > 0 && Number(trie[j].min) === Number(trie[j - 1].min)) return echec('Deux seuils ont la même valeur.');
        }
        p.baremeAppreciation = trie.map(function (x) { return { min: Number(x.min), label: texte(x.label) }; });
      }
      journaliser('parametres.modification', 'regles',
        'Passage ' + p.moyennePassage + ' / arrondi ' + p.arrondi + ' / ' + p.baremeAppreciation.length + ' seuils', moi());
      return { ok: true, parametres: p };
    });
  }
  function parametres() {
    /* Les bases creees avant l'introduction d'un reglage n'ont pas la cle :
       completerParametres() la complete a la lecture pour ne pas multiplier
       les migrations, et garantit un bareme meme si le serveur en manque. */
    completerParametres(load());
    return load().parametres;
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.store = {
    MIGRATIONS: MIGRATIONS,
    load: load, save: save, dernierRefus: dernierRefus, reset: reset, flush: flush, all: all, nextId: nextId, migrer: migrer,
    anneeActive: anneeActive, anneeParId: anneeParId,
    classesDe: classesDe, comparerClasses: comparerClasses,
    classeParId: classeParId, matiereParId: matiereParId,
    eleveParId: eleveParId, enseignantParId: enseignantParId,
    coefficient: coefficient, matieresDeClasse: matieresDeClasse,
    elevesDeClasse: elevesDeClasse, classeDeEleve: classeDeEleve,
    affectationsDe: affectationsDe, affectationsDeEnseignant: affectationsDeEnseignant, peutSaisir: peutSaisir,
    sequencesDe: sequencesDe, sequencesDeTrimestre: sequencesDeTrimestre, sequenceParId: sequenceParId,
    trimestresDe: trimestresDe, trimestreParId: trimestreParId, trimestreDeSequence: trimestreDeSequence,
    notesDe: notesDe, note: note, progression: progression,
    classeDeSequenceAnnee: classeDeSequenceAnnee,
    journaliser: journaliser, journal: journal,
    transfererEleve: transfererEleve, passerEnAnneeSuivante: passerEnAnneeSuivante, migrationsDe: migrationsDe,
    ppDeClasse: ppDeClasse, absencesDe: absencesDe,
    decisionDe: decisionDe, appreciationDe: appreciationDe, parametres: parametres,
    bulletinsValides: bulletinsValides, profsDisponiblesPourPP: profsDisponiblesPourPP,
    FONCTIONS: FONCTIONS,
    /* SMS / Notifications */
    envoyerSMS: envoyerSMS, envoyerSMSResultats: envoyerSMSResultats, envoyerSMSAbsences: envoyerSMSAbsences, smsLog: smsLog,
    /* ecriture centralisee */
    creerAnnee: creerAnnee, activerAnnee: activerAnnee, cloturerAnnee: cloturerAnnee,
    etatTrimestre: etatTrimestre, etatSequence: etatSequence, validerSequence: validerSequence,
    modifierPeriode: modifierPeriode,
    creerClasse: creerClasse, modifierClasse: modifierClasse, archiverClasse: archiverClasse, definirPP: definirPP,
    creerMatiere: creerMatiere, modifierMatiere: modifierMatiere, archiverMatiere: archiverMatiere,
    definirCoefficient: definirCoefficient,
    creerEleve: creerEleve, modifierEleve: modifierEleve, archiverEleve: archiverEleve, importerEleves: importerEleves,
    creerEnseignant: creerEnseignant, modifierEnseignant: modifierEnseignant, archiverEnseignant: archiverEnseignant,
    inscrireEleve: inscrireEleve, inscrireLot: inscrireLot, desinscrireEleve: desinscrireEleve,
    creerAffectation: creerAffectation, supprimerAffectation: supprimerAffectation,
    attribuerClasseSG: attribuerClasseSG, retirerAttributionSG: retirerAttributionSG, attributionsSG: attributionsSG,
    enregistrerNote: enregistrerNote, remarqueNote: remarqueNote,
    pointerAbsence: pointerAbsence, leverAbsence: leverAbsence,
    absencesDeSequence: absencesDeSequence, absenceDe: absenceDe, enregistrerAbsence: enregistrerAbsence,
    sanctionsDe: sanctionsDe, sanctionDe: sanctionDe, enregistrerSanction: enregistrerSanction,
    definirDecision: definirDecision, definirAppreciationPP: definirAppreciationPP,
    validerBulletins: validerBulletins,
    definirBaremeAppreciations: definirBaremeAppreciations, definirMoyennePassage: definirMoyennePassage,
    definirEtablissement: definirEtablissement, initialesEtablissement: initialesEtablissement,
    definirArrondi: definirArrondi, enregistrerRegles: enregistrerRegles,
/* section helpers */
    sectionDeClasse: sectionDeClasse, estSectionFrancophone: estSectionFrancophone, estSectionAnglophone: estSectionAnglophone,
    noteMaxPourClasse: noteMaxPourClasse, baremeAppreciationPourClasse: baremeAppreciationPourClasse,
    appreciationPourMoyenne: appreciationPourMoyenne, noteVersGCE: noteVersGCE, GCEVersNote: GCEVersNote
  };
})(window);
