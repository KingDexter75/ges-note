/* EduNeum - Mes classes (enseignant) : uniquement les affectations de l'annee en cours.
   Regle : un enseignant ne voit que les couples classe / matiere qui lui sont affectes. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui, C = E.calculs, R = E.routes;
  if (!E.auth.estConnecte()) return;

  var s = E.auth.session();
  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire active.')); return; }

  if (!s.enseignantId) {
    P.rendre(UI.etatVide('Votre compte n\'est rattaché à aucun enseignant. Contactez l\'administration.'));
    return;
  }

  var mesAffectations = S.affectationsDeEnseignant(s.enseignantId, an.id);
  var trimestre = S.trimestresDe(an.id).filter(function (t) { return t.ouvert; })[0] || null;
  var sequences = S.sequencesDe(an.id);

  /* Regroupement par classe : une carte par classe, une ligne par matiere.
     Les classes sont presentees dans l'ordre officiel (niveau, puis
     alphabetique), comme partout ailleurs. */
  var parClasse = {};
  mesAffectations.forEach(function (a) {
    if (!parClasse[a.classeId]) parClasse[a.classeId] = [];
    parClasse[a.classeId].push(a);
  });
  var idsClasses = Object.keys(parClasse).sort(function (x, y) {
    return S.comparerClasses(S.classeParId(x), S.classeParId(y));
  });
  var cartes = idsClasses.map(function (cid) {
    var c = S.classeParId(cid);
    var eleves = S.elevesDeClasse(cid, an.id);
    var matieres = parClasse[cid].map(function (a) {
      var m = S.matiereParId(a.matiereId);
      return { a: a, m: m, coef: S.coefficient(cid, a.matiereId) };
    });
    var cc = C.classerGeneral({ classeId: cid, anneeId: an.id, trimestreId: trimestre ? trimestre.id : null });
    var estPP = S.all('profsPrincipaux').some(function (p) { return p.classeId === cid && p.anneeId === an.id && p.enseignantId === s.enseignantId; });

    return '<div class="p-6 rounded-[32px] nm-flat space-y-4">' +
      '<div class="flex items-start justify-between gap-3">' +
      '<div><h3 class="text-lg font-bold display-font">' + P.esc(c.nom) + '</h3>' +
      '<p class="text-xs text-gray-400">' + eleves.length + ' élève(s)' + (estPP ? ' · professeur principal' : '') + '</p></div>' +
      (estPP ? '<span class="pastille accent">PP</span>' : '') +
      '</div>' +
      '<ul class="space-y-2">' + parClasse[cid].map(function (a) {
        var m = S.matiereParId(a.matiereId);
        /* Remplissage reel : notes saisies / eleves, sequence par sequence. */
        var totalAttendu = eleves.length * sequences.length;
        var saisi = S.all('notes').filter(function (n) {
          return n.classeId === cid && n.matiereId === a.matiereId && n.statut === 'note';
        }).length;
        return '<li class="flex items-center justify-between gap-3 text-sm">' +
          '<span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-accent"></span>' + P.esc(m ? m.nom : '—') +
          '<span class="text-xs text-gray-400">coef. ' + S.coefficient(cid, a.matiereId) + '</span></span>' +
          '<span class="text-xs font-bold text-gray-400">' + saisi + '/' + totalAttendu + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="flex items-center justify-between text-xs"><span class="text-gray-400">Moyenne classe</span>' +
      '<span class="font-black text-accent">' + (cc.moyenne === null ? '—' : UI.nombre(cc.moyenne)) + '</span></div>' +
      '<div class="flex gap-2">' +
      '<a href="' + R.resolve('teacher_saisie') + '" class="flex-1 text-center py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent">Saisir</a>' +
      (estPP ? '<a href="' + R.resolve('teacher_ma_classe') + '" class="flex-1 text-center py-2 nm-soft-convex rounded-xl text-xs font-bold text-gray-500">Ma classe</a>' : '') +
      '</div></div>';
  });

  P.rendre([
    P.grilleKPI([
      P.carte({ label: 'Mes classes', valeur: String(idsClasses.length), icone: 'school' }),
      P.carte({ label: 'Mes matières', valeur: String(mesAffectations.length), icone: 'book-open', couleur: 'text-blue-500' }),
      P.carte({ label: 'Élèves suivis', valeur: String(idsClasses.reduce(function (n, id) { return n + S.elevesDeClasse(id, an.id).length; }, 0)), icone: 'users-round', couleur: 'text-green-500' }),
      P.carte({ label: 'Séquences ouvertes', valeur: String(sequences.filter(function (x) { return x.ouverte; }).length), icone: 'list-checks', couleur: 'text-amber-500' })
    ]),
    P.section({
      titre: 'Mes affectations', icone: 'link-2',
      contenu: idsClasses.length
        ? '<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">' + cartes.join('') + '</div>'
        : UI.etatVide('Aucune affectation pour vous cette année. Contactez l\'administration.')
    }),
    P.section({
      titre: 'Rappel', icone: 'info',
      contenu: '<div class="p-6 rounded-[32px] nm-flat bg-accent/5 border border-accent/10 flex items-start gap-3">' +
        '<span class="text-accent mt-0.5">' + P.ico('shield-alert', 18) + '</span>' +
        '<p class="text-sm">Vous ne pouvez saisir des notes que dans les classes et matières qui vous sont affectées, et uniquement sur une séquence ouverte.</p></div>'
    })
  ]);
})();
