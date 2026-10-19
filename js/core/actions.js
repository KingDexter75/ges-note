/* EduNeum - Actions declaratives (delegation d'evenements).

   But : retirer le JavaScript du balisage. Un attribut onclick="exportData('pdf')"
   melange trois choses dans la meme ligne (structure, style et comportement) et
   oblige a evaluer une chaine dans la page. On le remplace par un attribut
   declaratif, et le comportement est branche ici.

       <button data-action="exportData@click" data-arg1="pdf">  -> exportData('pdf')
       <input  data-action="searchStudents@input">              -> searchStudents()
       <circle data-action="showTooltip@mouseover;hideTooltip@mouseout"
               data-arg1="0" data-arg2="10.5" data-event>
                                                            -> survol : showTooltip(0, 10.5, evenement)
                                                              sortie : hideTooltip(0, 10.5, evenement)

   L'evenement est toujours precise (@click, @input, ...). C'est indispensable :
   la delegation ecoute plusieurs types d'evenements sur le document, donc une
   action sans precision repondrait aussi au survol et au clic. Le champ de
   recherche, dont le gestionnaire d'origine etait oninput="searchStudents()",
   declencherait ainsi une recherche a chaque passage de la souris.

   Un element ne portant qu'un seul attribut data-action ne peut declarer qu'une
   seule action : c'est un attribut HTML, il ne peut pas se repeter. Quand un
   meme element doit repondre a deux evenements differents, les actions sont
   listees separees par des points-virgules. Les arguments (data-arg1, data-arg2)
   sont portes par l'element et donc partages par ses actions.

   Les arguments sont lus dans l'ordre (data-arg1, data-arg2, ...) et transmis
   comme chaines : c'est suffisant ici, tous les arguments existants sont des
   libelles ou des identifiants. Un element portant data-event recoit en plus
   l'objet evenement en dernier argument, ce qui evite de reconstruire un
   evenement a la main.

   RENDU INCHANGE : seuls des attributs sont ajoutes ou retires. Aucune classe,
   aucun style inline, aucune structure de noeud n'est touchee.

   La delegation se fait sur document, donc :
     - elle fonctionne pour les elements inseres plus tard par le JS (tableaux
       filtres, lignes de incidents, contenu de modales) ;
     - elle reproduit le comportement d'un attribut inline, y compris la
       propagation vers les ancetres qui portent aussi data-action, et l'arret
       premature si un gestionnaire appelle event.stopPropagation().

   Aucune dependance externe : les fonctions visees sont resolues sur window,
   ou les declarations de fonction de niveau superieur vivent deja. */
(function (global) {
  'use strict';

  var EVENEMENTS = ['click', 'change', 'input', 'submit', 'mouseover', 'mouseout'];

  /* Les arguments sont lus dans l'ordre (data-arg1, data-arg2, ...) et transmis
     comme chaines. Pour ne pas perdre le type d'un litteral numerique, une
     valeur prefixee par "n:" est convertie en nombre :

         data-action="deleteIncident" data-arg1="n:1"   -> deleteIncident(1)
         data-action="filterByStat" data-arg1="absent"  -> filterByStat('absent')

     Sans ce prefixe, '1' et '03' resteraient des chaines : c'est voulu, car un
     libelle comme "03" (moyenne affichee) ne doit pas devenir un nombre.

     Un element portant data-event recoit en plus l'objet evenement en dernier
     argument, ce qui evite de reconstruire un evenement a la main. */
  function valeurDe(brut) {
    return brut.indexOf('n:') === 0 ? Number(brut.slice(2)) : brut;
  }

  function argsDe(el) {
    var args = [];
    for (var i = 1; ; i++) {
      var nom = 'data-arg' + i;
      if (!el.hasAttribute(nom)) break;
      args.push(valeurDe(el.getAttribute(nom)));
    }
    return args;
  }

function parseActions(brut) {
        return String(brut).split(';').map(function (item) {
          item = item.trim();
          if (!item) return null;
          var at = item.indexOf('@');
          /* Sans @evenement, l'action repond a tous les types delegates : la
             migration en met toujours un, cette forme reste acceptee pour un
             ajout manuel. */
          return at < 0
            ? { nom: item, evenement: null }
            : { nom: item.slice(0, at).trim(), evenement: item.slice(at + 1).trim() };
        }).filter(Boolean);
      }

      function executer(el, type, event) {
        parseActions(el.getAttribute('data-action')).forEach(function (action) {
          /* Une action peut etre reservee a un evenement : c'est necessaire
             quand un seul element porte deux gestionnaires (un cercle de
             graphique affiche une bulle au survol et la masque a la sortie). */
          if (action.evenement && action.evenement !== type) return;

          var nom = action.nom;
          var fn = global[nom];
          if (typeof fn !== 'function') {
            /* Action declaree mais fonction absente : on le signale une fois plutot
               que de rester muet, sinon le clic semble simplement sans effet. */
            if (executer._signales[nom]) return;
            executer._signales[nom] = true;
            if (global.console && console.warn) console.warn('EduNeum.actions : fonction introuvable « ' + nom + ' »');
            return;
          }
          var args = argsDe(el);
          /* this reste l'element : une action peut relire ses propres attributs. */
          if (el.hasAttribute('data-event')) args.push(event);
          fn.apply(el, args);
        });
      }
      executer._signales = {};

      /* Sur un evenement delegue, currentTarget vaut document : il faut retrouver
         l'element porteur de data-action en remontant depuis la cible. */
      function deleguer(event) {
        var el = event.target;
        while (el && el !== document) {
          if (el.getAttribute && el.getAttribute('data-action')) {
            executer(el, event.type, event);
            /* Un stopPropagation() appele dans le gestionnaire empeche aussi
               l'attribut inline de l'ancetre de s'executer : on respecte la
               meme arret. */
            if (event.cancelBubble) return;
          }
          el = el.parentNode;
        }
      }


  var branche = false;
  function installer() {
    if (branche) return;
    branche = true;
    EVENEMENTS.forEach(function (type) {
      document.addEventListener(type, deleguer, false);
    });
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.actions = { installer: installer, EVENEMENTS: EVENEMENTS };
})(window);
