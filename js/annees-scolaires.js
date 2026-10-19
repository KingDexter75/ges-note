/* EduNeum - Années scolaires : le calendrier qui commande tout le reste.
   Regles : une seule année ACTIVE (donc modifiable) ; une année clôturée ou
   inactive reste consultable mais verrouillée ; l'ouverture d'un trimestre
   et d'une séquence est ce qui autorise — ou non — la saisie des notes. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  /* Garde de route : acces.exiger() refuse ET redirige. layout.init()
     refait le meme controle au DOMContentLoaded ; cette garde evite
     simplement d'afficher le contenu avant la redirection. */
  if (!E.acces.exiger('admin_annees')) return;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();

  function refresh() {
    var toutes = S.all('annees').slice().sort(function (a, b) {
      return (a.dateDebut || '') < (b.dateDebut || '') ? 1 : -1;
    });
    var active = toutes.filter(function (a) { return a.active && !a.cloturee; })[0] || null;
    var cloturees = toutes.filter(function (a) { return a.cloturee; }).length;

    var table = UI.tableau({
      lignes: toutes,
      placeholderRecherche: 'Rechercher une année…',
      parPage: 10,
      nomExport: 'annees-scolaires',
      messageVide: 'Aucune année scolaire. Créez la première pour commencer.',
      colonnes: [
        {
          cle: 'libelle', titre: 'Année scolaire',
          rendu: function (a) {
            return '<div><p class="font-bold">' + P.esc(a.libelle) + '</p>' +
              '<p class="text-xs text-gray-400">' + UI.dateFr(a.dateDebut) + ' → ' + UI.dateFr(a.dateFin) + '</p></div>';
          }
        },
        {
          cle: 'etat', titre: 'État', triable: false,
          valeurTri: function (a) { return a.cloturee ? 2 : (a.active ? 0 : 1); },
          rendu: function (a) { return Pastille(a); }
        },
        {
          cle: 'trimestres', titre: 'Trimestres', triable: false,
          valeurTri: function (a) { return a.trimestres.length; },
          rendu: function (a) {
            return '<div class="flex flex-wrap gap-1">' + a.trimestres.map(function (t) {
              var c = t.valide ? 'green' : (t.ouvert ? 'blue' : 'gray');
              return '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-' + c + '-500">' +
                P.esc(t.libelle) + '</span>';
            }).join('') + '</div>';
          }
        },
        {
          cle: 'sequences', titre: 'Séquences', triable: false,
          valeurTri: function (a) { return S.sequencesDe(a.id).length; },
          rendu: function (a) {
            var seq = S.sequencesDe(a.id);
            return '<span class="text-xs font-bold">' + seq.filter(function (s) { return s.ouverte; }).length +
              ' ouvertes</span><span class="text-xs text-gray-400"> / ' + seq.length + '</span>';
          }
        },
        {
          cle: 'actions', titre: '', triable: false, classe: 'text-right',
          rendu: function (a) { return P.peutEcrire() ? actions(a) : ''; }
        }
      ]
    });

    var section = P.avecTableau(
      P.section({
        titre: 'Calendrier scolaire', icone: 'calendar-range',
        actions: P.peutEcrire()
          ? '<button type="button" id="btn-nouvelle-annee" class="py-2.5 px-5 bg-accent text-white font-bold rounded-2xl text-xs flex items-center gap-2">' +
            P.ico('plus', 14) + 'Nouvelle année</button>'
          : '',
        contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
      }),
      table
    );

    var blocs = [P.grilleKPI([
      P.carte({ label: 'Années', valeur: String(toutes.length), icone: 'calendar-range' }),
      P.carte({
        label: 'Année active', valeur: active ? active.libelle : '—', icone: 'circle-check',
        couleur: 'text-green-500', note: active ? 'seule année modifiable' : 'aucune'
      }),
      P.carte({ label: 'Clôturées', valeur: String(cloturees), icone: 'lock', couleur: 'text-gray-400' }),
      P.carte({
        label: 'Séquences ouvertes', valeur: String(an ? S.sequencesDe(an.id).filter(function (s) { return s.ouverte; }).length : 0),
        icone: 'pencil-line', couleur: 'text-blue-500'
      })
    ]), section];

    if (an) blocs.push(sectionCalendrier(an));

    P.rendre(blocs);

    /* Le calendrier doit etre dans le document avant de brancher ses
       boutons : l'ordre compte, sinon les ancrages sont introuvables. */
    if (an) brancherCalendrier(an);

    var btn = document.getElementById('btn-nouvelle-annee');
    if (btn) btn.addEventListener('click', function () { formulaire(null); });
  }

  function Pastille(a) {
    if (a.cloturee) return '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full text-gray-500">clôturée</span>';
    if (a.active) return '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full text-green-500">active</span>';
    return '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full text-amber-500">inactive</span>';
  }

