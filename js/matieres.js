/* EduNeum - Matieres : le catalogue est PERMANENT, les coefficients sont
   lies a l'annee via les classes.

   Deux niveaux de regles a ne pas confondre :
     - la matiere porte un code unique et une note maximale GENERIQUE (5 a 100) ;
     - le coefficient est propre a chaque classe de l'annee consultee, donc
       la meme matiere peut pesee 1 en 6A et 4 en TS.

   Matieres (tous eleves, profs, matieres) survivent au changement d'annee :
   seuls les coefficients sont rejoues classe par classe a chaque rentree. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  /* Garde de route : acces.exiger() refuse ET redirige. layout.init()
     refait le meme controle au DOMContentLoaded ; cette garde evite
     simplement d'afficher le contenu avant la redirection. */
  if (!E.acces.exiger('admin_matieres')) return;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  var classes = S.classesDe(an.id).filter(function (c) { return !c.archive; });

  /* Une matiere est "suivie" dans une classe si son coefficient y est > 0 :
     c'est exactement le filtre applique par matieresDeClasse(), donc
     l'ecran et les moyennes ne peuvent pas diverger. */
  function coefficientDe(classeId, matiereId) { return S.coefficient(classeId, matiereId); }
  function suivieDans(m) {
    return classes.filter(function (c) { return coefficientDe(c.id, m.id) > 0; });
  }
  function volumeTotal(m) {
    return suivieDans(m).reduce(function (s, c) { return s + coefficientDe(c.id, m.id); }, 0);
  }

  function refresh() {
    var toutes = S.all('matieres');
    var actives = toutes.filter(function (m) { return !m.archive; });
    var archivees = toutes.filter(function (m) { return m.archive; });
    var orphelines = actives.filter(function (m) { return suivieDans(m).length === 0; });
    var partagees = actives.filter(function (m) { return suivieDans(m).length > 1; });

    var table = UI.tableau({
      lignes: actives,
      placeholderRecherche: 'Rechercher une matière ou un code…',
      parPage: 12,
      nomExport: 'matieres-' + an.libelle,
      messageVide: 'Aucune matière au catalogue.',
      filtres: [
        {
          cle: 'noteMax', options: [{ valeur: '', libelle: 'Toutes les notes max' }].concat(
            actives.map(function (m) { return m.noteMax; })
              .filter(function (v, i, a) { return a.indexOf(v) === i; })
              .sort(function (a, b) { return a - b; })
              .map(function (v) { return { valeur: String(v), libelle: '/ ' + v }; }))
        }
      ],
      /* noteMax : les options sont des chaines alors que la valeur stockee
         est un nombre, d'ou filtreValeur pour comparertexte a texte. */
      filtreValeur: function (l, k) { return String(l[k]); },
      colonnes: [
        {
          cle: 'code', titre: 'Code',
          rendu: function (l) {
            return '<span class="text-xs font-black nm-inset px-2 py-1 rounded-lg">' + P.esc(l.code) + '</span>';
          }
        },
        {
          cle: 'nom', titre: 'Matière',
          rendu: function (l) { return '<span class="font-bold">' + P.esc(l.nom) + '</span>'; }
        },
        {
          cle: 'noteMax', titre: 'Note max', valeurTri: function (l) { return l.noteMax; },
          rendu: function (l) { return '<span class="text-xs font-bold text-gray-400">/ ' + l.noteMax + '</span>'; }
        },
        {
          cle: 'classes', titre: 'Suivie dans', triable: false,
          valeurTri: function (l) { return suivieDans(l).length; },
          rendu: function (l) {
            var n = suivieDans(l).length;
            if (!n) return '<span class="text-xs font-bold text-amber-500">aucune classe</span>';
            return '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + n + ' / ' + classes.length + '</span>';
          }
        },
        {
          cle: 'volume', titre: 'Volume total', triable: false,
          valeurTri: function (l) { return volumeTotal(l); },
          rendu: function (l) {
            var v = volumeTotal(l);
            return '<span class="text-xs font-bold text-accent">' + v + ' pts</span>';
          }
        },
        {
          cle: 'actions', titre: '', triable: false, classe: 'text-right',
          rendu: function (l) { return P.peutEcrire() ? actions(l) : ''; }
        }
      ]
    });

    var sectionMatieres = P.avecTableau(
      P.section({
        titre: 'Catalogue des matières', icone: 'book-open',
        actions: P.peutEcrire()
          ? '<button type="button" id="btn-nouvelle-matiere" class="py-2.5 px-5 bg-accent text-white font-bold rounded-2xl text-xs flex items-center gap-2">' +
            P.ico('plus', 14) + 'Nouvelle matière</button>'
          : '',
        contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
      }),
      table
    );

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Matières actives', valeur: String(actives.length), icone: 'book-open' }),
        P.carte({
          label: 'Volume horaire total', valeur: String(volumeTotalTotal(actives)), icone: 'sigma',
          couleur: 'text-blue-500'
        }),
        P.carte({
          label: 'Partagees', valeur: String(partagees.length), icone: 'git-branch',
          couleur: partagees.length ? 'text-accent' : 'text-gray-400'
        }),
        P.carte({
          label: 'Sans classe', valeur: String(orphelines.length), icone: 'circle-alert',
          couleur: orphelines.length ? 'text-amber-500' : 'text-green-500'
        })
      ]),

      sectionMatieres,

      P.section({
        titre: 'Coefficients par classe', icone: 'sigma',
        contenu: '<div class="nm-flat p-6 rounded-[32px] overflow-x-auto">' +
          (matriceCoefficients(actives) || '<p class="text-sm text-gray-400">Aucune classe pour ' +
            P.esc(an.libelle) + '.</p>') + '</div>'
      }),

      archivees.length ? P.section({
        titre: 'Matières archivées', icone: 'archive',
        contenu: '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
          archivees.map(function (m) {
            return '<div class="nm-inset rounded-2xl p-4 flex items-center justify-between">' +
              '<div><p class="font-bold text-sm">' + P.esc(m.nom) + '</p>' +
              '<p class="text-xs text-gray-400">' + P.esc(m.code) + ' · / ' + m.noteMax + '</p></div>' +
              '<span class="text-xs text-gray-400">archivée</span></div>';
          }).join('') + '</div>'
      }) : ''
    ]);

    var btn = document.getElementById('btn-nouvelle-matiere');
    if (btn) btn.addEventListener('click', function () { formulaire(null); });
  }

  function volumeTotalTotal(actives) {
    return actives.reduce(function (s, m) { return s + volumeTotal(m); }, 0);
  }

  /* ------------------------- Matrice des coefficients --------------------- */
  /* Vue en lecture seule de l'etat courant : elle affiche exactement ce que
     matieresDeClasse() retiendra pour les moyennes. L'edition se fait par le
     bouton "Coefficients" de chaque matiere, pour ne pas melanger deux
     transactions dans une grille. */
  function matriceCoefficients(actives) {
    if (!classes.length || !actives.length) return '';
    var entete = '<tr><th class="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-400">Matière</th>' +
      classes.map(function (c) {
        return '<th class="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-gray-400">' + P.esc(c.nom) + '</th>';
      }).join('') + '<th class="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-gray-400">Total</th></tr>';

    var lignes = actives.map(function (m) {
      return '<tr class="border-t border-gray-200 dark:border-gray-700">' +
        '<td class="px-3 py-2 text-sm font-bold">' + P.esc(m.nom) + '</td>' +
        classes.map(function (c) {
          var v = coefficientDe(c.id, m.id);
          return '<td class="px-3 py-2 text-center">' + (v > 0
            ? '<span class="text-xs font-black text-accent">' + v + '</span>'
            : '<span class="text-xs text-gray-300 dark:text-gray-600">0</span>') + '</td>';
        }).join('') +
        '<td class="px-3 py-2 text-center text-xs font-bold text-gray-400">' + volumeTotal(m) + '</td></tr>';
    }).join('');

    return '<table class="w-full min-w-[560px]"><thead>' + entete + '</thead><tbody>' + lignes + '</tbody></table>' +
      '<p class="text-xs text-gray-400 mt-3">Un coefficient à 0 retire la matière de la classe : elle disparaît des moyennes et de la saisie, mais les notes déjà saisies restent conservées.</p>';
  }

  /* ------------------------------ Actions --------------------------------- */
  function actions(m) {
    var groupe = document.createElement('div');
    groupe.className = 'flex items-center justify-end gap-2';
    var bCoef = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-accent', title: 'Coefficients', html: P.ico('sigma', 14)
    });
    bCoef.addEventListener('click', function () { formulaireCoefficients(m); });
    var bEdit = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-blue-500', title: 'Modifier', html: P.ico('pencil', 14)
    });
    bEdit.addEventListener('click', function () { formulaire(m); });
    var bArch = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-red-500', title: 'Archiver', html: P.ico('archive', 14)
    });
    bArch.addEventListener('click', function () { archiver(m); });
    groupe.appendChild(bCoef);
    groupe.appendChild(bEdit);
    groupe.appendChild(bArch);
    return groupe;
  }

  /* --------------------------- Formulaire matiere ------------------------ */
  function formulaire(m) {
    var fCode = UI.champ({ label: 'Code', valeur: m ? m.code : '', requis: true, placeholder: 'Ex. MATH', maxlength: 12 });
    var fNom = UI.champ({ label: 'Intitulé', valeur: m ? m.nom : '', requis: true, placeholder: 'Ex. Mathématiques' });
    var fMax = UI.champ({
      label: 'Note maximale', type: 'number', min: 5, max: 100,
      valeur: m ? m.noteMax : 20, requis: true
    });

    UI.modal({
      titre: m ? 'Modifier la matière' : 'Nouvelle matière',
      contenu: '<div class="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4" id="form-matiere"></div>' +
        '<p class="text-xs text-gray-500 mt-3">Le code est unique et non accentué. La note maximale est le barème de référence : la limite saisie par l\'enseignant est réglée dans chaque classe, dans les paramètres de la matière.</p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: m ? 'Enregistrer' : 'Créer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fCode, fNom, fMax])) return false;
            var payload = { code: fCode.valeur(), nom: fNom.valeur(), noteMax: fMax.valeur() };
            var r = m ? S.modifierMatiere(m.id, payload) : S.creerMatiere(payload);
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast(m ? 'Matière mise à jour.' : 'Matière créée.', 'success');
            refresh();
          }
        }
      ]
    });
    var f = document.getElementById('form-matiere');
    f.appendChild(fCode.element); f.appendChild(fNom.element); f.appendChild(fMax.element);
  }

  /* ------------------- Formulaire coefficients par classe ----------------- */
  /* Chaque classe a son propre coefficient. Les valeurs sont poussees une a
     une : si l'une est refusee par le store, les autres restent coherentes
     et l'utilisateur voit le motif precis plutot qu'un echec global muet. */
  function formulaireCoefficients(m) {
    if (!classes.length) {
      UI.toast('Aucune classe active pour ' + an.libelle + '.', 'error');
      return;
    }

    var lignes = classes.map(function (c) {
      var v = coefficientDe(c.id, m.id);
      return '<div class="flex items-center justify-between gap-3 rounded-2xl p-3 ' +
        (v > 0 ? 'nm-flat' : 'nm-inset') + '">' +
        '<div><p class="text-sm font-bold">' + P.esc(c.nom) + '</p>' +
        '<p class="text-[10px] text-gray-400">' + P.esc(c.niveau) + ' · ' +
        S.elevesDeClasse(c.id, an.id).length + ' élèves</p></div>' +
        '<input type="number" min="0" max="20" step="1" value="' + v + '" data-coef="' + P.esc(c.id) + '" ' +
        'class="w-20 px-3 py-2 rounded-xl text-sm font-bold text-center nm-inset"></div>';
    }).join('');

    UI.modal({
      titre: 'Coefficients de ' + m.nom,
      contenu: '<div class="space-y-2" id="form-coef">' + lignes + '</div>' +
        '<p class="text-xs text-gray-500 mt-3">Coefficient entre 0 et 20, entier. À 0 la matière n\'est pas suivie dans la classe : elle est exclue des moyennes et de la saisie, sans perdre les notes déjà enregistrées. Chaque modification est inscrite au journal d\'audit.</p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Appliquer', classe: 'bg-accent text-white',
          onClick: function () {
            var champs = Array.prototype.slice.call(
              document.querySelectorAll('#form-coef input[data-coef]'));
            var refus = 0;
            champs.forEach(function (input) {
              var r = S.definirCoefficient(input.getAttribute('data-coef'), m.id, input.value);
              if (!r.ok) { refus++; UI.toast(r.motif, 'error'); }
            });
            if (refus) { UI.toast(refus + ' coefficient(s) refusé(s).', 'error'); return; }
            UI.toast('Coefficients mis à jour pour ' + an.libelle + '.', 'success');
            refresh();
          }
        }
      ]
    });
  }

  /* ----------------------------- Archivage -------------------------------- */
  /* Une matiere archivee garde son code, ses notes et son historique ; elle
     sort simplement des listes de saisie et des moyennes. */
  function archiver(m) {
    UI.confirmer({
      titre: 'Archiver la matière',
      message: 'Archiver <b>' + P.esc(m.nom) + '</b> ?<br><br>' +
        'Les affectations existantes et toutes les notes déjà saisies seront conservées. ' +
        'La matière sortira des listes de saisie et des moyennes.'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.archiverMatiere(m.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Matière archivée (historique conservé).', 'info');
      refresh();
    });
  }

  refresh();
})();
