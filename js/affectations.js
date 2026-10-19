/* EduNeum - Affectations : qui enseigne quoi, et dans quelle classe.
   Regle appliquee ici : un professeur principal ne peut pas enseigner dans sa
   propre classe (le choix du PP se fait depuis la page Classes). */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire active.')); return; }

  var fClasse = null, fMatiere = null, fEnseignant = null;

  function enseignants() {
    return S.all('enseignants').filter(function (p) { return !p.archive && p.fonction === 'enseignant'; });
  }
  function refresh() {
    var affectations = S.affectationsDe(an.id);
    var classes = S.classesDe(an.id);
    var pps = S.all('profsPrincipaux').filter(function (p) { return p.anneeId === an.id; });

    var parClasse = {};
    classes.forEach(function (c) { parClasse[c.id] = []; });
    affectations.forEach(function (a) {
      if (parClasse[a.classeId]) parClasse[a.classeId].push(a);
    });

    var table = UI.tableau({
      lignes: affectations.map(function (a) {
        var c = S.classeParId(a.classeId), m = S.matiereParId(a.matiereId), p = S.enseignantParId(a.enseignantId);
        return {
          classe: c ? c.nom : '—', matiere: m ? m.nom : '—',
          enseignant: p ? p.nom + ' ' + p.prenom : '—',
          coefficient: S.coefficient(a.classeId, a.matiereId), id: a.id
        };
      }),
      colonnes: [
        { cle: 'classe', titre: 'Classe' },
        { cle: 'matiere', titre: 'Matière' },
        { cle: 'enseignant', titre: 'Enseignant' },
        { cle: 'coefficient', titre: 'Coef.', rendu: function (l) { return l.coefficient || '—'; } },
        {
          cle: 'action', titre: '', triable: false, rendu: function (l) {
            var b = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-red-500', title: 'Retirer', html: P.ico('trash-2', 14) });
            b.addEventListener('click', function () { retirer(l); });
            return b;
          }
        }
      ],
      nomExport: 'affectations-' + an.libelle,
      messageVide: 'Aucune affectation pour cette année scolaire.'
    });

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Affectations', valeur: String(affectations.length), icone: 'link-2' }),
        P.carte({ label: 'Classes couvertes', valeur: String(classes.filter(function (c) { return parClasse[c.id] && parClasse[c.id].length; }).length) + ' / ' + classes.length, icone: 'school', couleur: 'text-blue-500' }),
        P.carte({ label: 'Professeurs principaux', valeur: String(pps.length), icone: 'user-round-search', couleur: 'text-green-500' })
      ]),

      P.section({
        titre: 'Nouvelle affectation', icone: 'link',
        contenu: P.peutEcrire() && classes.length
          ? '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 md:grid-cols-4 gap-4 items-end" id="form-affectation"></div>'
          : UI.etatVide('Créez d\'abord une classe et une matière.')
      }),

      P.section({
        titre: 'Couverture par classe', icone: 'layout-grid',
        contenu: '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">' + classes.map(function (c) {
          var list = parClasse[c.id] || [];
          var pp = pps.filter(function (p) { return p.classeId === c.id; })[0];
          var prof = pp ? S.enseignantParId(pp.enseignantId) : null;
          return '<div class="p-6 rounded-[32px] nm-flat space-y-3">' +
            '<div class="flex items-center justify-between"><p class="font-bold">' + P.esc(c.nom) + '</p>' +
            '<span class="pastille ' + (list.length ? 'accent' : 'rouge') + '">' + list.length + ' matière(s)</span></div>' +
            '<p class="text-xs text-gray-400">PP : ' + (prof ? P.esc(prof.nom + ' ' + prof.prenom) : 'non défini') + '</p>' +
            '<ul class="space-y-1 text-xs text-gray-500">' + list.slice(0, 6).map(function (a) {
              var m = S.matiereParId(a.matiereId), p = S.enseignantParId(a.enseignantId);
              return '<li class="flex justify-between"><span>' + P.esc(m ? m.nom : '—') + '</span>' +
                '<span class="font-bold">' + P.esc(p ? p.nom : '—') + '</span></li>';
            }).join('') + (list.length > 6 ? '<li class="text-gray-400">+ ' + (list.length - 6) + ' autre(s)</li>' : '') + '</ul>' +
            '</div>';
        }).join('') + '</div>'
      }),

      P.avecTableau(
        P.section({ titre: 'Toutes les affectations', icone: 'list', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
        table)
    ]);

    if (P.peutEcrire() && classes.length) {
      fClasse = UI.champ({ label: 'Classe', type: 'select', options: classes.map(function (c) { return { valeur: c.id, libelle: c.nom }; }), requis: true });
      fMatiere = UI.champ({ label: 'Matière', type: 'select', options: S.all('matieres').filter(function (m) { return !m.archive; }).map(function (m) { return { valeur: m.id, libelle: m.nom }; }), requis: true });
      fEnseignant = UI.champ({ label: 'Enseignant', type: 'select', options: enseignants().map(function (p) { return { valeur: p.id, libelle: p.nom + ' ' + p.prenom }; }), requis: true });
      var form = document.getElementById('form-affectation');
      form.appendChild(fClasse.element);
      form.appendChild(fMatiere.element);
      form.appendChild(fEnseignant.element);
      var btn = UI.el('button', { class: 'py-3 px-6 bg-accent text-white font-bold rounded-2xl text-sm', type: 'button', text: 'Affecter' });
      btn.addEventListener('click', ajouter);
      form.appendChild(btn);
    }
  }

  function ajouter() {
    if (!UI.validerChamps([fClasse, fMatiere, fEnseignant])) return false;
    var r = S.creerAffectation(fClasse.valeur(), fMatiere.valeur(), fEnseignant.valeur(), an.id);
    if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
    UI.toast('Affectation enregistrée.', 'success');
    refresh();
  }

  function retirer(l) {
    P.confirmerSuppression('cette affectation', function () {
      /* supprimerAffectation archive au lieu d'effacer : une affectation qui
         porte des notes est protegee par le store, pas par l'interface. */
      var r = S.supprimerAffectation(l.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Affectation retirée.', 'info');
      refresh();
    });
  }

  refresh();
})();
