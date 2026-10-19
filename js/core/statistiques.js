/* EduNeum - Service de statistiques.
   Agrege les donnees du store (notes, coefficients, absences) pour produire
   des syntheses par classe / periode / matiere. Aucune ecriture : le module
   est strictement en lecture, il fonctionne donc aussi sur une annee close.

   Regle de calcul : tout passe par EduNeum.calculs (moyenneGenerale,
   moyenneMatiereTrimestre, classer...). Aucune moyenne n'est recalculee ici,
   pour que les statistiques montrent exactement les bulletins. */
(function (global) {
  'use strict';

  function store() { return global.EduNeum.store; }
  function calculs() { return global.EduNeum.calculs; }

  /* --------------------------------------------------------------- */
  /* Periode : meme encodage que les bulletins, la page reste ainsi  */
  /* coherente entre les deux modules.                               */
  /*   'annuel'      -> toute l'annee                                */
  /*   't:<idTri>'   -> un trimestre                                 */
  /*   's:<idSeq>'   -> une sequence                                 */
  /* --------------------------------------------------------------- */
  function porteeDe(valeur) {
    if (!valeur || valeur === 'annuel') return 'annuel';
    return valeur.charAt(0) === 's' ? 'sequence' : 'trimestre';
  }
  function idPeriode(valeur) {
    return valeur === 'annuel' ? valeur : String(valeur).slice(2);
  }

  /* Construit les options a passer a moyenneGenerale selon la periode. */
  function optionsPeriode(periode, base) {
    var o = base || {};
    var p = porteeDe(periode);
    if (p === 'sequence') o.sequenceId = idPeriode(periode);
    else if (p === 'trimestre') o.trimestreId = idPeriode(periode);
    else o.annuel = true;
    return o;
  }

  /* Sequences couvertes par la periode, dans l'ordre de l'annee. Sert a
     enumerer les notes reellement saisies pour un eleve/matiere. */
  function sequencesDePeriode(anneeId, periode) {
    var S = store();
    var p = porteeDe(periode);
    if (p === 'sequence') return [S.sequenceParId(idPeriode(periode))].filter(Boolean);
    if (p === 'trimestre') return S.sequencesDeTrimestre(idPeriode(periode));
    return S.sequencesDe(anneeId);
  }

  /* Libelle lisible d'une periode, pour les titres et les fichiers. */
  function libellePeriode(anneeId, periode) {
    var S = store();
    if (!periode || periode === 'annuel') {
      var an = S.anneeParId(anneeId);
      return 'Annee ' + (an ? an.libelle : '');
    }
    if (porteeDe(periode) === 'sequence') {
      var s = S.sequenceParId(idPeriode(periode));
      if (!s) return periode;
      var t = S.trimestreParId(s.trimestreId);
      return (t ? t.libelle + ' - ' : '') + s.libelle;
    }
    var tri = S.trimestreParId(idPeriode(periode));
    return tri ? tri.libelle : periode;
  }

  /* --------------------------------------------------------------- */
  /* Statistiques descriptives d'une liste de valeurs (ignore null). */
  /* --------------------------------------------------------------- */
  function mediane(triees) {
    if (!triees.length) return null;
    var mil = Math.floor(triees.length / 2);
    if (triees.length % 2) return triees[mil];
    return (triees[mil - 1] + triees[mil]) / 2;
  }

  function descriptives(valeurs) {
    var A = calculs().arrondir;
    var triees = valeurs.slice().sort(function (a, b) { return a - b; });
    if (!triees.length) {
      return { effectif: valeurs.length, nbNotes: 0, moyenne: null, min: null, max: null, mediane: null, ecartType: null };
    }
    var somme = triees.reduce(function (a, b) { return a + b; }, 0);
    var moy = somme / triees.length;
    var variance = triees.reduce(function (a, b) { return a + (b - moy) * (b - moy); }, 0) / triees.length;
    return {
      effectif: valeurs.length,
      nbNotes: triees.length,
      moyenne: A(moy),
      min: A(triees[0]),
      max: A(triees[triees.length - 1]),
      mediane: A(mediane(triees)),
      ecartType: A(Math.sqrt(variance))
    };
  }

  /* --------------------------------------------------------------- */
  /* Statistiques d'une classe pour une periode, toutes matieres.    */
  /* --------------------------------------------------------------- */

  /* detail d'une matiere : moyenne de la classe dans cette matiere,
     meilleure et pire moyenne eleve, et effectif reellement note. */
  function statsMatiere(classeId, anneeId, periode, matiere, eleves) {
    var S = store();
    var parEleve = eleves.map(function (e) {
      return porteeDe(periode) === 'annuel'
        ? calculs().moyenneMatiereAnnuelle({ eleveId: e.id, anneeId: anneeId, matiereId: matiere.id })
        : calculs().moyenneMatiereTrimestre({ eleveId: e.id, trimestreId: idPeriode(periode), matiereId: matiere.id });
    }).filter(function (v) { return v !== null; });
    var d = descriptives(parEleve);
    return {
      matiereId: matiere.id,
      nom: matiere.nom,
      coefficient: S.coefficient(classeId, matiere.id),
      moyenne: d.moyenne,
      min: d.min,
      max: d.max,
      nbNotes: d.nbNotes,
      effectif: eleves.length
    };
  }

  /* Statistiques d'assiduite (heures) d'un ensemble d'eleves sur la periode.
     On s'appuie sur les sequences de la periode ; une absence d'heure vide
     (pointage jour) est neutralisee car elle ne porte pas d'heures. */
  function statsAssiduite(eleves, anneeId, periode, classeId) {
    var S = store();
    var seqIds = {};
    sequencesDePeriode(anneeId, periode).forEach(function (s) { seqIds[s.id] = true; });
    var aFiltre = Object.keys(seqIds).length > 0;
    var heures = 0, justifiees = 0, nonJustifiees = 0, elevesTouches = {};
    S.absencesDe(anneeId).forEach(function (a) {
      if (classeId && a.classeId !== classeId) return;
      if (!eleves[a.eleveId]) return;
      if (aFiltre && !seqIds[a.sequenceId]) return;
      heures += Number(a.heures) || 0;
      justifiees += Number(a.justifiees) || 0;
      nonJustifiees += Number(a.nonJustifiees) || 0;
      elevesTouches[a.eleveId] = true;
    });
    return {
      heures: heures,
      justifiees: justifiees,
      nonJustifiees: nonJustifiees,
      elevesTouches: Object.keys(elevesTouches).length
    };
  }

  /* Tableau de bord d'une classe : moyenne generale + descriptives +
     taux de reussite + moyennes par matiere + assiduite. */
  function statsClasse(classeId, anneeId, periode, options) {
    options = options || {};
    var S = store(), A = calculs().arrondir;
    var eleves = S.elevesDeClasse(classeId, anneeId);
    var seuil = S.parametres().moyennePassage;
    var matieresFiltre = options.matiereId || null;

    var moyennes = eleves.map(function (e) {
      var p = optionsPeriode(periode, { eleveId: e.id, classeId: classeId, anneeId: anneeId });
      if (matieresFiltre) p.matiereIds = [matieresFiltre];
      return calculs().moyenneGenerale(p).valeur;
    });
    var d = descriptives(moyennes.filter(function (v) { return v !== null; }));

    var admis = 0, redoublants = 0, notesNonRenseignees = 0;
    moyennes.forEach(function (v) {
      if (v === null) { notesNonRenseignees++; return; }
      if (v >= seuil) admis++; else redoublants++;
    });
    var evalues = admis + redoublants;

    var matieres = [];
    if (!matieresFiltre) {
      S.matieresDeClasse(classeId).forEach(function (m) {
        matieres.push(statsMatiere(classeId, anneeId, periode, m, eleves));
      });
      matieres.sort(function (a, b) { return (a.moyenne === null ? -1 : a.moyenne) - (b.moyenne === null ? -1 : b.moyenne); });
    } else {
      var m2 = S.matiereParId(matieresFiltre);
      if (m2) matieres.push(statsMatiere(classeId, anneeId, periode, m2, eleves));
    }

    var idsEleves = {};
    eleves.forEach(function (e) { idsEleves[e.id] = true; });
    var assiduite = statsAssiduite(idsEleves, anneeId, periode, classeId);

    var meilleur = null, pire = null;
    eleves.forEach(function (e, i) {
      if (moyennes[i] === null) return;
      if (!meilleur || moyennes[i] > meilleur.moyenne) meilleur = { eleveId: e.id, moyenne: moyennes[i] };
      if (!pire || moyennes[i] < pire.moyenne) pire = { eleveId: e.id, moyenne: moyennes[i] };
    });

    var classe = S.classeParId(classeId);
    return {
      classeId: classeId,
      classe: classe ? classe.nom : classeId,
      effectif: eleves.length,
      periode: periode,
      seuil: seuil,
      moyenne: d.moyenne,
      min: d.min,
      max: d.max,
      mediane: d.mediane,
      ecartType: d.ecartType,
      nbNotes: d.nbNotes,
      admis: admis,
      redoublants: redoublants,
      notesNonRenseignees: notesNonRenseignees,
      tauxReussite: evalues ? A((admis / evalues) * 100) : null,
      matieres: matieres,
      assiduite: assiduite,
      meilleur: meilleur,
      pire: pire
    };
  }

  /* --------------------------------------------------------------- */
  /* Detail par eleve : moyenne, rang, point fort/faible, absences.  */
  /* --------------------------------------------------------------- */
  function detailEleves(classeId, anneeId, periode, options) {
    options = options || {};
    var S = store();
    var eleves = S.elevesDeClasse(classeId, anneeId);

    var moyennes = {};
    eleves.forEach(function (e) {
      var p = optionsPeriode(periode, { eleveId: e.id, classeId: classeId, anneeId: anneeId });
      if (options.matiereId) p.matiereIds = [options.matiereId];
      moyennes[e.id] = calculs().moyenneGenerale(p).valeur;
    });

    var classement = calculs().classer(eleves.map(function (e) { return e.id; }), function (id) { return moyennes[id]; });
    var rangParId = {};
    classement.lignes.forEach(function (l) { rangParId[l.eleveId] = l.rang; });

    /* Absences par eleve : meme perimetre que l'agregat de classe (meme
       classe, et meme periode quand une periode borne les sequences). */
    var seqIds = {};
    var aFiltre = false;
    sequencesDePeriode(anneeId, periode).forEach(function (s) { seqIds[s.id] = true; aFiltre = true; });
    var absParEleve = {};
    S.absencesDe(anneeId).forEach(function (a) {
      if (!moyennes.hasOwnProperty(a.eleveId)) return;
      if (a.classeId !== classeId) return;
      if (aFiltre && !seqIds[a.sequenceId]) return;
      absParEleve[a.eleveId] = (absParEleve[a.eleveId] || 0) + (Number(a.heures) || 0);
    });

    var matieres = S.matieresDeClasse(classeId);
    var lignes = eleves.map(function (e) {
      var moyMat = matieres.map(function (m) {
        var v = porteeDe(periode) === 'annuel'
          ? calculs().moyenneMatiereAnnuelle({ eleveId: e.id, anneeId: anneeId, matiereId: m.id })
          : calculs().moyenneMatiereTrimestre({ eleveId: e.id, trimestreId: idPeriode(periode), matiereId: m.id });
        return { nom: m.nom, valeur: v };
      }).filter(function (x) { return x.valeur !== null; });
      moyMat.sort(function (a, b) { return b.valeur - a.valeur; });
      return {
        eleveId: e.id,
        nom: ((e.prenom || '') + ' ' + (e.nom || '')).trim(),
        matricule: e.matricule || '',
        moyenne: moyennes[e.id],
        rang: rangParId[e.id] || null,
        appreciation: calculs().appreciationAuto(moyennes[e.id], classeId),
        absences: absParEleve[e.id] || 0,
        pointFort: moyMat.length ? moyMat[0] : null,
        pointFaible: moyMat.length > 1 ? moyMat[moyMat.length - 1] : null
      };
    });
    lignes.sort(function (a, b) {
      if (a.rang === null && b.rang === null) return 0;
      if (a.rang === null) return 1;
      if (b.rang === null) return -1;
      return a.rang - b.rang;
    });
    return { classeId: classeId, lignes: lignes, classement: classement };
  }

  /* --------------------------------------------------------------- */
  /* Comparaison de toutes les classes de l'annee pour la periode.   */
  /* --------------------------------------------------------------- */
  function comparaisonClasses(anneeId, periode, options) {
    options = options || {};
    var S = store();
    return S.classesDe(anneeId).map(function (c) {
      return statsClasse(c.id, anneeId, periode, options);
    });
  }

  /* Repartition des moyennes generales par tranche de note (histogramme). */
  function repartition(classeId, anneeId, periode, matiereId) {
    var S = store();
    var eleves = S.elevesDeClasse(classeId, anneeId);
    var bornes = [[0, 5], [5, 10], [10, 15], [15, 20]];
    var compte = bornes.map(function () { return 0; });
    var valeurs = [];
    eleves.forEach(function (e) {
      var p = optionsPeriode(periode, { eleveId: e.id, classeId: classeId, anneeId: anneeId });
      if (matiereId) p.matiereIds = [matiereId];
      var v = calculs().moyenneGenerale(p).valeur;
      if (v === null) return;
      valeurs.push(v);
      for (var i = bornes.length - 1; i >= 0; i--) {
        if (v >= bornes[i][0]) { compte[i]++; break; }
      }
    });
    var total = valeurs.length;
    return bornes.map(function (b, i) {
      return {
        label: b[0] + '-' + b[1],
        min: b[0], max: b[1],
        nb: compte[i],
        pct: total ? Math.round((compte[i] / total) * 100) : 0
      };
    });
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.statistiques = {
    porteeDe: porteeDe, idPeriode: idPeriode, libellePeriode: libellePeriode,
    sequencesDePeriode: sequencesDePeriode, descriptives: descriptives,
    statsMatiere: statsMatiere, statsClasse: statsClasse, statsAssiduite: statsAssiduite,
    detailEleves: detailEleves, comparaisonClasses: comparaisonClasses,
    repartition: repartition
  };
})(window);
