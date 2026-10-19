/* EduNeum - Service de calcul unique.
   Toutes les moyennes, tous les rangs et toutes les appreciations passent par ici.
   Regle : une matiere non notee (ABS) n'est jamais comptee comme 0 sans regle explicite. */
(function (global) {
  'use strict';

  var S = function () { return global.EduNeum.store; };

  function arrondir(n, decimales) {
    if (n === null || n === undefined || isNaN(n)) return null;
    var d = decimales === undefined ? (S().load().parametres.arrondi || 2) : decimales;
    var f = Math.pow(10, d);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  /* Valeur d'une note exploitable, ou null si ABS / non note. */
  function valeur(brute) {
    if (brute === null || brute === undefined || brute === '') return null;
    var n = Number(brute);
    return isNaN(n) ? null : n;
  }

  /* Moyenne simple d'une liste de valeurs, en ignorant les non-notes. */
  function moyenne(valeurs) {
    var notes = valeurs.map(valeur).filter(function (v) { return v !== null; });
    if (!notes.length) return null;
    return notes.reduce(function (a, b) { return a + b; }, 0) / notes.length;
  }

  /* Moyenne d'une matiere sur un ensemble de sequences.
     options.traiterAbsCommeZero : si false (defaut), une sequence ABS est exclue du calcul. */
  /* La matiere est OBLIGATOIRE dans les options : sans elle, la note cherchee
     ne serait pas identifiable, car une note vaut pour un triplet
     (sequence, eleve, matiere) et pas seulement pour un couple (sequence, eleve). */
  function moyenneMatiere(opts) {
    var store = S();
    if (!opts.matiereId) return null;
    var valeurs = [];
    var nbAbs = 0;
    (opts.sequences || []).forEach(function (seqId) {
      var n = store.note(seqId, opts.eleveId, opts.matiereId);
      if (!n || n.statut !== 'note') { nbAbs++; return; }
      valeurs.push(n.valeur);
    });
    if (!valeurs.length) {
      if (opts.traiterAbsCommeZero && nbAbs > 0) return 0;
      return null;
    }
    return moyenne(valeurs);
  }

  /* Moyenne d'une matiere sur UNE sequence. Une sequence porte une seule note
     par matiere : la moyenne est donc la note elle-meme, NULL si l'eleve n'a
     pas ete note. On passe par moyenneMatiere() plutot que par store.note()
     pour qu'une sequence verrouillee ou non notee soit traitee exactement
     comme partout ailleurs. */
  function moyenneMatiereSequence(opts) {
    return moyenneMatiere({
      eleveId: opts.eleveId,
      sequences: [opts.sequenceId],
      matiereId: opts.matiereId,
      traiterAbsCommeZero: !!opts.traiterAbsCommeZero
    });
  }

  /* Moyenne d'une matiere sur un trimestre (moyenne des sequences du trimestre). */
  function moyenneMatiereTrimestre(opts) {
    var store = S();
    var t = store.trimestreParId(opts.trimestreId);
    if (!t) return null;
    var seqIds = store.sequencesDeTrimestre(t.id).map(function (s) { return s.id; });
    return moyenneMatiere({
      eleveId: opts.eleveId, sequences: seqIds, matiereId: opts.matiereId,
      traiterAbsCommeZero: !!opts.traiterAbsCommeZero
    });
  }

  /* Moyenne d'une matiere sur l'annee (moyenne des trimestres). */
  function moyenneMatiereAnnuelle(opts) {
    var store = S();
    if (!opts.matiereId) return null;
    var ts = store.trimestresDe(opts.anneeId);
    var valeurs = [];
    ts.forEach(function (t) {
      var v = moyenneMatiereTrimestre({
        eleveId: opts.eleveId, trimestreId: t.id, matiereId: opts.matiereId,
        traiterAbsCommeZero: !!opts.traiterAbsCommeZero
      });
      if (v !== null) valeurs.push(v);
    });
    if (!valeurs.length) return opts.traiterAbsCommeZero ? 0 : null;
    return moyenne(valeurs);
  }

  /* Moyenne generale ponderee : total des points / total des coefficients.
     Le coefficient d'une matiere entre TOUJOURS au denominateur, meme si
     l'eleve n'a aucune note dans cette matiere : une matiere non notee vaut
     0 point mais son coefficient reste compte dans le diviseur. La moyenne
     est donc toujours le total des points divise par le total des
     coefficients de la classe. */
  function moyenneGenerale(opts) {
    var store = S();
    var detail = [];
    var numerateur = 0, denominateur = 0;
    (opts.matiereIds || store.matieresDeClasse(opts.classeId).map(function (m) { return m.id; }))
      .forEach(function (matId) {
        var coef = store.coefficient(opts.classeId, matId);
        if (!coef) return;
        /* Trois portees possibles : annuel, trimestre ou sequence. La sequence
           est testee en premier car c'est la plus precise. */
        var moy = opts.sequenceId
          ? moyenneMatiereSequence({ eleveId: opts.eleveId, sequenceId: opts.sequenceId, matiereId: matId, traiterAbsCommeZero: opts.traiterAbsCommeZero })
          : opts.annuel
            ? moyenneMatiereAnnuelle({ eleveId: opts.eleveId, anneeId: opts.anneeId, matiereId: matId, traiterAbsCommeZero: opts.traiterAbsCommeZero })
            : moyenneMatiereTrimestre({ eleveId: opts.eleveId, trimestreId: opts.trimestreId, matiereId: matId, traiterAbsCommeZero: opts.traiterAbsCommeZero });
        detail.push({ matiereId: matId, coefficient: coef, moyenne: moy, pondere: moy === null ? null : moy * coef });
        denominateur += coef;
        numerateur += (moy === null ? 0 : moy) * coef;
      });
    return {
      valeur: denominateur ? arrondir(numerateur / denominateur) : null,
      denominateur: denominateur,
      matieresNonNotees: detail.filter(function (d) { return d.moyenne === null; }).map(function (d) { return d.matiereId; }),
      detail: detail
    };
  }

  /* Rang dans la classe, ex aequo gérés (competition 1,2,2,4). */
  function classer(elevesIds, calcUn) {
    var lignes = elevesIds.map(function (id) {
      return { eleveId: id, valeur: calcUn(id) };
    });
    var avecNote = lignes.filter(function (l) { return l.valeur !== null && l.valeur !== undefined; });
    avecNote.sort(function (a, b) { return b.valeur - a.valeur; });
    var rang = 0, precedent = null, i = 0;
    avecNote.forEach(function (l) {
      i++;
      if (precedent === null || l.valeur < precedent) { rang = i; precedent = l.valeur; }
      l.rang = rang;
    });
    lignes.forEach(function (l) {
      if (l.valeur === null || l.valeur === undefined) l.rang = null;
    });
    var valeurs = avecNote.map(function (l) { return l.valeur; });
    return {
      lignes: lignes,
      moyenne: valeurs.length ? arrondir(valeurs.reduce(function (a, b) { return a + b; }, 0) / valeurs.length) : null,
      meilleure: valeurs.length ? arrondir(Math.max.apply(null, valeurs)) : null,
      pire: valeurs.length ? arrondir(Math.min.apply(null, valeurs)) : null,
      effectif: elevesIds.length,
      nbNotes: valeurs.length
    };
  }

  /* Classement d'une matiere dans une classe pour une sequence. */
  var CLASSEMENT_VIDE = { lignes: [], moyenne: null, meilleure: null, pire: null, effectif: 0, nbNotes: 0 };

  function classerMatiereSequence(opts) {
    var store = S();
    /* sans matiere, aucun classement n'a de sens : on renvoie la meme
       forme qu'un classement normal, mais vide, plutot qu'un tableau. */
    if (!opts.matiereId) return CLASSEMENT_VIDE;
    var eleves = store.elevesDeClasse(opts.classeId, store.classeDeSequenceAnnee(opts.sequenceId) || opts.anneeId);
    return classer(eleves.map(function (e) { return e.id; }), function (eleveId) {
      var n = store.note(opts.sequenceId, eleveId, opts.matiereId);
      return n && n.statut === 'note' ? n.valeur : null;
    });
  }

  /* Classement general (sequence, trimestre ou annuel) pour une classe. */
  function classerGeneral(opts) {
    var store = S();
    var eleves = store.elevesDeClasse(opts.classeId, opts.anneeId);
    return classer(eleves.map(function (e) { return e.id; }), function (eleveId) {
      return moyenneGenerale({
        eleveId: eleveId, classeId: opts.classeId, anneeId: opts.anneeId,
        sequenceId: opts.sequenceId, trimestreId: opts.trimestreId, annuel: opts.annuel,
        traiterAbsCommeZero: opts.traiterAbsCommeZero
      }).valeur;
    });
  }

  /* Appreciation automatique selon le bareme configurable et la section de la classe. */
  function appreciationAuto(moyenne, classeId) {
    if (moyenne === null || moyenne === undefined) return 'Non renseignée';
    var store = S();
    var bareme = store.baremeAppreciationPourClasse ? store.baremeAppreciationPourClasse(classeId) : store.load().parametres.baremeAppreciation;
    for (var i = 0; i < bareme.length; i++) {
      if (moyenne >= bareme[i].min) return bareme[i].label;
    }
    return 'Insuffisant';
  }

  /* Convertit une note sur 20 vers le grade GCE (Anglophone). */
  function noteVersGCE(noteSur20) {
    var store = S();
    if (store.noteVersGCE) return store.noteVersGCE(noteSur20);
    if (noteSur20 === null || noteSur20 === undefined) return { grade: 'U', label: 'Fail', points: 0 };
    var sur100 = (noteSur20 / 20) * 100;
    var gce = store.load().parametres.gceGradeScale || [
      { min: 75, grade: 'A', label: 'Excellent' },
      { min: 70, grade: 'B', label: 'Very Good' },
      { min: 65, grade: 'C', label: 'Good' },
      { min: 60, grade: 'D', label: 'Satisfactory' },
      { min: 50, grade: 'E', label: 'Pass' },
      { min: 0, grade: 'U', label: 'Fail' }
    ];
    for (var i = 0; i < gce.length; i++) {
      if (sur100 >= gce[i].min) return { grade: gce[i].grade, label: gce[i].label, points: sur100 };
    }
    return { grade: 'U', label: 'Fail', points: sur100 };
  }

  /* Convertit un grade GCE vers note sur 20. */
  function GCEVersNote(grade) {
    var store = S();
    if (store.GCEVersNote) return store.GCEVersNote(grade);
    var gce = store.load().parametres.gceGradeScale || [
      { min: 75, grade: 'A', label: 'Excellent' },
      { min: 70, grade: 'B', label: 'Very Good' },
      { min: 65, grade: 'C', label: 'Good' },
      { min: 60, grade: 'D', label: 'Satisfactory' },
      { min: 50, grade: 'E', label: 'Pass' },
      { min: 0, grade: 'U', label: 'Fail' }
    ];
    var g = gce.filter(function (x) { return x.grade === grade; })[0];
    return g ? (g.min / 100) * 20 : null;
  }

  function decision(moyenneAnnuelle) {
    var seuil = S().load().parametres.moyennePassage;
    if (moyenneAnnuelle === null) return 'indeterminee';
    return moyenneAnnuelle >= seuil ? 'admis' : 'redouble';
  }

  /* Verifie qu'une note est saisissable : borne 0..noteMax, sequence ouverte, autorisation. */
  function validerSaisie(opts) {
    var store = S();
    var seq = store.sequenceParId(opts.sequenceId);
    if (!seq) return { ok: false, message: 'Séquence introuvable.' };
    if (seq.verrouillee) return { ok: false, message: 'Séquence verrouillée : la saisie est bloquée.' };
    if (!seq.ouverte) return { ok: false, message: 'Séquence fermée : la saisie est bloquée.' };
    var mat = store.matiereParId(opts.matiereId);
    var max = mat ? mat.noteMax : 20;
    var v = valeur(opts.valeur);
    if (v === null) return { ok: true, valeur: null, statut: 'non-note' };
    if (isNaN(v)) return { ok: false, message: 'Saisissez un nombre.' };
    if (v < 0) return { ok: false, message: 'La note ne peut pas être négative.' };
    if (v > max) return { ok: false, message: 'La note ne peut pas dépasser ' + max + '/20.' };
    if (opts.enseignantId && !store.peutSaisir(opts.enseignantId, opts.classeId, opts.matiereId, seq.anneeId)) {
      return { ok: false, message: 'Vous n’êtes pas affecté à cette classe/matière pour cette année scolaire.' };
    }
    return { ok: true, valeur: v, statut: 'note' };
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.calculs = {
    arrondir: arrondir, valeur: valeur, moyenne: moyenne,
    moyenneMatiere: moyenneMatiere, moyenneMatiereTrimestre: moyenneMatiereTrimestre,
    moyenneMatiereSequence: moyenneMatiereSequence,
    moyenneMatiereAnnuelle: moyenneMatiereAnnuelle, moyenneGenerale: moyenneGenerale,
    classer: classer, classerMatiereSequence: classerMatiereSequence, classerGeneral: classerGeneral,
    appreciationAuto: appreciationAuto, decision: decision, validerSaisie: validerSaisie,
    noteVersGCE: noteVersGCE, GCEVersNote: GCEVersNote
  };
})(window);
