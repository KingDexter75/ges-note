/* EduNeum - Saisie des notes (couplee, enseignant).
   Variante de js/saisie-des-notes.js : on choisit un TRIMESTRE au lieu d'une
   sequence et l'on saisit EN UNE FOIS les notes de toutes les sequences de
   ce trimestre (generalement deux). Chaque case correspond a une sequence
   precise ; l'enregistrement ecrit une note par eleve et par sequence.

   Memes regles que la saisie simple :
     - seules les affectations de l'enseignant sont proposables ;
     - une sequence fermee, verrouillee ou dont le trimestre est ferme
       bloque la saisie ;
     - la note est bornee a 0..noteMax de la matiere ;
     - une case vide vaut « non note », jamais 0 ;
     - l'eleve se ghere par l'inscription, pas depuis cette page. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, C = E.calculs, UI = E.ui, P = E.page;
  if (!E.auth.estConnecte()) return;

  var session = E.auth.session();
  var an = E.layout.anneeChoisie();
  var tbody = document.getElementById('grade-table-body');
  var thead = document.getElementById('grade-table-head');
  if (!tbody) return;

  var etat = {
    classeId: '', matiereId: '', trimestreId: '',
    sequences: [], brouillon: {}, historique: [], position: -1
  };

  /* L'administration (SEUL administrateur, la direction n'ecrit pas les
      notes) saisit les notes de TOUTE la classe et de TOUTES les matieres
      qui y sont dispensees ; un enseignant est borne a ses propres
      affectations. */
  function estGestionnaire() {
    return !!(E.acces && E.acces.estAdmin && E.acces.estAdmin());
  }

  /* Bareme de la note maximale d'une classe : 20, ou 100 en section anglophone. */
  function getNoteMaxForClass(classeId) {
    if (S.noteMaxPourClasse) return S.noteMaxPourClasse(classeId);
    var c = S.classeParId(classeId);
    return (c && c.section === 'anglophone') ? 100 : 20;
  }

  /* ------------------------- Raccourcis de toast ----------------------- */
  function showToast(message, type) {
    if (E.ui && E.ui.toast) { E.ui.toast(message, type || 'info'); return; }
    var c = document.getElementById('toast-container');
    if (!c) return;
    var t = document.createElement('div');
    t.className = 'nm-flat p-4 rounded-2xl flex items-center space-x-3 min-w-[280px]';
    t.innerHTML = '<div class="flex-1"><p class="text-sm font-bold">' +
      (type === 'error' ? 'Erreur' : 'Succès') + '</p><p class="text-xs text-gray-500">' + message + '</p></div>';
    c.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }

  /* --------------------------- Selecteurs ------------------------------ */
  function mesCombinaisons() {
    if (!an || !session.enseignantId) return [];
    return S.affectationsDeEnseignant(session.enseignantId, an.id);
  }

  function matieresDispensees(classeId) {
    var parId = {};
    S.matieresDeClasse(classeId).forEach(function (m) { parId[m.id] = m; });
    S.affectationsDe(an.id).forEach(function (a) {
      if (a.classeId !== classeId || a.archive) return;
      var m = S.matiereParId(a.matiereId);
      if (m && !m.archive) parId[m.id] = m;
    });
    return Object.keys(parId).map(function (k) { return parId[k]; })
      .sort(function (a, b) { return a.nom.localeCompare(b.nom); });
  }

  function remplirSelecteurs() {
    var selC = document.getElementById('sel-classe');
    var selM = document.getElementById('sel-matiere');
    var selT = document.getElementById('sel-trimestre');

    var classes = [], matieres = [];
    if (estGestionnaire()) {
      classes = S.classesDe(an.id).slice().sort(function (a, b) { return a.nom.localeCompare(b.nom); });
      matieres = etat.classeId ? matieresDispensees(etat.classeId) : [];
    } else {
      var combi = mesCombinaisons();
      var vus = {};
      combi.forEach(function (a) {
        if (vus[a.classeId]) return;
        var c = S.classeParId(a.classeId);
        if (c) { vus[a.classeId] = 1; classes.push(c); }
      });
      matieres = combi.filter(function (a) { return a.classeId === etat.classeId; })
        .map(function (a) { return S.matiereParId(a.matiereId); }).filter(Boolean);
      if (!combi.length) {
        avertir("Aucune affectation ne vous est attribuée cette année : la saisie est impossible. Contactez l'administration.", 'ambre');
      }
    }

    selC.innerHTML = '<option value="">Sélectionner une classe</option>' +
      classes.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === etat.classeId ? ' selected' : '') + '>' + P.esc(c.nom) + '</option>';
      }).join('');

    selM.innerHTML = '<option value="">Sélectionner une matière</option>' +
      matieres.map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === etat.matiereId ? ' selected' : '') + '>' + P.esc(m.nom) + '</option>';
      }).join('');

    /* Tous les trimestres de l'annee sont proposables : c'est au moment de
       charger la liste que l'on verifie l'etat d'ouverture des sequences. */
    var trimestres = an ? S.trimestresDe(an.id) : [];
    if (etat.trimestreId && !trimestres.some(function (t) { return t.id === etat.trimestreId; })) {
      etat.trimestreId = '';
    }
    selT.innerHTML = '<option value="">Sélectionner un trimestre</option>' +
      (trimestres.length
        ? trimestres.map(function (t) {
          return '<option value="' + t.id + '"' + (t.id === etat.trimestreId ? ' selected' : '') + '>' +
            P.esc(t.libelle) + (t.ouvert ? '' : ' (fermé)') + '</option>';
        }).join('')
        : '<option value="" disabled selected>Aucun trimestre</option>');
  }

  function avertir(message, ton) {
    var hote = document.getElementById('alerte-saisie');
    if (!hote) return;
    hote.innerHTML = '<div class="p-5 rounded-[32px] nm-flat bg-' + ton + '-500/5 border border-' + ton + '-500/20 flex items-start gap-3">' +
      '<span class="text-' + ton + '-500 mt-0.5">' + P.ico('triangle-alert', 18) + '</span>' +
      '<p class="text-sm font-bold">' + P.esc(message) + '</p></div>';
  }

  /* ---------------------------- Chargement ----------------------------- */
  function charger() {
    var btn = document.getElementById('btn-load-list');
    var ic = document.getElementById('load-icon');
    var sp = document.getElementById('load-spinner');
    if (btn) btn.disabled = true;
    if (ic) ic.classList.add('hidden');
    if (sp) sp.classList.remove('hidden');

    setTimeout(function () {
      if (btn) btn.disabled = false;
      if (ic) ic.classList.remove('hidden');
      if (sp) sp.classList.add('hidden');

      if (!etat.classeId || !etat.matiereId) { showToast('Choisissez une classe et une matière.', 'error'); return; }
      if (!etat.trimestreId) { showToast('Choisissez un trimestre.', 'error'); return; }
      rendreTable();
    }, 300);
  }

  /* Les sequences du trimestre sont lues dans le store puis classees par
     numero : la/les colonne(s) de saisie en decoulent. */
  function sequencesDuTrimestre() {
    if (!etat.trimestreId) return [];
    return S.sequencesDeTrimestre(etat.trimestreId);
  }

  /* Autorise la saisie d'une sequence donnee du trimestre (droits + etat). */
  function peutSaisirSequence(seq) {
    if (!seq) return { ok: false, message: 'Séquence introuvable.' };
    var trimestre = S.trimestreParId(seq.trimestreId);
    if (!trimestre || !trimestre.ouvert) return { ok: false, message: 'Le trimestre de cette séquence est fermé : la saisie est bloquée.' };
    if (seq.verrouillee) return { ok: false, message: 'Séquence verrouillée par l\'administration.' };
    if (!seq.ouverte) return { ok: false, message: 'Séquence non ouverte par l\'administration : l\'enregistrement est bloqué.' };
    if (!estGestionnaire() && session.enseignantId &&
      !S.peutSaisir(session.enseignantId, etat.classeId, etat.matiereId, an.id)) {
      return { ok: false, message: 'Vous n\'êtes pas affecté à cette classe/matière.' };
    }
    return { ok: true };
  }

  function rendreTable() {
    etat.sequences = sequencesDuTrimestre();
    var eleves = S.elevesDeClasse(etat.classeId, an.id);
    var classe = S.classeParId(etat.classeId);
    var trimestre = etat.trimestreId ? S.trimestreParId(etat.trimestreId) : null;
    var noteMax = getNoteMaxForClass(etat.classeId);
    var step = noteMax > 20 ? 1 : 0.25;
    var placeholder = noteMax > 20 ? '0-100' : '--';

    if (!etat.sequences.length) {
      avertir('Ce trimestre ne contient aucune séquence : la saisie couplée est impossible.', 'ambre');
    } else {
      var bloq = null;
      for (var i = 0; i < etat.sequences.length; i++) {
        var a = peutSaisirSequence(etat.sequences[i]);
        if (!a.ok) { bloq = a.message; break; }
      }
      if (bloq) avertir(bloq, 'ambre');
    }

    var h2 = document.getElementById('saisie-titre');
    if (h2) h2.textContent = 'Saisie Couplée - ' + (classe ? classe.nom : '') + (trimestre ? ' · ' + trimestre.libelle : '');

    var badgeT = document.getElementById('badge-trimestre');
    if (badgeT) {
      badgeT.textContent = trimestre ? trimestre.libelle : '—';
      badgeT.className = 'text-xs font-semibold px-3 py-1 rounded-full ' +
        (!trimestre || !trimestre.ouvert ? 'bg-amber-500/10 text-amber-500' : 'bg-accent/10 text-accent');
    }

    /* En-tete : une colonne « Note » par sequence du trimestre. */
    if (thead) {
      thead.innerHTML = '<th class="py-6 px-8">Élève</th>' +
        etat.sequences.map(function (s) {
          return '<th class="py-6 px-4 min-w-[140px]">' + P.esc(s.libelle) +
            (s.verrouillee ? ' (verrouillée)' : (!s.ouverte ? ' (fermée)' : '')) +
            '<span class="block text-[10px] font-medium normal-case text-gray-400">Note /' + noteMax + '</span></th>';
        }).join('') +
        '<th class="py-6 px-8 text-right">Statut</th>';
    }

    etat.brouillon = {};
    eleves.forEach(function (e) {
      var cellules = {};
      etat.sequences.forEach(function (s) {
        var n = S.note(s.id, e.id, etat.matiereId);
        cellules[s.id] = {
          valeur: n && n.statut === 'note' ? String(n.valeur) : '',
          remarque: n ? (n.remarque || '') : '',
          initial: n ? (n.statut === 'note' ? 'note' : 'non-note') : 'nouveau'
        };
      });
      etat.brouillon[e.id] = cellules;
    });

    tbody.innerHTML = eleves.map(function (e) {
      var cellules = etat.brouillon[e.id];
      return '<tr class="hover:bg-white/5 transition-colors group" data-eleve="' + e.id + '">' +
        '<td class="py-4 px-8"><div class="flex items-center space-x-3">' +
        '<div class="w-10 h-10 rounded-full nm-inset flex items-center justify-center text-accent font-bold text-xs">' +
        P.esc((e.prenom.charAt(0) + e.nom.charAt(0)).toUpperCase()) + '</div>' +
        '<div><p class="text-sm font-semibold">' + P.esc(e.prenom + ' ' + e.nom) + '</p>' +
        '<p class="text-xs text-gray-400">' + P.esc(e.matricule) + '</p></div></div></td>' +
        etat.sequences.map(function (s) {
          var b = cellules[s.id];
          var gceInfo = '';
          if (noteMax > 20 && b.valeur !== '') {
            var n = Number(b.valeur);
            if (!isNaN(n)) { gceInfo = '<span class="text-xs text-blue-500 ml-1">≈ ' + C.noteVersGCE(n).grade + '</span>'; }
          }
          return '<td class="py-4 px-4"><input type="number" min="0" max="' + noteMax + '" step="' + step + '" value="' + P.esc(b.valeur) +
            '" placeholder="' + placeholder + '" data-seq="' + s.id + '" ' +
            ' class="w-24 p-3 rounded-xl input-nm text-center font-bold text-accent note-saisie">' + gceInfo + '</td>';
        }).join('') +
        '<td class="py-4 px-8 text-right"><span class="status-badge text-gray-400 italic text-xs">Non saisi</span></td>' +
        '</tr>';
    }).join('');

    majStatutLignes();
    brancherTable();
    majProgression();
    sauverHistorique();
    rendreRecentes();
  }

  /* Le statut d'une ligne resume l'ensemble de ses cases : « Enregistré » si
     toutes les notes existaient deja, sinon « À enregistrer ». */
  function majStatutLignes() {
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var id = tr.getAttribute('data-eleve');
      var cellules = etat.brouillon[id] || {};
      var badge = tr.querySelector('.status-badge');
      if (!badge) return;
      var total = etat.sequences.length;
      var valides = 0;
      etat.sequences.forEach(function (s) { if (cellules[s.id] && cellules[s.id].initial === 'note') valides++; });
      if (total && valides === total) {
        badge.textContent = 'Enregistré';
        badge.className = 'status-badge text-green-500 font-bold text-[10px] nm-inset px-2 py-1 rounded-lg uppercase tracking-wider';
      } else if (valides > 0) {
        badge.textContent = 'Partiel';
        badge.className = 'status-badge text-accent font-bold text-[10px] nm-inset px-2 py-1 rounded-lg uppercase tracking-wider';
      } else {
        badge.textContent = 'Non saisi';
        badge.className = 'status-badge text-gray-400 italic text-xs';
      }
    });
  }

  function brancherTable() {
    var noteMax = getNoteMaxForClass(etat.classeId);
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var id = tr.getAttribute('data-eleve');
      tr.querySelectorAll('input.note-saisie').forEach(function (input) {
        var seqId = input.getAttribute('data-seq');
        input.addEventListener('input', function () {
          var v = input.value;
          var cellule = etat.brouillon[id][seqId];
          cellule.valeur = v;
          var n = v === '' ? null : Number(v);
          if (n !== null && (isNaN(n) || n < 0 || n > noteMax)) {
            input.classList.add('ring-2', 'ring-red-500');
          } else {
            input.classList.remove('ring-2', 'ring-red-500');
            cellule.initial = n === null ? 'non-note' : 'note';
          }
          majStatutLignes();
          majProgression();
        });
        input.addEventListener('change', sauverHistorique);
      });
    });
  }

  function majProgression() {
    var rows = tbody.querySelectorAll('tr').length;
    var inputs = Array.from(tbody.querySelectorAll('input.note-saisie'));
    var total = inputs.length;
    var rempli = inputs.filter(function (i) { return i.value !== ''; }).length;
    var pct = total ? Math.round((rempli / total) * 100) : 0;
    var bar = document.getElementById('progress-bar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.className = 'h-full transition-all duration-500 ' + (pct < 25 ? 'bg-red-500' : pct < 75 ? 'bg-yellow-500' : 'bg-green-500');
    }
    var txt = document.getElementById('progress-text');
    if (txt) txt.textContent = rempli + '/' + total + ' notes saisies (' + pct + '%)';
    var sum = document.getElementById('summary-count');
    if (sum) sum.textContent = 'Saisie de ' + rempli + '/' + total + ' notes en cours (' + rows + ' élèves)';
  }

  /* -------------------------- Annuler / rétablir ----------------------- */
  function sauverHistorique() {
    var instant = JSON.stringify(etat.brouillon);
    if (etat.historique[etat.position] === instant) return;
    etat.historique = etat.historique.slice(0, etat.position + 1);
    etat.historique.push(instant);
    if (etat.historique.length > 40) etat.historique.shift();
    etat.position = etat.historique.length - 1;
    majBoutonsHistorique();
  }

  function majBoutonsHistorique() {
    var u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
    if (u) {
      u.classList.toggle('opacity-50', etat.position <= 0);
      u.classList.toggle('cursor-not-allowed', etat.position <= 0);
    }
    if (r) {
      r.classList.toggle('opacity-50', etat.position >= etat.historique.length - 1);
      r.classList.toggle('cursor-not-allowed', etat.position >= etat.historique.length - 1);
    }
  }

  function restaurer(index) {
    if (index < 0 || index >= etat.historique.length) return;
    etat.position = index;
    etat.brouillon = JSON.parse(etat.historique[index]);
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var id = tr.getAttribute('data-eleve');
      var cellules = etat.brouillon[id];
      if (!cellules) return;
      tr.querySelectorAll('input.note-saisie').forEach(function (input) {
        var b = cellules[input.getAttribute('data-seq')];
        if (b) input.value = b.valeur;
      });
    });
    majStatutLignes();
    majProgression();
    majBoutonsHistorique();
  }

  /* ------------------------------ Actions ------------------------------ */
  function enregistrer() {
    if (!etat.sequences.length) { showToast('Aucune séquence dans ce trimestre.', 'error'); return; }

    var erreurs = [], ecrites = 0, nonNotees = 0;
    var noteMax = getNoteMaxForClass(etat.classeId);

    Object.keys(etat.brouillon).forEach(function (eleveId) {
      etat.sequences.forEach(function (s) {
        var b = etat.brouillon[eleveId][s.id];
        var v = b.valeur === '' ? null : Number(b.valeur);
        if (v !== null && (isNaN(v) || v < 0 || v > noteMax)) {
          erreurs.push((S.eleveParId(eleveId) || {}).nom + ' — ' + s.libelle + ' : hors bornes (0-' + noteMax + ')');
          return;
        }
        var res = S.enregistrerNote({
          sequenceId: s.id, eleveId: eleveId,
          classeId: etat.classeId, matiereId: etat.matiereId,
          valeur: v, remarque: b.remarque, modifiePar: session.enseignantId
        });
        if (!res || res.ok === false) {
          erreurs.push((res && res.message) || ('Échec pour ' + s.libelle + '.'));
          return;
        }
        if (v === null) nonNotees++; else ecrites++;
      });
    });

    if (erreurs.length) { showToast(erreurs[0], 'error'); return; }

    P.tracer('note.enregistrement', 'trimestre:' + etat.trimestreId,
      ecrites + ' note(s), ' + nonNotees + ' non notée(s)');
    showToast(ecrites + ' note(s) enregistrée(s), ' + nonNotees + ' non notée(s).', 'success');
    rendreTable();
  }

  function moyenneClasse() {
    var inputs = Array.from(tbody.querySelectorAll('input.note-saisie'));
    var valeurs = inputs.map(function (i) { return i.value === '' ? null : Number(i.value); })
      .filter(function (v) { return v !== null && !isNaN(v); });
    if (!valeurs.length) { showToast('Aucune note à calculer.', 'error'); return; }
    var moy = valeurs.reduce(function (a, b) { return a + b; }, 0) / valeurs.length;
    var max = getNoteMaxForClass(etat.classeId);
    showToast('Moyenne du trimestre : ' + UI.nombre(moy) + '/' + max, 'info');
  }

  function exporter() {
    var colonnes = [{ cle: 'eleve', titre: 'Élève' }, { cle: 'matricule', titre: 'Matricule' }];
    etat.sequences.forEach(function (s) { colonnes.push({ cle: s.id, titre: s.libelle }); });

    var lignes = Array.from(tbody.querySelectorAll('tr')).map(function (tr) {
      var e = S.eleveParId(tr.getAttribute('data-eleve')) || {};
      var ligne = { eleve: (e.prenom || '') + ' ' + (e.nom || ''), matricule: e.matricule || '' };
      etat.sequences.forEach(function (s) {
        var input = tr.querySelector('input[data-seq="' + s.id + '"]');
        ligne[s.id] = input && input.value !== '' ? input.value : 'non noté';
      });
      return ligne;
    });
    UI.exporterCSV(colonnes, lignes, 'notes-' + (S.classeParId(etat.classeId) || {}).nom + '-' + etat.trimestreId);
    P.tracer('export.notes', 'trimestre:' + etat.trimestreId, 'Export CSV de la saisie couplée');
    showToast('CSV généré.', 'success');
  }

  /* --------------------- Dernières notes saisies ---------------------- */
  function rendreRecentes() {
    var tbody2 = document.getElementById('dernieres-notes');
    if (!tbody2) return;
    var notes = S.all('notes').slice().sort(function (a, b) {
      return (b.modifieLe || '').localeCompare(a.modifieLe || '');
    });
    if (session.enseignantId) {
      notes = notes.filter(function (n) { return n.modifiePar === session.enseignantId; });
    }
    notes = notes.slice(0, 6);

    if (!notes.length) {
      tbody2.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-sm text-gray-400">Aucune note enregistrée pour le moment.</td></tr>';
      return;
    }
    tbody2.innerHTML = notes.map(function (n) {
      var e = S.eleveParId(n.eleveId) || {};
      var m = S.matiereParId(n.matiereId);
      var c = S.classeParId(n.classeId);
      var notee = n.statut === 'note';
      return '<tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-white/5 transition-colors">' +
        '<td class="py-4 px-2 font-medium">' + P.esc((e.prenom || '?') + ' ' + (e.nom || '')) +
        (c ? ' <span class="text-xs text-gray-400">· ' + P.esc(c.nom) + '</span>' : '') + '</td>' +
        '<td class="py-4 px-2">' + P.esc(m ? m.nom : '—') + '</td>' +
        '<td class="py-4 px-2 font-bold text-accent">' + (notee ? P.esc(UI.nombre(n.valeur) + '/' + (m ? m.noteMax : 20)) : 'Non noté') + '</td>' +
        '<td class="py-4 px-2 text-right"><span class="px-2 py-1 rounded-lg text-[10px] font-bold ' +
        (notee ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600') +
        '">' + (notee ? 'SAISIE' : 'ABS') + '</span></td></tr>';
    }).join('');
  }

  /* ---------------------------- Branchement ---------------------------- */
  function init() {
    if (!an) { avertir("Aucune année scolaire active : la saisie des notes est indisponible.", 'rouge'); return; }
    remplirSelecteurs();

    var selC = document.getElementById('sel-classe');
    var selM = document.getElementById('sel-matiere');
    var selT = document.getElementById('sel-trimestre');
    if (selC) selC.addEventListener('change', function () { etat.classeId = selC.value; etat.matiereId = ''; remplirSelecteurs(); });
    if (selM) selM.addEventListener('change', function () { etat.matiereId = selM.value; });
    if (selT) selT.addEventListener('change', function () { etat.trimestreId = selT.value; });

    var charger2 = document.getElementById('btn-load-list');
    if (charger2) charger2.addEventListener('click', charger);

    var save = document.getElementById('btn-save');
    if (save) save.addEventListener('click', enregistrer);

    var cancel = document.getElementById('btn-cancel');
    if (cancel) cancel.addEventListener('click', function () { rendreTable(); showToast('Modifications annulées.', 'info'); });

    var avg = document.getElementById('btn-avg');
    if (avg) avg.addEventListener('click', moyenneClasse);

    var exp = document.getElementById('btn-export');
    if (exp) exp.addEventListener('click', exporter);

    var undo = document.getElementById('btn-undo');
    if (undo) undo.addEventListener('click', function () { restaurer(etat.position - 1); });
    var redo = document.getElementById('btn-redo');
    if (redo) redo.addEventListener('click', function () { restaurer(etat.position + 1); });

    window.addEventListener('keydown', function (ev) {
      if (!ev.ctrlKey) return;
      if (ev.key === 'z') { ev.preventDefault(); restaurer(etat.position - 1); }
      if (ev.key === 'y') { ev.preventDefault(); restaurer(etat.position + 1); }
      if (ev.key === 's') { ev.preventDefault(); enregistrer(); }
    });

    majBoutonsHistorique();
    rendreRecentes();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
