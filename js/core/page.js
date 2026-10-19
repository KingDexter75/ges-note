/* EduNeum - Briques de page reutilisees par les modules (KPI, sections,
   selecteurs classes / matieres / trimestres lies a l'annee courante).
   S'appuie sur le layout partage et le service de calcul unique. */
(function (global) {
  'use strict';

  function core() { return global.EduNeum; }
  function ui() { return core().ui; }
  function store() { return core().store; }
  function calculs() { return core().calculs; }
  function auth() { return core().auth; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ico(n, w) { return '<iconify-icon icon="lucide:' + n + '" width="' + (w || 18) + '"></iconify-icon>'; }

  /* ------------------------------ Coquille ------------------------------ */
  function titre() {
    var n = document.querySelector('main h1');
    return n ? n.textContent.trim() : document.title;
  }

  function contenu() { return document.getElementById('contenu'); }

  /* ------------------------------ Sections ------------------------------ */
  function section(opts) {
    return '<section class="space-y-5" id="' + (opts.id || '') + '">' +
      '<div class="flex flex-wrap items-center justify-between gap-3">' +
      '<h2 class="text-lg font-bold display-font flex items-center gap-2">' +
      (opts.icone ? '<span class="text-accent">' + ico(opts.icone, 20) + '</span>' : '') + esc(opts.titre) + '</h2>' +
      (opts.actions ? '<div class="flex flex-wrap items-center gap-2">' + opts.actions + '</div>' : '') +
      '</div>' + (opts.contenu || '') + '</section>';
  }

  function carte(opts) {
    return '<div class="p-6 rounded-[32px] transition-all duration-200 hover:-translate-y-0.5 group nm-flat">' +
      '<div class="flex justify-between items-start">' +
      '<div><p class="text-xs font-bold text-gray-400 uppercase tracking-widest">' + esc(opts.label) + '</p>' +
      '<h3 class="text-2xl font-black mt-1 display-font">' + (opts.valeurHtml || esc(opts.valeur)) + '</h3></div>' +
      '<div class="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform nm-inset ' +
      (opts.couleur || 'text-accent') + '">' + ico(opts.icone || 'activity', 20) + '</div>' +
      '</div>' +
      (opts.note ? '<div class="mt-4 flex items-center text-xs font-medium px-2 py-1 rounded-full w-fit nm-inset text-gray-500">' + esc(opts.note) + '</div>' : '') +
      '</div>';
  }

  function grilleKPI(cartes, classes) {
    return '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">' + cartes.join('') + '</div>';
  }

  /* Construit une section puis y accroche un tableau : evite tout comptage
     d'elements par indice, qui casse des qu'une section est ajoutee. */
  function avecTableau(htmlSection, tableau) {
    var wrap = document.createElement('div');
    wrap.innerHTML = htmlSection;
    var section = wrap.firstElementChild;
    var boite = section ? section.querySelector('.nm-flat') : null;
    if (boite && tableau) boite.appendChild(tableau.element);
    return section;
  }

  /* ---------------------------- Selecteurs ----------------------------- */
  function classesDeAnneeCourante() { return store().classesDe(core().layout.anneeChoisie().id); }

  function optionsClasses(anneeId, valeur) {
    return classesDeAnneeCourante().map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === valeur ? ' selected' : '') + '>' + esc(c.nom) + '</option>';
    }).join('');
  }

  function optionsMatieres(classeId, valeur) {
    if (!classeId) return '';
    return store().matieresDeClasse(classeId).map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === valeur ? ' selected' : '') + '>' +
        esc(m.nom) + ' (coef. ' + store().coefficient(classeId, m.id) + ')</option>';
    }).join('');
  }

  function optionsTrimestres(anneeId, valeur) {
    return store().trimestresDe(anneeId).map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === valeur ? ' selected' : '') + '>' + esc(t.libelle) + '</option>';
    }).join('');
  }

  function optionsPeriodes(anneeId, valeur) {
    return optionsTrimestres(anneeId, valeur) +
      '<option value="annuel"' + (valeur === 'annuel' ? ' selected' : '') + '>Année complète</option>';
  }

  function liste(attributs, options) {
    return '<select ' + attributs + ' class="nm-soft-convex px-4 py-2 rounded-xl text-xs font-bold border-none">' + options + '</select>';
  }

  /* ------------------------- Acces : refus ecriture ------------------- */
  /* On ne teste plus seulement le role : la matrice d'acces sait aussi
     qu'une annee passee est en lecture seule, et que le censeur n'ecrit
     rien. Une page qui se base sur cette question affiche donc ses
     formulaires exactement la ou l'ecriture sera acceptee. */
  function peutEcrire(mod) {
    var s = auth().session();
    if (!s) return false;
    var A = core().acces;
    if (!A) return s.role === 'admin';
    return A.peutEcrire(mod || A.moduleCourant());
  }

  /* Le bandeau du contenu reprend la cause reelle du refus : annee non
     ecritable ou role sans droit, pour que la regle reste comprehensible. */
  function bandeauLectureSeule() {
    if (peutEcrire()) return '';
    var A = core().acces;
    var motif = 'Votre rôle ne permet pas de modifier les données de l\'établissement.';
    var an = core().layout ? core().layout.anneeChoisie() : null;
    if (A && an && A.anneeVerrouillee && A.anneeVerrouillee()) {
      motif = 'Année scolaire « ' + an.libelle + ' » : ' +
        (an.cloturee ? 'clôturée' : 'non active') + ', elle reste consultable mais non modifiable.';
    }
    return '<div class="p-5 rounded-[32px] nm-flat bg-amber-500/5 border border-amber-500/20 flex items-start gap-3">' +
      '<span class="text-amber-500 mt-0.5">' + ico('lock', 18) + '</span>' +
      '<div><p class="text-sm font-bold">Consultation seule</p>' +
      '<p class="text-xs text-gray-500 dark:text-gray-400">' + esc(motif) + '</p>' +
      '</div></div>';
  }

  /* --------------------------- Journal d'audit -------------------------- */
  function tracer(action, cible, details) {
    var s = auth().session();
    store().journaliser(action, cible, details, s ? s.enseignantId : null);
  }

  /* ------------------------ Confirmation obligatoire ------------------- */
  function confirmerSuppression(quoi, puis) {
    return ui().confirmer({
      titre: 'Suppression',
      message: 'Voulez-vous vraiment supprimer ' + quoi + ' ? Cette action est irréversible et sera inscrite au journal d\'audit.'
    }).then(function (ok) {
      if (!ok) return false;
      tracer('suppression', quoi, null);
      if (puis) puis();
      return true;
    });
  }

  /* ------------------------------ Rendu final --------------------------- */
  /* Accepte une chaine HTML, un noeud DOM, ou un melange des deux (tableau). */
  function rendre(blocs) {
    var c = contenu();
    if (!c) return;
    c.innerHTML = bandeauLectureSeule();
    var liste = Array.isArray(blocs) ? blocs : [blocs];
    liste.forEach(function (b) {
      if (b === null || b === undefined) return;
      if (b.nodeType) c.appendChild(b);
      else c.insertAdjacentHTML('beforeend', b);
    });
    if (global.iconify) global.iconify.play();
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.page = {
    esc: esc, ico: ico, titre: titre, contenu: contenu, rendre: rendre,
    section: section, carte: carte, grilleKPI: grilleKPI, avecTableau: avecTableau,
    optionsClasses: optionsClasses, optionsMatieres: optionsMatieres,
    optionsTrimestres: optionsTrimestres, optionsPeriodes: optionsPeriodes, liste: liste,
    peutEcrire: peutEcrire, bandeauLectureSeule: bandeauLectureSeule, tracer: tracer,
    confirmerSuppression: confirmerSuppression, classesDeAnneeCourante: classesDeAnneeCourante
  };
})(window);
