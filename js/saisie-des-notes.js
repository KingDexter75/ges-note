/* EduNeum - Saisie des notes (enseignant).
   On conserve l'interface d'origine (barre de progression, annuler/rétablir,
   moyenne, export) mais les donnees viennent du store et les regles de la spec
   sont appliquees :
     - seules les affectations de l'enseignant sont proposables ;
     - une sequence fermee, verrouillee ou sans trimestre ouvert bloque la saisie ;
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
  if (!tbody) return;

  var etat = {
    classeId: '', matiereId: '', sequenceId: '',
    brouillon: {}, historique: [], position: -1
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

  /* Matieres reellement dispensees dans une classe : celles du programme
     (coefficient > 0) et celles couvertes par une affectation active. */
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
    var selS = document.getElementById('sel-sequence');

    var classes = [], matieres = [];
    if (estGestionnaire()) {
      classes = S.classesDe(an.id).slice().sort(S.comparerClasses);
      matieres = etat.classeId ? matieresDispensees(etat.classeId) : [];
    } else {
      var combi = mesCombinaisons();
      var vus = {};
      combi.forEach(function (a) {
        if (vus[a.classeId]) return;
        var c = S.classeParId(a.classeId);
        if (c) { vus[a.classeId] = 1; classes.push(c); }
      });
      /* meme ordre que partout ailleurs : niveau, puis alphabetique */
      classes.sort(S.comparerClasses);
      matieres = combi.filter(function (a) { return a.classeId === etat.classeId; })
        .map(function (a) { return S.matiereParId(a.matiereId); }).filter(Boolean);
      if (!combi.length) {
        avertir("Aucune affectation ne vous est attribuée cette année : la saisie est impossible. Contactez l'administration.", 'ambre');
      }
    }

    /* On reconstruit les <option> puis on reapplique la selection courante :
       innerHTML vide la selection, il faut donc la replacer explicitement. */
    selC.innerHTML = '<option value="">Sélectionner une classe</option>' +
      classes.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === etat.classeId ? ' selected' : '') + '>' + P.esc(c.nom) + '</option>';
      }).join('');

    selM.innerHTML = '<option value="">Sélectionner une matière</option>' +
      matieres.map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === etat.matiereId ? ' selected' : '') + '>' + P.esc(m.nom) + '</option>';
      }).join('');

    /* Seules les sequences OUVERTES sont proposables, et ce dans TOUS les
       trimestres ouverts de l'annee : on ne sait pas a l'avance dans quel
       trimestre l'administration a ouvert ses sequences. Une sequence
       fermee n'apparait plus jamais dans le selecteur (la saisie de toute
       facon la bloquerait). */
    var sequences = an ? S.sequencesDe(an.id).filter(function (s) { return s.ouverte; }) : [];
    if (etat.sequenceId && !sequences.some(function (s) { return s.id === etat.sequenceId; })) {
      etat.sequenceId = '';
    }
    if (an && !sequences.length) {
      avertir('Aucune séquence n\'est ouverte pour le moment : demandez à l\'administration d\'en ouvrir une depuis la page « Année scolaire ».', 'rouge');
    }
    selS.innerHTML = '<option value="">Sélectionner une séquence</option>' +
      (sequences.length
        ? sequences.map(function (s) {
          var t = S.trimestreParId(s.trimestreId);
          return '<option value="' + s.id + '"' + (s.id === etat.sequenceId ? ' selected' : '') + '>' +
            P.esc(s.libelle) + (t ? ' · ' + P.esc(t.libelle) : '') +
            (s.verrouillee ? ' (verrouillée)' : '') + '</option>';
        }).join('')
        : '<option value="" disabled selected>Aucune séquence ouverte</option>');
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
      if (!etat.sequenceId) { showToast('Choisissez une séquence.', 'error'); return; }
      rendreTable();
    }, 300);
  }

  function sequenceCourante() { return etat.sequenceId ? S.sequenceParId(etat.sequenceId) : null; }

  function peutSaisir() {
    var seq = sequenceCourante();
    if (!seq) return { ok: false, message: 'Aucune séquence sélectionnée.' };
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
    var autorise = peutSaisir();
    var eleves = S.elevesDeClasse(etat.classeId, an.id);
    var classe = S.classeParId(etat.classeId);
    var seq = sequenceCourante();

    if (!autorise.ok) avertir(autorise.message, 'ambre');

    var h2 = document.getElementById('saisie-titre');
    if (h2) h2.textContent = 'Saisie Collective - ' + (classe ? classe.nom : '');

    var badgeT = document.getElementById('badge-trimestre');
    if (badgeT) {
      var trim = seq ? S.trimestreParId(seq.trimestreId) : null;
      badgeT.textContent = trim ? trim.libelle : '—';
      badgeT.className = 'text-xs font-semibold px-3 py-1 rounded-full ' +
        (!trim || !trim.ouvert ? 'bg-amber-500/10 text-amber-500' : 'bg-accent/10 text-accent');
    }

    etat.brouillon = {};
    eleves.forEach(function (e) {
      var n = S.note(etat.sequenceId, e.id, etat.matiereId);
      etat.brouillon[e.id] = {
        valeur: n && n.statut === 'note' ? String(n.valeur) : '',
        remarque: n ? (n.remarque || '') : '',
        initial: n ? (n.statut === 'note' ? 'note' : 'non-note') : 'nouveau'
      };
    });

    tbody.innerHTML = eleves.map(function (e) {
      var b = etat.brouillon[e.id];
      var noteMax = getNoteMaxForClass(etat.classeId);
      var step = noteMax > 20 ? 1 : 0.25;
      var placeholder = noteMax > 20 ? '0-100' : '--';
      var gceInfo = '';
      if (noteMax > 20 && b.valeur !== '') {
        var n = Number(b.valeur);
        if (!isNaN(n)) {
          var gce = C.noteVersGCE(n);
          gceInfo = '<span class="text-xs text-blue-500 ml-2">≈ ' + gce.grade + '</span>';
        }
      }
      return '<tr class="hover:bg-white/5 transition-colors group" data-eleve="' + e.id + '">' +
        '<td class="py-4 px-8"><div>' +
        '<p class="text-sm font-semibold">' + P.esc(e.nom + ' ' + e.prenom) + '</p>' +
        '<p class="text-xs text-gray-400">' + P.esc(e.matricule) + '</p></div></td>' +
        '<td class="py-4 px-4"><input type="number" min="0" max="' + noteMax + '" step="' + step + '" value="' + P.esc(b.valeur) +
        '" placeholder="' + placeholder + '" ' +
        ' class="w-24 p-3 rounded-xl input-nm text-center font-bold text-accent note-saisie">' + gceInfo + '</td>' +
        '<td class="py-4 px-4"><input type="text" value="' + P.esc(b.remarque) + '" placeholder="Remarque…" ' +
        ' class="w-full p-3 rounded-xl input-nm text-sm"></td>' +
        '<td class="py-4 px-8 text-right"><span class="status-badge ' +
        (b.initial === 'note' ? 'text-green-500 font-bold text-[10px] nm-inset px-2 py-1 rounded-lg uppercase tracking-wider'
          : 'text-gray-400 italic text-xs') + '">' +
        (b.initial === 'note' ? 'Enregistré' : 'Non saisi') + '</span></td>' +
        '<td class="py-4 px-4 text-center"><span class="text-gray-300 text-xs">ABS = non noté</span></td>' +
        '</tr>';
    }).join('');

    brancherTable();
    majProgression();
    sauverHistorique();
    rendreRecentes();
  }

  function brancherTable() {
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var id = tr.getAttribute('data-eleve');
      var inputNote = tr.querySelector('input[type="number"]');
      var inputRem = tr.querySelector('input[type="text"]');
      var badge = tr.querySelector('.status-badge');

      inputNote.addEventListener('input', function () {
        var v = inputNote.value;
        etat.brouillon[id].valeur = v;
        var max = getNoteMaxForClass(etat.classeId);
        var n = v === '' ? null : Number(v);
        if (n !== null && (isNaN(n) || n < 0 || n > max)) {
          inputNote.classList.add('ring-2', 'ring-red-500');
          badge.textContent = 'Hors bornes (0-' + max + ')';
          badge.className = 'status-badge text-red-500 font-bold text-[10px] nm-inset px-2 py-1 rounded-lg uppercase tracking-wider';
        } else {
          inputNote.classList.remove('ring-2', 'ring-red-500');
          badge.textContent = n === null ? 'Non noté' : 'À enregistrer';
          badge.className = 'status-badge ' + (n === null
            ? 'text-amber-500 font-bold text-[10px] nm-inset px-2 py-1 rounded-lg uppercase tracking-wider'
            : 'text-accent font-bold text-[10px] nm-inset px-2 py-1 rounded-lg uppercase tracking-wider');
        }
        majProgression();
      });
      inputNote.addEventListener('change', sauverHistorique);

      if (inputRem) {
        inputRem.addEventListener('input', function () { etat.brouillon[id].remarque = inputRem.value; });
        inputRem.addEventListener('change', sauverHistorique);
      }
    });
  }

  function majProgression() {
    var rows = tbody.querySelectorAll('tr').length;
    var rempli = tbody.querySelectorAll('input[type="number"]').length &&
      Array.from(tbody.querySelectorAll('input[type="number"]')).filter(function (i) { return i.value !== ''; }).length;
    var pct = rows ? Math.round((rempli / rows) * 100) : 0;
    var bar = document.getElementById('progress-bar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.className = 'h-full transition-all duration-500 ' + (pct < 25 ? 'bg-red-500' : pct < 75 ? 'bg-yellow-500' : 'bg-green-500');
    }
    var txt = document.getElementById('progress-text');
    if (txt) txt.textContent = rempli + '/' + rows + ' élèves saisis (' + pct + '%)';
    var sum = document.getElementById('summary-count');
    if (sum) sum.textContent = 'Saisie de ' + rempli + '/' + rows + ' élèves en cours';
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
      var b = etat.brouillon[id];
      if (!b) return;
      tr.querySelector('input[type="number"]').value = b.valeur;
      tr.querySelector('input[type="text"]').value = b.remarque;
    });
    majProgression();
    majBoutonsHistorique();
  }

  /* ------------------------------ Actions ------------------------------ */
  function enregistrer() {
    var autorise = peutSaisir();
    if (!autorise.ok) { showToast(autorise.message, 'error'); return; }

    var erreurs = [], ecrites = 0, nonNotees = 0;
    var max = getNoteMaxForClass(etat.classeId);

    Object.keys(etat.brouillon).forEach(function (eleveId) {
      var b = etat.brouillon[eleveId];
      var v = b.valeur === '' ? null : Number(b.valeur);
      if (v !== null && (isNaN(v) || v < 0 || v > max)) {
        erreurs.push((S.eleveParId(eleveId) || {}).nom + ' : note hors bornes (0-' + max + ')');
        return;
      }
      S.enregistrerNote({
        sequenceId: etat.sequenceId, eleveId: eleveId,
        classeId: etat.classeId, matiereId: etat.matiereId,
        valeur: v, remarque: b.remarque, modifiePar: session.enseignantId
      });
      if (v === null) nonNotees++; else ecrites++;
    });

    if (erreurs.length) { showToast(erreurs[0], 'error'); return; }

    P.tracer('note.enregistrement', 'sequence:' + etat.sequenceId,
      ecrites + ' note(s), ' + nonNotees + ' non notée(s)');
    showToast(ecrites + ' note(s) enregistrée(s), ' + nonNotees + ' non notée(s).', 'success');
    rendreTable();
  }

  function moyenneClasse() {
    var inputs = Array.from(tbody.querySelectorAll('input[type="number"]'));
    var valeurs = inputs.map(function (i) { return i.value === '' ? null : Number(i.value); })
      .filter(function (v) { return v !== null && !isNaN(v); });
    if (!valeurs.length) { showToast('Aucune note à calculer.', 'error'); return; }
    var moy = valeurs.reduce(function (a, b) { return a + b; }, 0) / valeurs.length;
    var max = getNoteMaxForClass(etat.classeId);
    showToast('Moyenne de la séquence : ' + UI.nombre(moy) + '/' + max, 'info');
  }

  function exporter() {
    var lignes = Array.from(tbody.querySelectorAll('tr')).map(function (tr) {
      var e = S.eleveParId(tr.getAttribute('data-eleve')) || {};
      return {
        eleve: (e.nom || '') + ' ' + (e.prenom || ''), matricule: e.matricule || '',
        note: tr.querySelector('input[type="number"]').value || 'non noté',
        remarque: tr.querySelector('input[type="text"]').value || ''
      };
    });
    UI.exporterCSV([
      { cle: 'eleve', titre: 'Élève' }, { cle: 'matricule', titre: 'Matricule' },
      { cle: 'note', titre: 'Note' }, { cle: 'remarque', titre: 'Remarque' }
    ], lignes, 'notes-' + (S.classeParId(etat.classeId) || {}).nom + '-' + etat.sequenceId);
    P.tracer('export.notes', 'sequence:' + etat.sequenceId, 'Export CSV de la saisie');
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
        '<td class="py-4 px-2 font-medium">' + P.esc((e.nom || '?') + ' ' + (e.prenom || '')) +
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
    var selS = document.getElementById('sel-sequence');
    if (selC) selC.addEventListener('change', function () { etat.classeId = selC.value; etat.matiereId = ''; remplirSelecteurs(); });
    if (selM) selM.addEventListener('change', function () { etat.matiereId = selM.value; });
    if (selS) selS.addEventListener('change', function () { etat.sequenceId = selS.value; });

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

    /* L'eleve se ghere par le module Inscriptions : on retire les boutons
       qui permettaient de modifier l'effectif depuis la feuille de notes. */
    var addRow = document.getElementById('btn-add-row');
    if (addRow) {
      addRow.replaceWith(document.createTextNode(''));
      var info = document.createElement('p');
      info.className = 'text-xs text-gray-400';
      info.textContent = 'Effectif géré depuis le module Inscriptions.';
      if (addRow.parentNode) addRow.parentNode.appendChild(info);
    }

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