/* ------------------ Calendrier de l'annee consultee ------------------ */
  /* Les boutons ne sont pas interpoles dans la chaine HTML : un element DOM
     concatene avec une chaine donne "[object HTMLDivElement]" et disparait
     silencieusement. On place donc des ancrages, et on y accroche les
     groupes de boutons apres l'injection du HTML. */
  function sectionCalendrier(a) {
    var modifiable = P.peutEcrire();
    var html = a.trimestres.map(function (t) {
      var seq = S.sequencesDeTrimestre(t.id);
      return '<div class="nm-inset rounded-[32px] p-5 space-y-4">' +
        '<div class="flex flex-wrap items-center justify-between gap-3">' +
        '<div><p class="font-bold">' + P.esc(t.libelle) + '</p>' +
        '<p class="text-xs text-gray-400">' + (t.dateDebut ? UI.dateFr(t.dateDebut) + ' → ' + UI.dateFr(t.dateFin) : 'période non définie') + '</p></div>' +
        '<div class="flex items-center gap-2">' +
        (t.valide ? '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-green-500">validé</span>'
          : '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-' + (t.ouvert ? 'blue' : 'gray') + '-500">' +
            (t.ouvert ? 'ouvert' : 'fermé') + '</span>') +
        '<span data-trimestre="' + P.esc(t.id) + '"></span>' +
        '</div></div>' +
        '<div class="space-y-2">' + seq.map(function (s) {
          return '<div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3 nm-flat">' +
            '<div><p class="text-sm font-bold">' + P.esc(s.libelle) + '</p>' +
            '<p class="text-[10px] text-gray-400">' + (s.dateDebut ? UI.dateFr(s.dateDebut) + ' → ' + UI.dateFr(s.dateFin) : 'période non définie') + '</p></div>' +
            '<div class="flex items-center gap-2">' + etatBadgeSequence(s) +
            '<span data-sequence="' + P.esc(s.id) + '"></span></div></div>';
        }).join('') + '</div>' +
        '</div>';
    }).join('');

    var section = P.section({
      titre: 'Calendrier ' + a.libelle, icone: 'calendar-days',
      contenu: '<div class="space-y-4">' + html + '</div>'
    });
    return section;
  }

  /* Branchement APRES l'injection : avant, le HTML est encore dans un
     fragment détaché et querySelector ne trouve aucun ancrage. */
  function brancherCalendrier(a) {
    if (!P.peutEcrire()) return;
    a.trimestres.forEach(function (t) {
      var ancrage = document.querySelector('[data-trimestre="' + t.id + '"]');
      if (ancrage) ancrage.appendChild(boutonsTrimestre(a, t));
    });
    S.sequencesDe(a.id).forEach(function (s) {
      var ancrage = document.querySelector('[data-sequence="' + s.id + '"]');
      if (ancrage) ancrage.appendChild(boutonsSequence(s));
    });
  }

  function etatBadgeSequence(s) {
    if (s.verrouillee) return '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-gray-500">verrouillée</span>';
    if (s.validee) return '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-green-500">validée</span>';
    return s.ouverte
      ? '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-blue-500">ouverte</span>'
      : '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-gray-400">fermée</span>';
  }

  function boutonsTrimestre(a, t) {
    var g = document.createElement('div');
    g.className = 'flex items-center gap-2';
    var bPeriode = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-gray-400', title: 'Dates du trimestre', html: P.ico('calendar-days', 14) });
    bPeriode.addEventListener('click', function () { periode('trimestre', t, a); });
    g.appendChild(bPeriode);

    if (!t.valide) {
      var bOuvert = UI.el('button', {
        class: 'p-2 nm-soft-convex rounded-lg ' + (t.ouvert ? 'text-amber-500' : 'text-green-500'),
        title: t.ouvert ? 'Fermer la saisie du trimestre' : 'Ouvrir la saisie du trimestre',
        html: P.ico(t.ouvert ? 'lock' : 'lock-open', 14)
      });
      bOuvert.addEventListener('click', function () { basculerTrimestre(t); });
      g.appendChild(bOuvert);

      var bValide = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-green-500', title: 'Valider le trimestre', html: P.ico('badge-check', 14) });
      bValide.addEventListener('click', function () { validerTrimestre(t); });
      g.appendChild(bValide);
    }
    return g;
  }

  function boutonsSequence(s) {
    var g = document.createElement('div');
    g.className = 'flex items-center gap-2';
    var bPeriode = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-gray-400', title: 'Dates de la séquence', html: P.ico('calendar-days', 14) });
    bPeriode.addEventListener('click', function () { periode('sequence', s, null); });
    g.appendChild(bPeriode);

    if (!s.validee) {
      var bOuvert = UI.el('button', {
        class: 'p-2 nm-soft-convex rounded-lg ' + (s.ouverte ? 'text-amber-500' : 'text-green-500'),
        title: s.ouverte ? 'Fermer la saisie' : 'Ouvrir la saisie',
        html: P.ico(s.ouverte ? 'lock' : 'lock-open', 14)
      });
      bOuvert.addEventListener('click', function () { basculerSequence(s); });
      g.appendChild(bOuvert);

      var bVerr = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-red-500', title: 'Verrouiller', html: P.ico('lock-keyhole', 14) });
      bVerr.addEventListener('click', function () { verrouillerSequence(s); });
      g.appendChild(bVerr);
    }
    return g;
  }

  /* ------------------------------ Actions -------------------------------- */
  function actions(a) {
    var g = document.createElement('div');
    g.className = 'flex items-center justify-end gap-2';
    /* Une annee inactive se reactive ; une annee cloturee se DEGELLE
       (meme bouton, message different). Dans les deux cas, une seule
       annee peut etre active a la fois. */
    if (a.cloturee || !a.active) {
      var degel = a.cloturee;
      var bAct = UI.el('button', {
        class: 'p-2 nm-soft-convex rounded-lg ' + (degel ? 'text-blue-500' : 'text-green-500'),
        title: degel ? 'Réactiver (dégeler)' : 'Activer',
        html: P.ico(degel ? 'lock-open' : 'circle-check', 14)
      });
      bAct.addEventListener('click', function () { activer(a); });
      g.appendChild(bAct);
    }
    var bEdit = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-accent', title: 'Modifier', html: P.ico('pencil', 14) });
    bEdit.addEventListener('click', function () { formulaire(a); });
    g.appendChild(bEdit);
    if (!a.cloturee) {
      var bClos = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-amber-500', title: 'Clôturer', html: P.ico('lock', 14) });
      bClos.addEventListener('click', function () { cloturer(a); });
      g.appendChild(bClos);
    }
    return g;
  }

  /* ---------------------------- Formulaires ------------------------------ */
  function formulaire(a) {
    var fLib = UI.champ({ label: 'Libellé', valeur: a ? a.libelle : '', requis: true, placeholder: 'Ex. 2026-2027' });
    var fDeb = UI.champ({ label: 'Date de début', type: 'date', valeur: a ? a.dateDebut : '', requis: true });
    var fFin = UI.champ({ label: 'Date de fin', type: 'date', valeur: a ? a.dateFin : '', requis: true });
    var fNb = UI.champ({ label: 'Nombre de trimestres', type: 'number', min: 1, max: 4, valeur: a ? a.trimestres.length : 3 });

    UI.modal({
      titre: a ? 'Modifier l\'année scolaire' : 'Nouvelle année scolaire',
      contenu: '<div class="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4" id="form-annee"></div>' +
        '<p class="text-xs text-gray-500 mt-2">Une année scolaire contient ses trimestres, chacun portant deux séquences. ' +
        'Le nombre de trimestres n\'est modifiable qu\'à la création.</p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: a ? 'Enregistrer' : 'Créer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fLib, fDeb, fFin, fNb])) return false;
            if (fFin.valeur() < fDeb.valeur()) { UI.toast('La date de fin doit suivre la date de début.', 'error'); return; }
            var r = a ? null : S.creerAnnee({
              libelle: fLib.valeur(), dateDebut: fDeb.valeur(), dateFin: fFin.valeur(), nbTrimestres: Number(fNb.valeur())
            });
            if (!r) {
              /* pas d'edition complete d'une annee existante : ses classes et
                 notes y sont rattachees, la modifier casserait l'historique.
                 Seules les periodes se reglent, via le calendrier. */
              UI.toast('Une année existante ne se modifie pas : ses données y sont rattachées. ' +
                'Créez une nouvelle année si nécessaire.', 'info');
              return;
            }
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast('Année scolaire créée. Activez-la pour ouvrir la saisie.', 'success');
            refresh();
          }
        }
      ]
    });
    var f = document.getElementById('form-annee');
    f.appendChild(fLib.element); f.appendChild(fDeb.element);
    f.appendChild(fFin.element); f.appendChild(fNb.element);
  }

  function periode(type, obj, an) {
    var fDeb = UI.champ({ label: 'Du', type: 'date', valeur: obj.dateDebut || '', requis: true });
    var fFin = UI.champ({ label: 'Au', type: 'date', valeur: obj.dateFin || '', requis: true });
    UI.modal({
      titre: 'Période — ' + obj.libelle,
      contenu: '<div class="space-y-4 grid grid-cols-2 gap-4" id="form-periode"></div>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Enregistrer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fDeb, fFin])) return false;
            var r = S.modifierPeriode(type, obj.id, fDeb.valeur(), fFin.valeur());
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast('Période enregistrée.', 'success');
            refresh();
          }
        }
      ]
    });
    var f = document.getElementById('form-periode');
    f.appendChild(fDeb.element); f.appendChild(fFin.element);
  }

  function activer(a) {
    var degel = !!a.cloturee;
    UI.confirmer({
      titre: degel ? 'Réactiver l\'année scolaire' : 'Activer l\'année scolaire',
      message: degel
        ? 'Réactiver (dégeler) <b>' + P.esc(a.libelle) + '</b> ?<br><br>' +
          'Le verrou sera levé, les trimestres rouverts et les séquences déverrouillées. ' +
          'Une seule année est active à la fois : la précédente repassera en lecture seule.'
        : 'Activer <b>' + P.esc(a.libelle) + '</b> ?<br><br>' +
          'Une seule année est active à la fois : l\'année précédente cessera d\'être modifiable ' +
          'et deviendra consultable en lecture seule.'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.activerAnnee(a.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast(degel
        ? 'Année réactivée : ' + a.libelle + '. Rouvrez les trimestres pour la saisie.'
        : 'Année active : ' + a.libelle + '. Ouvrez les trimestres pour la saisie.', 'success');
      refresh();
    });
  }

  function cloturer(a) {
    UI.confirmer({
      titre: 'Clôturer l\'année scolaire',
      message: 'Clôturer <b>' + P.esc(a.libelle) + '</b> ?<br><br>' +
        'Tous les trimestres seront fermés et toutes les séquences verrouillées. ' +
        'L\'année restera consultable en lecture seule. ' +
        'Vous pourrez néanmoins la réactiver (dégeler) ultérieurement si besoin.'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.cloturerAnnee(a.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Année clôturée : consultation seule.', 'info');
      refresh();
    });
  }

  function basculerTrimestre(t) {
    var ouvrir = !t.ouvert;
    var msg = ouvrir
      ? 'Ouvrir la saisie du <b>' + P.esc(t.libelle) + '</b> ? Les enseignants pourront y saisir des notes.'
      : 'Fermer la saisie du <b>' + P.esc(t.libelle) + '</b> ? Ses séquences seront fermées et les notes figées.';
    UI.confirmer({ titre: ouvrir ? 'Ouvrir le trimestre' : 'Fermer le trimestre', message: msg }).then(function (ok) {
      if (!ok) return;
      var r = S.etatTrimestre(t.id, ouvrir);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast(ouvrir ? 'Trimestre ouvert à la saisie.' : 'Trimestre fermé.', 'info');
      refresh();
    });
  }

  function validerTrimestre(t) {
    UI.confirmer({
      titre: 'Valider le trimestre',
      message: 'Valider <b>' + P.esc(t.libelle) + '</b> ?<br><br>' +
        'La validation est définitive : elle verrouille les notes et autorise l\'édition des bulletins du trimestre.'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.etatTrimestre(t.id, undefined, true);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Trimestre validé : bulletins disponibles.', 'success');
      refresh();
    });
  }

  function basculerSequence(s) {
    var r = S.etatSequence(s.id, { ouverte: !s.ouverte });
    if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
    UI.toast(s.ouverte ? 'Saisie fermée pour ' + s.libelle + '.' : 'Saisie ouverte pour ' + s.libelle + '.', 'info');
    refresh();
  }

  function verrouillerSequence(s) {
    UI.confirmer({
      titre: 'Verrouiller la séquence',
      message: 'Verrouiller <b>' + P.esc(s.libelle) + '</b> ?<br><br>La saisie sera définitivement fermée pour cette séquence.'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.etatSequence(s.id, { verrouillee: true });
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Séquence verrouillée.', 'info');
      refresh();
    });
  }

  refresh();
})();
