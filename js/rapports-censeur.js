/* EduNeum - Rapports Censeur : statistiques d'assiduité et discipline. */

(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui, C = E.calculs;

  if (!E.auth.estConnecte()) return;
  if (!E.acces.exiger('censeur_rapports')) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  function mesClasses() {
    if (!E.auth.session().enseignantId) return [];
    var ids = E.acces.mesClasses ? E.acces.mesClasses() : [];
    return ids.map(function (id) { return S.classeParId(id); }).filter(Boolean);
  }

  function refresh() {
    var classes = mesClasses();
    if (!classes.length) { P.rendre(UI.etatVide('Aucune classe sous votre responsabilité.')); return; }

    var seqs = S.sequencesDe(an.id);
    var seqActive = seqs.filter(function (s) { return s.ouverte && !s.verrouillee; })[0] || seqs[0];

    var totalEleves = 0, totalAbs = 0, totalNonJust = 0, totalSanctions = 0;

    classes.forEach(function (c) {
      var eleves = S.elevesDeClasse(c.id, an.id);
      totalEleves += eleves.length;
      if (seqActive) {
        eleves.forEach(function (e) {
          var a = S.absenceDe ? S.absenceDe(e.id, seqActive.id) : null;
          if (a) {
            totalAbs += Number(a.heures) || 0;
            totalNonJust += Number(a.nonJustifiees) || 0;
          }
          var san = S.sanctionDe ? S.sanctionDe(e.id, seqActive.id) : [];
          totalSanctions += san.length;
});
      }
    });

    document.getElementById('stat-classes').textContent = classes.length;
    document.getElementById('stat-eleves').textContent = totalEleves;
    document.getElementById('stat-abs-nj').textContent = totalNonJust + 'h';
    document.getElementById('stat-sanctions').textContent = totalSanctions;

    // Rendu tableau détaillé par classe
    var lignes = classes.map(function (c) {
      var eleves = S.elevesDeClasse(c.id, an.id);
      var abs = 0, nj = 0, san = 0;
      if (seqActive) {
        eleves.forEach(function (e) {
          var a = S.absenceDe ? S.absenceDe(e.id, seqActive.id) : null;
          if (a) { abs += Number(a.heures) || 0; nj += Number(a.nonJustifiees) || 0; }
          var s = S.sanctionDe ? S.sanctionDe(e.id, seqActive.id) : [];
          san += s.length;
        });
      }
      var taux = eleves.length ? Math.round((nj / eleves.length) * 10) / 10 : 0;
      return '<tr class="border-b border-gray-100 dark:border-gray-800">' +
        '<td class="py-3 px-4 font-bold">' + P.esc(c.nom) + '</td>' +
        '<td class="py-3 px-4 text-center">' + eleves.length + '</td>' +
        '<td class="py-3 px-4 text-center">' + abs + 'h</td>' +
        '<td class="py-3 px-4 text-center text-red-500 font-bold">' + nj + 'h</td>' +
        '<td class="py-3 px-4 text-center">' + taux + 'h/élève</td>' +
        '<td class="py-3 px-4 text-center text-orange-500 font-bold">' + san + '</td>' +
        '</tr>';
    }).join('');

    var tableHtml = '<div class="nm-flat p-6 rounded-[32px] overflow-x-auto mt-8">' +
      '<h3 class="text-lg font-bold mb-4">Détail par classe (' + (seqActive ? seqActive.libelle : 'Toutes séquences') + ')</h3>' +
      '<table class="w-full text-sm"><thead><tr class="text-xs font-bold text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">' +
      '<th class="text-left pb-2 px-2">Classe</th>' +
      '<th class="pb-2 px-2 text-center">Effectif</th>' +
      '<th class="pb-2 px-2 text-center">Absences totales</th>' +
      '<th class="pb-2 px-2 text-center">Non justifiées</th>' +
      '<th class="pb-2 px-2 text-center">Moy. non just./élève</th>' +
      '<th class="pb-2 px-2 text-center">Sanctions</th></tr></thead>' +
      '<tbody>' + lignes + '</tbody></table></div>';

    P.rendre([
      P.section({ titre: 'Vue d\'ensemble', icone: 'bar-chart-3', contenu: '' }),
      P.section({ titre: 'Détail par classe', icone: 'school', contenu: tableHtml })
    ]);

    // TODO: Charts avec Chart.js ou SVG natif
  }

  refresh();
})();