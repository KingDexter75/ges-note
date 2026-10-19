/* EduNeum - Layout partage : menu par role, fil d'Ariane, selecteur d'annee scolaire,
   profil et deconnexion. Remplace la navigation dupliquee des 14 pages sans
   toucher a leur contenu ni a leurs styles. */
(function (global) {
  'use strict';

  function core() { return global.EduNeum; }
  function store() { return core().store; }
  function routes() { return core().routes; }
  function auth() { return core().auth; }
  function ui() { return core().ui; }

  /* ------------------------------------------------------------------ */
  /* Selecteur d'annee scolaire : la donnee pilotante de toute l'app.     */
  /* ------------------------------------------------------------------ */
  /* L'annee consultee. Une annee CLOTUREE reste consultable : c'est
     l'historique, on ne la retire donc pas du selecteur. C'est
     acces.anneeVerrouillee() qui interdit ensuite toute ecriture. */
  function anneeChoisie() {
    var s = null;
    try { s = localStorage.getItem('eduneum.annee'); } catch (e) { }
    var st = store();
    if (s) {
      var a = st.anneeParId(s);
      if (a) return a;
    }
    return st.anneeActive();
  }

  /* Changer d'annee consultee ne doit PAS changer l'annee de travail :
     `active` designe l'annee dans laquelle on peut ecrire, et seule la
     page Annee scolaire (activerAnnee dans le store) la modifie. Le
     selecteur de l'en-tete change donc uniquement la consultation, ce qui
     permet de consulter une annee passee — cloturee ou non — en lecture
     seule. Aucune annee n'est donc refusee ici : c'est
     acces.anneeVerrouillee() qui interdit ensuite toute ecriture. */
  function definirAnnee(id) {
    var st = store();
    var a = st.anneeParId(id);
    if (!a) return null;
    try { localStorage.setItem('eduneum.annee', id); } catch (e) { }
    st.journaliser('annee.consultation', 'annee:' + id,
      'Consultation de ' + a.libelle + (a.cloturee || !a.active ? ' (lecture seule)' : ''),
      session() ? session().enseignantId : null);
    if (a.cloturee || !a.active) {
      ui().toast(a.libelle + ' : consultation en lecture seule.', 'info');
    }
    return a;
  }

  function session() { return auth().session(); }

  /* ------------------------------------------------------------------ */
  /* Fil d'Ariane                                                        */
  /* ------------------------------------------------------------------ */
  function filArianeHTML() {
    var R = routes();
    var key = R.currentRouteKey();
    var s = session();
    var items = [{ label: s && s.role === 'enseignant' ? 'Espace enseignant' : 'Administration', href: null }];
    if (key) {
      var item = R.trouverParRoute(R.menuFor(s ? s.role : 'admin'), key);
      items.push({ label: item ? item.label : key, href: null });
    }
    return items.map(function (it, i) {
      var last = i === items.length - 1;
      var txt = '<span class="' + (last ? 'text-gray-700 dark:text-gray-200 font-bold' : 'text-gray-400') + '">' + it.label + '</span>';
      if (!last) txt = '<a href="' + it.href + '" class="text-gray-400 hover:text-accent">' + it.label + '</a>' +
        '<iconify-icon icon="lucide:chevron-right" width="14" class="text-gray-300"></iconify-icon>';
      return txt;
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Menu lateral : genere depuis routes.MENUS, un seul par role         */
  /* ------------------------------------------------------------------ */
  function itemHTML(item, actif) {
    var href = routes().resolve(item.route);
    return '<a href="' + href + '" data-route="' + item.route + '"' +
      ' class="flex items-center space-x-3 p-3 rounded-xl transition-all ' +
      (actif ? 'nm-inset text-accent font-medium' : 'text-gray-500 hover:text-accent hover:nm-flat') + '">' +
      '<iconify-icon icon="lucide:' + item.icon + '" width="20"></iconify-icon>' +
      '<span>' + item.label + '</span></a>';
  }

  /* Un groupe déroulant (ex. Affectations > Enseignants / Surveillants) :
     le parent n'est pas un lien, il ouvre ou ferme ses sous-éléments.
     Il est déplié automatiquement si une page fille est la page courante. */
  function groupeHTML(item, ouvert) {
    var R = routes();
    var id = 'menu-groupe-' + item.enfants.map(function (e) { return e.route; }).join('-');
    return '<div class="menu-groupe" data-menu-groupe>' +
      '<button type="button" data-groupe-toggle="' + id + '" aria-expanded="' + (ouvert ? 'true' : 'false') + '"' +
      ' aria-controls="' + id + '"' +
      ' class="w-full flex items-center space-x-3 p-3 rounded-xl transition-all text-left ' +
      (ouvert ? 'nm-inset text-accent font-medium' : 'text-gray-500 hover:text-accent hover:nm-flat') + '">' +
      '<iconify-icon icon="lucide:' + item.icon + '" width="20"></iconify-icon>' +
      '<span>' + item.label + '</span>' +
      '<iconify-icon icon="lucide:chevron-down" width="16" class="ml-auto transition-transform duration-200 groupe-chevron"' +
      (ouvert ? ' style="transform: rotate(180deg);"' : '') + '></iconify-icon>' +
      '</button>' +
      '<div id="' + id + '" class="pl-4 mt-1 space-y-1 groupe-enfants' + (ouvert ? '' : ' hidden') + '">' +
      item.enfants.map(function (enfant) {
        return itemHTML(enfant, R.ROUTES[enfant.route] === R.currentPath());
      }).join('') +
      '</div></div>';
  }

  function monterMenu() {
    var aside = document.querySelector('aside');
    if (!aside) return false;
    var s = session();
    if (!s) return false;
    var R = routes();
    var courant = R.currentPath();
    var menu = R.menuFor(s.role, { profPrincipal: auth().estProfPrincipal() });

    /* On garde le bloc de marque (logo + nom) tel qu'il est. */
    var ancienNav = aside.querySelector(':scope > nav');
    var ancienBas = aside.querySelector(':scope > div.pt-4');
    var ancienSecond = aside.querySelectorAll(':scope > div')[1];

    function rendreItem(i) {
      if (i.enfants && i.enfants.length) {
        var actif = i.enfants.some(function (e) { return R.ROUTES[e.route] === courant; });
        return groupeHTML(i, actif);
      }
      return itemHTML(i, R.ROUTES[i.route] === courant);
    }

    var principaux = menu.filter(function (i) { return i.groupe !== 'bas'; });
    var bas = menu.filter(function (i) { return i.groupe === 'bas'; });
    var html = '<nav class="flex-1 space-y-2" id="eduneum-nav">' +
      principaux.map(rendreItem).join('') + '</nav>';
    if (bas.length) {
      html += '<div class="pt-4 border-t border-gray-300 dark:border-gray-700 space-y-2">' +
        bas.map(rendreItem).join('') + '</div>';
    }

    [ancienNav, ancienBas, ancienSecond].forEach(function (n) { if (n) n.remove(); });
    aside.insertAdjacentHTML('beforeend', html);

    /* Bascule des groupes déroulants (l'ouverture est mémorisée par groupe,
       sauf la page courante qui déplie toujours son groupe parent). */
    aside.querySelectorAll('[data-groupe-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var conteneur = document.getElementById(btn.getAttribute('data-groupe-toggle'));
        if (!conteneur) return;
        var ouvert = conteneur.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
        btn.classList.toggle('nm-inset', ouvert);
        btn.classList.toggle('text-accent', ouvert);
        btn.classList.toggle('font-medium', ouvert);
        btn.classList.toggle('text-gray-500', !ouvert);
        var chevron = btn.querySelector('.groupe-chevron');
        if (chevron) chevron.style.transform = ouvert ? 'rotate(180deg)' : '';
      });
    });
    return true;
  }

  /* Marque : si l'etablissement a un logo (data-URL stocke avec les
     parametres, voir parametres.js), il remplace l'icone generique dans
     l'en-tete de la barre laterale. Sans logo, le diplome par defaut est
     conserve. */
  function monterMarque() {
    var aside = document.querySelector('aside');
    if (!aside) return false;
    var marque = aside.querySelector(':scope > div');
    if (!marque) return false;
    var boite = marque.querySelector(':scope > div');
    if (!boite) return false;
    var etab = (store().parametres() || {}).etablissement || {};
    if (etab.logo) {
      boite.classList.remove('bg-accent', 'text-white');
      boite.classList.add('overflow-hidden', 'bg-transparent');
      boite.innerHTML = '<img src="' + etab.logo + '" alt="Logo de l\'établissement" class="w-full h-full object-contain">';
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Barre de contexte : fil d'Ariane + annee + profil + deconnexion     */
  /* ------------------------------------------------------------------ */
  /* Bandeau de lecture seule : il rend visible la regle que
     acces.verifierEcriture applique de facon invisible. Deux causes
     possibles — une annee non ecrivable (pas active / cloturee) OU un role
     sans droit d'ecriture sur le module courant (censeur) — et le bandeau
     doit les dire toutes les deux, sinon l'utilisateur ne comprend pas
     pourquoi la page est inerte. */
  function raisonLectureSeule() {
    var A = core().acces;
    if (!A) return null;
    var an = anneeChoisie();
    if (!an) return null;
    if (A.anneeVerrouillee()) {
      return {
        an: an, cause: 'annee',
        texte: 'Consultation seule — ' + an.libelle +
          (an.cloturee ? ' est clôturée' : ' n\'est pas l\'année active')
      };
    }
    /* role sans droit d'ecriture : on ne l'annonce que si le role autorise
       la lecture, sinon ce n'est pas un mode consultation mais un refus. */
    var s = session();
    if (s && A.moduleCourant() && A.peutLire(A.moduleCourant()) && !A.peutEcrire(A.moduleCourant())) {
      var lab = (auth().ROLE_LABEL && auth().ROLE_LABEL[s.role]) || s.role;
      return {
        an: an, cause: 'role',
        texte: 'Lecture seule — le rôle « ' + lab + ' » ne modifie pas le module « ' +
          A.libelleDe(A.moduleCourant()) + ' »'
      };
    }
    return null;
  }

  function bandeauLectureSeuleHTML() {
    var r = raisonLectureSeule();
    if (!r) return '';
    var ton = r.cause === 'role' ? 'sky' : 'amber';
    return '<div id="eduneum-lecture-seule" role="status" ' +
      'class="flex items-center gap-2 rounded-full px-4 py-2 bg-' + ton + '-500/10 text-' + ton +
      '-600 dark:text-' + ton + '-400 text-xs font-semibold">' +
      '<iconify-icon icon="lucide:lock" width="14"></iconify-icon>' +
      '<span>' + r.texte + '</span>' +
      '</div>';
  }

  function profilHTML() {
    var s = session();
    if (!s) return '';
    var an = anneeChoisie();
    var options = store().all('annees').map(function (a) {
      return '<option value="' + a.id + '"' + (an && a.id === an.id ? ' selected' : '') + '>' +
        a.libelle + (a.active ? ' (active)' : '') + '</option>';
    }).join('');
    return '<div class="flex flex-wrap items-center gap-3" id="eduneum-contexte">' +
      '<nav class="flex items-center gap-1 text-xs" aria-label="Fil d\'Ariane">' + filArianeHTML() + '</nav>' +
      bandeauLectureSeuleHTML() +
      '<div class="ml-auto flex items-center gap-3">' +
      '<label class="flex items-center gap-2 nm-inset rounded-full px-4 py-2">' +
      '<iconify-icon icon="lucide:calendar-range" width="16" class="text-accent"></iconify-icon>' +
      '<select id="eduneum-annee" class="bg-transparent border-none outline-none text-xs font-bold text-gray-600 dark:text-gray-300">' + options + '</select>' +
      '</label>' +
      '<button type="button" id="eduneum-profil" class="flex items-center gap-3 nm-flat rounded-2xl px-3 py-2 hover:nm-soft-convex transition-all">' +
      '<span class="w-8 h-8 rounded-full bg-gradient-to-tr from-accent to-purple-400 text-white flex items-center justify-center text-xs font-black">' +
      auth().initiales(s) + '</span>' +
      '<span class="text-left leading-tight"><span class="block text-xs font-bold">' + s.prenom + ' ' + s.nom + '</span>' +
      '<span class="block text-[10px] uppercase tracking-wider text-gray-400">' + auth().ROLE_LABEL[s.role] + '</span></span>' +
      '<iconify-icon icon="lucide:chevron-down" width="14" class="text-gray-400"></iconify-icon>' +
      '</button>' +
      '<button type="button" id="eduneum-deconnexion" title="Se déconnecter" aria-label="Se déconnecter" ' +
      'class="flex items-center gap-2 nm-flat rounded-2xl px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:nm-soft-convex transition-colors">' +
      '<iconify-icon icon="lucide:log-out" width="18"></iconify-icon>' +
      '<span class="hidden sm:inline text-xs font-bold">Déconnexion</span></button>' +
      '</div></div>';
  }

  /* Remplace le bandeau en place, sans reconstruire toute la barre :
     les pages appellent ceci apres avoir change d'annee. */
  function rafraichirBandeau() {
    var anc = document.getElementById('eduneum-lecture-seule');
    var html = bandeauLectureSeuleHTML();
    if (html) {
      if (anc) { anc.outerHTML = html; return true; }
      var fil = document.querySelector('#eduneum-contexte nav[aria-label]');
      if (fil) { fil.insertAdjacentHTML('afterend', html); return true; }
    } else if (anc) {
      anc.remove();
      return true;
    }
    return false;
  }

  function monterProfil() {
    var main = document.querySelector('main');
    if (!main || document.getElementById('eduneum-contexte')) return false;
    main.insertAdjacentHTML('afterbegin', '<div class="mb-6">' + profilHTML() + '</div>');
    brancherProfil();
    return true;
  }

  function brancherProfil() {
    var sel = document.getElementById('eduneum-annee');
    if (sel) {
      sel.addEventListener('change', function () {
        var a = definirAnnee(sel.value);
        if (a) { ui().toast('Année scolaire : ' + a.libelle, 'success'); setTimeout(function () { location.reload(); }, 500); }
      });
    }
    var btnDeco = document.getElementById('eduneum-deconnexion');
    if (btnDeco) btnDeco.addEventListener('click', deconnexion);
    var btn = document.getElementById('eduneum-profil');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var s = session();
      var an = anneeChoisie();
      var affectations = s.enseignantId
        ? store().affectationsDeEnseignant(s.enseignantId, an ? an.id : null).length : 0;
      ui().modal({
        titre: 'Mon profil',
        contenu:
          '<div class="space-y-2 text-sm">' +
          '<p><b>' + s.prenom + ' ' + s.nom + '</b></p>' +
          '<p class="text-gray-500">Rôle : ' + auth().ROLE_LABEL[s.role] + '</p>' +
          '<p class="text-gray-500">Courriel : ' + s.email + '</p>' +
          '<p class="text-gray-500">Année scolaire courante : ' + (an ? an.libelle : '—') + '</p>' +
          (s.enseignantId ? '<p class="text-gray-500">Affectations : ' + affectations + '</p>' : '') +
          (auth().estProfPrincipal() ? '<p class="text-accent font-bold">Professeur principal</p>' : '') +
          '</div>',
        actions: [
          { label: 'Changer le mot de passe', classe: 'nm-soft-convex', ferme: false, onClick: ouvrirChangementMotDePasse },
          { label: 'Verrouiller la session', classe: 'nm-soft-convex', onClick: deconnexion },
          { label: 'Fermer', classe: 'bg-accent text-white' }
        ]
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Changement de mot de passe : accessible a TOUT membre connecte via  */
  /* sa fiche « Mon profil ». Le mot de passe initial est attribue par    */
  /* l'administrateur a la creation du compte ; chacun peut ensuite le    */
  /* modifier librement.                                                  */
  /* ------------------------------------------------------------------ */
  function changerMotDePasse(actuel, nouveau) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/mot-de-passe/', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ actuel: actuel, nouveau: nouveau }));
      var j = {};
      try { j = JSON.parse(xhr.responseText || '{}'); } catch (e) { j = {}; }
      return { ok: xhr.status >= 200 && xhr.status < 300 && j.ok !== false, motif: j.motif || '' };
    } catch (e) {
      return { ok: false, motif: 'Serveur indisponible : changement impossible.' };
    }
  }

  function ouvrirChangementMotDePasse() {
    var fActuel = ui().champ({ label: 'Mot de passe actuel', type: 'password', requis: true });
    var fNouveau = ui().champ({ label: 'Nouveau mot de passe', type: 'password', requis: true });
    var fConfirm = ui().champ({ label: 'Confirmer le nouveau mot de passe', type: 'password', requis: true });

    function erreur(msg) {
      var el = document.getElementById('mdp-erreur');
      if (el) { el.textContent = msg; el.classList.remove('hidden'); }
    }

    ui().modal({
      titre: 'Changer mon mot de passe',
      contenu: '<div class="space-y-3" id="form-mdp"></div>' +
        '<p id="mdp-erreur" class="hidden text-xs font-bold text-red-500 mt-2"></p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Enregistrer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!ui().validerChamps([fActuel, fNouveau, fConfirm])) return false;
            if (fNouveau.valeur().length < 6) {
              erreur('Le nouveau mot de passe doit contenir au moins 6 caractères.'); return false;
            }
            if (fNouveau.valeur() !== fConfirm.valeur()) {
              erreur('Les deux mots de passe ne correspondent pas.'); return false;
            }
            var r = changerMotDePasse(fActuel.valeur(), fNouveau.valeur());
            if (!r.ok) { erreur(r.motif || 'Changement impossible.'); return false; }
            ui().toast('Mot de passe modifié.', 'success');
          }
        }
      ]
    });

    var f = document.getElementById('form-mdp');
    f.appendChild(fActuel.element);
    f.appendChild(fNouveau.element);
    f.appendChild(fConfirm.element);
  }

  function deconnexion() {
    ui().confirmer({
      titre: 'Déconnexion',
      message: 'Voulez-vous vraiment fermer la session ?'
    }).then(function (ok) {
      if (!ok) return;
      var s = session();
      if (s) store().journaliser('session.deconnexion', 'utilisateur:' + s.email, null, s.enseignantId);
      auth().deconnecter();
      location.replace(routes().resolve('connexion'));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Barre laterale : un bouton hamburger l'affiche et la masque.        */
  /*   - mobile (<= 850px) : la barre coulisse par-dessus la page ;      */
  /*   - bureau (> 850px)  : la barre se replie et le contenu s'elargit. */
  /* Deux etats distincts : `eduneum-sidebar-ouverte` (mobile) et        */
  /* `eduneum-barre-reduite` (bureau). Le CSS choisit le rendu.          */
  /* ------------------------------------------------------------------ */
  function estMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 850px)').matches;
  }

  function estOuvert() {
    if (estMobile()) return document.body.classList.contains('eduneum-sidebar-ouverte');
    return !document.body.classList.contains('eduneum-barre-reduite');
  }

  function memoireBarreReduite(valeur) {
    try {
      if (valeur) localStorage.setItem('eduneum.barreReduite', '1');
      else localStorage.removeItem('eduneum.barreReduite');
    } catch (e) { /* mode prive : l'etat reste simplement non persiste */ }
  }

  /* Meme logique pour le tiroir mobile : l'etat ouvert/ferme survit a la
     navigation, sinon la barre se refermait a chaque changement de page. */
  function memoireSidebarOuverte(valeur) {
    try {
      if (valeur) localStorage.setItem('eduneum.sidebarOuverte', '1');
      else localStorage.removeItem('eduneum.sidebarOuverte');
    } catch (e) { /* mode prive : l'etat reste simplement non persiste */ }
  }

  function majBoutonMenu() {
    var btn = document.getElementById('eduneum-menu-btn');
    var ouvert = estOuvert();
    if (btn) {
      btn.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
      btn.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      var ic = btn.querySelector('iconify-icon');
      if (ic) ic.setAttribute('icon', ouvert ? 'lucide:x' : 'lucide:menu');
    }
    var toggle = document.getElementById('eduneum-barre-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      /* L'icone doit refleter l'action a venir : barre ouverte -> replier
         (panneau ferme), barre repliee -> deplier (panneau ouvert). */
      var ic2 = toggle.querySelector('iconify-icon');
      if (ic2) ic2.setAttribute('icon', ouvert ? 'lucide:panel-left-close' : 'lucide:panel-left-open');
    }
  }

  function ouvrirMenuMobile() {
    if (estMobile()) {
      document.body.classList.add('eduneum-sidebar-ouverte');
      memoireSidebarOuverte(true);
    } else { document.body.classList.remove('eduneum-barre-reduite'); memoireBarreReduite(false); }
    majBoutonMenu();
  }

  function fermerMenuMobile() {
    if (!estOuvert()) return;
    if (estMobile()) {
      document.body.classList.remove('eduneum-sidebar-ouverte');
      memoireSidebarOuverte(false);
    } else { document.body.classList.add('eduneum-barre-reduite'); memoireBarreReduite(true); }
    majBoutonMenu();
  }

  function basculerMenuMobile() {
    if (estOuvert()) fermerMenuMobile(); else ouvrirMenuMobile();
  }

  /* Etat initial au chargement : on restaure le repli/depliage choisi, aussi
     bien pour la barre laterale de bureau que pour le tiroir mobile, afin que
     la navigation d'une page a l'autre ne referme plus le menu. */
  function appliquerEtatInitial() {
    var ouvert = false;
    try { ouvert = localStorage.getItem('eduneum.sidebarOuverte') === '1'; } catch (e) { }
    if (!estMobile()) {
      var reduite = false;
      try { reduite = localStorage.getItem('eduneum.barreReduite') === '1'; } catch (e) { }
      if (reduite) document.body.classList.add('eduneum-barre-reduite');
    } else if (ouvert) {
      document.body.classList.add('eduneum-sidebar-ouverte');
    }
    majBoutonMenu();
  }

  function monterNavigationMobile() {
    var aside = document.querySelector('aside');
    if (!aside) return false;

    if (!document.getElementById('eduneum-menu-btn')) {
      var btn = document.createElement('button');
      btn.id = 'eduneum-menu-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Ouvrir le menu');
      btn.setAttribute('aria-controls', 'eduneum-nav');
      btn.className = 'nm-soft-convex rounded-2xl text-gray-600 dark:text-gray-300 hover:text-accent transition-colors';
      btn.innerHTML = '<iconify-icon icon="lucide:menu" width="22"></iconify-icon>';
      btn.addEventListener('click', basculerMenuMobile);
      document.body.appendChild(btn);
    }

    /* Hamburger dans l'en-tete de la barre : sur bureau il replie/deplie la
       barre. Sur mobile c'est la croix du tiroir qui sert (voir le CSS). */
    var marque = aside.querySelector(':scope > div');
    if (marque && !document.getElementById('eduneum-barre-toggle')) {
      var toggle = document.createElement('button');
      toggle.id = 'eduneum-barre-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Afficher ou masquer le menu');
      toggle.setAttribute('aria-controls', 'eduneum-nav');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.className = 'ml-auto nm-inset rounded-xl w-9 h-9 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-accent transition-colors';
      toggle.innerHTML = '<iconify-icon icon="lucide:menu" width="18"></iconify-icon>';
      toggle.addEventListener('click', basculerMenuMobile);
      marque.appendChild(toggle);
    }

    /* Croix de fermeture : placee dans l'en-tete du tiroir, elle n'est
       visible que sur petit ecran (voir eduneum-core.css). */
    if (marque && !document.getElementById('eduneum-menu-close')) {
      var close = document.createElement('button');
      close.id = 'eduneum-menu-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Fermer le menu');
      close.className = 'ml-auto nm-inset rounded-xl w-9 h-9 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-accent transition-colors';
      close.innerHTML = '<iconify-icon icon="lucide:x" width="18"></iconify-icon>';
      close.addEventListener('click', fermerMenuMobile);
      marque.appendChild(close);
    }

    if (!document.querySelector('.sidebar-overlay')) {
      var voie = document.createElement('div');
      voie.className = 'sidebar-overlay';
      voie.addEventListener('click', fermerMenuMobile);
      document.body.appendChild(voie);
    }

    /* Les ecouteurs globaux ne sont poses qu'une seule fois. */
    if (!document.body.dataset.eduneumNav) {
      document.body.dataset.eduneumNav = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.keyCode === 27) fermerMenuMobile();
      });
      /* Le menu reste OUVERT quand on suit un lien : il n'y a plus de
         refermeture automatique. L'etat est memorise et restaure sur la page
         suivante ; l'utilisateur ferme lui-meme le tiroir (croix, overlay,
         ou changement de plage d'ecran). */
      /* Passage mobile <-> bureau : chaque etat de repli n'a de sens que
         dans sa plage. On neutralise l'etat devenu sans objet et on met le
         bouton a jour, pour que la barre reste toujours accessible. */
      var derniereLargeur = window.innerWidth;
      window.addEventListener('resize', function () {
        var changementDePlage = estMobile() !== (derniereLargeur <= 850);
        derniereLargeur = window.innerWidth;
        if (!changementDePlage) return;
        if (estMobile()) {
          document.body.classList.remove('eduneum-barre-reduite');
        } else {
          document.body.classList.remove('eduneum-sidebar-ouverte');
        }
        majBoutonMenu();
      });
    }

    majBoutonMenu();
    return true;
  }

  /* Bascule de theme : on ne cree le bouton que si la page n'en a pas.
     Une seule source de verite (EduNeumTheme), qui applique et persiste. */
  function basculerTheme() {
    if (global.EduNeumTheme) global.EduNeumTheme.basculer();
    else document.documentElement.classList.toggle('dark');
  }

  function monterTheme() {
    var existant = document.getElementById('theme-toggle');
    if (existant) {
      if (!existant.dataset.eduneum) {
        existant.dataset.eduneum = '1';
        existant.addEventListener('click', basculerTheme);
      }
      return;
    }
    var ancre = document.getElementById('eduneum-contexte');
    if (!ancre) return;
    ancre.insertAdjacentHTML('beforeend',
      '<button id="theme-toggle" class="w-10 h-10 nm-soft-convex rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-accent transition-colors">' +
      '<iconify-icon icon="lucide:sun" class="dark:hidden" width="20"></iconify-icon>' +
      '<iconify-icon icon="lucide:moon" class="hidden dark:block" width="20"></iconify-icon></button>');
    monterTheme();
  }

  /* ------------------------------------------------------------------ */
  function init() {
    if (!core() || !core().routes) return;

    /* 1. connexion obligatoire */
    if (core().auth) {
      var s = core().auth.exigerAcces();
      if (!s) return; /* redirection en cours */
    }

    /* 2. controle d'acces centralise : la matrice d'acces.js decide si le
          role courant a le droit d'ouvrir CETTE page. Toutes les pages
          passent par la, donc aucune ne peut contourner la garde. */
    if (core().acces) {
      if (!core().acces.exiger(core().acces.moduleCourant())) return;
    }

    monterMenu();
    monterMarque();
    monterProfil();
    monterNavigationMobile();
    /* Restaure le repli choisi sur bureau : sans cet appel, l'etat
       memorise dans localStorage n'etait jamais reapplique au chargement
       et la barre revenait toujours depliee. */
    appliquerEtatInitial();
    monterTheme();
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.layout = {
    init: init, monterMenu: monterMenu, monterMarque: monterMarque, monterProfil: monterProfil,
    filArianeHTML: filArianeHTML, anneeChoisie: anneeChoisie, definirAnnee: definirAnnee,
    bandeauLectureSeuleHTML: bandeauLectureSeuleHTML, rafraichirBandeau: rafraichirBandeau,
    deconnexion: deconnexion
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else init();
})(window);
