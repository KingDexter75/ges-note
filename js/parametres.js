/* EduNeum - Parametres : regles de calcul (bareme, moyenne de passage, arrondi)
   et gestion des annees scolaires, des matieres et des coefficients par classe. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  var enLecture = !P.peutEcrire();

  /* --------------------------- Regles de calcul ------------------------ */
  function sectionRegles() {
    var par = S.parametres();
    var bareme = par.baremeAppreciation.map(function (b) {
      return '<div class="flex items-center gap-2"><input type="number" step="0.5" min="0" max="20" value="' + b.min +
        '" data-seuil="' + b.min + '" ' + (enLecture ? 'disabled' : '') +
        ' class="w-20 nm-inset rounded-xl px-3 py-2 text-sm text-center font-bold text-accent"><span class="text-sm">' + P.esc(b.label) + '</span></div>';
    }).join('');

    return P.section({
      titre: 'Règles de calcul', icone: 'sigma',
      contenu: '<div class="nm-flat p-6 rounded-[32px] space-y-6">' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="regles-chiffres">' +
        '<div class="space-y-1"><label class="block text-xs font-bold uppercase tracking-wider text-gray-400">Moyenne de passage</label>' +
        '<input type="number" step="0.5" min="0" max="20" id="p-moyenne-passage" value="' + par.moyennePassage + '"' +
        (enLecture ? ' disabled' : '') + ' class="w-full nm-inset rounded-xl px-3 py-2 text-sm font-bold text-accent"></div>' +
        '<div class="space-y-1"><label class="block text-xs font-bold uppercase tracking-wider text-gray-400">Décimales d\'arrondi</label>' +
        '<input type="number" min="0" max="4" id="p-arrondi" value="' + par.arrondi + '"' +
        (enLecture ? ' disabled' : '') + ' class="w-full nm-inset rounded-xl px-3 py-2 text-sm font-bold text-accent"></div>' +
        '<div class="space-y-1 flex items-end"><button type="button" id="p-save"' + (enLecture ? ' disabled' : '') +
        ' class="w-full py-2 px-4 bg-accent text-white font-bold rounded-2xl text-xs">Enregistrer</button></div>' +
        '</div>' +
        '<div><p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Barème des appréciations automatiques</p>' +
        '<div class="space-y-2" id="bareme-seuils">' + bareme + '</div></div>' +
        '<p class="text-xs text-gray-500">Ces règles s\'appliquent partout : bulletins, statistiques et suivi des notes.</p>' +
        '</div>'
    });
  }

  /* --------------------------- Annees scolaires ------------------------ */
  function sectionAnnees() {
    var lignes = S.all('annees').map(function (a) {
      return {
        libelle: a.libelle, periode: UI.dateFr(a.dateDebut) + ' → ' + UI.dateFr(a.dateFin),
        trimestres: a.trimestres.length, etat: a.cloturee ? 'Clôturée' : (a.active ? 'Active' : 'Inactive'), id: a.id
      };
    });
    var table = UI.tableau({
      lignes: lignes,
      colonnes: [
        { cle: 'libelle', titre: 'Année scolaire' },
        { cle: 'periode', titre: 'Période', triable: false },
        { cle: 'trimestres', titre: 'Trimestres' },
        {
          cle: 'etat', titre: 'État', triable: false,
          rendu: function (l) {
            return '<span class="pastille ' + (l.etat === 'Active' ? 'vert' : l.etat === 'Clôturée' ? 'rouge' : 'gris') + '">' + l.etat + '</span>';
          }
        }
      ],
      messageVide: 'Aucune année scolaire.'
    });
    var bloc = P.avecTableau(
      P.section({
        titre: 'Années scolaires', icone: 'calendar-range',
        contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>',
        actions: enLecture ? '' : '<button type="button" id="btn-nouvelle-annee" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent flex items-center gap-2">' +
          P.ico('plus', 14) + 'Nouvelle année</button>'
      }),
      table);

    if (!enLecture) {
      var b = document.getElementById('btn-nouvelle-annee');
      if (b) b.addEventListener('click', creerAnnee);
    }
    return bloc;
  }

  function creerAnnee() {
    var f = {};
    var lib = UI.champ({ label: 'Libellé', placeholder: '2026-2027', requis: true, valeur: anneeSuivante() });
    var deb = UI.champ({ label: 'Début', type: 'date', requis: true, valeur: nouvelleDate(1) });
    var fin = UI.champ({ label: 'Fin', type: 'date', requis: true, valeur: nouvelleDate(2) });
    UI.modal({
      titre: 'Nouvelle année scolaire',
      contenu: '<div class="space-y-4" id="form-annee"></div>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Créer', classe: 'bg-accent text-white', onClick: function () {
            if (!UI.validerChamps([lib, deb, fin])) return false;
            if (fin.valeur() <= deb.valeur()) { UI.toast('La date de fin doit suivre la date de début.', 'error'); return; }
            var r = S.creerAnnee({ libelle: lib.valeur(), dateDebut: deb.valeur(), dateFin: fin.valeur() });
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast('Année scolaire créée.', 'success');
            setTimeout(function () { location.reload(); }, 600);
          }
        }
      ]
    });
    var form = document.getElementById('form-annee');
    form.appendChild(lib.element); form.appendChild(deb.element); form.appendChild(fin.element);
  }

  function anneeSuivante() {
    var a = S.all('annees').slice().sort(function (x, y) { return x.dateDebut < y.dateDebut ? -1 : 1; }).pop();
    if (!a) return '2025-2026';
    var d = parseInt(a.libelle.slice(0, 4), 10);
    return isNaN(d) ? a.libelle : (d + 1) + '-' + (d + 2);
  }
  function nouvelleDate(mois) {
    var d = new Date();
    d.setFullYear(d.getFullYear() + (mois === 1 ? 1 : 1));
    d.setMonth(mois === 1 ? 8 : 5, mois === 1 ? 1 : 30);
    return d.toISOString().slice(0, 10);
  }

  /* ------------------------- Coeff par classe -------------------------- */
  function sectionCoefficients() {
    var classes = S.classesDe(an ? an.id : null);
    var matieres = S.all('matieres').filter(function (m) { return !m.archive; });
    var lignes = [];
    classes.forEach(function (c) {
      matieres.forEach(function (m) {
        lignes.push({
          classe: c.nom, classeId: c.id, matiere: m.nom, matiereId: m.id,
          coefficient: S.coefficient(c.id, m.id) || 0
        });
      });
    });
    var table = UI.tableau({
      lignes: lignes, parPage: 20, placeholderRecherche: 'Filtrer une classe ou une matière…',
      colonnes: [
        { cle: 'classe', titre: 'Classe' },
        { cle: 'matiere', titre: 'Matière' },
        {
          cle: 'coefficient', titre: 'Coefficient', triable: true,
          rendu: function (l) {
            return '<input type="number" min="0" max="20" step="0.5" value="' + l.coefficient + '" data-classe="' + l.classeId +
              '" data-matiere="' + l.matiereId + '"' + (enLecture ? ' disabled' : '') +
              ' class="w-20 nm-inset rounded-xl px-3 py-2 text-sm text-center font-bold text-accent">';
          }
        }
      ],
      export: false,
      messageVide: 'Créez une classe et une matière pour définir les coefficients.'
    });
    return P.avecTableau(
      P.section({
        titre: 'Coefficients par classe', icone: 'percent',
        contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' +
          (enLecture ? '' : '<p class="text-xs text-gray-500">Un coefficient à 0 retire la matière de la classe. La modification est enregistrée automatiquement.</p>')
      }),
      table);
  }

  /* ------------------------------ Donnees ------------------------------ */
  function sectionDonnees() {
    var compte = function (coll) { return S.all(coll).length; };
    return P.section({
      titre: 'Données', icone: 'database',
      contenu: '<div class="nm-flat p-6 rounded-[32px] flex flex-wrap items-center justify-between gap-6">' +
        '<div class="flex flex-wrap gap-6 text-sm text-gray-500">' +
        '<span><b>' + compte('eleves') + '</b> élèves</span>' +
        '<span><b>' + compte('enseignants') + '</b> personnels</span>' +
        '<span><b>' + compte('classes') + '</b> classes</span>' +
        '<span><b>' + compte('matieres') + '</b> matières</span>' +
        '<span><b>' + compte('notes') + '</b> notes</span>' +
        '<span><b>' + compte('journal') + '</b> entrées de journal</span>' +
        '</div>' +
        (enLecture ? '' :
          '<button type="button" id="btn-reset" class="px-5 py-3 nm-soft-convex rounded-2xl text-xs font-bold text-red-500 flex items-center gap-2">' +
          P.ico('rotate-ccw', 14) + 'Réinitialiser les données de démonstration</button>') +
        '</div>'
    });
  }

  P.rendre([
    enLecture ? P.bandeauLectureSeule() : '',
    sectionRegles(), sectionEtablissement(), sectionAnnees(), sectionCoefficients(), sectionDonnees()
  ]);

  /* ------------------ Identite de l'etablissement --------------------- */
  /* Ces informations apparaissent en tete des bulletins : elles sont donc
     saisies ici plutot que codees en dur dans une page. Le logo est lu par
     le navigateur puis stocke en data-URL, afin que le projet reste
     copiable d'une machine a l'autre sans fichier externe. */
  function sectionEtablissement() {
    var etab = S.parametres().etablissement;
    var apercu = etab.logo
      ? '<img src="' + P.esc(etab.logo) + '" alt="" class="w-14 h-14 object-contain nm-inset rounded-xl p-1">'
      : '<div class="w-14 h-14 rounded-xl bg-accent text-white flex items-center justify-center font-black text-xl nm-soft-convex">' +
        P.esc(S.initialesEtablissement(etab)) + '</div>';

    return P.section({
      titre: 'Identité de l\'établissement', icone: 'landmark',
      actions: enLecture ? '' : '<button type="button" id="p-save-etablissement" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent">Enregistrer</button>',
      contenu: '<div class="nm-flat p-6 rounded-[32px] flex flex-col md:flex-row gap-6 items-start">' +
        '<div class="flex flex-col items-center gap-2 shrink-0">' + apercu +
        (enLecture ? '' : '<label class="text-[10px] uppercase tracking-widest text-gray-400 cursor-pointer">' +
          '<input type="file" id="p-logo" accept="image/*" class="hidden">Changer le logo</label>') +
        '</div>' +
        '<div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4" id="p-form-etablissement">' +
        '<div><label class="text-[10px] uppercase tracking-widest text-gray-400">Nom de l\'établissement</label>' +
        '<input id="p-etab-nom" type="text" value="' + P.esc(etab.nom) + '"' +
        (enLecture ? ' disabled' : '') + ' class="mt-1 w-full nm-inset bg-transparent rounded-xl px-4 py-2.5 text-sm"></div>' +
        '<div><label class="text-[10px] uppercase tracking-widest text-gray-400">Sigle</label>' +
        '<input id="p-etab-sigle" type="text" value="' + P.esc(etab.sigle) + '" maxlength="8"' +
        (enLecture ? ' disabled' : '') + ' class="mt-1 w-full nm-inset bg-transparent rounded-xl px-4 py-2.5 text-sm"></div>' +
        '<div class="md:col-span-2"><label class="text-[10px] uppercase tracking-widest text-gray-400">Adresse</label>' +
        '<input id="p-etab-adresse" type="text" value="' + P.esc(etab.adresse || '') + '" maxlength="160"' +
        (enLecture ? ' disabled' : '') + ' class="mt-1 w-full nm-inset bg-transparent rounded-xl px-4 py-2.5 text-sm"></div>' +
        '<div class="md:col-span-2"><label class="text-[10px] uppercase tracking-widest text-gray-400">Téléphone</label>' +
        '<input id="p-etab-telephone" type="text" value="' + P.esc(etab.telephone || '') + '" maxlength="40"' +
        (enLecture ? ' disabled' : '') + ' class="mt-1 w-full nm-inset bg-transparent rounded-xl px-4 py-2.5 text-sm"></div>' +
        '</div></div>' +
        '<p class="text-xs text-gray-500 mt-3">Le sigle remplace le logo par des initiales. ' +
        'Le logo est conservé dans les données du navigateur, pas sur le disque.</p>'
    });
  }

  /* ------------------------- Branchement actions ----------------------- */
  if (!enLecture) {
    /* Recharge la page seulement une fois l'enregistrement confirme par le
       serveur : recharger trop tot relirait l'ancien etat (transaction en
       cours) et donnerait l'impression que rien n'a change. */
    function rechargerApresSauvegarde() {
      var p = S.flush ? S.flush() : null;
      if (p && typeof p.then === 'function') p.then(function () { location.reload(); });
      else setTimeout(function () { location.reload(); }, 600);
    }

    /* Identite de l'etablissement : nom, sigle et logo. */
    var saveEtab = document.getElementById('p-save-etablissement');
    var nouveauLogo = '';
    var champLogo = document.getElementById('p-logo');
    if (champLogo) champLogo.addEventListener('change', function () {
      var f = champLogo.files && champLogo.files[0];
      if (!f) return;
      if (f.size > 300 * 1024) { UI.toast('Image trop lourde (300 Ko maximum).', 'error'); return; }
      var lecteur = new FileReader();
      lecteur.onload = function () { nouveauLogo = String(lecteur.result || ''); };
      lecteur.readAsDataURL(f);
    });
    if (saveEtab) saveEtab.addEventListener('click', function () {
      var r = S.definirEtablissement({
        nom: document.getElementById('p-etab-nom').value,
        sigle: document.getElementById('p-etab-sigle').value,
        logo: nouveauLogo || S.parametres().etablissement.logo,
        adresse: document.getElementById('p-etab-adresse').value,
        telephone: document.getElementById('p-etab-telephone').value
      });
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Identité de l\'établissement enregistrée.', 'success');
      rechargerApresSauvegarde();
    });

    var save = document.getElementById('p-save');
    if (save) save.addEventListener('click', function () {
      var mp = Number(document.getElementById('p-moyenne-passage').value);
      var ar = Number(document.getElementById('p-arrondi').value);
      if (isNaN(mp) || mp < 0 || mp > 20) { UI.toast('Moyenne de passage invalide (0 à 20).', 'error'); return; }
      if (isNaN(ar) || ar < 0 || ar > 4) { UI.toast('Nombre de décimales invalide (0 à 4).', 'error'); return; }
      /* Une seule ecriture pour tout le bloc : soit les regles passent
         ensemble, soit rien n'est enregistre et le message est explicite.
         Les libelles existants sont conserves, seul le seuil est editable. */
      var labels = S.parametres().baremeAppreciation.map(function (b) { return b.label; });
      var bareme = Array.prototype.map.call(document.querySelectorAll('#bareme-seuils input'), function (i, k) {
        return { min: Number(i.value), label: labels[k] || '' };
      });
      var r = S.enregistrerRegles({ moyennePassage: mp, arrondi: ar, bareme: bareme });
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Règles enregistrées.', 'success');
      rechargerApresSauvegarde();
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.dataset || !t.dataset.classe) return;
      var v = Number(t.value);
      if (isNaN(v) || v < 0 || v > 20) { UI.toast('Coefficient invalide (0 à 20).', 'error'); t.value = S.coefficient(t.dataset.classe, t.dataset.matiere) || 0; return; }
      S.definirCoefficient(t.dataset.classe, t.dataset.matiere, v);
      P.tracer('coefficient.modification', 'classe:' + t.dataset.classe, 'Matière ' + t.dataset.matiere + ' → coefficient ' + v);
      UI.toast('Coefficient enregistré.', 'success');
    });

    var reset = document.getElementById('btn-reset');
    if (reset) reset.addEventListener('click', function () {
      UI.confirmer({
        titre: 'Réinitialisation',
        message: 'Toutes les données métier (classes, élèves, notes, inscriptions, affectations, journal) seront supprimées. L\'application repartira vide, sans aucune donnée de démonstration. Cette action est irréversible.'
      }).then(function (ok) {
        if (!ok) return;
        if (!S.reset()) { UI.toast('Réinitialisation impossible.', 'error'); return; }
        UI.toast('Données réinitialisées.', 'info');
        rechargerApresSauvegarde();
      });
    });
  }
})();
