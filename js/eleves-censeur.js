/* EduNeum - Élèves Censeur : liste des élèves des classes sous responsabilité. */

(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;

  if (!E.auth.estConnecte()) return;
  if (!E.acces.exiger('censeur_eleves')) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  function mesClasses() {
    if (!E.auth.session().enseignantId) return [];
    var ids = E.acces.mesClasses ? E.acces.mesClasses() : [];
    return ids.map(function (id) { return S.classeParId(id); }).filter(Boolean);
  }

  var etat = { classeId: '', search: '' };

  function refresh() {
    var classes = mesClasses();
    if (!classes.length) { P.rendre(UI.etatVide('Aucune classe sous votre responsabilité.')); return; }
    etat.classeId = etat.classeId && S.classeParId(etat.classeId) ? etat.classeId : classes[0].id;
    rendre();
  }

  function rendre() {
    var classes = mesClasses();
    var fClasse = UI.champ({
      label: 'Classe', type: 'select', valeur: etat.classeId,
      options: classes.map(function (c) { return { valeur: c.id, libelle: c.nom + ' (' + (c.section || 'francophone') + ')' }; })
    });
    var fSearch = UI.champ({ label: 'Recherche', valeur: etat.search, placeholder: 'Nom, prénom, matricule...' });

    var toolbar = '<div class="nm-inset rounded-[32px] px-6 py-4 flex flex-wrap items-center gap-4">' +
      '<div class="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">' + P.ico('filter', 14) + 'Filtres :</div>' +
      fClasse.html + fSearch.html + '</div>';

    P.rendre([
      toolbar,
      P.section({ titre: 'Liste des élèves', icone: 'users', contenu: '<div id="zone-eleves"></div>' })
    ]);

    fClasse.element.addEventListener('change', function () { etat.classeId = fClasse.valeur(); refresh(); });
    fSearch.element.addEventListener('input', function () { etat.search = fSearch.valeur(); refresh(); });

    rendreTableau();
  }

  function rendreTableau() {
    var zone = document.getElementById('zone-eleves');
    if (!zone) return;
    if (!etat.classeId) { zone.innerHTML = UI.etatVide('Sélectionnez une classe.'); return; }

    var eleves = S.elevesDeClasse(etat.classeId, an.id);
    if (etat.search) {
      var q = etat.search.toLowerCase();
      eleves = eleves.filter(function (e) {
        return (e.nom + ' ' + e.prenom + ' ' + e.matricule).toLowerCase().indexOf(q) !== -1;
      });
    }

    var lignes = eleves.map(function (e) {
      var abs = S.absencesDe ? S.absencesDe(an.id).filter(function (a) { return a.eleveId === e.id; }) : [];
      var totalAbs = abs.reduce(function (s, a) { return s + (Number(a.heures) || 0); }, 0);
      return '<tr class="border-b border-gray-100 dark:border-gray-800">' +
        '<td class="py-3 px-4"><div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-full nm-inset flex items-center justify-center text-accent font-bold text-xs">' +
        P.esc((e.nom.charAt(0) + e.prenom.charAt(0)).toUpperCase()) + '</div>' +
        '<div><p class="font-semibold text-sm">' + P.esc(e.nom + ' ' + e.prenom) + '</p>' +
        '<p class="text-xs text-gray-400">' + P.esc(e.matricule) + '</p></div></div></td>' +
        '<td class="py-3 px-4 text-center"><span class="font-bold">' + totalAbs + 'h</span></td>' +
        '<td class="py-3 px-4"><span class="text-xs text-gray-500">' + P.esc(S.classeParId(etat.classeId).nom) + '</span></td>' +
        '<td class="py-3 px-4 text-center"><a href="../censeur/vie-scolaire.html?classe=' + etat.classeId + '&eleve=' + e.id + '" class="px-3 py-1 nm-soft-convex rounded-lg text-xs font-bold">Voir absences</a></td>' +
        '</tr>';
    }).join('');

    var html = '<div class="nm-flat p-6 rounded-[32px] overflow-x-auto">' +
      '<table class="w-full text-sm"><thead><tr class="text-xs font-bold text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">' +
      '<th class="text-left pb-2 px-2">Élève</th>' +
      '<th class="pb-2 px-2 text-center">Heures d\'absence</th>' +
      '<th class="pb-2 px-2">Classe</th>' +
      '<th class="pb-2 px-2 text-center">Actions</th></tr></thead>' +
      '<tbody>' + (lignes || '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucun élève dans cette classe.</td></tr>') + '</tbody></table></div>';

    document.getElementById('zone-eleves').innerHTML = html;
  }

  refresh();
})();