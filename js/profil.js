/* EduNeum - Mon profil (enseignant) : identite, role, annee courante, activite recente. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.auth.estConnecte()) return;

  var s = E.auth.session();
  var an = E.layout.anneeChoisie();
  var p = s.enseignantId ? S.enseignantParId(s.enseignantId) : null;

  var mesAffectations = s.enseignantId ? S.affectationsDeEnseignant(s.enseignantId, an.id) : [];
  var mesClasses = {};
  mesAffectations.forEach(function (a) { mesClasses[a.classeId] = (mesClasses[a.classeId] || []).concat([a]); });
  var estPP = E.auth.estProfPrincipal();
  var notesSaisies = s.enseignantId
    ? S.all('notes').filter(function (n) { return n.modifiePar === s.enseignantId; }).length : 0;

  var tableAffect = UI.tableau({
    lignes: mesAffectations.map(function (a) {
      return {
        classe: (S.classeParId(a.classeId) || {}).nom || '—',
        matiere: (S.matiereParId(a.matiereId) || {}).nom || '—',
        coefficient: S.coefficient(a.classeId, a.matiereId)
      };
    }),
    colonnes: [
      { cle: 'classe', titre: 'Classe' },
      { cle: 'matiere', titre: 'Matière' },
      { cle: 'coefficient', titre: 'Coefficient', rendu: function (l) { return l.coefficient || '—'; } }
    ],
    messageVide: 'Aucune affectation cette année.'
  });
  var sectionAffect = P.avecTableau(
    P.section({ titre: 'Mes affectations', icone: 'link-2', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
    tableAffect);

  var journal = S.journal().filter(function (j) { return j.auteurId === s.enseignantId; }).slice(0, 12);

  P.rendre([
    P.section({
      titre: 'Identité', icone: 'circle-user',
      contenu: '<div class="nm-flat p-8 rounded-[32px] flex flex-wrap items-center gap-6">' +
        '<div class="w-20 h-20 rounded-full bg-gradient-to-tr from-accent to-purple-400 text-white flex items-center justify-center text-2xl font-black">' +
        E.auth.initiales(s) + '</div>' +
        '<div class="flex-1 min-w-[200px] space-y-1">' +
        '<p class="text-xl font-bold display-font">' + P.esc((p ? p.prenom : s.prenom) + ' ' + (p ? p.nom : s.nom)) + '</p>' +
        '<p class="text-sm text-gray-500">' + P.esc(s.email) + '</p>' +
        '<p class="text-xs text-gray-400 uppercase tracking-wider">' + E.auth.ROLE_LABEL[s.role] +
        (p ? ' · ' + p.fonction : '') + (estPP ? ' · professeur principal' : '') + '</p>' +
        '</div>' +
        '<div class="text-right"><p class="text-xs text-gray-400 uppercase tracking-wider">Année scolaire</p>' +
        '<p class="font-bold">' + P.esc(an ? an.libelle : '—') + '</p></div>' +
        '</div>'
    }),

    P.grilleKPI([
      P.carte({ label: 'Classes', valeur: String(Object.keys(mesClasses).length), icone: 'school' }),
      P.carte({ label: 'Matières', valeur: String(mesAffectations.length), icone: 'book-open', couleur: 'text-blue-500' }),
      P.carte({ label: 'Notes saisies', valeur: String(notesSaisies), icone: 'file-text', couleur: 'text-green-500' }),
      P.carte({ label: 'Rôle', valeurHtml: '<span class="text-base">' + P.esc(E.auth.ROLE_LABEL[s.role]) + '</span>', icone: 'shield', couleur: 'text-amber-500' })
    ]),

    sectionAffect,

    P.section({
      titre: 'Mon activité récente', icone: 'history',
      contenu: journal.length
        ? '<div class="nm-flat p-6 rounded-[32px]">' + journal.map(function (j) {
          return '<div class="journal-ligne"><div class="w-2 h-2 rounded-full nm-soft-convex bg-accent mt-2 shrink-0"></div>' +
            '<div class="flex-1"><p class="text-sm font-bold">' + P.esc(j.action) + '</p>' +
            '<p class="text-xs text-gray-400">' + P.esc(j.cible || '—') + ' · ' + UI.dateFr(j.date) + '</p></div></div>';
        }).join('') + '</div>'
        : UI.etatVide('Aucune activité enregistrée.')
    }),

    P.section({
      titre: 'Sécurité', icone: 'lock',
      contenu: '<div class="p-6 rounded-[32px] nm-flat bg-amber-500/5 border border-amber-500/20 space-y-3">' +
        '<p class="text-sm font-bold flex items-center gap-2">' + P.ico('triangle-alert', 16) + 'Application de démonstration</p>' +
        '<p class="text-xs text-gray-500 leading-relaxed">Les données sont enregistrées uniquement dans ce navigateur (localStorage). ' +
        'Ce contrôle d\'accès est une contrainte d\'interface : il n\'apporte aucune sécurité réelle et serait contournable depuis la console. ' +
        'Un déploiement scolaire doit appliquer les droits et les rôles côté serveur.</p>' +
        '<button type="button" id="btn-deconnexion" class="px-5 py-3 nm-soft-convex rounded-2xl text-xs font-bold text-red-500 flex items-center gap-2">' +
        P.ico('log-out', 14) + 'Se déconnecter</button></div>'
    })
  ]);

  var btn = document.getElementById('btn-deconnexion');
  if (btn) btn.addEventListener('click', E.layout.deconnexion);
})();
