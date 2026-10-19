/* EduNeum - Session, roles et garde de route.
   La session est geree par le serveur (Django) : elle est injectee dans la
   page (window.__EDUNEUM_SESSION__) et la connexion/deconnexion passent par
   l'API /api/auth/... Il n'existe plus de repli localStorage : le controle
   reel de l'acces est applique cote serveur (eduneum/views.py), le garde de
   route ci-dessous n'est qu'une contrainte d'INTERFACE. */
(function (global) {
  'use strict';

  var SERVER = !!global.__EDUNEUM_SERVER__;
  var ROLE_LABEL = {
    admin: 'Administrateur', direction: 'Direction', censeur: 'Censeur',
    surveillant: 'Surveillant général', enseignant: 'Enseignant'
  };

  /* Session courante : elle vient toujours de la page servie par Django. */
  function session() {
    return global.__EDUNEUM_SESSION__ || null;
  }

  function definirSession(s) {
    global.__EDUNEUM_SESSION__ = s;
    return s;
  }

  /* Deconnexion : on efface la session cote serveur. La requete est synchrone
     pour que la redirection qui suit parte avec le cookie deja efface, sinon
     la page de connexion renverrait vers le tableau de bord (session encore
     valide). */
  function deconnecter() {
    global.__EDUNEUM_SESSION__ = null;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/auth/logout/', false);
      xhr.send(null);
    } catch (e) { /* ignore */ }
  }

  function estConnecte() { return !!session(); }

  function estAdmin() {
    var s = session();
    return !!s && (s.role === 'admin' || s.role === 'direction' || s.role === 'censeur');
  }

  function estEnseignant() {
    var s = session();
    return !!s && s.role === 'enseignant';
  }

  /* Droits derives du menu du role (recursif : un groupe déroulant
     n'a pas de route propre, seules ses pages filles comptent). */
  var DROITS = {};
  function compilerDroits() {
    var R = global.EduNeum.routes;
    function chemins(items) {
      var out = [];
      items.forEach(function (i) {
        if (i.enfants && i.enfants.length) {
          chemins(i.enfants).forEach(function (c) { out.push(c); });
        } else if (R.ROUTES[i.route]) {
          out.push(R.ROUTES[i.route]);
        }
      });
      return out;
    }
    Object.keys(R.MENUS).forEach(function (role) {
      DROITS[role] = chemins(R.MENUS[role]);
    });
  }

  function peutAcceder(routeKey) {
    var s = session();
    if (!s || !routeKey) return false;
    var R = global.EduNeum.routes;
    if (!DROITS[s.role]) compilerDroits();
    var cibles = DROITS[s.role] || [];
    return cibles.indexOf(R.ROUTES[routeKey]) !== -1;
  }

  /* Un censeur ne gere pas les parametres ni le personnel. */
  function estLectureSeule() {
    var s = session();
    return !!s && s.role === 'censeur';
  }

  function estProfPrincipal() {
    var s = session();
    if (!s || !s.enseignantId) return false;
    var store = global.EduNeum.store;
    var an = store.anneeActive();
    if (!an) return false;
    return store.all('profsPrincipaux').some(function (p) {
      return p.enseignantId === s.enseignantId && p.anneeId === an.id;
    });
  }

  /* Garde de route : redirige vers la connexion si non connecte, vers le bon
     tableau de bord si le role n'a pas le droit d'ouvrir la page. */
  function exigerAcces() {
    var routes = global.EduNeum.routes;
    var s = session();
    var page = routes.currentPath().split('/').pop();
    if (page === 'index.html') return s;
    if (!s) {
      location.replace(routes.resolve('connexion') + '?suite=' + encodeURIComponent(routes.currentPath()));
      return null;
    }
    var key = routes.currentRouteKey();
    if (key && !peutAcceder(key)) {
      location.replace(routes.resolve(s.role === 'enseignant' ? 'teacher_dashboard' : 'admin_dashboard'));
      return null;
    }
    return s;
  }

  function accueilPour(role) {
    return role === 'enseignant' ? 'teacher_dashboard' : 'admin_dashboard';
  }

  function initiales(s) {
    if (!s) return '?';
    return ((s.prenom || '').charAt(0) + (s.nom || '').charAt(0)).toUpperCase();
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.auth = {
    SERVER: SERVER, ROLE_LABEL: ROLE_LABEL,
    session: session, definirSession: definirSession, deconnecter: deconnecter,
    estConnecte: estConnecte, estAdmin: estAdmin, estEnseignant: estEnseignant, estLectureSeule: estLectureSeule,
    peutAcceder: peutAcceder, estProfPrincipal: estProfPrincipal,
    exigerAcces: exigerAcces, accueilPour: accueilPour, initiales: initiales
  };
})(window);
