/* EduNeum - Statistiques Censeur : indicateurs d'assiduité et vie scolaire. */

(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui, C = E.calculs;

  if (!E.auth.estConnecte()) return;
  if (!E.acces.exiger('censeur_statistiques')) return;

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

    var totalEleves = 0, totalHeures = 0, totalNonJust = 0, totalJust = 0;
    var classesRisque = 0, elevesRisque = 0, sanctionsTrim = 0;
    var topRisque = [];

    classes.forEach(function (c) {
      var eleves = S.elevesDeClasse(c.id, an.id);
      totalEleves += eleves.length;
      var classeAbs = 0, classeNJ = 0;
      if (seqActive) {
        eleves.forEach(function (e) {
          var a = S.absenceDe ? S.absenceDe(e.id, seqActive.id) : null;
          if (a) {
            var h = Number(a.heures) || 0;
            var j = Number(a.justifiees) || 0;
            var nj = Number(a.nonJustifiees) || 0;
            totalHeures += h; totalNonJust += nj; totalJust += j;
            classeAbs += h; classeNJ += nj;
            if (nj > 10) { elevesRisque++; topRisque.push({ eleve: e, classe: c, nj: nj }); }
          }
          var san = S.sanctionDe ? S.sanctionDe(e.id, seqActive.id) : [];
          sanctionsTrim += san.length;
        });
      }
      if (eleves.length && classeNJ / eleves.length > 5) classesRisque++;
    });

    var tauxPresence = totalHeures > 0 ? Math.round((1 - totalNonJust / (totalHeures || 1)) * 1000) / 10 : 100;

    document.getElementById('stat-taux-presence').textContent = tauxPresence + '%';
    document.getElementById('stat-classes-risque').textContent = classesRisque;
    document.getElementById('stat-eleves-risque').textContent = elevesRisque;
    document.getElementById('stat-sanctions-trim').textContent = sanctionsTrim;

    // Top 10 élèves à risque
    topRisque.sort(function (a, b) { return b.nj - a.nj; });
    topRisque = topRisque.slice(0, 10);

    var lignes = topRisque.map(function (r, i) {
      return '<tr class="border-b border-gray-100 dark:border-gray-800">' +
        '<td class="py-3 px-4 text-center font-bold">' + (i + 1) + '</td>' +
        '<td class="py-3 px-4"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-full nm-inset flex items-center justify-center text-xs font-bold text-accent">' +
        P.esc((r.eleve.nom.charAt(0) + r.eleve.prenom.charAt(0)).toUpperCase()) + '</div>' +
        '<div><p class="font-semibold text-xs">' + P.esc(r.eleve.nom + ' ' + r.eleve.prenom) + '</p>' +
        '<p class="text-[10px] text-gray-400">' + P.esc(r.eleve.matricule) + '</p></div></div></td>' +
        '<td class="py-3 px-4">' + P.esc(r.classe.nom) + '</td>' +
        '<td class="py-3 px-4 text-center text-red-500 font-bold">' + r.nj + 'h</td>' +
        '<td class="py-3 px-4 text-center"><a href="../censeur/vie-scolaire.html?classe=' + r.classe.id + '&seq=' + (S.sequencesDe(an.id).filter(function(s){return s.ouverte&&!s.verrouillee;})[0]||{}).id + '&eleve=' + r.eleve.id + '" class="px-2 py-1 nm-soft-convex rounded-lg text-xs font-bold">Détails</a></td>' +
        '</tr>';
    }).join('');

    var topHtml = '<div class="nm-flat p-6 rounded-[32px] overflow-x-auto">' +
      '<table class="w-full text-sm"><thead><tr class="text-xs font-bold text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">' +
      '<th class="text-left pb-2 px-2">#</th>' +
      '<th class="pb-2 px-2">Élève</th>' +
      '<th class="pb-2 px-2">Classe</th>' +
      '<th class="pb-2 px-2 text-center">Heures non just.</th>' +
      '<th class="pb-2 px-2 text-center">Action</th></tr></thead>' +
      '<tbody>' + (lignes || '<tr><td colspan="5" class="text-center py-8 text-gray-400">Aucun élève à risque.</td></tr>') + '</tbody></table></div>';

    document.getElementById('top-risque').innerHTML = topHtml;

    // TODO: Charts avec Chart.js ou SVG
  }

  refresh();
})();