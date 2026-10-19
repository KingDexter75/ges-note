/* EduNeum - Tableau de bord administrateur (page 01).
   Version d'origine tronquee et sans JavaScript : page reconstruite.
   Toutes les valeurs proviennent du store, aucune donnee en dur. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, C = E.calculs, A = E.auth, UI = E.ui, R = E.routes;
  if (!A.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) {
    P.rendre(P.section({ titre: 'Aucune année scolaire', contenu: UI.etatVide('Créez d\'abord une année scolaire.') }));
    return;
  }

  /* Le SURVEILLANT GENERAL n'a qu'une mission sur ce tableau de bord :
     SES salles et leurs absences. Moyennes, journal, affectations et
     alertes de direction sont affaires d'administration. */
  if (E.acces.estSurveillant()) { rendreTableauSG(); return; }

  function rendreTableauSG() {
    var sousTitre = document.querySelector('main header p');
    if (sousTitre) sousTitre.textContent = 'Vos salles et le suivi des absences';

    var salles = (E.acces.mesClasses() || [])
      .map(function (id) { return S.classeParId(id); })
      .filter(function (c) { return c && !c.archive; });
    var seqsOuvertes = S.sequencesDe(an.id).filter(function (s) { return s.ouverte && !s.verrouillee; });

    if (!salles.length) {
      P.rendre(P.section({
        titre: 'Mes salles', icone: 'door-open',
        contenu: UI.etatVide('Aucune salle ne vous est attribuée pour ' + an.libelle +
          ' : demandez à l\'administration de vous attribuer des classes.')
      }));
      return;
    }

    /* Absences d'une salle sur les sequences ouvertes : heures,
       non justifiees, eleves distincts concernes. */
    function statsSalle(classeId) {
      var touches = {}, st = { heures: 0, nonJust: 0 };
      seqsOuvertes.forEach(function (sq) {
        S.absencesDeSequence(sq.id).forEach(function (a) {
          if (a.classeId !== classeId) return;
          var h = Number(a.heures) || 0;
          if (h > 0) touches[a.eleveId] = 1;
          st.heures += h;
          st.nonJust += Number(a.nonJustifiees) || 0;
        });
      });
      st.touches = Object.keys(touches).length;
      return st;
    }

    var lignesSalles = salles.map(function (c) {
      var st = statsSalle(c.id);
      return {
        classeId: c.id, salle: c.nom, effectif: S.elevesDeClasse(c.id, an.id).length,
        touches: st.touches, heures: st.heures, nonJust: st.nonJust
      };
    });
    var totalEleves = lignesSalles.reduce(function (n, l) { return n + l.effectif; }, 0);
    var totalTouches = lignesSalles.reduce(function (n, l) { return n + l.touches; }, 0);
    var totalHeures = lignesSalles.reduce(function (n, l) { return n + l.heures; }, 0);
    var totalNonJust = lignesSalles.reduce(function (n, l) { return n + l.nonJust; }, 0);

    var kpis = P.grilleKPI([
      P.carte({ label: 'Mes salles', valeur: String(salles.length), icone: 'door-open', note: an.libelle }),
      P.carte({ label: 'Élèves suivis', valeur: String(totalEleves), icone: 'users-round', couleur: 'text-blue-500' }),
      P.carte({
        label: 'Élèves avec absences', valeur: String(totalTouches), icone: 'user-x',
        couleur: totalTouches ? 'text-red-500' : 'text-green-500',
        note: seqsOuvertes.length + ' séquence(s) ouverte(s)'
      }),
      P.carte({
        label: 'Heures d\'absence', valeur: String(totalHeures) + 'h', icone: 'clock',
        couleur: totalHeures ? 'text-amber-500' : 'text-green-500',
        note: totalNonJust + 'h non justifiées'
      })
    ]);

    var alertes = [];
    if (!seqsOuvertes.length) alertes.push({
      ton: 'rouge', icone: 'calendar-x',
      texte: 'Aucune séquence ouverte : la saisie des absences est bloquée.'
    });
    if (totalNonJust > 0) alertes.push({
      ton: 'ambre', icone: 'alert-triangle',
      texte: totalNonJust + ' heure(s) non justifiées sur vos salles.'
    });
    var blocages = P.section({
      titre: 'Points de vigilance', icone: 'triangle-alert',
      contenu: alertes.length
        ? '<div class="space-y-3">' + alertes.map(function (a) {
          return '<div class="p-5 rounded-[32px] nm-flat bg-' + a.ton + '-500/5 border border-' + a.ton + '-500/20 flex flex-wrap items-center gap-3">' +
            '<span class="text-' + a.ton + '-500">' + P.ico(a.icone, 18) + '</span>' +
            '<p class="text-sm font-bold">' + P.esc(a.texte) + '</p></div>';
        }).join('') + '</div>'
        : UI.etatVide('Aucune alerte sur vos salles.')
    });

    var tableSalles = UI.tableau({
      lignes: lignesSalles,
      colonnes: [
        { cle: 'salle', titre: 'Salle', rendu: function (l) { return '<span class="font-bold">' + P.esc(l.salle) + '</span>'; } },
        { cle: 'effectif', titre: 'Effectif' },
        { cle: 'touches', titre: 'Élèves avec absences', rendu: function (l) { return l.touches ? '<span class="font-bold text-red-500">' + l.touches + '</span>' : '0'; } },
        { cle: 'heures', titre: 'Heures', rendu: function (l) { return l.heures + 'h'; } },
        { cle: 'nonJust', titre: 'Non justifiées', rendu: function (l) { return l.nonJust ? '<span class="font-bold text-amber-500">' + l.nonJust + 'h</span>' : '0h'; } },
        {
          cle: 'liste', titre: 'Liste des absents', triable: false,
          rendu: function (l) {
            return '<button type="button" data-abs-classe="' + P.esc(l.classeId) + '" ' +
              'class="px-3 py-1.5 nm-soft-convex rounded-xl text-[11px] font-bold text-accent hover:nm-inset transition-all inline-flex items-center gap-1">' +
              P.ico('printer', 13) + 'Imprimer</button>';
          }
        }
      ],
      nomExport: 'mes-salles-absences',
      messageVide: 'Aucune salle attribuée.'
    });
    var sectionSalles = P.avecTableau(
      P.section({
        titre: 'Mes salles', icone: 'door-open',
        contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
      }),
      tableSalles);

    P.rendre([kpis, blocages, sectionSalles]);

    if (sectionSalles) {
      sectionSalles.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('[data-abs-classe]') : null;
        if (!b || !E.listesEleves) return;
        E.listesEleves.choisirAbsences([b.getAttribute('data-abs-classe')], { classe: b.getAttribute('data-abs-classe') });
      });
    }

    var actions = document.getElementById('actions');
    if (actions) {
      actions.innerHTML =
        '<a href="' + R.resolve('censeur_assiduite') + '" class="px-5 py-3 bg-accent text-white rounded-2xl text-xs font-bold hover:brightness-110 transition-all flex items-center gap-2">' +
        P.ico('calendar-check', 16) + 'Saisir les absences</a>' +
        '<button type="button" id="btn-print-absences" class="px-5 py-3 nm-soft-convex rounded-2xl text-xs font-bold text-accent hover:nm-inset transition-all flex items-center gap-2">' +
        P.ico('printer', 16) + 'Listes d\'absences</button>' +
        '<button type="button" id="btn-export-sg" class="px-5 py-3 nm-soft-convex rounded-2xl text-xs font-bold text-accent hover:nm-inset transition-all flex items-center gap-2">' +
        P.ico('download', 16) + 'Exporter</button>';
      document.getElementById('btn-print-absences').addEventListener('click', function () {
        if (!E.listesEleves) return;
        E.listesEleves.choisirAbsences(salles.map(function (c) { return c.id; }));
      });
      document.getElementById('btn-export-sg').addEventListener('click', function () {
        UI.exporterCSV([
          { cle: 'salle', titre: 'Salle' }, { cle: 'effectif', titre: 'Effectif' },
          { cle: 'touches', titre: 'Élèves avec absences' }, { cle: 'heures', titre: 'Heures' },
          { cle: 'nonJust', titre: 'Non justifiées (h)' }
        ], lignesSalles, 'mes-salles-absences-' + an.libelle.replace(/\//g, '-'));
        P.tracer('export.tableau-de-bord.sg', 'annee:' + an.id, 'Export CSV des absences par salle');
        UI.toast('Export généré.', 'success');
      });
    }
  }

  var classes = S.classesDe(an.id);
  var trimestre = S.trimestresDe(an.id).filter(function (t) { return t.ouvert; })[0] || null;
  var sequencesOuvertes = S.sequencesDe(an.id).filter(function (s) { return s.ouverte; });

  function effectifTotal() {
    return classes.reduce(function (n, c) { return n + S.elevesDeClasse(c.id, an.id).length; }, 0);
  }
  function classesSansPP() {
    return classes.filter(function (c) {
      return !S.all('profsPrincipaux').some(function (pp) { return pp.classeId === c.id && pp.anneeId === an.id; });
    });
  }
  /* Taux de remplissage moyen sur les couples (classe x sequence ouverte). */
  function couvertureSaisie() {
    if (!sequencesOuvertes.length || !classes.length) return 0;
    var total = 0, saisi = 0;
    classes.forEach(function (c) {
      sequencesOuvertes.forEach(function (s) {
        var p = S.progression(s.id, c.id);
        total += p.total; saisi += p.saisies;
      });
    });
    return total ? Math.round((saisi / total) * 100) : 0;
  }

  /* ------------------------------- KPI -------------------------------- */
  var kpis = P.grilleKPI([
    P.carte({ label: 'Classes ouvertes', valeur: String(classes.length), icone: 'school', note: an.libelle }),
    P.carte({ label: 'Élèves inscrits', valeur: String(effectifTotal()), icone: 'users-round', couleur: 'text-blue-500', note: an.libelle }),
    P.carte({ label: 'Enseignants', valeur: String(S.all('enseignants').filter(function (p) { return !p.archive && p.fonction === 'enseignant'; }).length), icone: 'id-card', couleur: 'text-green-500' }),
    P.carte({ label: 'Saisie des notes', valeur: couvertureSaisie() + ' %', icone: 'file-text', couleur: 'text-amber-500', note: sequencesOuvertes.length + ' séquence(s) ouverte(s)' })
  ]);

  /* ----------------------------- Alertes ------------------------------ */
  var alertes = [];
  var sansPP = classesSansPP();
  if (sansPP.length) alertes.push({
    ton: 'ambre', icone: 'user-round-search',
    texte: sansPP.length + ' classe(s) sans professeur principal : ' + sansPP.map(function (c) { return c.nom; }).join(', '),
    lien: 'admin_classes', action: 'Affecter un professeur principal'
  });
  var sansAffectation = classes.filter(function (c) {
    return !S.affectationsDe(an.id).some(function (a) { return a.classeId === c.id; });
  });
  if (sansAffectation.length) alertes.push({
    ton: 'rouge', icone: 'link-2-off',
    texte: sansAffectation.length + ' classe(s) sans aucune affectation d\'enseignement.',
    lien: 'admin_affectations', action: 'Compléter les affectations'
  });
  var sansInscription = classes.filter(function (c) { return S.elevesDeClasse(c.id, an.id).length === 0; });
  if (sansInscription.length) alertes.push({
    ton: 'ambre', icone: 'user-plus',
    texte: sansInscription.length + ' classe(s) sans élève inscrit.',
    lien: 'admin_inscriptions', action: 'Inscrire des élèves'
  });
  if (!trimestre) alertes.push({
    ton: 'rouge', icone: 'calendar-x',
    texte: 'Aucun trimestre ouvert : la saisie des notes est bloquée.',
    lien: 'admin_annees', action: 'Ouvrir un trimestre'
  });

  var blocages = P.section({
    titre: 'Points de vigilance', icone: 'triangle-alert',
    contenu: alertes.length
      ? '<div class="space-y-3">' + alertes.map(function (a) {
        return '<div class="p-5 rounded-[32px] nm-flat bg-' + a.ton + '-500/5 border border-' + a.ton + '-500/20 flex flex-wrap items-center justify-between gap-3">' +
          '<div class="flex items-start gap-3"><span class="text-' + a.ton + '-500 mt-0.5">' + P.ico(a.icone, 18) + '</span>' +
          '<p class="text-sm font-bold">' + P.esc(a.texte) + '</p></div>' +
          '<a href="' + R.resolve(a.lien) + '" class="text-xs font-bold text-accent hover:underline whitespace-nowrap">' + P.esc(a.action) + '</a></div>';
      }).join('') + '</div>'
      : UI.etatVide('Aucune alerte : la configuration est complète.')
  });

  /* ------------------------- Moyennes par classe ----------------------- */
  var lignesMoyennes = classes.map(function (c) {
    var calcul = C.classerGeneral({ classeId: c.id, anneeId: an.id, trimestreId: trimestre ? trimestre.id : null });
    return {
      classe: c.nom, effectif: S.elevesDeClasse(c.id, an.id).length,
      moyenne: calcul.moyenne, meilleure: calcul.meilleure, pire: calcul.pire,
      saisie: couvertureClasse(c)
    };
  });
  function couvertureClasse(c) {
    if (!sequencesOuvertes.length) return null;
    var total = 0, saisi = 0;
    sequencesOuvertes.forEach(function (s) {
      var p = S.progression(s.id, c.id);
      total += p.total; saisi += p.saisies;
    });
    return total ? Math.round((saisi / total) * 100) : 0;
  }
  var tableMoyennes = UI.tableau({
    lignes: lignesMoyennes,
    colonnes: [
      { cle: 'classe', titre: 'Classe', rendu: function (l) { return '<span class="font-bold">' + P.esc(l.classe) + '</span>'; } },
      { cle: 'effectif', titre: 'Effectif' },
      { cle: 'moyenne', titre: 'Moyenne classe', rendu: function (l) { return l.moyenne === null ? '—' : UI.nombre(l.moyenne); } },
      { cle: 'meilleure', titre: 'Meilleure', rendu: function (l) { return l.meilleure === null ? '—' : UI.nombre(l.meilleure); } },
      { cle: 'pire', titre: 'Plus faible', rendu: function (l) { return l.pire === null ? '—' : UI.nombre(l.pire); } },
      {
        cle: 'saisie', titre: 'Saisie', triable: false,
        rendu: function (l) {
          if (l.saisie === null) return '—';
          return '<div class="flex items-center gap-2"><div class="seq-jauge w-16"><span style="width:' + l.saisie + '%"></span></div>' +
            '<span class="text-xs font-bold text-gray-500">' + l.saisie + '%</span></div>';
        }
      }
    ],
    nomExport: 'moyennes-classes',
    messageVide: 'Aucune classe pour cette année scolaire.'
  });
  var sectionMoyennes = P.avecTableau(
    P.section({
      titre: 'Moyennes par classe', icone: 'bar-chart-3',
      contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
    }),
    tableMoyennes);

  /* --------------------------- Dernières actions ----------------------- */
  var journal = S.journal(8);
  var activite = P.section({
    titre: 'Dernières actions', icone: 'history',
    contenu: journal.length
      ? '<div class="nm-flat p-6 rounded-[32px]">' + journal.map(function (j) {
        return '<div class="journal-ligne"><div class="w-2 h-2 rounded-full nm-soft-convex bg-accent mt-2 shrink-0"></div>' +
          '<div class="flex-1"><p class="text-sm font-bold">' + P.esc(j.action) + '</p>' +
          '<p class="text-xs text-gray-400">' + P.esc(j.cible || '—') + ' · ' + UI.dateFr(j.date) + '</p></div></div>';
      }).join('') + '</div>' +
      '<a href="' + R.resolve('admin_journal') + '" class="text-xs font-bold text-accent hover:underline">Consulter le journal complet</a>'
      : UI.etatVide('Aucune action enregistrée pour le moment.')
  });

  /* ------------------------------ Rendu ------------------------------- */
  P.rendre([kpis, blocages, sectionMoyennes, activite]);

  var actions = document.getElementById('actions');
  if (actions) {
    actions.innerHTML =
      '<button type="button" id="btn-print-listes" class="px-5 py-3 nm-soft-convex rounded-2xl text-xs font-bold text-accent hover:nm-inset transition-all flex items-center gap-2">' +
      P.ico('printer', 16) + 'Imprimer les listes</button>' +
      '<button type="button" id="btn-export-dash" class="px-5 py-3 nm-soft-convex rounded-2xl text-xs font-bold text-accent hover:nm-inset transition-all flex items-center gap-2">' +
      P.ico('download', 16) + 'Exporter</button>';
    document.getElementById('btn-print-listes').addEventListener('click', function () {
      if (!E.listesEleves) return;
      E.listesEleves.choisir(classes.map(function (c) { return c.id; }), { titre: 'Liste-eleves-' + an.libelle.replace(/\//g, '-') });
    });
    document.getElementById('btn-export-dash').addEventListener('click', function () {
      UI.exporterCSV([
        { cle: 'classe', titre: 'Classe' }, { cle: 'effectif', titre: 'Effectif' },
        { cle: 'moyenne', titre: 'Moyenne' }, { cle: 'meilleure', titre: 'Meilleure' },
        { cle: 'pire', titre: 'Plus faible' }, { cle: 'saisie', titre: 'Saisie (%)' }
      ], lignesMoyennes, 'tableau-de-bord-' + an.libelle.replace(/\//g, '-'));
      P.tracer('export.tableau-de-bord', 'annee:' + an.id, 'Export CSV des moyennes par classe');
      UI.toast('Export généré.', 'success');
    });
  }
})();
