/* EduNeum - Table de routage unique.
   Toutes les navigations passent par ici : un menu par role, une seule source de verite. */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Theme (clair / sombre) : source unique pour tout le site.            */
  /* routes.js est charge dans le <head> de toutes les pages, donc        */
  /* l'application se fait AVANT le premier rendu : aucun flash.          */
  /* La cle localStorage « theme » est la cle historique deja utilisee     */
  /* par les pages existantes, on la conserve pour ne rien casser.         */
  /* ------------------------------------------------------------------ */
  var EduNeumTheme = (function () {
    var CLE = 'theme';

    function lire() {
      var v = null;
      try { v = localStorage.getItem(CLE); } catch (e) { }
      return v === 'dark' ? 'dark' : 'light';
    }

    function courant() {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }

    function appliquer(mode) {
      mode = mode === 'dark' ? 'dark' : 'light';
      var html = document.documentElement;
      html.classList.toggle('dark', mode === 'dark');
      html.classList.toggle('light', mode === 'light');
      return mode;
    }

    function basculer() {
      var mode = courant() === 'dark' ? 'light' : 'dark';
      appliquer(mode);
      try { localStorage.setItem(CLE, mode); } catch (e) { }
      return mode;
    }

    appliquer(lire());

    return { CLE: CLE, lire: lire, courant: courant, appliquer: appliquer, basculer: basculer };
  })();
  global.EduNeumTheme = EduNeumTheme;

  var ROUTES = {
    connexion: 'index.html',

    admin_dashboard: 'admin/tableau-de-bord.html',
    admin_annees: 'admin/annee-scolaire.html',
    admin_classes: 'admin/classes.html',
    admin_matieres: 'admin/matieres.html',
    admin_eleves: 'admin/eleves.html',
    admin_personnel: 'admin/personnel.html',
    admin_inscriptions: 'admin/inscriptions.html',
    admin_migrations: 'admin/migrations.html',
    admin_affectations: 'admin/affectations.html',
    admin_affectations_sg: 'admin/affectations-surveillants.html',
    admin_notes: 'admin/notes.html',
    admin_bulletins: 'admin/bulletins.html',
    admin_statistiques: 'admin/statistiques.html',
    admin_assiduite: 'admin/assiduite.html',
    admin_rapports: 'admin/rapports.html',
    admin_vie_scolaire: 'admin/vie-scolaire.html',
    admin_journal: 'admin/journal.html',
    admin_parametres: 'admin/parametres.html',

    censeur_dashboard: 'censeur/tableau-de-bord.html',
    censeur_vie_scolaire: 'censeur/vie-scolaire.html',
    censeur_assiduite: 'censeur/assiduite.html',
    censeur_eleves: 'censeur/eleves.html',
    censeur_classes: 'censeur/classes.html',
    censeur_notes: 'censeur/notes.html',
    censeur_rapports: 'censeur/rapports.html',
    censeur_statistiques: 'censeur/statistiques.html',
    censeur_profil: 'censeur/profil.html',

    teacher_dashboard: 'enseignant/tableau-de-bord.html',
    teacher_classes: 'enseignant/mes-classes.html',
    teacher_saisie: 'enseignant/saisie-notes.html',
    teacher_saisie_couplee: 'enseignant/saisie-notes-couplee.html',
    teacher_ma_classe: 'enseignant/ma-classe.html',
    teacher_rapports: 'enseignant/rapports.html',
    teacher_profil: 'enseignant/profil.html'
  };

  /* Chemin racine du site, deduit au chargement du script (js/core/routes.js). */
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) return null;
    var i = s.lastIndexOf('js/core/routes.js');
    return i === -1 ? null : s.slice(0, i);
  })();

  var MENUS = {
    admin: [
      { route: 'admin_dashboard', label: 'Tableau de bord', icon: 'layout-dashboard' },
      { route: 'admin_annees', label: 'Année scolaire', icon: 'calendar-range' },
      { route: 'admin_classes', label: 'Classes', icon: 'school' },
      { route: 'admin_matieres', label: 'Matières', icon: 'book-open' },
      { route: 'admin_eleves', label: 'Élèves', icon: 'users' },
      { route: 'admin_personnel', label: 'Personnel et enseignants', icon: 'id-card' },
      { route: 'admin_inscriptions', label: 'Inscriptions', icon: 'user-plus' },
      { route: 'admin_migrations', label: 'Migrations', icon: 'shuffle' },
      /* Menu déroulant : chaque sous-élément est une page distincte
         (pas de contenu mélangé). Le groupe n'a pas de route propre,
         layout.js le rend en accordéon et l'ouvre si une page fille
         est la page courante. */
      {
        label: 'Affectations', icon: 'link-2', enfants: [
          { route: 'admin_affectations', label: 'Enseignants', icon: 'link-2' },
          { route: 'admin_affectations_sg', label: 'Surveillants', icon: 'door-open' }
        ]
      },
      {
        label: 'Saisie des notes', icon: 'pencil-line', enfants: [
          { route: 'teacher_saisie', label: 'Saisie simple', icon: 'pencil-line' },
          { route: 'teacher_saisie_couplee', label: 'Saisie couplée', icon: 'columns-2' }
        ]
      },
      { route: 'admin_notes', label: 'Notes (suivi)', icon: 'file-text' },
      { route: 'admin_bulletins', label: 'Bulletins', icon: 'award' },
      { route: 'admin_statistiques', label: 'Statistiques', icon: 'bar-chart-3' },
      { route: 'admin_rapports', label: 'Rapports', icon: 'pie-chart', groupe: 'bas' },
      { route: 'admin_journal', label: 'Journal d\'audit', icon: 'history', groupe: 'bas' },
      { route: 'admin_parametres', label: 'Paramètres', icon: 'settings', groupe: 'bas' }
    ],
    censeur: [
      { route: 'censeur_dashboard', label: 'Tableau de bord', icon: 'layout-dashboard' },
      { route: 'censeur_vie_scolaire', label: 'Vie scolaire', icon: 'shield-alert' },
      { route: 'censeur_assiduite', label: 'Assiduité', icon: 'calendar-check' },
      { route: 'censeur_eleves', label: 'Élèves', icon: 'users' },
      { route: 'censeur_classes', label: 'Classes', icon: 'school' },
      { route: 'censeur_notes', label: 'Notes (suivi)', icon: 'file-text' },
      { route: 'censeur_rapports', label: 'Rapports', icon: 'bar-chart-3' },
      { route: 'censeur_statistiques', label: 'Statistiques', icon: 'bar-chart-3' },
      { route: 'censeur_profil', label: 'Profil', icon: 'circle-user', groupe: 'bas' }
    ],
    enseignant: [
      { route: 'teacher_dashboard', label: 'Tableau de bord', icon: 'layout-dashboard' },
      { route: 'teacher_classes', label: 'Mes classes', icon: 'school' },
      {
        label: 'Saisie des notes', icon: 'pencil-line', enfants: [
          { route: 'teacher_saisie', label: 'Saisie simple', icon: 'pencil-line' },
          { route: 'teacher_saisie_couplee', label: 'Saisie couplée', icon: 'columns-2' }
        ]
      },
      { route: 'teacher_rapports', label: 'Rapports', icon: 'bar-chart-3' },
      { route: 'admin_bulletins', label: 'Bulletins', icon: 'award', profPrincipalOnly: true },
      { route: 'teacher_ma_classe', label: 'Ma classe', icon: 'users-round', profPrincipalOnly: true },
      { route: 'teacher_profil', label: 'Profil', icon: 'circle-user' }
    ]
  };

  /* La direction dispose des memes ecrans que l'administrateur, SAUF la
     saisie des notes : elle consulte les resultats, elle n'ecrit aucune
     note (droits admin_notes / teacher_saisie, cote client et serveur).
     La saisie est desormais un groupe deroulant (simple + couplee) : on
     retire le groupe entier, pas une simple entree. */
  MENUS.direction = MENUS.admin.filter(function (i) {
    if (i.route === 'teacher_saisie' || i.route === 'teacher_saisie_couplee') return false;
    if (i.enfants && i.enfants.some(function (e) { return e.route === 'teacher_saisie'; })) return false;
    return true;
  });

  /* Le surveillant general est charge de l'enregistrement des heures
     d'absences : tableau de bord, assiduite et classes (lecture). */
  MENUS.surveillant = [
    { route: 'admin_dashboard', label: 'Tableau de bord', icon: 'layout-dashboard' },
    { route: 'censeur_assiduite', label: 'Absences', icon: 'calendar-check' },
    { route: 'admin_classes', label: 'Classes', icon: 'school' }
  ];

  /* Index par chemin COMPLET : les noms de fichiers ne suffisent pas
     (admin/tableau-de-bord.html et enseignant/tableau-de-bord.html). */
  var PATH_TO_ROUTE = (function () {
    var m = {};
    Object.keys(ROUTES).forEach(function (k) { m[ROUTES[k]] = k; });
    return m;
  })();

  function normaliser(p) {
    try { return decodeURIComponent(p).replace(/^\/+/, ''); } catch (e) { return p.replace(/^\/+/, ''); }
  }

  /* Chemin de la page courante, relatif a la racine du site. */
  function currentPath() {
    var p = normaliser(location.pathname);
    if (ROOT) {
      var root = normaliser(ROOT.replace(/^[a-z]+:\/\//i, '').replace(/^\/+/, ''));
      if (p.indexOf(root) === 0) p = p.slice(root.length);
    }
    p = p.replace(/^\/+/, '');
    return p || 'index.html';
  }

  function currentRouteKey() {
    return PATH_TO_ROUTE[currentPath()] || null;
  }

  function currentDir() {
    var p = currentPath();
    var i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
  }

  /* Chemin relatif depuis la page courante vers une route. */
  function resolve(routeKey) {
    var target = ROUTES[routeKey];
    if (!target) throw new Error('Route inconnue: ' + routeKey);
    var from = currentDir();
    if (!from) return target;
    var a = from.split('/'), b = target.split('/');
    var i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    var out = [];
    for (var k = i; k < a.length; k++) out.push('..');
    for (var j = i; j < b.length; j++) out.push(b[j]);
    var p = out.join('/');
    return p.charAt(0) === '.' ? p : './' + p;
  }

  /* Filtre profPrincipalOnly (récursif : un groupe ne subsiste que si
     au moins un de ses sous-éléments reste visible). Sans opts, le menu
     du rôle est renvoyé tel quel. */
  function menuFor(role, opts) {
    var items = MENUS[role] || [];
    if (opts && typeof opts.profPrincipal === 'boolean') {
      var filtrer = function (liste) {
        var out = [];
        liste.forEach(function (it) {
          if (it.profPrincipalOnly && !opts.profPrincipal) return;
          var copie = it;
          if (it.enfants && it.enfants.length) {
            var enfants = filtrer(it.enfants);
            if (!enfants.length) return;
            copie = {};
            Object.keys(it).forEach(function (k) { copie[k] = it[k]; });
            copie.enfants = enfants;
          }
          out.push(copie);
        });
        return out;
      };
      return filtrer(items);
    }
    return items;
  }

  /* Premier élément du menu (feuille) correspondant à une route, y compris
     dans les groupes déroulants : sert au fil d'Ariane. */
  function trouverParRoute(items, route) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].route === route) return items[i];
      if (items[i].enfants && items[i].enfants.length) {
        var t = trouverParRoute(items[i].enfants, route);
        if (t) return t;
      }
    }
    return null;
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.routes = {
    ROUTES: ROUTES, MENUS: MENUS, resolve: resolve, menuFor: menuFor,
    trouverParRoute: trouverParRoute,
    currentPath: currentPath, currentRouteKey: currentRouteKey, currentDir: currentDir
  };
})(window);
