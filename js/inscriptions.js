/* EduNeum - Inscriptions : rattacher les eleves a une classe pour l'annee courante.
   Regle : un eleve ne peut etre inscrit que dans une seule classe active par annee. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire active.')); return; }

  var fClasse = null, fEleve = null;

  function refresh() {
    var classes = S.classesDe(an.id);
    var dejaIncrits = {};
    S.all('inscriptions').forEach(function (i) {
      if (i.anneeId === an.id && !i.archive) dejaIncrits[i.eleveId] = i.classeId;
    });
    var disponibles = S.all('eleves').filter(function (e) { return !e.archive && !dejaIncrits[e.id]; });
    var inscrits = S.all('inscriptions').filter(function (i) { return i.anneeId === an.id && !i.archive; });

    var parClasse = classes.map(function (c) {
      return {
        classe: c.nom, id: c.id,
        effectif: S.elevesDeClasse(c.id, an.id).length
      };
    });

    var tableInscrits = UI.tableau({
      lignes: inscrits.map(function (i) {
        var e = S.eleveParId(i.eleveId), c = S.classeParId(i.classeId);
        return {
          eleve: e ? e.prenom + ' ' + e.nom : '—', matricule: e ? e.matricule : '—',
          classe: c ? c.nom : '—', date: i.dateInscription, id: i.id, eleveId: i.eleveId
        };
      }),
      colonnes: [
        { cle: 'eleve', titre: 'Élève' },
        { cle: 'matricule', titre: 'Matricule', triable: false },
        { cle: 'classe', titre: 'Classe' },
        { cle: 'date', titre: 'Inscription', rendu: function (l) { return UI.dateFr(l.date); } },
        {
          cle: 'action', titre: '', triable: false, rendu: function (l) {
            var b = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-red-500', title: 'Retirer', html: P.ico('user-minus', 14) });
            b.addEventListener('click', function () { retirer(l); });
            return b;
          }
        }
      ],
      nomExport: 'inscriptions-' + an.libelle,
      messageVide: 'Aucun élève inscrit pour cette année scolaire.'
    });

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Classes', valeur: String(classes.length), icone: 'school' }),
        P.carte({ label: 'Inscrits', valeur: String(inscrits.length), icone: 'users-round', couleur: 'text-blue-500' }),
        P.carte({ label: 'En attente', valeur: String(disponibles.length), icone: 'user-plus', couleur: 'text-amber-500' }),
        P.carte({ label: ' archivés', valeur: String(S.all('eleves').filter(function (e) { return e.archive; }).length), icone: 'archive', couleur: 'text-gray-400' })
      ]),

      P.section({
        titre: 'Inscrire un élève', icone: 'user-plus',
        contenu: P.peutEcrire()
          ? '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 md:grid-cols-3 gap-4 items-end" id="form-inscription"></div>'
          : UI.etatVide('Seul un administrateur peut inscrire un élève.')
      }),

      P.section({
        titre: 'Effectifs par classe', icone: 'users',
        contenu: '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">' + parClasse.map(function (c) {
          return '<div class="p-6 rounded-[32px] nm-flat">' +
            '<div class="flex items-center justify-between"><p class="font-bold">' + P.esc(c.classe) + '</p>' +
            '<span class="text-xs font-bold text-gray-400">' + c.effectif + ' élève(s)</span></div></div>';
        }).join('') + '</div>'
      }),

      P.avecTableau(
        P.section({ titre: 'Élèves inscrits', icone: 'list-checks', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
        tableInscrits)
    ]);

    if (P.peutEcrire()) {
      fClasse = UI.champ({ label: 'Classe', type: 'select', options: classes.map(function (c) { return { valeur: c.id, libelle: c.nom }; }), requis: true });
      fEleve = UI.champ({
        label: 'Élève non inscrit', type: 'select', requis: true,
        options: [{ valeur: '', libelle: 'Sélectionner…' }].concat(disponibles.map(function (e) { return { valeur: e.id, libelle: e.prenom + ' ' + e.nom + ' (' + e.matricule + ')' }; }))
      });
      var form = document.getElementById('form-inscription');
      form.appendChild(fClasse.element);
      form.appendChild(fEleve.element);
      var btn = UI.el('button', { class: 'py-3 px-6 bg-accent text-white font-bold rounded-2xl text-sm', type: 'button', text: 'Inscrire' });
      btn.addEventListener('click', inscrire);
      form.appendChild(btn);
    }
  }

  function inscrire() {
    if (!UI.validerChamps([fClasse, fEleve])) return false;
    /* Une seule classe par eleve et par annee : la regle est verifiee par le
       store, pas seulement ici, pour rester vraie quel que soit l'appelant. */
    var r = S.inscrireEleve(fEleve.valeur(), fClasse.valeur(), an.id);
    if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
    UI.toast('Inscription enregistrée.', 'success');
    refresh();
  }

  function retirer(l) {
    var el = S.eleveParId(l.eleveId);
    P.confirmerSuppression('l\'inscription de ' + (el ? el.prenom + ' ' + el.nom : 'cet élève'), function () {
      var r = S.desinscrireEleve(l.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Inscription retirée.', 'info');
      refresh();
    });
  }

  refresh();
})();
