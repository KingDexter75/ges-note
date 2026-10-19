/* EduNeum - Journal d'audit : tracabilite en lecture seule.
   Le journal est alimente automatiquement par le store (store.journaliser). */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.auth.estConnecte()) return;

  var filtreAction = '', filtrePeriode = '';

  function Libelles() {
    return {
      'session.connexion': 'Connexion', 'session.deconnexion': 'Déconnexion',
      'inscription.creation': 'Inscription', 'migration.transfert': 'Migration',
      'affectation.creation': 'Affectation', 'note.creation': 'Saisie de note',
      'note.modification': 'Modification de note', 'sequence.ouverture': 'Ouverture de séquence',
      'sequence.verrouillage': 'Verrouillage de séquence', 'bulletin.validation': 'Validation de bulletin',
      'annee.changement': 'Changement d\'année', 'suppression': 'Suppression',
      'export.tableau-de-bord': 'Export'
    };
  }

  function rendre() {
    var tout = S.journal();
    var lignes = tout.filter(function (j) {
      if (filtreAction && j.action !== filtreAction) return false;
      if (filtrePeriode === 'jour' && (j.date || '').slice(0, 10) !== new Date().toISOString().slice(0, 10)) return false;
      if (filtrePeriode === 'semaine') {
        var d = new Date(Date.now() - 7 * 864e5).toISOString();
        if ((j.date || '') < d) return false;
      }
      return true;
    });

    var lib = Libelles();
    var actionsPresentes = tout.reduce(function (acc, j) { acc[j.action] = true; return acc; }, {});

    var table = UI.tableau({
      lignes: lignes,
      placeholderRecherche: 'Rechercher une action, une cible…',
      parPage: 15,
      filtres: [
        {
          cle: 'action', options: [{ valeur: '', libelle: 'Toutes les actions' }].concat(
            Object.keys(actionsPresentes).sort().map(function (a) { return { valeur: a, libelle: lib[a] || a }; }))
        }
      ],
      filtreValeur: function (l, cle) { return cle === 'action' ? l.action : ''; },
      colonnes: [
        {
          cle: 'date', titre: 'Horodatage', triable: true,
          valeurTri: function (l) { return l.date; },
          rendu: function (l) {
            return '<span class="text-xs text-gray-500">' + new Date(l.date).toLocaleString('fr-FR') + '</span>';
          }
        },
        { cle: 'action', titre: 'Action', rendu: function (l) { return '<span class="pastille accent">' + P.esc(lib[l.action] || l.action) + '</span>'; } },
        { cle: 'cible', titre: 'Cible', rendu: function (l) { return '<span class="text-xs">' + P.esc(l.cible || '—') + '</span>'; } },
        {
          cle: 'auteur', titre: 'Auteur', triable: false,
          rendu: function (l) {
            var p = l.auteurId ? S.enseignantParId(l.auteurId) : null;
            return p ? P.esc(p.prenom + ' ' + p.nom) : '<span class="text-gray-400">système</span>';
          }
        }
      ],
      nomExport: 'journal-audit',
      messageVide: 'Aucune entrée pour ces filtres.'
    });

    var periode = P.liste('id="filtre-periode"',
      '<option value="">Toutes les périodes</option>' +
      '<option value="jour"' + (filtrePeriode === 'jour' ? ' selected' : '') + '>Aujourd\'hui</option>' +
      '<option value="semaine"' + (filtrePeriode === 'semaine' ? ' selected' : '') + '>7 derniers jours</option>');

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Entrées', valeur: String(tout.length), icone: 'history' }),
        P.carte({ label: 'Aujourd\'hui', valeur: String(tout.filter(function (j) { return (j.date || '').slice(0, 10) === new Date().toISOString().slice(0, 10); }).length), icone: 'calendar', couleur: 'text-blue-500' }),
        P.carte({ label: 'Types d\'action', valeur: String(Object.keys(actionsPresentes).length), icone: 'list-checks', couleur: 'text-green-500' })
      ]),
      P.avecTableau(
        P.section({
          titre: 'Consultation', icone: 'scroll-text',
          contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>',
          actions: periode
        }),
        table)
    ]);
    var sel = document.getElementById('filtre-periode');
    if (sel) sel.addEventListener('change', function () { filtrePeriode = sel.value; rendre(); });
  }

  var actions = document.getElementById('actions');
  if (actions) {
    actions.innerHTML = '<button type="button" id="btn-export-journal" class="px-5 py-3 nm-soft-convex rounded-2xl text-xs font-bold text-accent hover:nm-inset transition-all flex items-center gap-2">' +
      P.ico('download', 16) + 'Exporter</button>';
    document.getElementById('btn-export-journal').addEventListener('click', function () {
      UI.exporterCSV([
        { cle: 'date', titre: 'Horodatage' }, { cle: 'action', titre: 'Action' },
        { cle: 'cible', titre: 'Cible' }, { cle: 'auteurId', titre: 'Auteur' }
      ], S.journal().slice().reverse(), 'journal-audit');
      P.tracer('export.journal', 'journal', 'Export CSV du journal');
      UI.toast('Export généré.', 'success');
    });
  }

  rendre();
})();
