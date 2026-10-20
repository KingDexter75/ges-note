/* EduNeum - Vie Scolaire Censeur : gestion absences et discipline.
   Connecté au store, avec persistance et contrôles d'accès. */

(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui, C = E.calculs;

  if (!E.auth.estConnecte()) return;
  if (!E.acces.exiger('censeur_vie_scolaire')) return;

  var session = E.auth.session();
  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  /* Classes du censeur */
  function mesClasses() {
    if (!session.enseignantId) return [];
    var ids = E.acces.mesClasses ? E.acces.mesClasses() : [];
    return ids.map(function (id) { return S.classeParId(id); }).filter(Boolean);
  }

  /* Sequences ouvertes */
  function sequencesOuvertes() {
    var out = [];
    S.trimestresDe(an.id).forEach(function (tr) {
      if (!tr.ouvert) return;
      S.sequencesDeTrimestre(tr.id).forEach(function (sq) {
        if (sq.ouverte && !sq.verrouillee) out.push({ sequence: sq, trimestre: tr });
      });
    });
    return out;
  }

  var etat = { classeId: '', sequenceId: '', mode: 'absences' };
  var classes = mesClasses();
  var seqs = sequencesOuvertes();

  function refresh() {
    classes = mesClasses();
    seqs = sequencesOuvertes();
    if (!classes.length) { P.rendre(UI.etatVide('Aucune classe sous votre responsabilité.')); return; }
    etat.classeId = etat.classeId && S.classeParId(etat.classeId) ? etat.classeId : classes[0].id;
    etat.sequenceId = etat.sequenceId && seqs.some(function (s) { return s.sequence.id === etat.sequenceId; })
      ? etat.sequenceId : (seqs[0] ? seqs[0].sequence.id : null);
    rendre();
  }

  function rendre() {
    var fClasse = UI.champ({
      label: 'Classe', type: 'select', valeur: etat.classeId,
      options: classes.map(function (c) { return { valeur: c.id, libelle: c.nom + ' (' + (c.section || 'francophone') + ')' }; })
    });
    var fSequence = UI.champ({
      label: 'Séquence', type: 'select', valeur: etat.sequenceId,
      options: [{ valeur: '', libelle: 'Toutes' }].concat(seqs.map(function (s) {
        return { valeur: s.sequence.id, libelle: s.sequence.libelle + ' (' + s.trimestre.libelle + ')' };
      }))
    });
    var fMode = UI.champ({
      label: 'Mode', type: 'select', valeur: etat.mode,
      options: [{ valeur: 'absences', libelle: 'Absences' }, { valeur: 'discipline', libelle: 'Discipline' }]
    });

    var toolbar = '<div class="nm-inset rounded-[32px] px-6 py-4 flex flex-wrap items-center gap-4">' +
      '<div class="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">' + P.ico('filter', 14) + 'Filtres :</div>' +
      fClasse.html + fSequence.html + fMode.html + '</div>';

    P.rendre([
      toolbar,
      P.section({ titre: 'Gestion Vie Scolaire', icone: 'shield-alert', contenu: '<div id="zone-vs"></div>' })
    ]);

    fClasse.element.addEventListener('change', function () { etat.classeId = fClasse.valeur(); refresh(); });
    fSequence.element.addEventListener('change', function () { etat.sequenceId = fSequence.valeur(); refresh(); });
    fMode.element.addEventListener('change', function () { etat.mode = fMode.valeur(); refresh(); });

    var btnCharger = document.getElementById('btn-charger');
    if (btnCharger) btnCharger.addEventListener('click', chargerTableau);

    chargerTableau();
  }

  function chargerTableau() {
    var zone = document.getElementById('zone-vs');
    if (!zone) return;
    if (!etat.classeId || !etat.sequenceId) {
      zone.innerHTML = UI.etatVide('Sélectionnez une classe et une séquence.');
      return;
    }

    var classe = S.classeParId(etat.classeId);
    var seq = S.sequenceParId(etat.sequenceId);

    if (etat.mode === 'absences') rendreAbsences(zone, classe, seq);
    else rendreDiscipline(zone, classe, seq);
  }

  /* ---------- ABSENCES ---------- */
  function rendreAbsences(zone, classe, seq) {
    var eleves = S.elevesDeClasse(classe.id, an.id);
    var peutEcrire = E.auth.estAdmin() || (E.acces.estPPDe && E.acces.estPPDe(classe.id)) || E.auth.estCenseur();

    var lignes = eleves.map(function (e) {
      var a = S.absenceDe ? S.absenceDe(e.id, seq.id) : null;
      var total = a ? (Number(a.heures) || 0) : 0;
      var just = a ? (Number(a.justifiees) || 0) : 0;
      var nonJust = a ? (Number(a.nonJustifiees) || 0) : 0;
      var motif = a ? (a.motif || '') : '';

      return '<tr class="border-b border-gray-100 dark:border-gray-800" data-eleve="' + e.id + '">' +
        '<td class="py-3 px-4"><div class="vie-student-cell">' +
        '<div class="vie-avatar">' + P.esc((e.nom.charAt(0) + e.prenom.charAt(0)).toUpperCase()) + '</div>' +
        '<div class="vie-student-info"><p class="vie-student-name">' + P.esc(e.nom + ' ' + e.prenom) + '</p>' +
        '<p class="vie-student-matricule">' + P.esc(e.matricule) + '</p></div></div></td>' +
        '<td class="py-3 px-4 text-center">' +
        (peutEcrire
          ? '<input type="number" min="0" max="200" value="' + total + '" data-field="heures" class="vie-input-hours">'
          : '<span class="font-bold">' + total + '</span>') + '</td>' +
        '<td class="py-3 px-4 text-center">' +
        (peutEcrire
          ? '<input type="number" min="0" max="200" value="' + just + '" data-field="justifiees" class="vie-input-hours">'
          : '<span class="vie-badge vie-badge-justified">' + just + '</span>') + '</td>' +
        '<td class="py-3 px-4 text-center">' +
        (peutEcrire
          ? '<input type="number" min="0" max="200" value="' + nonJust + '" data-field="nonJustifiees" class="vie-input-hours">'
          : '<span class="vie-badge vie-badge-warning">' + nonJust + '</span>') + '</td>' +
        '<td class="py-3 px-4">' +
        (peutEcrire
          ? '<input type="text" value="' + P.esc(motif) + '" placeholder="Motif…" data-field="motif" class="vie-input-text">'
          : '<span class="text-xs text-gray-500">' + P.esc(motif || '—') + '</span>') + '</td>' +
        '<td class="py-3 px-4 text-center">' +
        (peutEcrire
          ? '<button type="button" class="vie-action-btn" data-action="save-absence">Enregistrer</button>'
          : '<span class="text-xs text-gray-400">Lecture seule</span>') + '</td>' +
        '</tr>';
    }).join('');

    var html = '<div class="vie-section-header"><h2 class="text-lg font-bold">' + P.esc('Absences - ' + classe.nom + ' - ' + seq.libelle) + '</h2></div>' +
      '<div class="nm-flat p-6 rounded-[32px] overflow-x-auto">' +
      '<table class="vie-scolaire-table"><thead><tr class="text-xs font-bold text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">' +
      '<th class="text-left pb-2 px-2">Élève</th>' +
      '<th class="pb-2 px-2 text-center">Heures totales</th>' +
      '<th class="pb-2 px-2 text-center">Justifiées</th>' +
      '<th class="pb-2 px-2 text-center">Non justifiées</th>' +
      '<th class="pb-2 px-2">Motif / Justificatif</th>' +
      '<th class="pb-2 px-2 text-center">Action</th></tr></thead>' +
      '<tbody>' + (lignes || '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucun élève dans cette classe.</td></tr>') + '</tbody></table></div>';

    zone.innerHTML = html;

    zone.querySelectorAll('button[data-action="save-absence"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var eleveId = tr.getAttribute('data-eleve');
        var heures = Number(tr.querySelector('[data-field="heures"]').value) || 0;
        var just = Number(tr.querySelector('[data-field="justifiees"]').value) || 0;
        var nonJust = Number(tr.querySelector('[data-field="nonJustifiees"]').value) || 0;
        var motif = tr.querySelector('[data-field="motif"]').value || '';
        if (heures !== just + nonJust) {
          UI.toast('Le total doit être égal à justifiées + non justifiées.', 'error');
          return;
        }
        S.enregistrerAbsence({
          sequenceId: seq.id, eleveId: eleveId, classeId: classe.id,
          heures: heures, justifiees: just, nonJustifiees: nonJust,
          motif: motif, modifiePar: session.enseignantId
        });
        UI.toast('Absences enregistrées pour ' + seq.libelle, 'success');
        refresh();
      });
    });
  }

  /* ---------- DISCIPLINE ---------- */
  function rendreDiscipline(zone, classe, seq) {
    var eleves = S.elevesDeClasse(classe.id, an.id);
    var peutEcrire = E.auth.estAdmin() || (E.acces.estPPDe && E.acces.estPPDe(classe.id)) || E.auth.estCenseur();

    var lignes = eleves.map(function (e) {
      var san = S.sanctionDe ? S.sanctionDe(e.id, seq.id) : [];
      var badges = san.map(function (s) {
        var couleur = s.type === 'avertissement' ? 'amber' : s.type === 'blame' ? 'orange' : s.type === 'exclusion_temporaire' ? 'red' : 'gray';
        var label = s.type.charAt(0).toUpperCase() + s.type.slice(1).replace('_', ' ');
        return '<span class="vie-badge vie-badge-sanction mr-1 mb-1">' + label + (s.duree ? ' ' + s.duree + 'j' : '') + '</span>';
      }).join('');

      return '<tr class="border-b border-gray-100 dark:border-gray-800" data-eleve="' + e.id + '">' +
        '<td class="py-3 px-4"><div class="vie-student-cell">' +
        '<div class="vie-avatar">' + P.esc((e.nom.charAt(0) + e.prenom.charAt(0)).toUpperCase()) + '</div>' +
        '<div class="vie-student-info"><p class="vie-student-name">' + P.esc(e.nom + ' ' + e.prenom) + '</p>' +
        '<p class="vie-student-matricule">' + P.esc(e.matricule) + '</p></div></div></td>' +
        '<td class="py-3 px-4">' + (badges || '<span class="text-xs text-gray-400">Aucune sanction</span>') + '</td>' +
        '<td class="py-3 px-4 text-center">' +
        (peutEcrire
          ? '<button type="button" class="vie-action-btn" data-action="add-sanction">+ Ajouter</button>'
          : '<span class="text-xs text-gray-400">Lecture seule</span>') + '</td>' +
        '</tr>';
    }).join('');

    var html = '<div class="vie-section-header"><h2 class="text-lg font-bold">' + P.esc('Discipline - ' + classe.nom + ' - ' + seq.libelle) + '</h2></div>' +
      '<div class="nm-flat p-6 rounded-[32px]">' +
      '<table class="vie-scolaire-table"><thead><tr class="text-xs font-bold text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">' +
      '<th class="text-left pb-2 px-2">Élève</th>' +
      '<th class="pb-2 px-2">Sanctions</th>' +
      '<th class="pb-2 px-2 text-center">Action</th></tr></thead>' +
      '<tbody>' + (lignes || '<tr><td colspan="3" class="text-center py-8 text-gray-400">Aucun élève dans cette classe.</td></tr>') + '</tbody></table></div>';

    zone.innerHTML = html;

    zone.querySelectorAll('button[data-action="add-sanction"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var eleveId = tr.getAttribute('data-eleve');
        ouvrirModalSanction(eleveId, seq.id, classe.id);
      });
    });
  }

  function ouvrirModalSanction(eleveId, sequenceId, classeId) {
    var eleve = S.eleveParId(eleveId);
    var modal = document.getElementById('sanction-modal');
    document.getElementById('sanction-eleve-name').textContent = eleve.nom + ' ' + eleve.prenom;
    document.getElementById('sanction-type').value = 'avertissement';
    document.getElementById('sanction-duree').value = '0';
    document.getElementById('sanction-motif').value = '';
    modal.classList.remove('hidden');

    var saveBtn = document.getElementById('btn-save-sanction');
    var cancelBtn = document.getElementById('btn-cancel-sanction');
    var closeBtn = document.getElementById('close-sanction-modal');

    var cleanup = function () {
      saveBtn.removeEventListener('click', onSave);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      modal.classList.add('hidden');
    };

    var onSave = function () {
      var type = document.getElementById('sanction-type').value;
      var duree = Number(document.getElementById('sanction-duree').value) || 0;
      var motif = document.getElementById('sanction-motif').value || '';
      S.enregistrerSanction({
        sequenceId: sequenceId, eleveId: eleveId, classeId: classeId,
        type: type, duree: duree, motif: motif, modifiePar: session.enseignantId
      });
      UI.toast('Sanction enregistrée.', 'success');
      cleanup();
      refresh();
    };

    var onCancel = function () { cleanup(); };

    saveBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
  }

  refresh();
})();