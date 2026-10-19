/* EduNeum - Affectations : salles des surveillants generaux.
   Page dediee (menu Affectations > Surveillants) : uniquement
   l'attribution des salles aux membres ayant la fonction
   "Surveillant". */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune annee scolaire active.')); return; }

  function surveillantsGeneraux() {
    return S.all('enseignants').filter(function (p) { return !p.archive && p.fonction === 'surveillant'; });
  }

  function refresh() {
    var classes = S.classesDe(an.id);
    var sgs = surveillantsGeneraux();
    var attributions = S.attributionsSG(an.id);

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Surveillants generaux', valeur: String(sgs.length), icone: 'shield' }),
        P.carte({ label: 'Salles attribuees', valeur: String(attributions.length), icone: 'door-open', couleur: 'text-blue-500' }),
        P.carte({ label: 'Classes', valeur: String(classes.length), icone: 'school', couleur: 'text-green-500' })
      ]),

      P.section({
        titre: 'Salles des surveillants generaux', icone: 'door-open',
        contenu: '<div class="nm-flat p-6 rounded-[32px] space-y-5">' +
          (P.peutEcrire() && classes.length && sgs.length
            ? '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end" id="form-sg"></div>'
            : '<p class="text-xs text-gray-500">' +
              (!sgs.length
                ? "Aucun membre avec la fonction 'Surveillant' : creez-le depuis la page Personnel."
                : 'Creez dabord une classe pour pouvoir attribuer des salles.') +
              '</p>') +
          (attributions.length
            ? '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">' + attributions.map(function (a) {
              var c = S.classeParId(a.classeId), p = S.enseignantParId(a.enseignantId);
              return '<div class="nm-inset rounded-2xl p-4 flex items-center justify-between gap-3">' +
                '<div><p class="font-bold text-sm">' + P.esc(c ? c.nom : a.classeId) + '</p>' +
                '<p class="text-xs text-gray-400">SG : ' + P.esc(p ? p.nom + ' ' + p.prenom : a.enseignantId) + '</p></div>' +
                (P.peutEcrire()
                  ? '<button type="button" class="p-2 nm-soft-convex rounded-lg text-red-500" title="Retirer l\'attribution" data-sg-id="' + P.esc(a.id) + '">' + P.ico('trash-2', 14) + '</button>'
                  : '') +
                '</div>';
            }).join('') + '</div>'
            : '<p class="text-xs text-gray-400">Aucune salle attribuee pour ' + P.esc(an.libelle) + '.</p>') +
          '</div>'
      })
    ]);

    if (P.peutEcrire() && classes.length && sgs.length) {
      var fSGClasse = UI.champ({
        label: 'Classe', type: 'select', requis: true,
        options: classes.map(function (c) { return { valeur: c.id, libelle: c.nom }; })
      });
      var fSG = UI.champ({
        label: 'Surveillant general', type: 'select', requis: true,
        options: sgs.map(function (p) { return { valeur: p.id, libelle: p.nom + ' ' + p.prenom }; })
      });
      var formSG = document.getElementById('form-sg');
      formSG.appendChild(fSGClasse.element);
      formSG.appendChild(fSG.element);
      var btnSG = UI.el('button', { class: 'py-3 px-6 bg-accent text-white font-bold rounded-2xl text-sm', type: 'button', text: 'Attribuer la salle' });
      btnSG.addEventListener('click', function () {
        if (!UI.validerChamps([fSGClasse, fSG])) return false;
        var r = S.attribuerClasseSG(fSGClasse.valeur(), fSG.valeur());
        if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
        UI.toast('Salle attribuee au surveillant general.', 'success');
        refresh();
      });
      formSG.appendChild(btnSG);
    }

    document.querySelectorAll('#contenu [data-sg-id]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-sg-id');
        P.confirmerSuppression('cette attribution de salle', function () {
          var r = S.retirerAttributionSG(id);
          if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
          UI.toast('Attribution retiree.', 'info');
          refresh();
        });
      });
    });
  }

  refresh();
})();
