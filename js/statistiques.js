/* EduNeum - Page Statistiques (administration / direction).
   Vue reelle, alimentee par EduNeum.statistiques et EduNeum.calculs.

   Regles :
   - consultation seule : aucun appel d'ecriture, la page marche donc aussi
     sur une annee cloturee ;
   - periodes encodees 'annuel' | 't:<idTri>' | 's:<idSeq>' (idem bulletins) ;
   - filtres : classe, periode, matiere (une ou toutes) ;
   - sorties : impression A4 (navigateur), PDF, XLSX. */
(function (global) {
  'use strict';

  var E = global.EduNeum;
  if (!E || !E.statistiques) return;

  var S = E.store, C = E.calculs, P = E.page, UI = E.ui, ST = E.statistiques;

  if (E.acces && E.acces.exiger && !E.acces.exiger('admin_statistiques')) return;
  if (E.auth && !E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  var classes = S.classesDe(an.id).filter(function (c) { return !c.archive; });
  var trimestres = an.trimestres || [];

  var etat = {
    classeId: classes.length ? classes[0].id : null,
    periode: 'annuel',
    matiereId: '' /* '' = toutes les matieres */
  };

  /* ----------------------------- Periodes ----------------------------- */
  function periodes() {
    var liste = [{ valeur: 'annuel', libelle: 'Année complète ' + an.libelle }];
    trimestres.forEach(function (t) {
      liste.push({ valeur: 't:' + t.id, libelle: t.libelle });
      S.sequencesDeTrimestre(t.id).forEach(function (s) {
        liste.push({ valeur: 's:' + s.id, libelle: t.libelle + ' - ' + s.libelle });
      });
    });
    return liste;
  }
  function libellePeriodeCourante() {
    return ST.libellePeriode(an.id, etat.periode);
  }
  function libelleClasse(id) {
    var c = S.classeParId(id);
    return c ? c.nom : '-';
  }
  function libelleMatiere() {
    if (!etat.matiereId) return 'Toutes les matières';
    var m = S.matiereParId(etat.matiereId);
    return m ? m.nom : '-';
  }

  /* ------------------------------- Rendu ------------------------------ */
  function esc(s) { return P.esc(s); }
  function ico(n, w) { return P.ico(n, w); }
  function nb(v) { return v === null || v === undefined ? '-' : UI.nombre(v); }
  function nb1(v) { return v === null || v === undefined ? '-' : UI.nombre(v, 1); }
  function pctTexte(v) { return v === null || v === undefined ? '-' : UI.nombre(v, 1) + ' %'; }

  function barre(htmlOuNode) {
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="p-6 rounded-[32px] nm-flat">' + htmlOuNode + '</div>';
    return wrap.firstElementChild;
  }

  function optionClasses() {
    return classes.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === etat.classeId ? ' selected' : '') + '>' + esc(c.nom) + '</option>';
    }).join('');
  }
  function optionPeriodes() {
    return periodes().map(function (p) {
      return '<option value="' + p.valeur + '"' + (p.valeur === etat.periode ? ' selected' : '') + '>' + esc(p.libelle) + '</option>';
    }).join('');
  }
  function optionMatieres() {
    var html = '<option value=""' + (!etat.matiereId ? ' selected' : '') + '>Toutes les matières</option>';
    if (!etat.classeId) return html;
    return html + S.matieresDeClasse(etat.classeId).map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === etat.matiereId ? ' selected' : '') + '>' +
        esc(m.nom) + ' (coef. ' + S.coefficient(etat.classeId, m.id) + ')</option>';
    }).join('');
  }

  function blocFiltres() {
    return '<div class="flex flex-wrap gap-4 items-end no-print">' +
      '<div class="flex-1 min-w-[200px] space-y-2">' +
      '<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Classe</label>' +
      P.liste('id="f-classe"', optionClasses()) + '</div>' +
      '<div class="flex-1 min-w-[180px] space-y-2">' +
      '<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Période</label>' +
      P.liste('id="f-periode"', optionPeriodes()) + '</div>' +
      '<div class="flex-1 min-w-[200px] space-y-2">' +
      '<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Matière</label>' +
      P.liste('id="f-matiere"', optionMatieres()) + '</div>' +
      '</div>';
  }

  function cartesKPI(st) {
    return P.grilleKPI([
      P.carte({ label: 'Effectif', valeur: String(st.effectif), icone: 'users-round',
        note: st.nbNotes + ' élève(s) noté(s)' }),
      P.carte({ label: 'Moyenne de classe', valeur: nb(st.moyenne), icone: 'activity',
        note: 'min ' + nb(st.min) + ' / med. ' + nb(st.mediane) + ' / max ' + nb(st.max) }),
      P.carte({ label: 'Taux de réussite', valeur: pctTexte(st.tauxReussite), icone: 'award',
        note: st.admis + ' admis, ' + st.redoublants + ' en difficulte' }),
      P.carte({ label: 'Demande requise', valeur: String(st.notesNonRenseignees), icone: 'alert-triangle',
        note: 'élève(s) sans note' })
    ]);
  }

  function tableauMatieres(st) {
    if (etat.matiereId) {
      /* Mode matiere unique : tableau eleve x notes de la matiere choisi. */
      var d = ST.detailEleves(etat.classeId, an.id, etat.periode, { matiereId: etat.matiereId });
      return UI.tableau({
        colonnes: [
          { cle: 'rang', titre: 'Rang', classe: 'text-center', classeCellule: 'text-center' },
          { cle: 'nom', titre: 'Élève' },
          { cle: 'moyenne', titre: 'Moyenne', rendu: function (l) { return '<b class="text-accent">' + nb1(l.moyenne) + '</b>'; } },
          { cle: 'appreciation', titre: 'Appréciation' },
          { cle: 'absences', titre: 'Absences (h)', classeCellule: 'tabular-nums' }
        ],
        lignes: d.lignes, nomExport: 'stats-' + etat.classeId, parPage: 15,
        messageVide: 'Aucune note pour cette matière sur la période.'
      });
    }
    var lignes = st.matieres.map(function (m) {
      return {
        nom: m.nom, coefficient: m.coefficient, moyenne: m.moyenne,
        min: m.min, max: m.max, nbNotes: m.nbNotes, effectif: m.effectif
      };
    });
    return UI.tableau({
      colonnes: [
        { cle: 'nom', titre: 'Matière' },
        { cle: 'coefficient', titre: 'Coef.', classe: 'text-center', classeCellule: 'text-center' },
        { cle: 'moyenne', titre: 'Moyenne classe', rendu: function (l) { return '<b class="text-accent">' + nb(l.moyenne) + '</b>'; } },
        { cle: 'min', titre: 'Min', rendu: function (l) { return nb(l.min); } },
        { cle: 'max', titre: 'Max', rendu: function (l) { return nb(l.max); } },
        { cle: 'nbNotes', titre: 'Notes', classe: 'text-center', classeCellule: 'text-center', rendu: function (l) { return l.nbNotes + '/' + l.effectif; } }
      ],
      lignes: lignes, nomExport: 'stats-matieres-' + etat.classeId, parPage: 20,
      placeholderRecherche: 'Filtrer une matière...', messageVide: 'Aucune matière notée.'
    });
  }

  function tableauEleves(st) {
    var d = ST.detailEleves(etat.classeId, an.id, etat.periode, { matiereId: etat.matiereId || null });
    var lignes = d.lignes.map(function (l) {
      return {
        rang: l.rang === null ? '-' : l.rang,
        nom: l.nom, matricule: l.matricule, moyenne: l.moyenne,
        pointFort: l.pointFort ? l.pointFort.nom + ' (' + nb1(l.pointFort.valeur) + ')' : '-',
        pointFaible: l.pointFaible ? l.pointFaible.nom + ' (' + nb1(l.pointFaible.valeur) + ')' : '-',
        appreciation: l.appreciation, absences: l.absences
      };
    });
    return UI.tableau({
      colonnes: [
        { cle: 'rang', titre: 'Rang', classe: 'text-center', classeCellule: 'text-center', rendu: function (l) { return l.rang; } },
        { cle: 'nom', titre: 'Élève' },
        { cle: 'moyenne', titre: 'Moyenne', rendu: function (l) { return '<b class="text-accent">' + nb(l.moyenne) + '</b>'; } },
        { cle: 'pointFort', titre: 'Point fort', classeCellule: 'text-green-500' },
        { cle: 'pointFaible', titre: 'Point faible', classeCellule: 'text-red-400' },
        { cle: 'appreciation', titre: 'Appréciation' },
        { cle: 'absences', titre: 'Absences (h)', classe: 'text-right', classeCellule: 'text-right tabular-nums' }
      ],
      lignes: lignes, nomExport: 'stats-eleves-' + etat.classeId, parPage: 15,
      placeholderRecherche: 'Rechercher un élève...', messageVide: 'Aucun élève inscrit.'
    });
  }

  function blocRepartition(st) {
    var rep = ST.repartition(etat.classeId, an.id, etat.periode, etat.matiereId || null);
    var maxNb = Math.max.apply(null, rep.map(function (r) { return r.nb; }).concat([1]));
    var cols = ['#ef4444', '#f97316', '#8b5cf6', '#10b981'];
    var barres = rep.map(function (r, i) {
      var h = Math.round((r.nb / maxNb) * 100);
      return '<div class="flex flex-col items-center flex-1 space-y-3 stat-bar-item">' +
        '<span class="text-xs font-bold text-gray-500">' + r.nb + '</span>' +
        '<div class="w-full nm-inset rounded-t-xl overflow-hidden flex items-end" style="height:180px">' +
        '<div class="w-full rounded-t-xl" style="height:' + h + '%;background:' + cols[i] + '"></div></div>' +
        '<span class="text-[10px] font-bold text-gray-400">' + r.label + '</span>' +
        '<span class="text-[10px] text-gray-400">' + r.pct + ' %</span></div>';
    }).join('');
    return '<h3 class="text-lg font-bold display-font mb-5 flex items-center gap-2">' +
      '<span class="text-accent">' + ico('bar-chart-3', 20) + '</span>Repartition des moyennes</h3>' +
      '<div class="flex items-end justify-between gap-4 px-2">' + barres + '</div>';
  }

  function blocAssiduite(st) {
    var a = st.assiduite;
    var total = a.heures + 0;
    var pctJ = total ? Math.round((a.justifiees / total) * 100) : 0;
    var lignes = [
      ['Heures d\'absence', a.heures + ' h'],
      ['Justifiees', a.justifiees + ' h (' + pctJ + ' %)'],
      ['Non justifiees', a.nonJustifiees + ' h'],
      ['Élèves concernés', a.elevesTouches]
    ];
    return '<h3 class="text-lg font-bold display-font mb-5 flex items-center gap-2">' +
      '<span class="text-accent">' + ico('calendar-clock', 20) + '</span>Assiduite</h3>' +
      '<div class="space-y-3">' + lignes.map(function (l) {
        return '<div class="flex items-center justify-between nm-inset p-4 rounded-2xl">' +
          '<span class="text-xs font-bold text-gray-400 uppercase tracking-widest">' + esc(l[0]) + '</span>' +
          '<span class="text-sm font-black">' + esc(l[1]) + '</span></div>';
      }).join('') + '</div>';
  }

  function tableauComparaison(liste) {
    var lignes = liste.map(function (st) {
      return {
        classe: st.classe, effectif: st.effectif, moyenne: st.moyenne,
        min: st.min, max: st.max, mediane: st.mediane,
        tauxReussite: st.tauxReussite, admis: st.admis
      };
    });
    return UI.tableau({
      colonnes: [
        { cle: 'classe', titre: 'Classe' },
        { cle: 'effectif', titre: 'Effectif', classe: 'text-center', classeCellule: 'text-center' },
        { cle: 'moyenne', titre: 'Moyenne', rendu: function (l) { return '<b class="text-accent">' + nb(l.moyenne) + '</b>'; } },
        { cle: 'min', titre: 'Min' },
        { cle: 'max', titre: 'Max' },
        { cle: 'mediane', titre: 'Médiane' },
        { cle: 'tauxReussite', titre: 'Réussite', rendu: function (l) { return pctTexte(l.tauxReussite); } },
        { cle: 'admis', titre: 'Admis', classe: 'text-center', classeCellule: 'text-center' }
      ],
      lignes: lignes, nomExport: 'stats-comparaison-classes', parPage: 30,
      placeholderRecherche: 'Filtrer une classe...', messageVide: 'Aucune classe.'
    });
  }

  /* --------------------------- Rendu principal ------------------------- */
  function rendre() {
    if (!classes.length) {
      P.rendre([
        blocFiltres(),
        UI.etatVide('Aucune classe pour ' + an.libelle + '.')
      ]);
      brancher();
      return;
    }
    var st = ST.statsClasse(etat.classeId, an.id, etat.periode, { matiereId: etat.matiereId || null });
    var comparaison = ST.comparaisonClasses(an.id, etat.periode, { matiereId: etat.matiereId || null });

    var sous = P.section({
      id: 'sec-filtres',
      titre: 'Filtres',
      icone: 'sliders-horizontal',
      contenu: blocFiltres()
    });

    var kpi = cartesKPI(st);

    var sectionDetail = P.section({
      titre: 'Moyennes par matière',
      icone: 'book-open',
      actions: boutonsExport(),
      contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
    });
    var sectionDetailAvecTableau = P.avecTableau(sectionDetail, tableauMatieres(st));

    var sectionEleves = P.section({
      titre: 'Détail par élève',
      icone: 'users',
      contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
    });
    var sectionElevesAvecTableau = P.avecTableau(sectionEleves, tableauEleves(st));

    var sectionGraph = P.section({
      titre: 'Analyse',
      icone: 'bar-chart-3',
      contenu: '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
        '<div class="p-6 rounded-[32px] nm-flat">' + blocRepartition(st) + '</div>' +
        '<div class="p-6 rounded-[32px] nm-flat">' + blocAssiduite(st) + '</div>' +
        '</div>'
    });

    var sectionComparaison = P.section({
      titre: 'Comparaison de toutes les classes',
      icone: 'layers',
      actions: boutonComparaison(),
      contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
    });
    var sectionComparaisonAvecTableau = P.avecTableau(sectionComparaison, tableauComparaison(comparaison));

    P.rendre([sous, kpi, sectionGraph, sectionDetailAvecTableau, sectionElevesAvecTableau, sectionComparaisonAvecTableau]);
    rendreEnTete();
    brancher();
  }

  /* Bandeau d'en-tete : reference du rapport en cours (imprime avec la page). */
  function rendreEnTete() {
    var z = document.getElementById('stat-ref');
    if (z) {
      z.textContent = libelleClasse(etat.classeId) + ' - ' + libellePeriodeCourante() + ' - ' + libelleMatiere();
    }
  }

  function boutonsExport() {
    return '<div class="flex flex-wrap items-center gap-2 no-print">' +
      '<button type="button" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent flex items-center gap-2" data-export="print">' + ico('printer', 16) + 'Imprimer</button>' +
      '<button type="button" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent flex items-center gap-2" data-export="pdf">' + ico('file-down', 16) + 'PDF</button>' +
      '<button type="button" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold text-green-500 flex items-center gap-2" data-export="xlsx">' + ico('sheet', 16) + 'XLSX</button>' +
      '</div>';
  }
  function boutonComparaison() {
    return '<div class="flex flex-wrap items-center gap-2 no-print">' +
      '<button type="button" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent flex items-center gap-2" data-export="print">' + ico('printer', 16) + 'Imprimer</button>' +
      '<button type="button" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent flex items-center gap-2" data-export="pdf-cmp">' + ico('file-down', 16) + 'PDF</button>' +
      '</div>';
  }

  /* --------------------------- Bornage des filtres -------------------- */
  function brancher() {
    var fc = document.getElementById('f-classe');
    var fp = document.getElementById('f-periode');
    var fm = document.getElementById('f-matiere');
    if (fc) fc.addEventListener('change', function () {
      etat.classeId = fc.value; etat.matiereId = ''; rendre();
    });
    if (fp) fp.addEventListener('change', function () { etat.periode = fp.value; rendre(); });
    if (fm) fm.addEventListener('change', function () { etat.matiereId = fm.value; rendre(); });

    document.querySelectorAll('[data-export]').forEach(function (b) {
      b.addEventListener('click', function () { exporter(b.getAttribute('data-export')); });
    });
  }

  /* ------------------------------ Sorties ----------------------------- */
  function entetesEtLignes() {
    var st = ST.statsClasse(etat.classeId, an.id, etat.periode, { matiereId: etat.matiereId || null });
    var d = ST.detailEleves(etat.classeId, an.id, etat.periode, { matiereId: etat.matiereId || null });
    var lignes = d.lignes.map(function (l) {
      return [
        l.rang === null ? '-' : l.rang, l.nom, l.matricule,
        l.moyenne === null ? '-' : UI.nombre(l.moyenne),
        l.pointFort ? l.pointFort.nom + ' (' + UI.nombre(l.pointFort.valeur, 1) + ')' : '-',
        l.appreciation, l.absences
      ];
    });
    return { st: st, entetes: ['Rang', 'Eleve', 'Matricule', 'Moyenne', 'Point fort', 'Appreciation', 'Absences (h)'], lignes: lignes };
  }

  function titreRapport() {
    return 'Statistiques - ' + libelleClasse(etat.classeId);
  }
  function sousTitreRapport() {
    return libellePeriodeCourante() + ' - ' + libelleMatiere() + ' - ' + an.libelle;
  }

  function exporter(mode) {
    if (mode === 'print') return imprimer();
    if (mode === 'pdf') return exporterPdfDetail();
    if (mode === 'pdf-cmp') return exporterPdfComparaison();
    if (mode === 'xlsx') return exporterXlsx();
  }

  function imprimer() {
    var e = entetesEtLignes();
    var html = syntheseHtml(e.st) + tableauHtml(e.entetes, e.lignes);
    UI.imprimer(html, { titre: titreRapport(), sousTitre: sousTitreRapport() });
  }

  function tableauHtml(entetes, lignes) {
    return '<table><thead><tr>' + entetes.map(function (h) { return '<th>' + P.esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + lignes.map(function (l) {
        return '<tr>' + l.map(function (c) { return '<td>' + P.esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  function syntheseHtml(st) {
    return '<p>' + P.esc('Effectif : ' + st.effectif + ' - Moyenne : ' + nb(st.moyenne) +
      ' - Min : ' + nb(st.min) + ' - Mediane : ' + nb(st.mediane) + ' - Max : ' + nb(st.max) +
      ' - Réussite : ' + pctTexte(st.tauxReussite) + ' - Absences : ' + st.assiduite.heures + ' h') + '</p>';
  }

  function exporterPdfDetail() {
    var e = entetesEtLignes();
    var st = e.st;
    UI.exporterPDF({
      titre: titreRapport(),
      sousTitre: sousTitreRapport(),
      meta: 'Effectif ' + st.effectif + ' - Moyenne ' + nb(st.moyenne) + ' - Réussite ' + pctTexte(st.tauxReussite) +
        ' - Min ' + nb(st.min) + ' / Med. ' + nb(st.mediane) + ' / Max ' + nb(st.max),
      entetes: e.entetes,
      lignes: e.lignes,
      alignements: ['centre', 'gauche', 'gauche', 'centre', 'gauche', 'gauche', 'centre'],
      nom: 'statistiques-' + slug(libelleClasse(etat.classeId)) + '-' + slug(libellePeriodeCourante())
    });
    if (UI.toast) UI.toast('Rapport PDF genere.', 'success');
  }

  function exporterPdfComparaison() {
    var liste = ST.comparaisonClasses(an.id, etat.periode, { matiereId: etat.matiereId || null });
    var lignes = liste.map(function (st) {
      return [st.classe, st.effectif, nb(st.moyenne), nb(st.min), nb(st.mediane), nb(st.max), pctTexte(st.tauxReussite), st.admis];
    });
    UI.exporterPDF({
      titre: 'Comparaison des classes',
      sousTitre: libellePeriodeCourante() + ' - ' + libelleMatiere() + ' - ' + an.libelle,
      meta: liste.length + ' classe(s)',
      entetes: ['Classe', 'Effectif', 'Moyenne', 'Min', 'Médiane', 'Max', 'Réussite', 'Admis'],
      lignes: lignes,
      alignements: ['gauche', 'centre', 'centre', 'centre', 'centre', 'centre', 'centre', 'centre'],
      nom: 'comparaison-classes-' + slug(libellePeriodeCourante())
    });
    if (UI.toast) UI.toast('Comparaison PDF generee.', 'success');
  }

  function exporterXlsx() {
    var e = entetesEtLignes();
    var colonnes = e.entetes.map(function (t, i) {
      return { cle: 'c' + i, titre: t, valeurTri: function (l) { return l[i]; } };
    });
    var lignes = e.lignes.map(function (l) {
      var o = {}; l.forEach(function (v, i) { o['c' + i] = v; }); return o;
    });
    UI.exporterXLSX(colonnes, lignes, 'statistiques-' + slug(libelleClasse(etat.classeId)) + '-' + slug(libellePeriodeCourante()), {
      titreFeuille: 'Classes'
    });
    if (UI.toast) UI.toast('Export XLSX genere.', 'success');
  }

  function slug(s) {
    return String(s || '').replace(/[^0-9A-Za-z]+/g, '-').replace(/^-+|-+$/g, '');
  }

  rendre();
})(window);
