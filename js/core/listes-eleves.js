/* EduNeum - Listes d'eleves par salle de classe : impression + PDF.

   Mise en page (reprise du bulletin pour rester coherent) :

   * chaque salle de classe est decoupee en pages A4 strictes (210x297 mm) ;
   * L'EN-TETE OFFICIEL (ministeres bilingues, logo, etablissement, intitule)
     figure en HAUT de la PREMIERE page de CHAQUE classe : les pages suivantes
     d'une meme classe ne le reprennent pas (l'en-tete de colonnes du tableau,
     lui, reste repete) ;
   * le tableau (numero, matricule, nom complet, date et lieu de naissance,
     sexe, redoublant, statut A/I, telephone des parents, et pour l'enseignant
     les colonnes SEQ vides) occupe le corps de la page ;
   * le PIED DE PAGE ne contient que « Salle de classe : … · Année scolaire … ·
     Effectif : … élève(s) » et la numerotation « Page i / n ».

   Un second mode produit la LISTE DES ABSENCES par classe : numero, nom
   complet, matricule, date et lieu de naissance, sexe, redoublant et nombre
   d'heures d'absence, filtrable sur les absents, les non-absents ou la liste
   complete, dans le meme ordre alphabetique.

   La langue (francais / anglais) suit la section de la classe.

   Le tout est autonome : le HTML est construit ici puis remis au navigateur
   pour l'impression, ou rasterise en PDF (html2canvas + jsPDF, deja embarques
   dans le projet) hors ecran pour ne jamais perturber l'application. */
