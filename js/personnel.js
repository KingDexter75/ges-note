/* EduNeum - Personnel : fiches, fonctions, comptes de connexion.

   Trois fonctions seulement : ENSEIGNANT (saisie des notes, censeur,
   PP), DIRECTION (administration sans notes) et SURVEILLANT GENERAL
   (SG : saisie des heures d'absence sur ses classes attribuees).
   Chaque membre a un compte de connexion dont le telephone est
   l'identifiant.

   Regle d'archivage : un membre encore_PP est refuse, car retirer le PP
   laisserait la classe sans titulaire. Le store porte la regle ; l'ecran
   annonce le refus avant meme la confirmation. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.acces.exiger('admin_personnel')) return;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  /* Les fonctions possibles sont celles acceptees par le store : la liste
     est donc identique des deux cotes, sinon le formulaire proposerait des
     valeurs que le store refuserait. */
  var FONCTIONS = [
    { valeur: 'enseignant', libelle: 'Enseignant' },
    { valeur: 'direction', libelle: 'Direction' },
    { valeur: 'surveillant', libelle: 'Surveillant général (SG)' }
  ];
  function libelleFonction(f) {
    var x = FONCTIONS.filter(function (y) { return y.valeur === f; })[0];
    return x ? x.libelle : f;
  }

  /* Toutes les fonctions donnent un compte de connexion. Seul un
     ADMINISTRATEUR peut creer ces comptes : tout passe par /api/comptes/
     qui refuse les autres roles cote serveur. */
  var ROLE_PAR_FONCTION = { enseignant: 'enseignant', direction: 'direction', surveillant: 'surveillant' };

  /* Comptes existants, indexes par identifiant de membre. Charges une fois. */
  var COMPTES = {};
  function chargerComptes() {
    COMPTES = {};
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/comptes/', false);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        var rep = JSON.parse(xhr.responseText || '{}');
        (rep.comptes || []).forEach(function (c) { COMPTES[c.enseignantId] = c; });
      }
    } catch (e) { /* pas de comptes affiches si le serveur ne repond pas */ }
  }

  function normaliserTel(v) {
    return String(v || '').replace(/\s+/g, '').replace(/^\+237/, '');
  }
  function telValide(t) { return /^6\d{8}$/.test(t); }

  /* Un numero deja pris par un AUTRE membre rendrait la connexion ambigue. */
  function telDejaPris(tel, saufId) {
    return Object.keys(COMPTES).some(function (id) {
      return id !== saufId && COMPTES[id].telephone === tel;
    });
  }

  /* Appel synchrone (comme le reste de l'appli) a l'API des comptes. */
  function appelerCompte(payload) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/comptes/', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(payload));
      var j = {};
      try { j = JSON.parse(xhr.responseText || '{}'); } catch (e) { j = {}; }
      return { ok: xhr.status >= 200 && xhr.status < 300 && j.ok !== false, motif: j.motif || '' };
    } catch (e) {
      return { ok: false, motif: 'Serveur indisponible : compte non enregistré.' };
    }
  }

  chargerComptes();

  /* Charge de l'annee consultee : c'est ce qui rend un membre pertinent ou
     non, et c'est la seule annee ou ses affectations comptent. */
  function affectationsDe(p) {
    return S.affectationsDe(an.id).filter(function (a) { return a.enseignantId === p.id && !a.archive; });
  }
  function classesDe(p) {
    var ids = affectationsDe(p).map(function (a) { return a.classeId; });
    return ids.filter(function (v, i, a) { return a.indexOf(v) === i; })
      .map(function (id) { return S.classeParId(id); })
      .filter(function (c) { return c; });
  }
  /* ppDeClasse renvoie l'identifiant de l'enseignant PP (une chaine), pas un
     objet : on compare donc l'identifiant, sinon la colonne resterait vide et
     le garde-fou d'archivage ne se déclencherait jamais. */
  function ppDeClasseDe(p) {
    return S.classesDe(an.id).filter(function (c) {
      return !c.archive && S.ppDeClasse(c.id) === p.id;
    });
  }

  function refresh() {
    var tous = S.all('enseignants');
    var actifs = tous.filter(function (p) { return !p.archive; });
    var archivees = tous.filter(function (p) { return p.archive; });
    var enseignants = actifs.filter(function (p) { return p.fonction === 'enseignant'; });
    var sansCharge = actifs.filter(function (p) {
      return p.fonction === 'enseignant' && affectationsDe(p).length === 0;
    });
    var pp = actifs.filter(function (p) { return ppDeClasseDe(p).length > 0; });

    var optionsFonction = [{ valeur: '', libelle: 'Toutes les fonctions' }].concat(
      FONCTIONS.filter(function (f) { return actifs.some(function (p) { return p.fonction === f.valeur; }); })
        .map(function (f) { return { valeur: f.valeur, libelle: f.libelle }; }));

    var table = UI.tableau({
      lignes: actifs,
      placeholderRecherche: 'Rechercher un nom ou un matricule…',
      parPage: 12,
      nomExport: 'personnel-' + an.libelle,
      messageVide: 'Aucun membre du personnel.',
      filtres: [{ cle: 'fonction', options: optionsFonction }],
      filtreValeur: function (l, k) { return String(l[k]); },
      colonnes: [
        {
          cle: 'nom', titre: 'Membre',
          valeurTri: function (p) { return p.nom + ' ' + p.prenom; },
          rendu: function (p) {
            return '<div class="flex items-center gap-3">' +
              '<div class="w-9 h-9 rounded-xl nm-inset flex items-center justify-center text-xs font-black text-accent shrink-0">' +
              P.esc((p.prenom || '?').charAt(0) + (p.nom || '?').charAt(0)) + '</div>' +
              '<div><p class="font-bold">' + P.esc(p.nom + ' ' + p.prenom) + '</p>' +
              '<p class="text-xs text-gray-400">' + P.esc(p.matricule) + '</p></div></div>';
          }
        },
        {
          cle: 'fonction', titre: 'Fonction',
          rendu: function (p) {
            return '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + P.esc(libelleFonction(p.fonction)) + '</span>';
          }
        },
        {
          cle: 'compte', titre: 'Compte de connexion',
          valeurTri: function (p) { return COMPTES[p.id] ? COMPTES[p.id].telephone : ''; },
          rendu: function (p) {
            var c = COMPTES[p.id];
            if (!c || c.actif === false) {
              return '<span class="text-xs font-bold text-amber-500">aucun compte</span>';
            }
            return '<span class="text-xs text-gray-500">' + P.esc(c.telephone) + '</span>' +
              '<span class="block text-[10px] uppercase tracking-wider text-gray-400">' + P.esc(E.auth.ROLE_LABEL[c.role] || c.role) + '</span>';
          }
        },
        {
          cle: 'classes', titre: 'Charge ' + an.libelle, triable: false,
          valeurTri: function (p) { return classesDe(p).length; },
          rendu: function (p) {
            var cs = classesDe(p);
            if (p.fonction !== 'enseignant') {
              return '<span class="text-xs text-gray-400">sans charge d\'enseignement</span>';
            }
            if (!cs.length) return '<span class="text-xs font-bold text-amber-500">non affecté</span>';
            return '<span class="text-xs font-bold text-accent">' + P.esc(cs.map(function (c) { return c.nom; }).join(', ')) + '</span>';
          }
        },
        {
          cle: 'pp', titre: 'Professeur principal', triable: false,
          valeurTri: function (p) { return ppDeClasseDe(p).length; },
          rendu: function (p) {
            var liste = ppDeClasseDe(p);
            return liste.length
              ? '<span class="text-xs font-bold text-blue-500">' + P.esc(liste.map(function (c) { return c.nom; }).join(', ')) + '</span>'
              : '<span class="text-xs text-gray-400">—</span>';
          }
        },
        {
          cle: 'actions', titre: '', triable: false, classe: 'text-right',
          rendu: function (p) { return actions(p); }
        }
      ]
    });

    var sectionPersonnel = P.avecTableau(
      P.section({
        titre: 'Personnel de l\'établissement', icone: 'id-card',
        actions: '<button type="button" id="btn-nouveau-membre" class="py-2.5 px-5 bg-accent text-white font-bold rounded-2xl text-xs flex items-center gap-2">' +
          P.ico('plus', 14) + 'Nouveau membre</button>',
        contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
      }),
      table
    );

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Membres actifs', valeur: String(actifs.length), icone: 'id-card' }),
        P.carte({ label: 'Enseignants', valeur: String(enseignants.length), icone: 'users-round', couleur: 'text-blue-500' }),
        P.carte({
          label: 'Professeurs principaux', valeur: String(pp.length), icone: 'user-round-cog',
          couleur: 'text-accent'
        }),
        P.carte({
          label: 'Enseignants sans charge', valeur: String(sansCharge.length), icone: 'circle-alert',
          couleur: sansCharge.length ? 'text-amber-500' : 'text-green-500'
        })
      ]),

      sectionPersonnel,

      archivees.length ? P.section({
        titre: 'Personnel archivé', icone: 'archive',
        contenu: '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
          archivees.map(function (p) {
            return '<div class="nm-inset rounded-2xl p-4 flex items-center justify-between">' +
              '<div><p class="font-bold text-sm">' + P.esc(p.nom + ' ' + p.prenom) + '</p>' +
              '<p class="text-xs text-gray-400">' + P.esc(libelleFonction(p.fonction)) + '</p></div>' +
              '<span class="text-xs text-gray-400">archivé</span></div>';
          }).join('') + '</div>'
      }) : ''
    ]);

    var btn = document.getElementById('btn-nouveau-membre');
    if (btn) btn.addEventListener('click', function () { formulaire(null); });
  }

  /* ------------------------------ Actions --------------------------------- */
  function actions(p) {
    var groupe = document.createElement('div');
    groupe.className = 'flex items-center justify-end gap-2';
    var bFiche = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-blue-500', title: 'Fiche', html: P.ico('contact', 14)
    });
    bFiche.addEventListener('click', function () { fiche(p); });
    var bEdit = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-accent', title: 'Modifier', html: P.ico('pencil', 14)
    });
    bEdit.addEventListener('click', function () { formulaire(p); });
    /* Miroir de la page Classes : la on designe le PROFESSEUR, ici on
       choisit sa CLASSE. Reservé aux membres dont la fonction est
       « enseignant ». */
    var bPP = null;
    if (p.fonction === 'enseignant') {
      bPP = UI.el('button', {
        class: 'p-2 nm-soft-convex rounded-lg text-blue-500',
        title: 'Nommer professeur principal d\'une classe', html: P.ico('user-round-cog', 14)
      });
      bPP.addEventListener('click', function () { nommerPP(p); });
    }
    var bArch = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-red-500', title: 'Archiver', html: P.ico('archive', 14)
    });
    bArch.addEventListener('click', function () { archiver(p); });
    groupe.appendChild(bFiche);
    groupe.appendChild(bEdit);
    if (bPP) groupe.appendChild(bPP);
    groupe.appendChild(bArch);
    return groupe;
  }

  /* --------------------- Professeur principal ---------------------------- */
  /* Chaque classe de l'annee consultee est proposee avec son effectif et
     son PP actuel, pour que le remplacement soit visible avant validation.
     Le store recontrole les deux regles : une seule classe par PP par
     annee, et le PP sortant de la classe choisie est remplace. */
  function nommerPP(p) {
    var classes = S.classesDe(an.id).filter(function (c) { return !c.archive; });
    if (!classes.length) { UI.toast('Aucune classe pour ' + an.libelle + '.', 'error'); return; }

    var options = [{ valeur: '', libelle: '— Choisir une classe —' }].concat(
      classes.map(function (c) {
        var ppId = S.ppDeClasse(c.id);
        var pp = ppId ? S.enseignantParId(ppId) : null;
        var n = S.elevesDeClasse(c.id, an.id).length;
        return {
          valeur: c.id,
          libelle: c.nom + ' — ' + n + ' élève(s) — ' + (pp
            ? (ppId === p.id ? 'PP actuel' : 'PP : ' + pp.prenom + ' ' + pp.nom)
            : 'sans PP')
        };
      }));

    var fClasse = UI.champ({
      label: 'Classe à diriger en ' + an.libelle, type: 'select', requis: true, options: options
    });

    var deja = ppDeClasseDe(p);
    UI.modal({
      titre: 'Nommer professeur principal',
      contenu: '<div class="space-y-3" id="form-nommer-pp"></div>' +
        '<p class="text-xs text-gray-500">' +
        (deja.length
          ? '<b>' + P.esc(p.prenom + ' ' + p.nom) + '</b> est déjà professeur principal de <b>' +
            P.esc(deja.map(function (c) { return c.nom; }).join(', ')) +
            '</b> : un professeur principal ne dirige qu\'une seule classe par année.'
          : 'Un professeur principal ne dirige qu\'une seule classe par année. Si la classe choisie a déjà un PP, il est remplacé.') +
        '</p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Nommer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fClasse])) return false;
            if (!fClasse.valeur()) { UI.toast('Choisissez une classe.', 'error'); return false; }
            var r = S.definirPP(fClasse.valeur(), p.id);
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast(p.prenom + ' ' + p.nom + ' est maintenant professeur principal.', 'success');
            refresh();
          }
        }
      ]
    });
    document.getElementById('form-nommer-pp').appendChild(fClasse.element);
  }

  /* ------------------------------- Fiche ---------------------------------- */
  function fiche(p) {
    var cs = classesDe(p);
    var aff = affectationsDe(p);
    var pps = ppDeClasseDe(p);

    UI.modal({
      titre: p.nom + ' ' + p.prenom,
      contenu: '<div class="space-y-3 text-sm">' +
        '<div class="grid grid-cols-2 gap-3">' +
        ligne('Matricule', p.matricule) +
        ligne('Fonction', libelleFonction(p.fonction)) +
        ligne('Compte de connexion', (function () {
          var c = COMPTES[p.id];
          if (!c || c.actif === false) return 'Aucun (à créer)';
          return c.telephone + ' · ' + (E.auth.ROLE_LABEL[c.role] || c.role);
        })()) +
        ligne('Téléphone (identifiant)', p.telephone || '—') +
        ligne('Créé le', p.dateCreation ? UI.dateFr(p.dateCreation) : '—') +
        '</div>' +
        '<div class="pt-2"><p class="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Affectations ' + P.esc(an.libelle) + '</p>' +
        (aff.length
          ? '<ul class="space-y-1">' + aff.map(function (a) {
            var c = S.classeParId(a.classeId), m = S.matiereParId(a.matiereId);
            return '<li class="nm-inset rounded-xl px-3 py-2 text-xs">' +
              P.esc((c ? c.nom : '?') + ' · ' + (m ? m.nom : '?')) + '</li>';
          }).join('') + '</ul>'
          : '<p class="text-xs text-gray-400">Aucune affectation.</p>') + '</div>' +
        '<div class="pt-2"><p class="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Professeur principal</p>' +
        (pps.length
          ? '<p class="text-xs font-bold text-blue-500">' + P.esc(pps.map(function (c) { return c.nom; }).join(', ')) + '</p>'
          : '<p class="text-xs text-gray-400">—</p>') + '</div>' +
        '</div>',
      actions: [
        { label: 'Fermer', classe: 'nm-soft-convex' },
        { label: 'Modifier', classe: 'bg-accent text-white', onClick: function () { formulaire(p); } }
      ]
    });
  }
  function ligne(label, valeur) {
    return '<div class="nm-inset rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-gray-400">' +
      P.esc(label) + '</p><p class="font-bold">' + P.esc(valeur) + '</p></div>';
  }

  /* ---------------------------- Formulaire -------------------------------- */
  function formulaire(p) {
    var fNom = UI.champ({ label: 'Nom', valeur: p ? p.nom : '', requis: true });
    var fPre = UI.champ({ label: 'Prénom', valeur: p ? p.prenom : '', requis: true });
    var fMat = UI.champ({ label: 'Matricule', valeur: p ? p.matricule : '', placeholder: 'Vac (vacataire) si vide' });
    var fFonction = UI.champ({
      label: 'Fonction', type: 'select', requis: true,
      valeur: p ? p.fonction : 'enseignant', options: FONCTIONS
    });
    var telExistant = p ? (p.telephone || (COMPTES[p.id] ? COMPTES[p.id].telephone : '')) : '';
    var fTel = UI.champ({
      label: 'Téléphone (identifiant de connexion)', valeur: telExistant,
      requis: true, placeholder: '6XXXXXXXX'
    });
    var fMdp = UI.champ({
      label: p ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Mot de passe initial',
      type: 'password', placeholder: p ? '••••••' : '6 caractères minimum'
    });

    UI.modal({
      titre: p ? 'Modifier le membre' : 'Nouveau membre du personnel',
      contenu: '<div class="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4" id="form-personnel"></div>' +
        '<p class="text-xs text-gray-500 mt-3">Le <b>téléphone</b> est l\'identifiant de connexion et le <b>mot de passe</b> initial est attribué par l\'administrateur ; ' +
        'le membre pourra le changer une fois connecté. Trois fonctions : <b>enseignant</b> (saisie des notes, censeur, PP), ' +
        '<b>direction</b> (administration sans notes) et <b>surveillant général</b> (heures d\'absence sur ses classes attribuées).</p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: p ? 'Enregistrer' : 'Créer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fNom, fPre, fMat, fFonction, fTel])) return false;
            var fonction = fFonction.valeur();
            var tel = normaliserTel(fTel.valeur());
            var mdp = fMdp.valeur();

            /* Validation AVANT toute ecriture : le membre ne doit pas etre
               cree si le compte qui l'accompagne est invalide. */
            if (!telValide(tel)) { UI.toast('Numéro de téléphone invalide (format CM : 6XXXXXXXX).', 'error'); return false; }
            if (telDejaPris(tel, p ? p.id : null)) { UI.toast('Ce numéro est déjà utilisé par un autre compte.', 'error'); return false; }
            if (!p && mdp.length < 6) { UI.toast('Le mot de passe initial doit contenir au moins 6 caractères.', 'error'); return false; }
            if (p && mdp && mdp.length < 6) { UI.toast('Le nouveau mot de passe doit contenir au moins 6 caractères.', 'error'); return false; }

            var payload = {
              nom: fNom.valeur(), prenom: fPre.valeur(), matricule: fMat.valeur(),
              fonction: fonction, telephone: tel
            };
            var r = p ? S.modifierEnseignant(p.id, payload) : S.creerEnseignant(payload);
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }

            var id = p ? p.id : r.id;
            var rc = appelerCompte({
              enseignantId: id, telephone: tel, role: ROLE_PAR_FONCTION[fonction],
              nom: payload.nom, prenom: payload.prenom, motDePasse: mdp
            });
            if (!rc.ok) { UI.toast(rc.motif || 'Compte non enregistré.', 'error'); return false; }

            UI.toast(p ? 'Fiche mise à jour.' : 'Membre du personnel créé.', 'success');
            chargerComptes();
            refresh();
          }
        }
      ]
    });

    var f = document.getElementById('form-personnel');
    f.appendChild(fNom.element); f.appendChild(fPre.element);
    f.appendChild(fMat.element); f.appendChild(fFonction.element);
    f.appendChild(fTel.element);
    f.appendChild(fMdp.element);
  }

  /* ----------------------------- Archivage --------------------------------- */
  /* Le refus PP est annonce AVANT la confirmation : inutile de faire
     remplir une modale pour un echec previsible. Le store recontrole. */
  function archiver(p) {
    var pps = ppDeClasseDe(p);
    if (pps.length) {
      UI.toast('Ce membre est professeur principal de ' + pps.map(function (c) { return c.nom; }).join(', ') +
        ' : désignez son remplaçant avant de l\'archiver.', 'error');
      return;
    }
    var n = affectationsDe(p).length;
    UI.confirmer({
      titre: 'Archiver le membre',
      message: 'Archiver <b>' + P.esc(p.nom + ' ' + p.prenom) + '</b> ?<br><br>' +
        (n ? 'Ses <b>' + n + '</b> affectation(s) de ' + P.esc(an.libelle) + ' seront libérées. ' : '') +
        'Son compte est désactivé et l\'historique des notes qu\'il a saisies est conservé.'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.archiverEnseignant(p.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return; }
      if (COMPTES[p.id]) { appelerCompte({ enseignantId: p.id, actif: false }); chargerComptes(); }
      UI.toast('Membre archivé' + (r.affectationsLiberees
        ? ' — ' + r.affectationsLiberees + ' affectation(s) libérée(s).' : '.'), 'info');
      refresh();
    });
  }

  refresh();
})();
