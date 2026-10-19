/* EduNeum - Tableau de bord de l'enseignant.

   Point d'entree de l'espace enseignant : ce que j'ai a faire aujourd'hui.

   Tout ce qui est affiche vient du store et de mes affectations ; aucune
   donnee de demonstration ne subsiste. Les trois actions de l'en-tete
   mènent aux seules pages qui reellement existent pour un enseignant :

     - Saisie des notes : le cours se saisit par classe, matiere et
       sequence, la sequence devant etre ouverte et validee par
       l'administration ;
     - Rapports          : mes resultats par classe et par sequence ;
     - Mes classes       : l'ensemble de mes affectations.

   Le bouton « Appel » de la maquette a ete retire : la prise d'assiduite
   releve de l'administration et de la vie scolaire, pas de cet espace.
   Idem pour la « saisie rapide » (elle ignorait la classe et la sequence)
   et la « consultation de l'emploi du temps » (aucun module ne la traite). */
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

  /* Regroupement des affectations par classe : c'est la seule porte
     d'entree. Une classe sans affectation n'apparait pas, une matiere
     qui n'est pas la mienne non plus. */
  function mesClasses() {
    if (!session.enseignantId || !an) return [];
    var parClasse = {};
    S.affectationsDeEnseignant(session.enseignantId, an.id).forEach(function (a) {
      if (!parClasse[a.classeId]) parClasse[a.classeId] = { classeId: a.classeId, matieres: [] };
      if (parClasse[a.classeId].matieres.indexOf(a.matiereId) === -1) {
        parClasse[a.classeId].matieres.push(a.matiereId);
      }
    });
    return Object.keys(parClasse).map(function (id) {
      var c = S.classeParId(id);
      if (!c || c.archive) return null;
      var g = parClasse[id];
      return {
        id: id, nom: c.nom, niveau: c.niveau, section: c.section || 'francophone',
        matieres: g.matieres.map(function (m) { return S.matiereParId(m); })
          .filter(function (m) { return m && !m.archive; }),
        eleves: S.elevesDeClasse(id, an.id)
      };
    }).filter(function (c) { return c && c.matieres.length; });
  }

  /* Les notes reellement enregistrees, indexees pour compter vite.
     Le triplet (sequence, eleve, matiere) est ce que le store considere
     comme l'unite de saisie. */
  function notesSaisies() {
    var set = {};
    S.all('notes').forEach(function (n) {
      if (n.archive) return;
      if (n.statut !== 'note') return;
      set[n.sequenceId + '|' + n.eleveId + '|' + n.matiereId] = n;
    });
    return set;
  }

  function attendu(g) {
    return g.eleves.length * g.matieres.length;
  }

  function saisies(set, g, sequenceId) {
    var n = 0;
    g.eleves.forEach(function (e) {
      g.matieres.forEach(function (m) {
        if (set[sequenceId + '|' + e.id + '|' + m.id]) n++;
      });
    });
    return n;
  }

  /* Sequences des trimestres encore ouverts : c'est la que l'enseignant
     a reellement de la saisie a faire. */
  function sequencesOuvertes() {
    if (!an) return [];
    var out = [];
    S.trimestresDe(an.id).forEach(function (tr) {
      if (!tr.ouvert) return;
      S.sequencesDeTrimestre(tr.id).forEach(function (sq) {
        out.push({ sequence: sq, trimestre: tr });
      });
    });
    return out;
  }

  /* Une sequence est saisissable si elle est ouverte, non verrouillee et
     son trimestre ouvert : memes conditions que la page de saisie. */
  function saisissable(x) {
    return x.sequence.ouverte && !x.sequence.verrouillee && x.trimestre.ouvert;
  }

  /* -------------------------- Fragments ------------------------------- */

  function url(route) {
    return R.resolve(route);
  }

  function actionsEnTete() {
    var boite = document.getElementById('actions');
    if (!boite) return;
    var liens = [
      { id: 'tdb-saisie', href: url('teacher_saisie'), icone: 'file-edit', label: t('tdb.ouvrirSaisie', 'Saisie des notes') },
      { id: 'tdb-rapports', href: url('teacher_rapports'), icone: 'bar-chart-3', label: t('tdb.ouvrirRapports', 'Rapports') },
      { id: 'tdb-classes', href: url('teacher_classes'), icone: 'school', label: t('tdb.ouvrirClasses', 'Mes classes') }
    ].map(function (b) {
      return '<a id="' + b.id + '" href="' + b.href + '" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold flex items-center gap-2">' +
        P.ico(b.icone, 16) + P.esc(b.label) + '</a>';
    }).join('');
    var imprimer = '<button type="button" id="tdb-print-listes" class="px-4 py-2 nm-soft-convex rounded-xl text-xs font-bold flex items-center gap-2">' +
      P.ico('printer', 16) + P.esc(t('tdb.imprimerListes', 'Imprimer les listes')) + '</button>';
    boite.innerHTML = imprimer + liens;
    var btn = document.getElementById('tdb-print-listes');
    if (btn && E.listesEleves) {
      btn.addEventListener('click', function () {
        var groupes = mesClasses();
        var entrees = [];
        var infos = {};
        var nomEns = [session.prenom, session.nom].filter(Boolean).join(' ');
        groupes.forEach(function (g) {
          g.matieres.forEach(function (m) {
            entrees.push({ classeId: g.id, matiereId: m.id });
            infos[g.id + '|' + m.id] = {
              enseignant: nomEns,
              matieres: [{ nom: m.nom, coef: S.coefficient(g.id, m.id) }]
            };
          });
        });
        E.listesEleves.choisir(entrees,
          { avecSequences: true, infos: infos, titre: 'Liste-eleves-' + (an ? an.libelle.replace(/\//g, '-') : '') });
      });
    }
  }

  function carteClasse(g, set, sequences) {
    /* Progression de la classe sur les sequences actuellement saisissables. */
    var attenduTotal = 0, saisiTotal = 0;
    sequences.forEach(function (x) {
      if (!saisissable(x)) return;
      attenduTotal += attendu(g);
      saisiTotal += saisies(set, g, x.sequence.id);
    });
    var pct = attenduTotal ? Math.round((saisiTotal / attenduTotal) * 100) : 0;
    var couleurs = ['text-accent bg-accent/10', 'text-blue-500 bg-blue-500/10', 'text-green-500 bg-green-500/10'];
    var section = g.classe ? (g.classe.section || 'francophone') : 'francophone';
    var sectionBadge = section === 'anglophone' 
      ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">Anglophone</span>'
      : '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/10 text-green-500">Francophone</span>';

    return '<article class="nm-flat p-6 rounded-[32px] space-y-4">' +
      '<div class="flex justify-between items-start gap-2">' +
      '<span class="text-xs font-black px-3 py-1 rounded-full ' + couleurs[0] + '">' + P.esc(g.nom) + '</span>' +
      '<div class="flex items-center gap-2">' + sectionBadge + '<span class="text-xs font-bold text-gray-400">' + pct + '%</span></div></div>' +
      '<div><h3 class="text-lg font-bold">' +
      P.esc(g.matieres.map(function (m) { return m.nom; }).join(' · ')) + '</h3>' +
      '<p class="text-xs text-gray-400 mt-1">' +
      P.esc(t('tdb.effectif', '{n} élèves • {saisies}/{total} notes', {
        n: g.eleves.length, saisies: saisiTotal, total: attenduTotal
      })) + '</p></div>' +
      '<div class="seq-jauge"><span style="width:' + pct + '%"></span></div>' +
      '<div class="flex gap-2">' +
      '<a href="' + url('teacher_saisie') + '" class="flex-1 text-center px-3 py-2 nm-soft-convex rounded-xl text-xs font-bold">' +
      P.esc(t('tdb.saisir', 'Saisir')) + '</a>' +
      '<a href="' + url('teacher_rapports') + '" class="flex-1 text-center px-3 py-2 nm-soft-convex rounded-xl text-xs font-bold text-accent">' +
      P.esc(t('tdb.rapport', 'Rapport')) + '</a></div>' +
      '</article>';
  }

  function ligneSequence(x, g, set) {
    var total = attendu(g);
    if (!total) return '';
    var fait = saisies(set, g, x.sequence.id);
    var pct = Math.round((fait / total) * 100);
    var etat = fait === 0 ? 'sequenceVide' : fait >= total ? 'sequenceComplete' : 'sequenceEnCours';
    var couleur = fait === 0 ? 'text-gray-400' : fait >= total ? 'text-green-500' : 'text-amber-500';

    return '<li class="flex items-center gap-3 py-2">' +
      '<div class="min-w-0 flex-1"><p class="text-sm font-semibold truncate">' +
      P.esc(g.nom) + ' <span class="text-gray-400">•</span> ' + P.esc(g.matieres.map(function (m) { return m.nom; }).join(', ')) + '</p>' +
      '<p class="text-[10px] font-black uppercase tracking-widest ' + couleur + '">' +
      P.esc(t('tdb.' + etat, fait === 0 ? 'Aucune note saisie' : fait >= total ? 'Saisie complète' : 'Saisie en cours')) +
      ' — ' + fait + '/' + total + '</p></div>' +
      '<div class="w-24 seq-jauge"><span style="width:' + pct + '%"></span></div>' +
      '<a href="' + url('teacher_saisie') + '" class="px-3 py-2 nm-soft-convex rounded-xl text-xs font-bold">' +
      P.esc(t('tdb.saisir', 'Saisir')) + '</a></li>';
  }

  function dernieresActions() {
    var notes = S.all('notes').filter(function (n) {
      return !n.archive && n.modifiePar === session.enseignantId;
    }).sort(function (a, b) {
      return String(b.modifieLe || '').localeCompare(String(a.modifieLe || ''));
    }).slice(0, 6);

    if (!notes.length) {
      return '<p class="text-sm text-gray-400">' + P.esc(t('tdb.aucuneAction', 'Aucune note saisie pour le moment.')) + '</p>';
    }
    return '<ul class="space-y-4">' + notes.map(function (n) {
      var e = S.eleveParId(n.eleveId), m = S.matiereParId(n.matiereId), c = S.classeParId(n.classeId);
      var notee = n.statut === 'note';
      return '<li class="relative pl-6 border-l-2 border-gray-100 dark:border-gray-800">' +
        '<p class="text-xs font-bold">' +
        P.esc(t('tdb.noteSaisie', 'Note saisie — {eleve}', { eleve: (e ? e.prenom + ' ' + e.nom : '?') })) +
        (c ? ' <span class="text-gray-400 font-normal">• ' + P.esc(c.nom) + '</span>' : '') + '</p>' +
        '<p class="text-[10px] font-black uppercase tracking-widest ' + (notee ? 'text-accent' : 'text-amber-500') + '">' +
        (notee ? P.esc(UI.nombre(n.valeur) + '/' + (m ? m.noteMax : 20)) + ' • ' + P.esc(m ? m.nom : '') : P.esc(t('commun.nonNote', 'Non noté'))) +
        '</p></li>';
    }).join('') + '</ul>';
  }

  /* Rappels calcules, jamais des textes figes : ce qui reste a saisir et ce
     qui n'est plus modifiable. */
  function rappels(sequences, groupes, set) {
    var aFaire = [], fermees = [];
    sequences.forEach(function (x) {
      var total = 0, fait = 0;
      groupes.forEach(function (g) {
        if (!saisissable(x)) return;
        total += attendu(g);
        fait += saisies(set, g, x.sequence.id);
      });
      if (!saisissable(x)) { fermees.push(x); return; }
      if (fait < total) aFaire.push({ x: x, reste: total - fait });
    });

    var out = [];
    if (aFaire.length) {
      var reste = aFaire.reduce(function (a, b) { return a + b.reste; }, 0);
      out.push({
        icone: 'info', classe: 'bg-accent/5 border-accent/10', couleur: 'text-accent',
        texte: t('tdb.rappelEnCours', '{n} séquence(s) encore à saisir', { n: aFaire.length }) + ' (' + reste + ' notes)'
      });
    } else {
      out.push({
        icone: 'check-circle', classe: 'bg-green-500/5 border-green-500/10', couleur: 'text-green-500',
        texte: t('tdb.rappelAJour', 'Toutes vos saisies sont à jour.')
      });
    }
    if (fermees.length) {
      out.push({
        icone: 'lock', classe: 'bg-orange-500/5 border-orange-500/10', couleur: 'text-orange-500',
        texte: t('tdb.rappelFerme', '{n} séquence(s) verrouillée(s) ou close(s).', { n: fermees.length })
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
    var groupes = mesClasses();
    if (!groupes.length) {
      P.rendre(UI.etatVide(t('tdb.aucuneAffectation', 'Aucune affectation ne vous est attribuée cette année.')));
      return;
    }

    var set = notesSaisies();
    var sequences = sequencesOuvertes();
    var saisissables = sequences.filter(saisissable);

    /* Compteurs globaux sur les sequences encore ouvertes. */
    var attenduTotal = 0, saisiTotal = 0, elevesUniques = {};
    groupes.forEach(function (g) {
      g.eleves.forEach(function (e) { elevesUniques[e.id] = 1; });
      saisissables.forEach(function (x) {
        attenduTotal += attendu(g);
        saisiTotal += saisies(set, g, x.sequence.id);
      });
    });
    var elevesSuivis = Object.keys(elevesUniques).length;
    var sequencesEnRetard = 0;
    saisissables.forEach(function (x) {
      var total = 0, fait = 0;
      groupes.forEach(function (g) { total += attendu(g); fait += saisies(set, g, x.sequence.id); });
      if (fait < total) sequencesEnRetard++;
    });

    var contexte = document.getElementById('tdb-contexte');
    if (contexte) {
      contexte.textContent = t('tdb.bienvenue', 'Bonjour, {nom}', {
        nom: [session.prenom, session.nom].filter(Boolean).join(' ')
      }) + ' • ' + an.libelle;
    }

    var cartes = groupes.map(function (g) { return carteClasse(g, set, sequences); }).join('');
    var lignesSeq = saisissables.map(function (x) {
      return groupes.map(function (g) { return ligneSequence(x, g, set); }).join('');
    }).join('');

    var blocs = [
      P.grilleKPI([
        P.carte({ label: t('tdb.mesClasses', 'Mes classes'), valeur: String(groupes.length), icone: 'school', couleur: 'text-accent' }),
        P.carte({ label: t('tdb.elevesSuivis', 'Élèves suivis'), valeur: String(elevesSuivis), icone: 'users-round', couleur: 'text-blue-500' }),
        P.carte({
          label: t('tdb.sequencesASaisir', 'Séquences à saisir'), valeur: String(sequencesEnRetard),
          icone: 'clipboard-list', couleur: 'text-amber-500',
          note:sequencesEnRetard ? t('tdb.sequenceEnCours', 'Saisie en cours') : t('tdb.rappelAJour', 'À jour')
        }),
        P.carte({
          label: t('tdb.tauxSaisie', 'Taux de saisie'),
          valeur: attenduTotal ? String(Math.round((saisiTotal / attenduTotal) * 100)) + '%' : '—',
          icone: 'gauge', couleur: 'text-green-500', note: saisiTotal + '/' + attenduTotal
        })
      ]),

      P.section({
        titre: t('tdb.mesClasses', 'Mes classes'), icone: 'school',
        contenu: '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">' + cartes + '</div>'
      }),

      P.section({
        titre: t('tdb.sequencesASaisir', 'Séquences à saisir'), icone: 'clipboard-list',
        contenu: '<div class="nm-flat p-6 rounded-[32px]">' +
          (lignesSeq ? '<ul class="divide-y divide-gray-100 dark:divide-gray-800">' + lignesSeq + '</ul>'
            : '<p class="text-sm text-gray-400">' + P.esc(t('tdb.aucuneSequence', 'Aucune séquence ouverte pour le trimestre en cours.')) + '</p>') +
          '</div>'
      }),

      P.section({
        titre: t('tdb.derniereActions', 'Dernières actions'), icone: 'history',
        contenu: '<div class="nm-flat p-6 rounded-[32px]">' + dernieresActions() + '</div>'
      }),

      P.section({
        titre: t('tdb.rappels', 'Rappels'), icone: 'bell',
        contenu: blocRappels(rappels(sequences, groupes, set))
      })
    ];

    P.rendre(blocs);
    actionsEnTete();
    if (E.i18n) E.i18n.appliquer();
  }

  /* Le contenu est ecrit avec t() : i18n.js ne peut pas le retraduire
     seul, on se rend donc a nouveau sur son signal. */
  document.addEventListener('eduneum:langue', function () { rendre(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rendre);
  else rendre();
})();