(function (global) {
  'use strict';

  function core() { return global.EduNeum || {}; }
  function store() { return core().store; }
  function ui() { return core().ui; }

  function anneeCourante() {
    return core().layout ? core().layout.anneeChoisie() : null;
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ------------------------- Section / langue ---------------------------- */
  /* La classe porte `sectionId` (entite Section) avec repli sur la chaine
     historique `section`. */
  function sectionDe(classe) {
    if (!classe) return '';
    var id = classe.sectionId;
    if (id) {
      var sec = (store().all('sections') || []).filter(function (s) { return s.id === id; })[0];
      if (sec && sec.nom) return String(sec.nom).toLowerCase();
    }
    return String(classe.section || '').toLowerCase();
  }

  function estAnglophone(classe) { return sectionDe(classe).indexOf('angl') !== -1; }

  var TEXTES = {
    fr: {
      titreListe: 'Liste des élèves',
      titreAbsences: 'Liste des absences',
      salle: 'Salle de classe', annee: 'Année scolaire', effectif: 'Effectif',
      eleveS: 'élève(s)', page: 'Page',
      cNumero: 'N°', cMatricule: 'Matricule', cNom: 'Nom et prénom',
      cDate: 'Date de naissance', cLieu: 'Lieu de naissance', cSexe: 'Sexe',
      cRedoublant: 'Redoublant', cRed: 'Red', cStatut: 'Statut',
      cTelParent: 'Téléphone des parents', cHeures: 'Heures d\'absence',
      seq: 'SEQ', oui: 'Oui', non: 'Non',
      enseignant: 'Enseignant', matiere: 'Matière',
      garcons: 'Garçons', filles: 'Filles', redoublants: 'Redoublants',
      vide: 'Aucun élève inscrit dans cette classe.',
      videAbsences: 'Aucune absence enregistrée pour cette sélection.'
    },
    en: {
      titreListe: 'List of students',
      titreAbsences: 'List of absences',
      salle: 'Class',
      annee: 'School year',
      effectif: 'Enrolment',
      eleveS: 'student(s)',
      page: 'Page',
      cNumero: 'No.',
      cMatricule: 'Matricule',
      cNom: 'Full name',
      cDate: 'Date of birth',
      cLieu: 'Place of birth',
      cSexe: 'Sex',
      cRedoublant: 'Repeating',
      cRed: 'Red',
      cStatut: 'Status',
      cTelParent: 'Parents\' phone',
      cHeures: 'Absence hours',
      seq: 'SEQ',
      oui: 'Yes',
      non: 'No',
      enseignant: 'Teacher', matiere: 'Subject',
      garcons: 'Boys', filles: 'Girls', redoublants: 'Repeating',
      vide: 'No student enrolled in this class.',
      videAbsences: 'No absence recorded for this selection.'
    }
  };
  function T(classe) { return estAnglophone(classe) ? TEXTES.en : TEXTES.fr; }

  function elevesTries(classeId, anneeId) {
    return store().elevesDeClasse(classeId, anneeId).slice().sort(function (a, b) {
      return ((a.nom || '') + ' ' + (a.prenom || '')).localeCompare(
        (b.nom || '') + ' ' + (b.prenom || ''));
    });
  }

  /* Inscriptions de la classe indexees par eleve : porte le statut
     (active / redouble / passe / exclu). */
  function inscriptionsParEleve(classeId, anneeId) {
    var map = {};
    store().all('inscriptions').forEach(function (i) {
      if (i.classeId !== classeId || i.anneeId !== anneeId || i.archive) return;
      map[i.eleveId] = i;
    });
    return map;
  }

  /* Heures d'absence cumulees par eleve sur toutes les sequences de l'annee. */
  function heuresParEleve(anneeId) {
    var map = {};
    store().sequencesDe(anneeId).forEach(function (sq) {
      store().absencesDeSequence(sq.id).forEach(function (a) {
        map[a.eleveId] = (map[a.eleveId] || 0) + (Number(a.heures) || 0);
      });
    });
    return map;
  }

  /* Nombre de colonnes SEQ : autant que de sequences definies pour l'annee,
     avec un repli sur 6 (deux sequences par trimestre) pour une base vierge. */
  function nombreSequences(anneeId) {
    var n = store().sequencesDe(anneeId).length;
    return n > 0 ? n : 6;
  }

  /* ------------------------- Repartition des pages ----------------------- */
  /* Remplit les pages A4 en mesurant la hauteur reelle des lignes : chaque page
     recoit le maximum d'eleves qui tient sans jamais rogner une ligne, quel que
     soit le mode (avec/sans colonnes SEQ, noms longs, en-tete plus ou moins
     haut). La premiere page, qui porte l'en-tete officiel et le bandeau
     d'informations, est mesuree separement des suivantes. */
  function paginerA4(classe, annee, t, cfg) {
    var lignes = cfg.lignesHtml || [];
    var videHtml = '<table class="lst-table">' + (cfg.colsHtml || '') + '<thead><tr>' + cfg.theadHtml +
      '</tr></thead><tbody></tbody></table>';
    var hote = document.createElement('div');
    hote.style.cssText = 'position:absolute;left:-10000px;top:0;width:210mm;';
    if (!document.getElementById('eduneum-listes-style')) assurerStyle();
    document.body.appendChild(hote);

    function enveloppe(entete, corps) {
      return '<div class="lst-page">' + entete + '<div class="lst-corps">' + corps + '</div>' +
        piedBas(classe, annee, cfg.effectif, 1, 1, t) + '</div>';
    }
    /* Place disponible dans le corps de la page (px). La marge de 6 px couvre
       l'arrondi des hauteurs et la hauteur d'impression (296 mm au lieu de
       297 mm). */
    function capacite(entete) {
      hote.innerHTML = enveloppe(entete, videHtml);
      var page = hote.firstChild;
      var corps = page.querySelector('.lst-corps');
      var th = page.querySelector('thead');
      var pad = parseFloat(window.getComputedStyle(corps).paddingTop) || 0;
      return Math.max(0, corps.clientHeight - pad - (th ? th.offsetHeight : 0) - 6);
    }

    var tranches = [];
    try {
      var capPremiere = capacite(enteteHaut(classe, annee, cfg.titreListe, cfg.bloc || ''));
      var capSuivantes = capacite('');

      var hauteurs = [];
      if (lignes.length) {
        hote.innerHTML = enveloppe('', '<table class="lst-table">' + (cfg.colsHtml || '') +
          '<thead><tr>' + cfg.theadHtml + '</tr></thead><tbody>' + lignes.join('') + '</tbody></table>');
        var trs = hote.querySelectorAll('tbody tr');
        for (var i = 0; i < trs.length; i++) hauteurs.push(trs[i].getBoundingClientRect().height);
      }

      var courante = [];
      var utilise = 0;
      var cap = capPremiere;
      for (var j = 0; j < lignes.length; j++) {
        var h = hauteurs[j] + 1;
        if (courante.length && utilise + h > cap) {
          tranches.push(courante);
          courante = [];
          utilise = 0;
          cap = capSuivantes;
        }
        courante.push(lignes[j]);
        utilise += h;
      }
      tranches.push(courante);
    } finally {
      hote.remove();
    }

    var total = tranches.length;
    return tranches.map(function (groupe, idx) {
      var corps = groupe.length ? groupe.join('') :
        '<tr><td class="lst-vide" colspan="' + cfg.nbColonnes + '">' + esc(cfg.vide) + '</td></tr>';
      var tableau = '<table class="lst-table">' + (cfg.colsHtml || '') +
        '<thead><tr>' + cfg.theadHtml + '</tr></thead><tbody>' + corps + '</tbody></table>';
      var entete = idx === 0 ? enteteHaut(classe, annee, cfg.titreListe, cfg.bloc || '') : '';
      return pageA4(entete, tableau, piedBas(classe, annee, cfg.effectif, idx + 1, total, t));
    });
  }

  /* ------------------------- Pieces reutilisables ------------------------ */

  /* Largeurs fixes des colonnes : elles permettent au maximum de lignes de
     rester sur une seule ligne (les noms longs ne prennent la place que d'une
     ligne), donc de remplir chaque page A4 au maximum. */
  function colonnesEleves(enseignant, nbSeq) {
    var cols = '<col style="width:9mm"><col style="width:18mm">' +
      '<col style="width:' + (enseignant ? 64 : 48) + 'mm">';
    if (!enseignant) cols += '<col style="width:19mm"><col style="width:25mm">';
    cols += '<col style="width:10mm"><col style="width:13mm">';
    if (!enseignant) cols += '<col style="width:12mm"><col style="width:24mm">';
    for (var s = 0; s < nbSeq; s++) cols += '<col style="width:11mm">';
    return '<colgroup>' + cols + '</colgroup>';
  }

  function colonnesAbsences() {
    return '<colgroup>' +
      '<col style="width:9mm"><col style="width:52mm"><col style="width:20mm">' +
      '<col style="width:19mm"><col style="width:26mm"><col style="width:9mm">' +
      '<col style="width:18mm"><col style="width:15mm">' +
      '</colgroup>';
  }

  function enteteColonnes(t, nbSeq, mode, enseignant) {
    if (mode === 'absences') {
      return '<th class="lst-c">' + esc(t.cNumero) + '</th>' +
        '<th>' + esc(t.cNom) + '</th>' +
        '<th class="lst-c">' + esc(t.cMatricule) + '</th>' +
        '<th class="lst-c">' + esc(t.cDate) + '</th>' +
        '<th>' + esc(t.cLieu) + '</th>' +
        '<th class="lst-c">' + esc(t.cSexe) + '</th>' +
        '<th class="lst-c">' + esc(t.cRed) + '</th>' +
        '<th class="lst-c">' + esc(t.cHeures) + '</th>';
    }
    var t2 = '<th class="lst-c">' + esc(t.cNumero) + '</th>' +
      '<th class="lst-c">' + esc(t.cMatricule) + '</th>' +
      '<th>' + esc(t.cNom) + '</th>';
    if (!enseignant) {
      t2 += '<th class="lst-c">' + esc(t.cDate) + '</th>' +
        '<th>' + esc(t.cLieu) + '</th>';
    }
    t2 += '<th class="lst-c">' + esc(t.cSexe) + '</th>' +
      '<th class="lst-c">' + esc(t.cRed) + '</th>';
    if (!enseignant) {
      t2 += '<th class="lst-c">' + esc(t.cStatut) + '</th>' +
        '<th class="lst-c">' + esc(t.cTelParent) + '</th>';
    }
    for (var s = 1; s <= nbSeq; s++) t2 += '<th class="lst-seq">' + esc(t.seq) + ' ' + s + '</th>';
    return t2;
  }

  function ligneEleve(e, rang, nbSeq, ins, t, enseignant) {
    var red = (ins && ins.statut === 'redouble') || e.redoublant === 'O' ? t.oui : t.non;
    var statut = e.aptitude === 'I' ? 'I' : 'A';
    var l = '<td class="lst-c">' + rang + '</td>' +
      '<td class="lst-c">' + esc(e.matricule || '') + '</td>' +
      '<td>' + esc((e.nom || '') + ' ' + (e.prenom || '')) + '</td>';
    if (!enseignant) {
      l += '<td class="lst-c">' + esc(ui().dateFr(e.dateNaissance)) + '</td>' +
        '<td>' + esc(e.lieuNaissance || '') + '</td>';
    }
    l += '<td class="lst-c">' + esc(e.sexe || '') + '</td>' +
      '<td class="lst-c">' + esc(red) + '</td>';
    if (!enseignant) {
      l += '<td class="lst-c">' + esc(statut) + '</td>' +
        '<td class="lst-c">' + esc(e.contactTuteur || '') + '</td>';
    }
    for (var j = 0; j < nbSeq; j++) l += '<td class="lst-seq"></td>';
    return '<tr>' + l + '</tr>';
  }

  function ligneAbsence(l, rang, t) {
    var e = l.eleve;
    var red = (l.ins && l.ins.statut === 'redouble') || (l.eleve && l.eleve.redoublant === 'O') ? t.oui : t.non;
    return '<tr>' +
      '<td class="lst-c">' + rang + '</td>' +
      '<td>' + esc((e.nom || '') + ' ' + (e.prenom || '')) + '</td>' +
      '<td class="lst-c">' + esc(e.matricule || '') + '</td>' +
      '<td class="lst-c">' + esc(ui().dateFr(e.dateNaissance)) + '</td>' +
      '<td>' + esc(e.lieuNaissance || '') + '</td>' +
      '<td class="lst-c">' + esc(e.sexe || '') + '</td>' +
      '<td class="lst-c">' + esc(red) + '</td>' +
      '<td class="lst-c">' + l.heures + '</td>' +
      '</tr>';
  }

  /* En-tete officiel : ministeres bilingues, logo, nom de l'etablissement et
     intitule du document. Le bloc de la langue de la section est place en
     premier (a gauche), l'autre en second. */
  function enteteHaut(classe, annee, titre, bloc) {
    var etab = store().parametres().etablissement;
    var logo = etab.logo
      ? '<img src="' + esc(etab.logo) + '" alt="">'
      : '<span>' + esc(store().initialesEtablissement(etab)) + '</span>';
    var fr = '<div class="lst-official">' +
      '<p class="lst-country">République du Cameroun</p>' +
      '<p class="lst-devise">Paix — Travail — Patrie</p>' +
      '<p class="lst-min">Ministère des Enseignements Secondaires</p>' +
      '</div>';
    var en = '<div class="lst-official">' +
      '<p class="lst-country">Republic of Cameroon</p>' +
      '<p class="lst-devise">Peace — Work — Fatherland</p>' +
      '<p class="lst-min">Ministry of Secondary Education</p>' +
      '</div>';
    var gauche = estAnglophone(classe) ? en : fr;
    var droite = estAnglophone(classe) ? fr : en;

    return '<div class="lst-entete">' +
      '<div class="lst-header">' + gauche +
      '<div class="lst-logo">' + logo + '</div>' + droite +
      '</div>' +
      '<div class="lst-etab">' +
      '<div class="lst-nom">' + esc(etab.nom) + '</div>' +
      '<div class="lst-titre">' + esc(titre) + ' — ' + esc(classe.nom) + '</div>' +
      '</div>' +
      (bloc || '') +
      '</div>';
  }

  /* Bandeau d'informations sous le titre, sur la premiere page de chaque classe
     (liste cote enseignant) : enseignant, matiere(s) et coefficient(s), puis
     effectif, garcons, filles et redoublants. */
  function blocInfosEnseignant(info, stats, t) {
    var matieres = (info.matieres || []).map(function (m) {
      return esc(m.nom) + (m.coef ? ' (coef. ' + m.coef + ')' : '');
    }).join(', ');
    return '<div class="lst-infos">' +
      '<span><b>' + esc(t.enseignant) + ' :</b> ' + esc(info.enseignant || '') + '</span>' +
      '<span><b>' + esc(t.matiere) + ' :</b> ' + (matieres || '—') + '</span>' +
      '<span><b>' + esc(t.effectif) + ' :</b> ' + stats.effectif + '</span>' +
      '<span><b>' + esc(t.garcons) + ' :</b> ' + stats.garcons + '</span>' +
      '<span><b>' + esc(t.filles) + ' :</b> ' + stats.filles + '</span>' +
      '<span><b>' + esc(t.redoublants) + ' :</b> ' + stats.redoublants + '</span>' +
      '</div>';
  }

  /* Pied de page reduit : salle de classe, annee, effectif + numerotation. */
  function piedBas(classe, annee, effectif, numero, total, t) {
    return '<div class="lst-pied">' +
      '<div class="lst-classe-meta">' + esc(t.salle) + ' : <b>' + esc(classe.nom) + '</b>' +
      ' · ' + esc(t.annee) + ' ' + esc(annee.libelle) + ' · ' + esc(t.effectif) + ' : ' +
      effectif + ' ' + esc(t.eleveS) + '</div>' +
      '<div class="lst-page-num">' + esc(t.page) + ' ' + numero + ' / ' + total + '</div>' +
      '</div>';
  }

  function pageA4(enteteHautHtml, corps, piedBasHtml) {
    return '<div class="lst-page">' + enteteHautHtml +
      '<div class="lst-corps">' + corps + '</div>' + piedBasHtml + '</div>';
  }

  /* Decoupe une salle de classe en pages A4 (liste des eleves). */
  function pagesClasse(classe, annee, options) {
    options = options || {};
    var avecSeq = !!options.avecSequences;
    var enseignant = avecSeq;
    var nbSeq = avecSeq ? nombreSequences(annee.id) : 0;
    var t = T(classe);
    var eleves = elevesTries(classe.id, annee.id);
    var insMap = inscriptionsParEleve(classe.id, annee.id);
    var nbColonnes = (enseignant ? 5 : 9) + nbSeq;

    var matiereId = options.matiereId || '';
    var matiere = matiereId ? store().matiereParId(matiereId) : null;
    var titreListe = t.titreListe + (matiere && matiere.nom ? ' — ' + matiere.nom : '');

    var stats = null;
    var info = options.infos ? options.infos[classe.id + '|' + matiereId] : null;
    if (enseignant && info) {
      stats = { effectif: eleves.length, garcons: 0, filles: 0, redoublants: 0 };
      eleves.forEach(function (e) {
        var sx = String(e.sexe || '').trim().toUpperCase();
        if (sx.charAt(0) === 'M') stats.garcons++;
        else if (sx.charAt(0) === 'F') stats.filles++;
        if ((insMap[e.id] && insMap[e.id].statut === 'redouble') || e.redoublant === 'O') stats.redoublants++;
      });
    }

    return paginerA4(classe, annee, t, {
      titreListe: titreListe,
      theadHtml: enteteColonnes(t, nbSeq, 'eleves', enseignant),
      colsHtml: colonnesEleves(enseignant, nbSeq),
      lignesHtml: eleves.map(function (e, k) {
        return ligneEleve(e, k + 1, nbSeq, insMap[e.id], t, enseignant);
      }),
      nbColonnes: nbColonnes,
      effectif: eleves.length,
      vide: t.vide,
      bloc: stats ? blocInfosEnseignant(info, stats, t) : ''
    });
  }

  /* Decoupe une salle de classe en pages A4 (liste des absences).
     options.filtre : 'tous' (defaut) | 'absents' | 'sans'. */
  function pagesAbsences(classe, annee, options) {
    options = options || {};
    var filtre = options.filtre || 'tous';
    var t = T(classe);
    var eleves = elevesTries(classe.id, annee.id);
    var insMap = inscriptionsParEleve(classe.id, annee.id);
    var heuresMap = heuresParEleve(annee.id);

    var lignes = eleves
      .map(function (e) {
        return { eleve: e, ins: insMap[e.id], heures: heuresMap[e.id] || 0 };
      })
      .filter(function (l) {
        if (filtre === 'absents') return l.heures > 0;
        if (filtre === 'sans') return l.heures <= 0;
        return true;
      });

    return paginerA4(classe, annee, t, {
      titreListe: t.titreAbsences,
      theadHtml: enteteColonnes(t, 0, 'absences'),
      colsHtml: colonnesAbsences(),
      lignesHtml: lignes.map(function (l, k) {
        return ligneAbsence(l, k + 1, t);
      }),
      nbColonnes: 8,
      effectif: lignes.length,
      vide: t.videAbsences,
      bloc: ''
    });
  }

  /* Une entree de liste : soit un identifiant de classe (chaine), soit un
     couple classe / matiere (objet) pour l'espace enseignant (une liste par
     matiere dispensee dans la classe). */
  function normaliserEntrees(items) {
    return (items || []).map(function (x) {
      return typeof x === 'string' ? { classeId: x, matiereId: '' } : { classeId: x.classeId, matiereId: x.matiereId || '' };
    });
  }

  function construirePages(items, options) {
    options = options || {};
    var an = anneeCourante();
    if (!an) return [];
    var entrees = normaliserEntrees(items);
    var vus = {};
    var pages = [];
    entrees.forEach(function (en) {
      var cle = en.classeId + '|' + en.matiereId;
      if (vus[cle]) return;
      vus[cle] = 1;
      var c = store().classeParId(en.classeId);
      if (!c || c.archive) return;
      var opts = {};
      Object.keys(options).forEach(function (k) { opts[k] = options[k]; });
      opts.matiereId = en.matiereId;
      var ps = opts.mode === 'absences' ? pagesAbsences(c, an, opts) : pagesClasse(c, an, opts);
      ps.forEach(function (p) { pages.push(p); });
    });
    return pages;
  }

  function nomFichier(items, options) {
    options = options || {};
    var base = options.mode === 'absences' ? 'Liste-absences' : 'Liste-eleves';
    var noms = normaliserEntrees(items).map(function (en) {
      var c = store().classeParId(en.classeId);
      if (!c) return '';
      var nom = String(c.nom);
      if (en.matiereId) {
        var m = store().matiereParId(en.matiereId);
        if (m && m.nom) nom += '-' + m.nom;
      }
      return nom.replace(/[^\w]+/g, '-');
    }).filter(Boolean);
    var an = anneeCourante();
    return base + (noms.length ? '-' + noms.join('_') : '') +
      (an ? '-' + String(an.libelle).replace(/[^\w]+/g, '-') : '');
  }

  /* --------------------------- Styles (A4 + pied) ------------------------ */
  var CSS =
    '#eduneum-print-liste{display:none}' +
    '.lst-page{box-sizing:border-box;width:210mm;height:297mm;background:#fff;color:#111;' +
    'font-family:Helvetica,Arial,sans-serif;font-size:11px;padding:8mm 12mm 6mm;' +
    'display:flex;flex-direction:column;overflow:hidden}' +
    '.lst-entete{flex:0 0 auto;text-align:center;padding-bottom:4mm;border-bottom:2px solid #0f766e}' +
    '.lst-header{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center}' +
    '.lst-official{text-align:center}' +
    '.lst-official p{margin:0}' +
    '.lst-country{font-weight:800;font-size:11px;text-transform:uppercase;color:#1e3a8a}' +
    '.lst-devise{font-style:italic;color:#64748b;font-size:9px}' +
    '.lst-min{font-weight:600;font-size:10px}' +
    '.lst-logo{width:50px;height:50px;border-radius:50%;border:2px solid #0f766e;' +
    'display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff;margin:0 auto}' +
    '.lst-logo img{width:100%;height:100%;object-fit:contain}' +
    '.lst-logo span{font-weight:900;font-size:17px;color:#0f766e}' +
    '.lst-etab{margin-top:3mm}' +
    '.lst-nom{font-size:16px;font-weight:900;letter-spacing:.3px;text-transform:uppercase;color:#1e3a8a}' +
    '.lst-titre{font-size:12px;font-weight:700;color:#0f766e;margin-top:1mm}' +
    '.lst-infos{display:flex;flex-wrap:wrap;gap:1mm 7mm;justify-content:center;margin-top:3mm;' +
    'padding:2mm 3mm;border:1px solid #cbd5e1;border-radius:2mm;background:#f8fafc;font-size:10px;color:#334155}' +
    '.lst-infos b{color:#0f766e;text-transform:uppercase;font-size:9px;letter-spacing:.3px}' +
    '.lst-corps{flex:1 1 auto;min-height:0;padding-top:4mm}' +
    '.lst-pied{flex:0 0 auto;margin-top:auto;padding-top:3mm;border-top:1px solid #cbd5e1;text-align:center}' +
    '.lst-classe-meta{font-size:10px;color:#475569}' +
    '.lst-page-num{font-size:10px;font-weight:700;color:#0f766e;margin-top:1mm}' +
    '.lst-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;line-height:1.15;margin:0}' +
    '.lst-table th,.lst-table td{border:1px solid #333;padding:2px 5px;text-align:left;vertical-align:top}' +
    '.lst-table thead th{background:#e2e8f0;font-size:9px;text-transform:uppercase;letter-spacing:.3px;text-align:center}' +
    '.lst-table .lst-c{text-align:center}' +
    '.lst-table .lst-seq{width:30px}' +
    '.lst-table tbody tr:nth-child(even){background:#f8fafc}' +
    '.lst-vide{color:#64748b;font-style:italic;padding:14px;text-align:center}' +
    '@media print{' +
    '  html,body{margin:0 !important;padding:0 !important;width:210mm !important;height:auto !important;overflow:visible !important}' +
    '  body > *{display:none !important}' +
    '  #eduneum-print-liste{display:block !important;position:absolute;left:0;top:0;width:210mm;margin:0;padding:0}' +
    '  #eduneum-print-liste .lst-page{width:210mm !important;height:296mm !important;' +
    '    page-break-after:always;break-after:page;box-shadow:none;border-radius:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '  #eduneum-print-liste .lst-page:last-child{page-break-after:auto;break-after:auto}' +
    '  #eduneum-print-liste .lst-table thead{display:table-header-group}' +
    '  #eduneum-print-liste .lst-table thead th{display:table-cell}' +
    '  #eduneum-print-liste .lst-table tbody tr:nth-child(even){background:#f8fafc !important}' +
    '  #eduneum-print-liste .lst-table th{background:#e2e8f0 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '}' +
    '@media print{@page{size:A4;margin:0}}';

  function purger() {
    try {
      ['eduneum-print-liste', 'eduneum-pdf-stage'].forEach(function (id) {
        var n = document.getElementById(id);
        if (n) n.remove();
      });
    } catch (e) {
      /* rien a purger */
    }
  }

  function assurerStyle() {
    purger();
    var ancien = document.getElementById('eduneum-listes-style');
    if (ancien) ancien.remove();
    var style = document.createElement('style');
    style.id = 'eduneum-listes-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function retirerStyle() {
    var s = document.getElementById('eduneum-listes-style');
    if (s) s.remove();
  }

  function stageImpression(pages) {
    assurerStyle();
    var zone = document.createElement('div');
    zone.id = 'eduneum-print-liste';
    zone.innerHTML = pages.join('');
    document.body.appendChild(zone);
    return zone;
  }

  /* ------------------------------- Impression --------------------------- */
  function imprimer(classeIds, options) {
    options = options || {};
    try {
      var pages = construirePages(classeIds, options);
      if (!pages || !pages.length) { if (ui().toast) ui().toast('Aucune classe à imprimer.', 'error'); return; }

      stageImpression(pages);
      var ancienTitre = document.title;
      document.title = nomFichier(classeIds, options);
      setTimeout(function () {
        var apres = function () { document.title = ancienTitre; };
        window.addEventListener('afterprint', apres, { once: true });
        window.print();
        setTimeout(function () {
          retirerStyle();
          var z = document.getElementById('eduneum-print-liste');
          if (z) z.remove();
          window.removeEventListener('afterprint', apres);
        }, 800);
      }, 120);
    } catch (e) {
      if (ui().toast) ui().toast('Impression impossible : ' + ((e && e.message) || e), 'error');
    }
  }

  /* ------------------------------- Telechargement PDF ------------------- */
  function telechargerPdf(classeIds, options) {
    options = options || {};
    try {
      var pages = construirePages(classeIds, options);
      if (!pages || !pages.length) { if (ui().toast) ui().toast('Aucune classe à télécharger.', 'error'); return; }
      if (!(window.jspdf && typeof window.jspdf.jsPDF === 'function')) {
        if (ui().toast) ui().toast('Génération PDF indisponible : bibliothèque non chargée.', 'error');
        return;
      }
      if (ui().toast) ui().toast('Génération du PDF…', 'info');

      var stage = document.createElement('div');
      stage.style.cssText = 'position:fixed;left:-10000px;top:0;';
      stage.innerHTML = pages.join('');
      document.body.appendChild(stage);
      assurerStyle();
      var ps = stage.querySelectorAll('.lst-page');
      var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      var i = 0;

      function suivant() {
        if (i >= ps.length) {
          doc.save(nomFichier(classeIds, options) + '.pdf');
          stage.remove();
          retirerStyle();
          if (ui().toast) ui().toast('PDF téléchargé.', 'success');
          return;
        }
        window.html2canvas(ps[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(function (canvas) {
          var img = canvas.toDataURL('image/jpeg', 0.92);
          if (i > 0) doc.addPage();
          doc.addImage(img, 'JPEG', 0, 0, 210, 297);
          i++;
          suivant();
        }).catch(function (err) {
          stage.remove();
          retirerStyle();
          if (ui().toast) ui().toast('Erreur PDF : ' + ((err && err.message) || err), 'error');
        });
      }
      suivant();
    } catch (e) {
      if (ui().toast) ui().toast('Erreur PDF : ' + ((e && e.message) || e), 'error');
    }
  }

  /* ------------------------------ Boite de choix ------------------------ */
  function classesDisponibles(classeIds) {
    return (classeIds || []).map(function (id) { return store().classeParId(id); })
      .filter(function (c) { return c && !c.archive; });
  }
  function optionsHtmlClasses(classes, labelToutes, valeur) {
    return '<option value="__all__">' + esc(labelToutes) + ' (' + classes.length + ')</option>' +
      classes.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === valeur ? ' selected' : '') + '>' + esc(c.nom) + '</option>';
      }).join('');
  }
  function choisies(classes) {
    var sel = document.getElementById('lst-classe-choix');
    var v = sel ? sel.value : '__all__';
    return v === '__all__' ? classes.map(function (c) { return c.id; }) : [v];
  }
  function entreesHtml(entrees, labelToutes, valeur) {
    var html = '<option value="__all__">' + esc(labelToutes) + ' (' + entrees.length + ')</option>';
    entrees.forEach(function (en) {
      var c = store().classeParId(en.classeId);
      var m = en.matiereId ? store().matiereParId(en.matiereId) : null;
      var label = (c ? c.nom : '') + (m && m.nom ? ' — ' + m.nom : '');
      var val = en.classeId + '|' + (en.matiereId || '');
      html += '<option value="' + esc(val) + '">' + esc(label) + '</option>';
    });
    return html;
  }
  function choisiesEntrees(entrees) {
    var sel = document.getElementById('lst-classe-choix');
    var v = sel ? sel.value : '__all__';
    if (v === '__all__') return entrees.slice();
    var parts = v.split('|');
    return [{ classeId: parts[0], matiereId: parts[1] || '' }];
  }
  function aDesMatieres(entrees) {
    for (var i = 0; i < entrees.length; i++) { if (entrees[i].matiereId) return true; }
    return false;
  }
  function optionsChamp() {
    var sel = document.getElementById('lst-options-champ');
    return sel ? sel.value : '__all__';
  }

  /* Impression / telechargement des listes d'eleves (colonnes SEQ en option).
     `items` : identifiants de classe, ou couples classe / matiere (enseignant),
     une liste etant produite par couple. */
  function choisir(items, options) {
    options = options || {};
    var entrees = normaliserEntrees(items);
    if (!entrees.length) { if (ui().toast) ui().toast('Aucune classe disponible.', 'error'); return; }
    var avecSeq = !!options.avecSequences;
    var opts = { avecSequences: avecSeq, infos: options.infos };
    var parMatiere = aDesMatieres(entrees);

    ui().modal({
      titre: 'Imprimer la liste des élèves',
      contenu: '<div class="space-y-3">' +
        '<label class="block text-xs font-bold uppercase tracking-wider text-gray-400">' +
        (parMatiere ? 'Classe / matière' : 'Classe') + '</label>' +
        '<select id="lst-classe-choix" class="w-full p-3 nm-inset rounded-xl text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200">' +
        entreesHtml(entrees, parMatiere ? 'Toutes mes listes' : 'Toutes les classes') + '</select>' +
        '<p class="text-xs text-gray-400">' +
        (parMatiere
          ? 'Une liste par matière dispensée : une classe où vous enseignez deux matières donne deux listes. '
          : 'Colonnes : matricule, nom et prénom, date et lieu de naissance, sexe, redoublant, statut (A/I), téléphone des parents. ') +
        'Tri alphabétique. L\'en-tête figure sur la première page de chaque liste, le pied de page est répété (effectif, pagination). ' +
        'La langue suit la section de la classe.</p>' +
        '</div>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Télécharger PDF', classe: 'nm-soft-convex text-accent',
          onClick: function () { telechargerPdf(choisiesEntrees(entrees), opts); }
        },
        {
          label: 'Imprimer', classe: 'bg-accent text-white',
          onClick: function () { imprimer(choisiesEntrees(entrees), opts); }
        }
      ]
    });
  }

  /* Impression / telechargement de la liste des absences d'une ou plusieurs
     classes attribuees, avec le choix du filtre. */
  function choisirAbsences(classeIds, options) {
    options = options || {};
    var classes = classesDisponibles(classeIds);
    if (!classes.length) { if (ui().toast) ui().toast('Aucune classe disponible.', 'error'); return; }

    ui().modal({
      titre: 'Liste des absences',
      contenu: '<div class="space-y-3">' +
        '<label class="block text-xs font-bold uppercase tracking-wider text-gray-400">Classe</label>' +
        '<select id="lst-classe-choix" class="w-full p-3 nm-inset rounded-xl text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200">' +
        optionsHtmlClasses(classes, 'Toutes les classes', options.classe) + '</select>' +
        '<label class="block text-xs font-bold uppercase tracking-wider text-gray-400">Type de liste</label>' +
        '<select id="lst-options-champ" class="w-full p-3 nm-inset rounded-xl text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200">' +
        '<option value="absents"' + (!options.filtre || options.filtre === 'absents' ? ' selected' : '') + '>Absents uniquement</option>' +
        '<option value="sans"' + (options.filtre === 'sans' ? ' selected' : '') + '>Non-absents uniquement</option>' +
        '<option value="tous"' + (options.filtre === 'tous' ? ' selected' : '') + '>Liste complète</option>' +
        '</select>' +
        '<p class="text-xs text-gray-400">Trie alphabétiquement les élèves et totalise les heures d\'absence de l\'année. ' +
        'L\'en-tête figure sur la première page de chaque classe, le pied de page est répété. La langue suit la section de la classe.</p>' +
        '</div>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Télécharger PDF', classe: 'nm-soft-convex text-accent',
          onClick: function () { telechargerPdf(choisies(classes), { mode: 'absences', filtre: optionsChamp() }); }
        },
        {
          label: 'Imprimer', classe: 'bg-accent text-white',
          onClick: function () { imprimer(choisies(classes), { mode: 'absences', filtre: optionsChamp() }); }
        }
      ]
    });
  }

  function nombreSequencesExport(anneeId) { return nombreSequences(anneeId); }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.listesEleves = {
    choisir: choisir,
    choisirAbsences: choisirAbsences,
    imprimer: imprimer,
    telechargerPdf: telechargerPdf,
    estAnglophone: estAnglophone,
    nombreSequences: nombreSequencesExport
  };
})(window);
