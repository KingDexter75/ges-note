/* EduNeum - Classes Censeur : vue des classes sous responsabilité. */

(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;

  if (!E.auth.estConnecte()) return;
  if (!E.acces.exiger('censeur_classes')) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  function mesClasses() {
    if (!E.auth.session().enseignantId) return [];
    var ids = E.acces.mesClasses ? E.acces.mesClasses() : [];
    return ids.map(function (id) { return S.classeParId(id); }).filter(Boolean);
  }

  function effectifDe(c) { return S.elevesDeClasse(c.id, an.id).length; }

  function refresh() {
    var classes = mesClasses();
    if (!classes.length) { P.rendre(UI.etatVide('Aucune classe sous votre responsabilité.')); return; }

    var table = UI.tableau({
      lignes: classes,
      placeholderRecherche: 'Rechercher une classe…',
      parPage: 12,
      nomExport: 'mes-classes-' + an.libelle,
      messageVide: 'Aucune classe pour ' + an.libelle + '.',
      colonnes: [
        {
          cle: 'nom', titre: 'Classe', rendu: function (l) {
            var section = l.section || 'francophone';
            var badge = section === 'anglophone'
              ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">Anglophone</span>'
              : '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/10 text-green-500">Francophone</span>';
            return '<div><p class="font-bold">' + P.esc(l.nom) + '</p>' +
              '<p class="text-xs text-gray-400 flex items-center gap-2">' + P.esc(l.cycle) + ' ' + badge + '</p></div>';
          }
        },
        { cle: 'niveau', titre: 'Niveau' },
        {
          cle: 'effectif', titre: 'Effectif', valeurTri: function (l) { return effectifDe(l); },
          rendu: function (l) {
            return '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + effectifDe(l) + ' élève(s)</span>';
          }
        },
        {
          cle: 'pp', titre: 'Professeur principal', triable: false,
          valeurTri: function (l) { var id = S.ppDeClasse(l.id); var p = id ? S.enseignantParId(id) : null; return p ? p.nom : ''; },
          rendu: function (l) {
            var id = S.ppDeClasse(l.id);
            var p = id ? S.enseignantParId(id) : null;
            return p ? '<span class="text-xs font-bold">' + P.esc(p.prenom + ' ' + p.nom) + '</span>'
              : '<span class="text-xs font-bold text-amber-500">non désigné</span>';
          }
        },
        {
          cle: 'matieres', titre: 'Matières', triable: false,
          rendu: function (l) {
            var n = S.matieresDeClasse(l.id).length;
            return n ? '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + n + '</span>'
              : '<span class="text-xs text-amber-500 font-bold">aucune</span>';
          }
        }
      ]
    });

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Classes', valeur: String(classes.length), icone: 'school' }),
        P.carte({ label: 'Élèves', valeur: String(classes.reduce(function (s, c) { return s + effectifDe(c); }, 0)), icone: 'users-round', couleur: 'text-blue-500' }),
        P.carte({ label: 'Sans PP', valeur: String(classes.filter(function (c) { return !S.ppDeClasse(c.id); }).length), icone: 'user-round-cog', couleur: 'text-amber-500' }),
        P.carte({ label: 'Niveaux représentés', valeur: String(classes.reduce(function (acc, c) { if (acc.indexOf(c.niveau) === -1) acc.push(c.niveau); return acc; }, []).length), icone: 'layers', couleur: 'text-blue-500' })
      ]),
      P.section({ titre: 'Classes de ' + an.libelle, icone: 'school', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' })
    ]);

    P.avecTableau(
      P.section({ titre: 'Classes de ' + an.libelle, icone: 'school', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
      table
    );
  }

  refresh();
})();