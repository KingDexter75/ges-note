/* EduNeum - Suivi des notes (consultation) : moyennes, rangs et absences par matiere.
   L'administration ne saisit pas les notes : elle controle. Toute moyenne affichee
   ici provient du service de calcul unique. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui, C = E.calculs;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire active.')); return; }

  var fClasse = null, fMatiere = null, fPeriode = null;
  var etat = { classeId: null, matiereId: null, periodeId: null };

  function rafraichirSelecteurs() {
    var classes = S.classesDe(an.id);
    if (!classes.length) { P.rendre(UI.etatVide('Aucune classe pour cette année scolaire.')); return; }
    etat.classeId = etat.classeId && S.classeParId(etat.classeId) ? etat.classeId : classes[0].id;
    var matieres = S.matieresDeClasse(etat.classeId);
    etat.matiereId = etat.matiereId && matieres.some(function (m) { return m.id === etat.matiereId; })
      ? etat.matiereId : (matieres[0] ? matieres[0].id : null);
    etat.periodeId = etat.periodeId || (S.trimestresDe(an.id)[0] || {}).id;
    rendre();
  }

  function sequencesDeLaPeriode() {
    if (etat.periodeId === 'annuel') return S.sequencesDe(an.id);
    return S.sequencesDeTrimestre(etat.periodeId);
  }

  function rendre() {
    var classes = S.classesDe(an.id);
    var matieres = S.matieresDeClasse(etat.classeId);
    var bareme = P.liste('id="sel-classe"', classes.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === etat.classeId ? ' selected' : '') + '>' + P.esc(c.nom) + '</option>';
    }).join(''));
    var selMatiere = P.liste('id="sel-matiere"', matieres.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === etat.matiereId ? ' selected' : '') + '>' + P.esc(m.nom) + '</option>';
    }).join(''));
    var selPeriode = P.liste('id="sel-periode"', P.optionsPeriodes(an.id, etat.periodeId));

    var toolbar = '<div class="nm-inset rounded-[32px] px-6 py-4 flex flex-wrap items-center gap-4">' +
      '<div class="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">' + P.ico('filter', 14) + 'Filtres :</div>' +
      bareme + selMatiere + selPeriode + '</div>';

    if (!etat.matiereId) {
      P.rendre([toolbar, P.section({ titre: 'Matières', contenu: UI.etatVide('Aucun coefficient défini pour cette classe.') })]);
      brancher();
      return;
    }

    var sequences = sequencesDeLaPeriode();
    var matiere = S.matiereParId(etat.matiereId);
    var affectation = S.affectationsDe(an.id).filter(function (a) {
      return a.classeId === etat.classeId && a.matiereId === etat.matiereId;
    })[0];
    var enseignant = affectation ? S.enseignantParId(affectation.enseignantId) : null;

    var lignes = S.elevesDeClasse(etat.classeId, an.id).map(function (e) {
      var parSeq = sequences.map(function (s) {
        var n = S.note(s.id, e.id, etat.matiereId);
        return { libelle: 'S' + s.numero, note: n && n.statut === 'note' ? n.valeur : null };
      });
      var moy = etat.periodeId === 'annuel'
        ? C.moyenneMatiereAnnuelle({ eleveId: e.id, anneeId: an.id, matiereId: etat.matiereId })
        : C.moyenneMatiere({ eleveId: e.id, matiereId: etat.matiereId, sequences: sequences.map(function (s) { return s.id; }) });
      return {
        id: e.id, eleve: e.nom + ' ' + e.prenom, notes: parSeq,
        moyenne: moy, abs: parSeq.filter(function (n) { return n.note === null; }).length
      };
    });
    var classement = C.classer(lignes.map(function (l) { return l.id; }), function (id) {
      var l = lignes.filter(function (x) { return x.id === id; })[0];
      return l ? l.moyenne : null;
    });
    lignes.forEach(function (l) {
      var r = classement.lignes.filter(function (x) { return x.eleveId === l.id; })[0];
      l.rang = r ? r.rang : null;
    });

    var table = UI.tableau({
      lignes: lignes,
      placeholderRecherche: 'Rechercher un élève…',
      colonnes: [
        { cle: 'eleve', titre: 'Élève' },
        { cle: 'rang', titre: 'Rang', rendu: function (l) { return l.rang === null ? '—' : '<span class="pastille accent">' + l.rang + (l.rang === 1 ? 'er' : 'e') + '</span>'; } }
      ].concat(sequences.map(function (s) {
        return {
          cle: 's' + s.id, titre: s.libelle, triable: false,
          valeurTri: function (l) { var n = l.notes.filter(function (x) { return x.libelle === 'S' + s.numero; })[0]; return n ? n.note : null; },
          rendu: function (l) {
            var n = l.notes.filter(function (x) { return x.libelle === 'S' + s.numero; })[0];
            return n.note === null ? '<span class="pastille rouge">ABS</span>' : UI.nombre(n.note, 2);
          }
        };
      })).concat([
        {
          cle: 'moyenne', titre: 'Moyenne',
          rendu: function (l) {
            return l.moyenne === null ? '—' : '<span class="font-black text-accent">' + UI.nombre(l.moyenne) + '</span>';
          }
        },
        { cle: 'abs', titre: 'Non notées', rendu: function (l) { return l.abs || '—'; } }
      ]),
      nomExport: 'suivi-notes-' + (S.classeParId(etat.classeId) || {}).nom,
      messageVide: 'Aucun élève dans cette classe.'
    });

    var infos = '<div class="nm-flat p-6 rounded-[32px] flex flex-wrap items-center justify-between gap-4">' +
      '<div class="flex flex-wrap items-center gap-6 text-sm">' +
      '<span><b>' + P.esc(matiere.nom) + '</b> · coef. ' + S.coefficient(etat.classeId, etat.matiereId) + '</span>' +
      '<span class="text-gray-500">Enseignant : ' + (enseignant ? P.esc(enseignant.nom + ' ' + enseignant.prenom) : 'non affecté') + '</span>' +
      '<span class="text-gray-500">Moyenne classe : <b class="text-accent">' + (classement.moyenne === null ? '—' : UI.nombre(classement.moyenne)) + '</b></span>' +
      '<span class="text-gray-500">Notées : ' + classement.nbNotes + ' / ' + classement.effectif + '</span>' +
      '</div>' +
      '<span class="pastille ' + (sequences.some(function (s) { return s.ouverte; }) ? 'vert' : 'gris') + '">' +
      (sequences.some(function (s) { return s.ouverte; }) ? 'Saisie ouverte' : 'Saisie fermée') + '</span></div>';

    P.rendre([
      toolbar,
      P.section({ titre: 'Suivi par élève', icone: 'file-text', contenu: infos }),
      P.avecTableau(
        P.section({ titre: 'Notes et moyennes', icone: 'bar-chart-3', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
        table)
    ]);
    brancher();
  }

  function brancher() {
    var c = document.getElementById('sel-classe');
    if (c) c.addEventListener('change', function () { etat.classeId = c.value; etat.matiereId = null; rafraichirSelecteurs(); });
    var m = document.getElementById('sel-matiere');
    if (m) m.addEventListener('change', function () { etat.matiereId = m.value; rendre(); });
    var p = document.getElementById('sel-periode');
    if (p) p.addEventListener('change', function () { etat.periodeId = p.value; rendre(); });
  }

  rafraichirSelecteurs();
})();
