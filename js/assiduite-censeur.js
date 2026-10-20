/* EduNeum - Absences : saisie des heures d'absence (censeur / SG).

   Deux roles partagent cet ecran :
   - le SURVEILLANT GENERAL (SG) ne voit QUE les classes qui lui sont
     attribuees (acces.mesClasses, collection affectationsCenseurs) et y
     saisit, par sequence, le nombre d'heures d'absence de chaque eleve ;
   - le CENSEUR ne consulte que : le module admin_assiduite n'admet pas
     son ecriture, la vue « Saisie » ne lui est donc pas proposee.

   Regles du store : heures = justifiees + non justifiees ; sequence
   ouverte et non verrouillee ; une classe hors de vos attributions est
   refusee au moment de l'ecriture. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;

  if (!E.auth.estConnecte()) return;
  if (!E.acces.exiger('censeur_assiduite')) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  var estSG = E.acces.estSurveillant();
  /* L'ecriture des absences passe par le module admin_assiduite :
     admin, direction et surveillant general ; pas le censeur. */
  var ecriture = P.peutEcrire('admin_assiduite');

  var etat = { classeId: '', sequenceId: '', vue: ecriture ? 'saisie' : 'synthese' };

  function mesClasses() {
    return (E.acces.mesClasses() || [])
      .map(function (id) { return S.classeParId(id); })
      .filter(function (c) { return c && !c.archive; });
  }

  function toutesLesSequences() {
    var out = [];
    S.trimestresDe(an.id).forEach(function (tr) {
      S.sequencesDeTrimestre(tr.id).forEach(function (sq) {
        out.push({ sequence: sq, trimestre: tr });
      });
    });
    return out;
  }

  function seqCourante() { return etat.sequenceId ? S.sequenceParId(etat.sequenceId) : null; }
  function bloquee(seq) { return !seq || !!seq.verrouillee || !seq.ouverte; }
  function eleves() { return S.elevesDeClasse(etat.classeId, an.id); }

  function statistiques() {
    var st = { effectif: 0, touches: 0, heures: 0, nonJust: 0 };
    if (!etat.sequenceId) return st;
    eleves().forEach(function (e) {
      st.effectif++;
      var a = S.absenceDe(e.id, etat.sequenceId);
      if (!a) return;
      var h = Number(a.heures) || 0;
      if (h > 0) st.touches++;
      st.heures += h;
      st.nonJust += Number(a.nonJustifiees) || 0;
    });
    return st;
  }

  function refresh() {
    var classes = mesClasses();
    var seqs = toutesLesSequences();
    if (!classes.length) {
      P.rendre(UI.etatVide(estSG
        ? 'Aucune salle ne vous est attribuée pour ' + an.libelle +
          ' : demandez à l\'administration de vous attribuer une classe depuis la page Affectations.'
        : 'Aucune classe sous votre responsabilité pour ' + an.libelle + '.'));
      return;
    }
    etat.classeId = etat.classeId && S.classeParId(etat.classeId) &&
      classes.some(function (c) { return c.id === etat.classeId; })
      ? etat.classeId : classes[0].id;
    etat.sequenceId = etat.sequenceId && seqs.some(function (s) { return s.sequence.id === etat.sequenceId; })
      ? etat.sequenceId : (seqs[0] ? seqs[0].sequence.id : null);
    rendre();
  }

  function rendre() {
    var classes = mesClasses();
    var seqs = toutesLesSequences();
    if (!classes.length) { refresh(); return; }

    var fClasse = UI.champ({
      label: 'Classe', type: 'select', valeur: etat.classeId, requis: true,
      options: classes.map(function (c) { return { valeur: c.id, libelle: c.nom }; })
    });
    var fSequence = UI.champ({
      label: 'Séquence', type: 'select', valeur: etat.sequenceId, requis: true,
      options: seqs.map(function (s) {
        return {
          valeur: s.sequence.id,
          libelle: s.sequence.libelle + ' · ' + s.trimestre.libelle +
            (s.sequence.verrouillee ? ' (verrouillée)' : (!s.sequence.ouverte ? ' (fermée)' : ''))
        };
      })
    });
    var fVue = UI.champ({
      label: 'Vue', type: 'select', valeur: etat.vue,
      options: ecriture
        ? [{ valeur: 'saisie', libelle: 'Saisie des heures' }, { valeur: 'synthese', libelle: 'Synthèse' }]
        : [{ valeur: 'synthese', libelle: 'Synthèse' }]
    });

    var st = statistiques();
    var seq = seqCourante();

    var notes = [];
    if (estSG) notes.push('Vous ne voyez que les salles qui vous sont attribuées.');
    if (!ecriture) notes.push('Consultation seule : l\'enregistrement des heures est réservé à l\'administration et au surveillant général.');
    if (bloquee(seq)) notes.push('Séquence ' + (seq ? (seq.verrouillee ? 'verrouillée' : 'fermée') : 'inexistante') + ' : la saisie est bloquée.');

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Effectif', valeur: String(st.effectif), icone: 'users-round', couleur: 'text-blue-500' }),
        P.carte({ label: 'Élèves avec absences', valeur: String(st.touches), icone: 'user-x', couleur: st.touches ? 'text-red-500' : 'text-green-500' }),
        P.carte({ label: 'Heures totales', valeur: String(st.heures) + 'h', icone: 'clock', couleur: 'text-accent' }),
        P.carte({ label: 'Non justifiées', valeur: String(st.nonJust) + 'h', icone: 'alert-triangle', couleur: st.nonJust ? 'text-amber-500' : 'text-green-500' })
      ]),

      P.section({
        titre: 'Filtres', icone: 'filter',
        contenu: '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 md:grid-cols-3 gap-4" id="form-filtres"></div>'
      }),

      P.section({
        titre: etat.vue === 'saisie' ? 'Saisie des heures d\'absence' : 'Synthèse des absences',
        icone: 'calendar-check',
        contenu: '<div class="nm-flat p-6 rounded-[32px] space-y-4">' +
          (notes.length
            ? '<div class="space-y-1">' + notes.map(function (n) {
              return '<p class="text-xs font-semibold text-amber-600 dark:text-amber-400">' + P.esc(n) + '</p>';
            }).join('') + '</div>'
            : '') +
          '<div id="zone-tableau"></div></div>'
      })
    ]);

    var f = document.getElementById('form-filtres');
    f.appendChild(fClasse.element);
    f.appendChild(fSequence.element);
    f.appendChild(fVue.element);
    fClasse.input.addEventListener('change', function () { etat.classeId = fClasse.valeur(); rendre(); });
    fSequence.input.addEventListener('change', function () { etat.sequenceId = fSequence.valeur(); rendre(); });
    fVue.input.addEventListener('change', function () { etat.vue = fVue.valeur(); rendre(); });

    rendreZone();
  }

  function rendreZone() {
    var zone = document.getElementById('zone-tableau');
    if (!zone) return;
    var seq = seqCourante();
    if (!seq) { zone.innerHTML = UI.etatVide('Aucune séquence disponible pour ' + an.libelle + '.'); return; }
    if (etat.vue === 'saisie') rendreSaisie(zone, seq);
    else rendreSynthese(zone, seq);
  }

  /* ---------------------------- Saisie ---------------------------------- */
  function rendreSaisie(zone, seq) {
    var liste = eleves();
    if (!liste.length) { zone.innerHTML = UI.etatVide('Aucun élève inscrit dans cette classe.'); return; }
    var bloque = bloquee(seq);

    var html = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead>' +
      '<tr class="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-300 dark:border-gray-700">' +
      '<th class="text-left pb-3 px-2">Élève</th>' +
      '<th class="pb-3 px-2 text-center">Heures d\'absence</th>' +
      '<th class="pb-3 px-2 text-center">dont justifiées</th>' +
      '<th class="text-left pb-3 px-2">Motif</th>' +
      '<th class="pb-3 px-2 text-center">Action</th></tr></thead><tbody>';

    liste.forEach(function (e) {
      var a = S.absenceDe(e.id, seq.id);
      var h = a ? (Number(a.heures) || 0) : 0;
      var j = a ? (Number(a.justifiees) || 0) : 0;
      var m = a ? (a.motif || '') : '';
      var dis = bloque ? ' disabled' : '';
      html += '<tr class="border-b border-gray-200 dark:border-gray-800 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">' +
        '<td class="py-3 px-2"><div class="flex items-center gap-3">' +
        '<div class="w-9 h-9 rounded-full nm-inset flex items-center justify-center text-xs font-bold text-accent">' +
        P.esc((e.nom.charAt(0) + e.prenom.charAt(0)).toUpperCase()) + '</div>' +
        '<div><p class="font-semibold text-sm text-gray-800 dark:text-gray-100">' + P.esc(e.nom + ' ' + e.prenom) + '</p>' +
        '<p class="text-xs text-gray-500 dark:text-gray-400">' + P.esc(e.matricule) + '</p></div></div></td>' +
        '<td class="py-3 px-2 text-center"><input type="number" min="0" step="1" id="h-' + e.id + '" value="' + h + '"' + dis +
        ' class="w-24 p-2 nm-inset rounded-xl text-center text-sm font-bold"></td>' +
        '<td class="py-3 px-2 text-center"><input type="number" min="0" step="1" id="j-' + e.id + '" value="' + j + '"' + dis +
        ' class="w-24 p-2 nm-inset rounded-xl text-center text-sm font-bold text-green-600 dark:text-green-400"></td>' +
        '<td class="py-3 px-2"><input type="text" id="m-' + e.id + '" value="' + P.esc(m) + '"' + dis +
        ' placeholder="—" class="w-full p-2 nm-inset rounded-xl text-sm"></td>' +
        '<td class="py-3 px-2 text-center"><button type="button" data-sauver="' + e.id + '"' + dis +
        ' class="px-3 py-1.5 nm-soft-convex rounded-lg text-xs font-bold text-accent' + (bloque ? ' opacity-50' : '') + '">Enregistrer</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    zone.innerHTML = html;

    zone.querySelectorAll('button[data-sauver]').forEach(function (btn) {
      btn.addEventListener('click', function () { enregistrerLigne(btn.getAttribute('data-sauver'), seq); });
    });
  }

  function enregistrerLigne(eleveId, seq) {
    if (bloquee(seq)) {
      UI.toast('Séquence ' + (seq.verrouillee ? 'verrouillée' : 'fermée') + ' : saisie bloquée.', 'error');
      return;
    }
    var hEl = document.getElementById('h-' + eleveId);
    var jEl = document.getElementById('j-' + eleveId);
    var mEl = document.getElementById('m-' + eleveId);
    if (!hEl || !jEl) return;
    var total = Number(hEl.value) || 0;
    var just = Number(jEl.value) || 0;
    if (total < 0 || just < 0) { UI.toast('Les heures doivent être positives.', 'error'); return; }
    if (just > total) { UI.toast('Les heures justifiées ne peuvent pas dépasser le total.', 'error'); return; }
    var r = S.enregistrerAbsence({
      sequenceId: seq.id, classeId: etat.classeId, eleveId: eleveId,
      heures: total, justifiees: just, nonJustifiees: total - just,
      motif: mEl ? (mEl.value || '') : ''
    });
    if (!r.ok) { UI.toast(r.motif, 'error'); return; }
    UI.toast('Absence enregistrée (' + total + 'h).', 'success');
    rendre();
  }

  /* --------------------------- Synthèse ---------------------------------- */
  function rendreSynthese(zone, seq) {
    var liste = eleves();
    if (!liste.length) { zone.innerHTML = UI.etatVide('Aucun élève inscrit dans cette classe.'); return; }

    var html = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead>' +
      '<tr class="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-300 dark:border-gray-700">' +
      '<th class="text-left pb-3 px-2">Élève</th>' +
      '<th class="pb-3 px-2 text-center">Heures abs.</th>' +
      '<th class="pb-3 px-2 text-center">Justifiées</th>' +
      '<th class="pb-3 px-2 text-center">Non just.</th>' +
      '<th class="text-left pb-3 px-2">Motif</th>' +
      (ecriture ? '<th class="pb-3 px-2 text-center">Action</th>' : '') +
      '</tr></thead><tbody>';

    liste.forEach(function (e) {
      var a = S.absenceDe(e.id, seq.id);
      var h = a ? (Number(a.heures) || 0) : 0;
      var j = a ? (Number(a.justifiees) || 0) : 0;
      var nj = a ? (Number(a.nonJustifiees) || 0) : 0;
      var m = a ? (a.motif || '') : '';
      html += '<tr class="border-b border-gray-200 dark:border-gray-800 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">' +
        '<td class="py-3 px-2"><div class="flex items-center gap-3">' +
        '<div class="w-9 h-9 rounded-full nm-inset flex items-center justify-center text-xs font-bold text-accent">' +
        P.esc((e.nom.charAt(0) + e.prenom.charAt(0)).toUpperCase()) + '</div>' +
        '<div><p class="font-semibold text-sm text-gray-800 dark:text-gray-100">' + P.esc(e.nom + ' ' + e.prenom) + '</p>' +
        '<p class="text-xs text-gray-500 dark:text-gray-400">' + P.esc(e.matricule) + '</p></div></div></td>' +
        '<td class="py-3 px-2 text-center font-bold text-base">' + h + '</td>' +
        '<td class="py-3 px-2 text-center font-bold text-base text-green-600 dark:text-green-400">' + j + '</td>' +
        '<td class="py-3 px-2 text-center font-bold text-base ' + (nj ? 'text-red-500' : 'text-gray-400') + '">' + nj + '</td>' +
        '<td class="py-3 px-2 text-sm text-gray-600 dark:text-gray-300">' + P.esc(m || '—') + '</td>' +
        (ecriture
          ? '<td class="py-3 px-2 text-center"><button type="button" data-justif="' + e.id +
            '" class="px-3 py-1.5 nm-soft-convex rounded-lg text-xs font-bold text-accent">Justifier</button></td>'
          : '') +
        '</tr>';
    });
    html += '</tbody></table></div>';
    zone.innerHTML = html;

    zone.querySelectorAll('button[data-justif]').forEach(function (btn) {
      btn.addEventListener('click', function () { justifier(btn.getAttribute('data-justif'), seq); });
    });
  }

  /* --------------------------- Justificatif ------------------------------- */
  function justifier(eleveId, seq) {
    if (bloquee(seq)) {
      UI.toast('Séquence ' + (seq.verrouillee ? 'verrouillée' : 'fermée') + ' : modification bloquée.', 'error');
      return;
    }
    var a = S.absenceDe(eleveId, seq.id);
    if (!a || !(Number(a.heures) > 0)) {
      UI.toast('Aucune heure d\'absence enregistrée pour cet élève : saisissez-le d\'abord dans la vue « Saisie des heures ».', 'error');
      return;
    }
    var e = S.eleveParId(eleveId);
    var total = Number(a.heures) || 0;
    var dejaJust = Number(a.justifiees) || 0;
    var reste = Math.max(0, total - dejaJust);

    var fType = UI.champ({
      label: 'Type de justificatif', type: 'select', requis: true, valeur: 'maladie',
      options: [
        { valeur: 'maladie', libelle: 'Maladie (certificat)' },
        { valeur: 'familial', libelle: 'Événement familial' },
        { valeur: 'transport', libelle: 'Problème de transport' },
        { valeur: 'autre', libelle: 'Autre' }
      ]
    });
    var fHeures = UI.champ({
      label: 'Heures à justifier', type: 'number', requis: true,
      valeur: String(reste), min: 0, max: reste, placeholder: '0'
    });
    var fComm = UI.champ({ label: 'Commentaire', type: 'textarea', placeholder: 'Détails du justificatif…' });

    UI.modal({
      titre: 'Justifier une absence',
      contenu: '<p class="text-sm text-gray-600 dark:text-gray-300"><b>' +
        P.esc(e.nom + ' ' + e.prenom) + '</b> — ' + total + 'h d\'absence, dont ' +
        dejaJust + 'h justifiées (' + reste + 'h restantes).</p>' +
        '<div class="space-y-3" id="form-justif"></div>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Enregistrer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fType, fHeures])) return false;
            var hv = Number(fHeures.valeur()) || 0;
            if (hv < 0 || hv > reste) {
              UI.toast('Heures justifiées comprises entre 0 et ' + reste + '.', 'error');
              return false;
            }
            var nouveauJust = dejaJust + hv;
            var r = S.enregistrerAbsence({
              sequenceId: seq.id, classeId: etat.classeId, eleveId: eleveId,
              heures: total, justifiees: nouveauJust, nonJustifiees: total - nouveauJust,
              motif: '[' + fType.valeur() + '] ' + (fComm.valeur() || '')
            });
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast('Justificatif enregistré (' + hv + 'h).', 'success');
            rendre();
          }
        }
      ]
    });

    var fc = document.getElementById('form-justif');
    fc.appendChild(fType.element);
    fc.appendChild(fHeures.element);
    fc.appendChild(fComm.element);
  }

  refresh();
})();
