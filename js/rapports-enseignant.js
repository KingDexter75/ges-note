/* EduNeum - Rapports de l'enseignant.

   L'enseignant consulte ses propres resultats : une classe, une matiere et
   une sequence. Aucune ecriture ici — c'est une lecture. Trois regles
   structurent la page :
     - les classes proposees sont celles de ses affectations, plus la
       classe dont il est professeur principal (acces.mesClasses) ;
     - les matieres proposees sont celles de SES affectations dans la
       classe choisie, jamais le programme entier ;
     - les notes viennent du store par le triplet (sequence, eleve,
       matiere), donc une sequence non notee reste vide au lieu d'afficher
       des zeros. */
(function () {
  'use strict';

  var E = window.EduNeum;
  if (!E.auth.estConnecte()) return;
  var S = E.store, C = E.calculs, UI = E.ui, P = E.page, A = E.acces;
  var t = function (cle, defaut) {
    if (!E.i18n) return defaut;
    var v = E.i18n.t(cle);
    return v === cle ? defaut : v;
  };

  var session = E.auth.session();
  var an = E.layout.anneeChoisie();
  var racine = P.contenu();
  if (!racine) return;

  var etat = { classeId: '', matiereId: '', sequenceId: '' };

  /* ------------------------------ Donnees ------------------------------ */

  /* Une classe n'est proposable que si l'enseignant y est affecte ou s'il
     en est le professeur principal : c'est la meme regle que les ecritures,
     donc le rapport ne peut pas divulguer une classe hors perimetre. */
  function mesClasses() {
    var ids = A.mesClasses ? A.mesClasses() : [];
    return ids.map(function (id) { return S.classeParId(id); })
      .filter(function (c) { return c && !c.archive; });
  }

  function mesMatieres(classeId) {
    if (!session.enseignantId || !classeId || !an) return [];
    return S.affectationsDeEnseignant(session.enseignantId, an.id)
      .filter(function (a) { return a.classeId === classeId; })
      .map(function (a) { return S.matiereParId(a.matiereId); })
      .filter(function (m) { return m && !m.archive; });
  }

  /* Les sequences de l'annee, avec le trimestre qui les porte. */
  function sequencesDeAnnee() {
    if (!an) return [];
    var out = [];
    S.trimestresDe(an.id).forEach(function (tr) {
      S.sequencesDeTrimestre(tr.id).forEach(function (sq) {
        out.push({ sequence: sq, trimestre: tr });
      });
    });
    return out;
  }

  function classe() { return etat.classeId ? S.classeParId(etat.classeId) : null; }
  function matiere() { return etat.matiereId ? S.matiereParId(etat.matiereId) : null; }
  function sequence() { return etat.sequenceId ? S.sequenceParId(etat.sequenceId) : null; }
  function trimestreDeSequence() {
    var sq = sequence();
    return sq ? S.trimestreParId(sq.trimestreId) : null;
  }

  /* Etat de la sequence pour l'enseignant : une sequence fermee, verrouillee
     ou dont le trimestre est cloture se consulte mais ne se modifie pas. */
  function etatSequence() {
    var sq = sequence();
    if (!sq) return null;
    var tr = S.trimestreParId(sq.trimestreId);
    return {
      fermee: !sq.ouverte,
      verrouillee: !!sq.verrouillee,
      trimestreCloture: !tr || !tr.ouvert
    };
  }

  /* ---------------------------- Resultats ------------------------------ */

  function resultats() {
    var c = classe(), m = matiere(), sq = sequence();
    if (!c || !m || !sq) return null;
    var eleves = S.elevesDeClasse(c.id, an.id);
    var max = m.noteMax || 20;

    var lignes = eleves.map(function (e) {
      var n = S.note(sq.id, e.id, m.id);
      var note = n && n.statut === 'note' ? n.valeur : null;
      return {
        eleveId: e.id,
        eleve: e.nom + ' ' + e.prenom,
        matricule: e.matricule || '',
        sexe: e.sexe || '',
        note: note,
        remarque: n ? (n.remarque || '') : '',
        nonNote: n ? (n.statut === 'non-note') : false
      };
    });

    /* Le rang ne porte que sur les eleves reellement notes : classer un
       non note comme dernier serait une information fausse. */
    var notes = lignes.filter(function (l) { return l.note !== null; })
      .sort(function (a, b) { return b.note - a.note; });
    notes.forEach(function (l, i) {
      if (i > 0 && notes[i - 1].note === l.note) l.rang = notes[i - 1].rang;
      else l.rang = i + 1;
    });

    var valeurs = notes.map(function (l) { return l.note; });
    var moyenne = valeurs.length
      ? valeurs.reduce(function (a, b) { return a + b; }, 0) / valeurs.length
      : null;

    return {
      classe: c, matiere: m, sequence: sq, trimestre: trimestreDeSequence(),
      lignes: lignes, notes: notes,
      effectif: eleves.length,
      saisie: notes.length,
      nonNotes: lignes.length - notes.length,
      moyenne: moyenne,
      minimum: valeurs.length ? Math.min.apply(null, valeurs) : null,
      maximum: valeurs.length ? Math.max.apply(null, valeurs) : null,
      tauxSaisie: eleves.length ? Math.round((notes.length / eleves.length) * 100) : 0,
      noteMax: max
    };
  }

  /* Repartition en sept tranches, exprimees en points a partir de la
     note maximale reelle de la matiere (qui n'est pas toujours 20). */
  function tranches(r) {
    var max = r.noteMax;
    var bornes = [0, 0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0001];
    var etiq = [];
    for (var i = 0; i < bornes.length - 1; i++) {
      etiq.push(Math.round(bornes[i] * max) + '–' + Math.round(Math.min(bornes[i + 1], 1) * max));
    }
    var compte = etiq.map(function () { return 0; });
    r.notes.forEach(function (l) {
      var f = l.note / max;
      for (var i = 0; i < bornes.length - 1; i++) {
        if (f >= bornes[i] && f < bornes[i + 1]) { compte[i]++; return; }
      }
    });
    return { etiquettes: etiq, compte: compte, max: Math.max(1, Math.max.apply(null, compte)) };
  }

  /* --------------------- Repartition par sexe -------------------------- */
  /* Garcons et filles sont analyses separement : seuil = la moitie de la
     note maximale, plus le min/max et le taux de reussite de chaque
     sexe, et un taux global. */
  function statsParSexe(r) {
    var seuil = r.noteMax / 2;
    function bloc(sexe) {
      var notes = r.notes.filter(function (l) { return l.sexe === sexe; });
      if (!notes.length) return { effectif: 0, reussis: 0, echoues: 0, max: null, min: null, taux: null };
      var reussis = notes.filter(function (l) { return l.note >= seuil; }).length;
      var valeurs = notes.map(function (l) { return l.note; });
      return {
        effectif: notes.length,
        reussis: reussis,
        echoues: notes.length - reussis,
        max: Math.max.apply(null, valeurs),
        min: Math.min.apply(null, valeurs),
        taux: Math.round((reussis / notes.length) * 100)
      };
    }
    var g = bloc('M'), f = bloc('F');
    var total = r.notes.length;
    return {
      seuil: seuil,
      garcons: g, filles: f,
      tauxTotal: total ? Math.round(((g.reussis + f.reussis) / total) * 100) : null
    };
  }

  /* Une carte resume : effectif, reussis/echoues, min-max. */
  function carteSexe(titre, icone, couleur, b) {
    if (!b.effectif) {
      return P.carte({ label: titre, valeur: '—', icone: icone, couleur: couleur, note: 'aucun élève' });
    }
    return P.carte({
      label: titre,
      valeurHtml: '<span class="text-lg">' + b.reussis + ' / ' + b.effectif + '</span>',
      icone: icone, couleur: couleur,
      note: b.echoues + ' en échec · max ' + UI.nombre(b.max) + ' · min ' + UI.nombre(b.min)
    });
  }

  /* Trois barres horizontales : reussis vs echoues pour chaque sexe,
     puis le taux global. Meme style que la jauge de repartition. */
  function repartitionSexe(r) {
    var s = statsParSexe(r);
    function barre(label, b) {
      if (!b.effectif) {
        return '<div class="flex items-center gap-3 text-xs font-bold text-gray-400">' +
          '<span class="w-20">' + label + '</span><span class="flex-1 text-gray-400">aucun élève</span></div>';
      }
      var pct = Math.round((b.reussis / b.effectif) * 100);
      return '<div class="flex items-center gap-3 text-xs font-bold text-gray-500">' +
        '<span class="w-20">' + label + '</span>' +
        '<div class="flex-1 seq-jauge"><span style="width:' + pct + '%"></span></div>' +
        '<span class="w-20 text-right">' + b.reussis + '/' + b.effectif + ' (' + pct + '%)</span></div>';
    }
    var lignesHtml = barre(t('rapport.garcons', 'Garçons'), s.garcons) +
      barre(t('rapport.filles', 'Filles'), s.filles);
    var total = '<div class="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 text-xs font-black text-accent">' +
      '<span class="w-20">' + t('rapport.tauxTotal', 'Total') + '</span>' +
      '<span class="flex-1"></span>' +
      '<span class="w-20 text-right">' + (s.tauxTotal === null ? '—' : s.tauxTotal + '%') + '</span></div>';
    var note = '<p class="text-[11px] text-gray-400 pt-1">' +
      P.esc(t('rapport.seuilReussite', 'Réussite : note = la moitié de la note maximale') +
        ' (≥ ' + UI.nombre(s.seuil) + ')') + '</p>';
    return '<div class="nm-flat p-6 rounded-[32px] space-y-2">' + lignesHtml + total + note + '</div>';
  }

  /* ------------------------------ Rendu -------------------------------- */

  function jauge(r) {
    var tr = tranches(r);
    return '<div class="nm-flat p-6 rounded-[32px] space-y-3">' + tr.etiquettes.map(function (k, i) {
      var v = tr.compte[i];
      return '<div class="flex items-center gap-3 text-xs font-bold text-gray-500">' +
        '<span class="w-14 text-right">' + P.esc(k) + '</span>' +
        '<div class="flex-1 seq-jauge"><span style="width:' +
        Math.round((v / tr.max) * 100) + '%"></span></div>' +
        '<span class="w-6">' + v + '</span></div>';
    }).join('') + '</div>';
  }

  function tableauResultats(r) {
    return UI.tableau({
      lignes: r.lignes,
      placeholderRecherche: t('commun.rechercher', 'Rechercher un élève…'),
      colonnes: [
        { cle: 'eleve', titre: t('commun.eleve', 'Élève') },
        { cle: 'matricule', titre: t('commun.matricule', 'Matricule'), triable: false },
        {
          cle: 'note', titre: t('commun.note', 'Note') + ' /' + r.noteMax,
          rendu: function (l) {
            if (l.note !== null) return '<span class="font-black text-accent">' + UI.nombre(l.note) + '</span>';
            if (l.nonNote) return '<span class="pastille ambre">' + t('commun.abs', 'ABS') + '</span>';
            return '<span class="text-gray-400">' + t('commun.nonSaisi', 'Non saisi') + '</span>';
          }
        },
        {
          cle: 'rang', titre: 'Rang',
          rendu: function (l) { return l.rang ? '<span class="pastille accent">' + l.rang + '</span>' : '—'; }
        },
        {
          cle: 'remarque', titre: t('commun.remarque', 'Remarque'), triable: false,
          rendu: function (l) { return l.remarque ? P.esc(l.remarque) : '—'; }
        }
      ],
      nomExport: 'rapport-' + r.classe.nom,
      messageVide: t('rapport.aucuneNote', 'Aucune note enregistrée pour cette séquence.')
    });
  }

  /* ----------------------------- Exports ------------------------------- */
  /* Les trois sorties utilisent le meme jeu de donnees : ce qui est
     imprime, ce qui part en PDF et ce qui part en Excel ne peuvent pas
     diverger. */

  function lignesExport(r) {
    return r.lignes.map(function (l) {
      return {
        eleve: l.eleve, matricule: l.matricule,
        note: l.note === null ? (l.nonNote ? 'ABS' : '') : UI.nombre(l.note),
        rang: l.rang || '', appreciation: l.note === null ? '' : C.appreciationAuto(l.note),
        remarque: l.remarque
      };
    });
  }

  var COLONNES = [
    { cle: 'eleve', titre: 'Élève' },
    { cle: 'matricule', titre: 'Matricule' },
    { cle: 'note', titre: 'Note' },
    { cle: 'rang', titre: 'Rang' },
    { cle: 'appreciation', titre: 'Appréciation' },
    { cle: 'remarque', titre: 'Remarque' }
  ];

  function titreDuRapport(r) {
    return r.classe.nom + ' — ' + r.matiere.nom + ' — ' + r.sequence.libelle;
  }

  function exporterPDF(r) {
    var donnees = lignesExport(r);
    UI.exporterPDF({
      titre: titreDuRapport(r),
      sousTitre: r.trimestre ? r.trimestre.libelle : '',
      meta: (an ? an.libelle + ' • ' : '') +
        'Effectif ' + r.effectif + ' • Saisies ' + r.saisie +
        (r.moyenne !== null ? ' • Moyenne ' + UI.nombre(r.moyenne) + '/' + r.noteMax : ''),
      entetes: COLONNES.map(function (c) { return c.titre; }),
      lignes: donnees.map(function (l) {
        return COLONNES.map(function (c) { return l[c.cle]; });
      }),
      poids: [4, 2, 1.5, 1, 3, 4],
      alignements: ['gauche', 'gauche', 'droite', 'droite', 'gauche', 'gauche'],
      nom: 'rapport-' + r.classe.nom
    });
    P.tracer('export.rapport', 'sequence:' + r.sequence.id, 'Export PDF des résultats de ' + r.classe.nom);
    UI.toast(t('msg.exportPrete', 'Export généré.'), 'success');
  }

  function exporterXLSX(r) {
    UI.exporterXLSX(COLONNES, lignesExport(r), 'rapport-' + r.classe.nom, { titreFeuille: r.sequence.libelle });
    P.tracer('export.rapport', 'sequence:' + r.sequence.id, 'Export Excel des résultats de ' + r.classe.nom);
    UI.toast(t('msg.exportPrete', 'Export généré.'), 'success');
  }

  function imprimer(r) {
    var corps = '<p>' + P.esc((an ? an.libelle : '') + ' • ' +
      (r.trimestre ? r.trimestre.libelle : '')) + '</p>' +
      '<table><thead><tr>' + COLONNES.map(function (c) { return '<th>' + P.esc(c.titre) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      lignesExport(r).map(function (l) {
        return '<tr>' + COLONNES.map(function (c) {
          return '<td>' + P.esc(l[c.cle] === null || l[c.cle] === undefined ? '—' : l[c.cle]) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    UI.imprimer(corps, { titre: titreDuRapport(r) });
    P.tracer('export.rapport', 'sequence:' + r.sequence.id, 'Impression des résultats de ' + r.classe.nom);
    UI.toast(t('msg.impression', 'Ouverture de l’impression…'), 'info');
  }

  /* --------------------------- Habillage page -------------------------- */

  function boutons(r) {
    return '<div class="flex flex-wrap gap-2">' +
      '<button type="button" id="rp-pdf" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold flex items-center gap-2">' +
      P.ico('file-text', 16) + P.esc(t('rapport.exporterPdf', 'Exporter en PDF')) + '</button>' +
      '<button type="button" id="rp-xlsx" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold flex items-center gap-2">' +
      P.ico('table', 16) + P.esc(t('rapport.exporterXlsx', 'Exporter en Excel')) + '</button>' +
      '<button type="button" id="rp-print" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold flex items-center gap-2">' +
      P.ico('printer', 16) + P.esc(t('rapport.imprimer', 'Imprimer')) + '</button>' +
      '</div>';
  }

  function zoneFiltres() {
    var classes = mesClasses();
    var matieres = mesMatieres(etat.classeId);
    var sequences = sequencesDeAnnee();

    var optClasses = classes.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === etat.classeId ? ' selected' : '') + '>' + P.esc(c.nom) + '</option>';
    }).join('');

    var optMatieres = matieres.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === etat.matiereId ? ' selected' : '') + '>' + P.esc(m.nom) + '</option>';
    }).join('');

    var optSeq = sequences.map(function (x) {
      var marque = x.sequence.ouverte ? '' : (x.sequence.verrouillee ? ' (verrouillée)' : ' (fermée)');
      return '<option value="' + x.sequence.id + '"' + (x.sequence.id === etat.sequenceId ? ' selected' : '') + '>' +
        P.esc(x.trimestre ? x.trimestre.libelle + ' — ' : '') + P.esc(x.sequence.libelle) + marque + '</option>';
    }).join('');

    return '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 md:grid-cols-3 gap-4 items-end">' +
      champ('rp-classe', t('rapport.choisirClasse', 'Classe'),
        optClasses, t('rapport.aucuneClasse', 'Sélectionner une classe'), classes.length) +
      champ('rp-matiere', t('rapport.choisirMatiere', 'Matière'),
        optMatieres, t('saisie.selectionnerMatiere', 'Sélectionner une matière'), matieres.length) +
      champ('rp-sequence', t('rapport.choisirSequence', 'Séquence'),
        optSeq, t('rapport.aucuneSequence', 'Sélectionner une séquence'), sequences.length) +
      '</div>';
  }

  function champ(id, label, options, vide, nbOptions) {
    return '<div class="space-y-2">' +
      '<label class="block text-xs font-bold uppercase tracking-widest text-gray-400">' + P.esc(label) + '</label>' +
      '<select id="' + id + '" class="w-full p-3 nm-soft-convex rounded-xl text-sm font-medium"' +
      (nbOptions ? '' : ' disabled') + '>' +
      (options || '<option value="">' + P.esc(vide) + '</option>') +
      '</select></div>';
  }

  function bandeauSequence(r) {
    var e = etatSequence();
    if (!e) return '';
    var motifs = [];
    if (e.trimestreCloture) motifs.push('le trimestre de cette séquence est clôturé');
    if (e.verrouillee) motifs.push('la séquence est verrouillée par l\'administration');
    if (e.fermee) motifs.push('la séquence est fermée');
    if (!motifs.length) return '';
    return '<div class="p-5 rounded-[32px] nm-flat bg-amber-500/5 border border-amber-500/20 flex items-start gap-3">' +
      '<span class="text-amber-500 mt-0.5">' + P.ico('lock', 18) + '</span>' +
      '<div><p class="text-sm font-bold">Consultation seule</p>' +
      '<p class="text-xs text-gray-500 dark:text-gray-400">Résultats non modifiables : ' +
      P.esc(motifs.join(' ; ')) + '.</p></div></div>';
  }

  function rendre() {
    if (!an) {
      P.rendre(UI.etatVide(t('saisie.aucuneAnnee', 'Aucune année scolaire active.')));
      return;
    }
    var classes = mesClasses();
    if (!classes.length) {
      P.rendre(UI.etatVide(t('rapport.aucuneAffectation', 'Aucune affectation ne vous est attribuée cette année.')));
      return;
    }

    /* Premiere venue : on propose directement la premiere classe et sa
       premiere matiere, sinon la page s'affiche vide et sans cause. */
    if (!etat.classeId) {
      etat.classeId = classes[0].id;
      var m0 = mesMatieres(etat.classeId);
      if (m0.length) etat.matiereId = m0[0].id;
      var s0 = sequencesDeAnnee();
      if (s0.length) etat.sequenceId = s0[0].sequence.id;
    }

    var r = resultats();
    var blocs = [zoneFiltres()];

    if (!r) {
      blocs.push(UI.etatVide(t('rapport.aucuneClasse', 'Sélectionnez une classe')));
    } else {
      blocs.push(bandeauSequence(r));
      blocs.push(P.grilleKPI([
        P.carte({ label: t('commun.classe', 'Classe'), valeurHtml: '<span class="text-lg">' + P.esc(r.classe.nom) + '</span>', icone: 'school', note: r.matiere.nom }),
        P.carte({ label: t('commun.effectif', 'Effectif'), valeur: String(r.effectif), icone: 'users-round', couleur: 'text-blue-500', note: r.saisie + ' ' + t('commun.notes', 'notes').toLowerCase() }),
        P.carte({ label: t('commun.moyenne', 'Moyenne'), valeur: r.moyenne === null ? '—' : UI.nombre(r.moyenne), icone: 'gauge', couleur: 'text-green-500', note: '/' + r.noteMax }),
        P.carte({ label: t('commun.minimum', 'Minimum') + ' / ' + t('commun.maximum', 'Maximum'), valeurHtml: '<span class="text-lg">' + (r.minimum === null ? '—' : UI.nombre(r.minimum)) + ' / ' + (r.maximum === null ? '—' : UI.nombre(r.maximum)) + '</span>', icone: 'arrow-down-up', couleur: 'text-amber-500', note: r.tauxSaisie + '% saisi' })
      ]));

      blocs.push(P.section({
        titre: t('rapport.repartitionNotes', 'Répartition des notes'), icone: 'bar-chart-3',
        contenu: r.saisie ? jauge(r) : UI.etatVide(t('rapport.aucuneNote', 'Aucune note enregistrée pour cette séquence.'))
      }));

      /* Repartition par sexe : cartes + barres, uniquement s'il y a des
         notes. Les cles i18n sont dans i18n.js (rapport.*). */
      if (r.saisie) {
        var sx = statsParSexe(r);
        blocs.push(P.section({
          titre: t('rapport.repartitionSexe', 'Répartition par sexe'), icone: 'users-round',
          contenu: '<div class="space-y-4">' +
            P.grilleKPI([
              carteSexe(t('rapport.garcons', 'Garçons'), 'user', 'text-blue-500', sx.garcons),
              carteSexe(t('rapport.filles', 'Filles'), 'user', 'text-pink-500', sx.filles),
              P.carte({
                label: t('rapport.tauxReussite', 'Taux de réussite'),
                valeurHtml: '<span class="text-lg">' + (sx.tauxTotal === null ? '—' : sx.tauxTotal + '%') + '</span>',
                icone: 'percent', couleur: 'text-green-500',
                note: t('rapport.seuilReussite', 'Réussite : note = la moitié de la note maximale') + ' (≥ ' + UI.nombre(sx.seuil) + ')'
              })
            ]) + repartitionSexe(r) + '</div>'
        }));
      }

      blocs.push(P.avecTableau(
        P.section({
          titre: t('rapport.resultatsEleves', 'Résultats des élèves'), icone: 'clipboard-list',
          actions: boutons(r),
          contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
        }),
        tableauResultats(r)
      ));
    }

    P.rendre(blocs);
    brancher(r);
    if (E.i18n) E.i18n.appliquer();
  }

  function brancher(r) {
    var selC = document.getElementById('rp-classe');
    var selM = document.getElementById('rp-matiere');
    var selS = document.getElementById('rp-sequence');

    if (selC) selC.addEventListener('change', function () {
      etat.classeId = selC.value;
      /* Changer de classe invalide la matiere : les affectations ne sont
         pas les memes d'une classe a l'autre. */
      etat.matiereId = '';
      var ms = mesMatieres(etat.classeId);
      if (ms.length) etat.matiereId = ms[0].id;
      rendre();
    });
    if (selM) selM.addEventListener('change', function () { etat.matiereId = selM.value; rendre(); });
    if (selS) selS.addEventListener('change', function () { etat.sequenceId = selS.value; rendre(); });

    if (!r) return;
    var bPdf = document.getElementById('rp-pdf');
    var bXls = document.getElementById('rp-xlsx');
    var bPri = document.getElementById('rp-print');
    if (bPdf) bPdf.addEventListener('click', function () { exporterPDF(r); });
    if (bXls) bXls.addEventListener('click', function () { exporterXLSX(r); });
    if (bPri) bPri.addEventListener('click', function () { imprimer(r); });
  }

/* Le changement d'annee consulte recharge la page (layout.js s'en charge) :
     on ne re-rend donc pas ici, sinon on cumulerait deux rendus. */

  /* Le contenu ci-dessus est ecrit avec t(), pas avec data-i18n : i18n.js
     ne peut pas le retraduire tout seul. On se rend a nouveau sur son
     signal, en conservant classe, matiere et sequence choisies. */
  document.addEventListener('eduneum:langue', function () { rendre(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rendre);
  else rendre();
})();
