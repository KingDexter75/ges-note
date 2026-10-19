/* EduNeum - Tableau de bord du Censeur (Vice-Principal).
   Point d'entree de l'espace censeur : gestion vie scolaire, absences, discipline.
   Affiche uniquement les classes sous sa responsabilité. */

(function () {
  'use strict';

  var E = window.EduNeum;
  if (!E.auth.estConnecte()) return;
  var S = E.store, UI = E.ui, P = E.page, R = E.routes;
  var t = function (cle, defaut, vars) {
    if (!E.i18n) return defaut;
    var v = E.i18n.t(cle, vars);
    return v === cle ? defaut : v;
  };

  var session = E.auth.session();
  var an = E.layout.anneeChoisie();
  var racine = P.contenu();
  if (!racine) return;

  /* ------------------------------ Donnees ------------------------------ */

  /* Classes sous responsabilité du censeur : via affectations PP ou accès censeur */
  function mesClasses() {
    if (!session.enseignantId || !an) return [];
    var classeIds = E.acces.mesClasses ? E.acces.mesClasses() : [];
    return classeIds.map(function (id) {
      var c = S.classeParId(id);
      if (!c || c.archive) return null;
      return {
        id: c.id, nom: c.nom, niveau: c.niveau, section: c.section || 'francophone',
        eleves: S.elevesDeClasse(id, an.id),
        effectif: S.elevesDeClasse(id, an.id).length
      };
    }).filter(Boolean);
  }

  /* Absences par sequence pour les classes du censeur */
  function absencesParClasse(classeId, sequenceId) {
    var eleves = S.elevesDeClasse(classeId, an.id);
    var data = eleves.map(function (e) {
      var abs = S.absenceDe ? S.absenceDe(e.id, sequenceId) : null;
      return {
        eleve: e,
        total: abs ? (Number(abs.heures) || 0) : 0,
        justifiees: abs ? (Number(abs.justifiees) || 0) : 0,
        nonJustifiees: abs ? (Number(abs.nonJustifiees) || 0) : 0,
        motif: abs ? (abs.motif || '') : ''
      };
    });
    var totalHeures = data.reduce(function (s, d) { return s + d.total; }, 0);
    var totalJust = data.reduce(function (s, d) { return s + d.justifiees; }, 0);
    var totalNonJust = data.reduce(function (s, d) { return s + d.nonJustifiees; }, 0);
    return { eleves: data, totalHeures: totalHeures, totalJust: totalJust, totalNonJust: totalNonJust };
  }

  /* Sanctions par sequence pour les classes du censeur */
  function sanctionsParClasse(classeId, sequenceId) {
    var eleves = S.elevesDeClasse(classeId, an.id);
    var data = eleves.map(function (e) {
      var san = S.sanctionDe ? S.sanctionDe(e.id, sequenceId) : [];
      return { eleve: e, sanctions: san || [] };
    }).filter(function (d) { return d.sanctions.length > 0; });
    return data;
  }

  /* Sequences ouvertes pour la saisie vie scolaire */
  function sequencesOuvertes() {
    if (!an) return [];
    var out = [];
    S.trimestresDe(an.id).forEach(function (tr) {
      if (!tr.ouvert) return;
      S.sequencesDeTrimestre(tr.id).forEach(function (sq) {
        if (sq.ouverte && !sq.verrouillee) out.push({ sequence: sq, trimestre: tr });
      });
    });
    return out;
  }

  /* -------------------------- Fragments ------------------------------- */

  function url(route) { return R.resolve(route); }

  function actionsEnTete() {
    var boite = document.getElementById('actions');
    if (!boite) return;
    var liens = [
      { id: 'cens-vie', href: url('censeur_vie_scolaire'), icone: 'shield-alert', label: t('censeur.vieScolaire', 'Vie Scolaire') },
      { id: 'cens-assid', href: url('censeur_assiduite'), icone: 'calendar-check', label: t('censeur.assiduite', 'Assiduité') },
      { id: 'cens-eleves', href: url('censeur_eleves'), icone: 'users', label: t('censeur.eleves', 'Élèves') },
      { id: 'cens-rapports', href: url('censeur_rapports'), icone: 'bar-chart-3', label: t('censeur.rapports', 'Rapports') }
    ].map(function (b) {
      return '<a id="' + b.id + '" href="' + b.href + '" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold flex items-center gap-2">' +
        P.ico(b.icone, 16) + P.esc(b.label) + '</a>';
    }).join('');
    var imprimer = '<button type="button" id="cens-print-listes" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold flex items-center gap-2">' +
      P.ico('printer', 16) + P.esc(t('censeur.imprimerListes', 'Imprimer les listes')) + '</button>';
    boite.innerHTML = imprimer + liens;
    var btn = document.getElementById('cens-print-listes');
    if (btn && E.listesEleves) {
      btn.addEventListener('click', function () {
        E.listesEleves.choisir(mesClasses().map(function (g) { return g.id; }),
          { titre: 'Liste-eleves-' + (an ? an.libelle.replace(/\//g, '-') : '') });
      });
    }
  }

  function carteClasseAbsences(g, seq) {
    var data = absencesParClasse(g.id, seq.id);
    var pct = data.totalHeures > 0 ? Math.round((data.totalNonJust / data.totalHeures) * 100) : 0;
    var section = g.section || 'francophone';
    var sectionBadge = section === 'anglophone'
      ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">Anglophone</span>'
      : '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/10 text-green-500">Francophone</span>';

    return '<article class="censeur-classe-card">' +
      '<div class="flex justify-between items-start gap-2">' +
      '<div class="flex items-center gap-2"><span class="text-xs font-black px-3 py-1 rounded-full text-accent bg-accent/10">' + P.esc(g.nom) + '</span>' + sectionBadge + '</div>' +
      '<span class="text-xs font-bold text-gray-400">' + g.effectif + ' élèves</span></div>' +
      '<div class="grid grid-cols-3 gap-4 text-center">' +
      '<div class="p-4 nm-inset rounded-2xl"><p class="text-2xl font-black text-red-500">' + data.totalNonJust + '</p><p class="text-xs text-gray-400">Non justifiées</p></div>' +
      '<div class="p-4 nm-inset rounded-2xl"><p class="text-2xl font-black text-green-500">' + data.totalJust + '</p><p class="text-xs text-gray-400">Justifiées</p></div>' +
      '<div class="p-4 nm-inset rounded-2xl"><p class="text-2xl font-black text-gray-500">' + data.totalHeures + '</p><p class="text-xs text-gray-400">Total heures</p></div>' +
      '</div>' +
      '<div class="seq-jauge"><span style="width:' + pct + '%" class="bg-red-500"></span></div>' +
      '<a href="' + url('censeur_vie_scolaire') + '?classe=' + g.id + '&seq=' + seq.id + '" class="censeur-action-btn w-full text-center">' +
      P.ico('calendar-check', 16) + P.esc(t('censeur.gererAbsences', 'Gérer absences')) + '</a>' +
      '</article>';
  }

  function carteClasseSanctions(g, seq) {
    var data = sanctionsParClasse(g.id, seq.id);
    var nbSanctions = data.reduce(function (s, d) { return s + d.sanctions.length; }, 0);
    var section = g.section || 'francophone';
    var sectionBadge = section === 'anglophone'
      ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">Anglophone</span>'
      : '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/10 text-green-500">Francophone</span>';

    return '<article class="censeur-classe-card">' +
      '<div class="flex justify-between items-start gap-2">' +
      '<div class="flex items-center gap-2"><span class="text-xs font-black px-3 py-1 rounded-full text-orange-500 bg-orange-500/10">' + P.esc(g.nom) + '</span>' + sectionBadge + '</div>' +
      '<span class="text-xs font-bold text-gray-400">' + g.effectif + ' élèves</span></div>' +
      '<div class="p-4 nm-inset rounded-2xl text-center">' +
      '<p class="text-3xl font-black text-orange-500">' + nbSanctions + '</p>' +
      '<p class="text-xs text-gray-400">Sanctions en cours</p></div>' +
      '<a href="' + url('censeur_vie_scolaire') + '?classe=' + g.id + '&seq=' + seq.id + '&mode=discipline" class="censeur-action-btn w-full text-center">' +
      P.ico('alert-triangle', 16) + P.esc(t('censeur.gererSanctions', 'Gérer sanctions')) + '</a>' +
      '</article>';
  }

  function rappelsAbsences(classes, seq) {
    var nonSaisies = classes.filter(function (g) {
      var data = absencesParClasse(g.id, seq.id);
      return data.totalHeures === 0 && g.effectif > 0;
    });
    var retards = classes.filter(function (g) {
      var data = absencesParClasse(g.id, seq.id);
      return data.totalNonJust > 0;
    });

    var out = [];
    if (nonSaisies.length) {
      out.push({
        icone: 'alert-circle', classe: 'bg-amber-500/5 border-amber-500/10', couleur: 'text-amber-500',
        texte: t('censeur.absencesNonSaisies', '{n} classe(s) sans absences saisies', { n: nonSaisies.length })
      });
    }
    if (retards.length) {
      out.push({
        icone: 'clock', classe: 'bg-red-500/5 border-red-500/10', couleur: 'text-red-500',
        texte: t('censeur.absencesNonJustifiees', '{n} classe(s) avec absences non justifiées', { n: retards.length })
      });
    }
    if (!out.length) {
      out.push({
        icone: 'check-circle', classe: 'bg-green-500/5 border-green-500/10', couleur: 'text-green-500',
        texte: t('censeur.toutAJour', 'Toutes les absences sont à jour.')
      });
    }
    return out;
  }

  function blocRappels(liste) {
    return '<div class="space-y-4">' + liste.map(function (r) {
      return '<div class="p-5 rounded-[32px] nm-flat ' + r.classe + ' border flex items-start gap-3">' +
        '<span class="' + r.couleur + ' mt-0.5">' + P.ico(r.icone, 18) + '</span>' +
        '<p class="text-sm font-semibold">' + P.esc(r.texte) + '</p></div>';
    }).join('') + '</div>';
  }

  /* ------------------------------ Rendu -------------------------------- */

  function rendre() {
    if (!an) {
      P.rendre(UI.etatVide(t('saisie.aucuneAnnee', 'Aucune année scolaire active.')));
      return;
    }
    var classes = mesClasses();
    if (!classes.length) {
      P.rendre(UI.etatVide(t('censeur.aucuneClasse', 'Aucune classe sous votre responsabilité cette année.')));
      return;
    }

    var seqs = sequencesOuvertes();
    var seqActive = seqs[0];

    var contexte = document.getElementById('censeur-contexte');
    if (contexte) {
      contexte.textContent = t('censeur.bienvenue', 'Bonjour, {nom}', {
        nom: [session.prenom, session.nom].filter(Boolean).join(' ')
      }) + ' • ' + an.libelle;
    }

    var cartesAbs = seqActive ? classes.map(function (g) { return carteClasseAbsences(g, seqActive); }).join('') : '';
    var cartesSan = seqActive ? classes.map(function (g) { return carteClasseSanctions(g, seqActive); }).join('') : '';
    var rappels = seqActive ? rappelsAbsences(classes, seqActive) : [];

    var blocs = [
      P.grilleKPI([
        P.carte({ label: t('censeur.mesClasses', 'Classes responsables'), valeur: String(classes.length), icone: 'school', couleur: 'text-accent' }),
        P.carte({ label: t('censeur.totalEleves', 'Élèves suivis'), valeur: String(classes.reduce(function (s, g) { return s + g.effectif; }, 0)), icone: 'users-round', couleur: 'text-blue-500' }),
        P.carte({
          label: t('censeur.sequencesActives', 'Séquences ouvertes'), valeur: String(seqs.length),
          icone: 'clipboard-list', couleur: seqs.length ? 'text-green-500' : 'text-amber-500',
          note: seqs.length ? t('censeur.saisieOuverte', 'Saisie ouverte') : t('censeur.saisieFermee', 'Saisie fermée')
        }),
        P.carte({
          label: t('censeur.tauxAbsences', 'Taux abs. non just.'), valeur: seqActive ? (function () {
            var tot = classes.reduce(function (s, g) {
              var d = absencesParClasse(g.id, seqActive.id);
              return s + d.totalHeures;
            }, 0);
            var nj = classes.reduce(function (s, g) {
              var d = absencesParClasse(g.id, seqActive.id);
              return s + d.totalNonJust;
            }, 0);
            return tot ? String(Math.round((nj / tot) * 100)) + '%' : '—';
          })() : '—',
          icone: 'alert-triangle', couleur: 'text-red-500'
        })
      ]),

      P.section({
        titre: t('censeur.absencesParClasse', 'Absences par classe'), icone: 'calendar-check',
        contenu: '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">' + (cartesAbs || '<p class="text-sm text-gray-400 col-span-full">' + P.esc(t('censeur.aucuneSequence', 'Aucune séquence ouverte.')) + '</p>') + '</div>'
      }),

      P.section({
        titre: t('censeur.sanctionsParClasse', 'Sanctions par classe'), icone: 'shield-alert',
        contenu: '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">' + (cartesSan || '<p class="text-sm text-gray-400 col-span-full">' + P.esc(t('censeur.aucuneSanction', 'Aucune sanction en cours.')) + '</p>') + '</div>'
      }),

      P.section({
        titre: t('censeur.rappels', 'Alertes & Rappels'), icone: 'bell',
        contenu: blocRappels(rappels)
      })
    ];

    P.rendre(blocs);
    actionsEnTete();
    if (E.i18n) E.i18n.appliquer();
  }

  document.addEventListener('eduneum:langue', function () { rendre(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rendre);
  else rendre();
})();