/* EduNeum - Profil Censeur : informations personnelles et classes responsables. */

(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;

  if (!E.auth.estConnecte()) return;
  if (!E.acces.exiger('censeur_profil')) return;

  var session = E.auth.session();
  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  function mesClasses() {
    if (!session.enseignantId) return [];
    var ids = E.acces.mesClasses ? E.acces.mesClasses() : [];
    return ids.map(function (id) { return S.classeParId(id); }).filter(Boolean);
  }

  function refresh() {
    var classes = mesClasses();
    var totalEleves = classes.reduce(function (s, c) { return s + S.elevesDeClasse(c.id, an.id).length; }, 0);

    document.getElementById('profil-nom').textContent = session.prenom + ' ' + session.nom;
    document.getElementById('profil-role').textContent = E.auth.ROLE_LABEL[session.role] || session.role;
    document.getElementById('profil-telephone').textContent = session.telephone || '—';
    document.getElementById('profil-email').textContent = session.email || '—';
    document.getElementById('profil-annee').textContent = an.libelle;
    document.getElementById('profil-classes').textContent = classes.length + ' classe(s) • ' + totalEleves + ' élève(s)';

    var liste = document.getElementById('profil-liste-classes');
    liste.innerHTML = classes.map(function (c) {
      var eff = S.elevesDeClasse(c.id, an.id).length;
      var section = c.section || 'francophone';
      var badge = section === 'anglophone'
        ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">Anglophone</span>'
        : '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/10 text-green-500">Francophone</span>';
      return '<div class="nm-inset rounded-xl p-4 flex items-center justify-between">' +
        '<div><p class="font-bold">' + P.esc(c.nom) + '</p>' +
        '<p class="text-xs text-gray-400 flex items-center gap-2">' + P.esc(c.niveau) + ' ' + badge + ' · ' + eff + ' élève(s)</p></div>' +
        '<a href="../censeur/vie-scolaire.html?classe=' + c.id + '" class="px-3 py-1 nm-soft-convex rounded-lg text-xs font-bold">Gérer</a>' +
        '</div>';
    }).join('') || '<p class="text-center text-gray-400 py-8">Aucune classe assignée.</p>';
  }

  refresh();
})();