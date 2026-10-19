/* EduNeum - Ma classe (professeur principal).
   Reserve au professeur principal : moyenne de la classe, distribution,ilisibles
   et situation de chaque eleve. Les moyennes viennent du service de calcul unique. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui, C = E.calculs;
  if (!E.auth.estConnecte()) return;

  var s = E.auth.session();
  var an = E.layout.anneeChoisie();

  var maClasse = null;
  if (s && s.enseignantId && an) {
    S.all('profsPrincipaux').forEach(function (p) {
      if (p.anneeId === an.id && p.enseignantId === s.enseignantId) maClasse = S.classeParId(p.classeId);
    });
  }

  if (!maClasse) {
    P.rendre(UI.etatVide('Vous n\'êtes professeur principal d\'aucune classe pour ' + (an ? an.libelle : 'cette année') + '.'));
    return;
  }

  var trimestreId = (S.trimestresDe(an.id).filter(function (t) { return t.ouvert; })[0] || {}).id;
  var eleves = S.elevesDeClasse(maClasse.id, an.id);
  var classement = C.classerGeneral({ classeId: maClasse.id, anneeId: an.id, trimestreId: trimestreId });
  var lignes = eleves.map(function (e) {
    var g = C.moyenneGenerale({ eleveId: e.id, classeId: maClasse.id, anneeId: an.id, trimestreId: trimestreId });
    var r = classement.lignes.filter(function (x) { return x.eleveId === e.id; })[0];
    return {
      id: e.id, eleve: e.nom + ' ' + e.prenom, matricule: e.matricule,
      moyenne: g.valeur, rang: r ? r.rang : null, nonNotees: g.matieresNonNotees.length
    };
  });
  var parTranche = { '0-5': 0, '5-8': 0, '8-10': 0, '10-12': 0, '12-14': 0, '14-16': 0, '16-20': 0 };
  lignes.forEach(function (l) {
    if (l.moyenne === null) return;
    if (l.moyenne < 5) parTranche['0-5']++;
    else if (l.moyenne < 8) parTranche['5-8']++;
    else if (l.moyenne < 10) parTranche['8-10']++;
    else if (l.moyenne < 12) parTranche['10-12']++;
    else if (l.moyenne < 14) parTranche['12-14']++;
    else if (l.moyenne < 16) parTranche['14-16']++;
    else parTranche['16-20']++;
  });
  var maxTranche = Math.max.apply(null, Object.keys(parTranche).map(function (k) { return parTranche[k]; }).concat([1]));

  var table = UI.tableau({
    lignes: lignes,
    placeholderRecherche: 'Rechercher un élève…',
    colonnes: [
      { cle: 'eleve', titre: 'Élève' },
      { cle: 'matricule', titre: 'Matricule', triable: false },
      { cle: 'rang', titre: 'Rang', rendu: function (l) { return l.rang === null ? '—' : '<span class="pastille accent">' + l.rang + (l.rang === 1 ? 'er' : 'e') + '</span>'; } },
      { cle: 'moyenne', titre: 'Moyenne', rendu: function (l) { return l.moyenne === null ? '—' : '<span class="font-black text-accent">' + UI.nombre(l.moyenne) + '</span>'; } },
      { cle: 'appreciation', titre: 'Appréciation', triable: false, valeurTri: function (l) { return C.appreciationAuto(l.moyenne); }, rendu: function (l) { return P.esc(C.appreciationAuto(l.moyenne)); } },
      { cle: 'nonNotees', titre: 'Matières non notées', rendu: function (l) { return l.nonNotees ? '<span class="pastille ambre">' + l.nonNotees + '</span>' : '—'; } }
    ],
    nomExport: 'classe-' + maClasse.nom,
    messageVide: 'Aucun élève inscrit dans cette classe.'
  });

  var sectionTable = P.avecTableau(
    P.section({ titre: 'Situation des élèves', icone: 'users', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
    table);

  P.rendre([
    P.grilleKPI([
      P.carte({ label: 'Classe', valeurHtml: '<span class="text-lg">' + P.esc(maClasse.nom) + '</span>', icone: 'school', note: an.libelle }),
      P.carte({ label: 'Effectif', valeur: String(eleves.length), icone: 'users-round', couleur: 'text-blue-500' }),
      P.carte({ label: 'Moyenne de classe', valeur: classement.moyenne === null ? '—' : UI.nombre(classement.moyenne), icone: 'gauge', couleur: 'text-green-500' }),
      P.carte({ label: 'Meilleure moyenne', valeur: classement.meilleure === null ? '—' : UI.nombre(classement.meilleure), icone: 'trophy', couleur: 'text-amber-500' })
    ]),

    P.section({
      titre: 'Distribution des moyennes', icone: 'bar-chart-3',
      contenu: '<div class="nm-flat p-6 rounded-[32px] space-y-3">' + Object.keys(parTranche).map(function (k) {
        var v = parTranche[k];
        return '<div class="flex items-center gap-3 text-xs font-bold text-gray-500">' +
          '<span class="w-16 text-right">' + k.replace('-', '–') + '</span>' +
          '<div class="flex-1 seq-jauge"><span style="width:' + Math.round((v / maxTranche) * 100) + '%"></span></div>' +
          '<span class="w-6">' + v + '</span></div>';
      }).join('') + '</div>'
    }),

    sectionTable,

    P.section({
      titre: 'Conseil de classe', icone: 'clipboard-list',
      contenu: '<div class="nm-flat p-6 rounded-[32px] space-y-4">' +
        '<p class="text-sm text-gray-600 dark:text-gray-300">Appréciations automatiques, calculées par le service unique selon le barème défini en paramètres.</p>' +
        '<div class="space-y-2">' + ['16-20', '14-16', '12-14', '10-12', '8-10', '5-8', '0-5'].map(function (k) {
          var el = lignes.filter(function (l) {
            if (l.moyenne === null) return false;
            var t = l.moyenne < 5 ? '0-5' : l.moyenne < 8 ? '5-8' : l.moyenne < 10 ? '8-10' :
              l.moyenne < 12 ? '10-12' : l.moyenne < 14 ? '12-14' : l.moyenne < 16 ? '14-16' : '16-20';
            return t === k;
          });
          if (!el.length) return '';
          return '<div class="flex flex-wrap items-center gap-2 text-xs"><span class="pastille accent">' +
            k.replace('-', '–') + '</span><span class="text-gray-500">' +
            el.slice(0, 6).map(function (l) { return P.esc(l.eleve); }).join(', ') +
            (el.length > 6 ? ' +' + (el.length - 6) : '') + '</span></div>';
        }).join('') + '</div></div>'
    })
  ]);
})();
