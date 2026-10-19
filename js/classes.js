/* EduNeum - Classes : niveaux, effectifs, professeur principal.
   Regles appliquees ici : une classe appartient a une annee scolaire, son
   effectif est le nombre d'eleves inscrits (aucun plafond), un professeur
   principal ne dirige qu'UNE classe par annee. Les trois sont verifiees par
   le store ; l'interface se contente de proposer des choix deja coherents. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  /* Garde de route : acces.exiger() refuse ET redirige. layout.init()
     refait le meme controle au DOMContentLoaded ; cette garde evite
     simplement d'afficher le contenu avant la redirection. */
  if (!E.acces.exiger('admin_classes')) return;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  /* Niveaux classes par sous-systeme : chaque sous-systeme dispose de ses
     propres niveaux ; on ne peut en choisir qu'apres avoir choisi le
     sous-systeme. */
  var NIVEAUX_PAR_SECTION = {
    francophone: ['Sixième', 'Cinquième', 'Quatrième', 'Troisième', 'Seconde', 'Première', 'Terminale'],
    anglophone: ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower Sixth', 'Upper Sixth']
  };
  function tousLesNiveaux() {
    return NIVEAUX_PAR_SECTION.francophone.concat(NIVEAUX_PAR_SECTION.anglophone);
  }
  var table = null;

  function effectifDe(c) { return S.elevesDeClasse(c.id, an.id).length; }

  function refresh() {
    var toutes = S.all('classes').filter(function (c) { return c.anneeId === an.id; });
    var actives = toutes.filter(function (c) { return !c.archive; });
    var archivees = toutes.filter(function (c) { return c.archive; });
    var totalEleves = S.all('inscriptions').filter(function (i) { return i.anneeId === an.id && !i.archive; }).length;
    var sansPP = actives.filter(function (c) { return !S.ppDeClasse(c.id); }).length;

    var filtresNiveau = [{ valeur: '', libelle: 'Tous les niveaux' }].concat(
      tousLesNiveaux().filter(function (n) { return actives.some(function (c) { return c.niveau === n; }); })
        .map(function (n) { return { valeur: n, libelle: n }; }));

    table = UI.tableau({
      lignes: actives,
      placeholderRecherche: 'Rechercher une classe…',
      parPage: 12,
      nomExport: 'classes-' + an.libelle,
      messageVide: 'Aucune classe pour ' + an.libelle + '.',
      filtres: [{ cle: 'niveau', options: filtresNiveau }],
      filtreValeur: function (l, k) { return l.niveau; },
      colonnes: [
        {
          cle: 'nom', titre: 'Classe', rendu: function (l) {
            var section = l.section || 'francophone';
            var badge = section === 'anglophone'
              ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">Anglophone</span>'
              : '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/10 text-green-500">Francophone</span>';
            return '<div><p class="font-bold">' + P.esc(l.nom) + '</p>' +
              '<p class="text-xs text-gray-400 flex items-center gap-2">' + badge + '</p></div>';
          }
        },
        { cle: 'niveau', titre: 'Niveau' },
        { cle: 'section', titre: 'Sous-système', valeurTri: function (l) { return l.section || 'francophone'; },
          rendu: function (l) {
            var section = l.section || 'francophone';
            return section === 'anglophone'
              ? '<span class="text-xs font-bold text-blue-500">Anglophone</span>'
              : '<span class="text-xs font-bold text-green-500">Francophone</span>';
          }
        },
        {
          cle: 'effectif', titre: 'Effectif', valeurTri: function (l) { return effectifDe(l); },
          rendu: function (l) {
            var n = effectifDe(l);
            return '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + n + ' élève(s)</span>';
          }
        },
        {
          cle: 'pp', titre: 'Professeur principal', triable: false,
          valeurTri: function (l) { var id = S.ppDeClasse(l.id); var p = id ? S.enseignantParId(id) : null; return p ? p.nom : ''; },
          rendu: function (l) { return PP(l); }
        },
        {
          cle: 'matieres', titre: 'Matières', triable: false,
          rendu: function (l) {
            var n = S.matieresDeClasse(l.id).length;
            return n ? '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + n + '</span>'
              : '<span class="text-xs text-amber-500 font-bold">aucune</span>';
          }
        },
        {
          cle: 'actions', titre: '', triable: false, classe: 'text-right',
          rendu: function (l) { return P.peutEcrire() ? actions(l) : ''; }
        }
      ]
    });

    /* Le tableau est accroche a la section "Classes" : avecTableau cherche
       le premier bloc .nm-flat du HTML qu'on lui passe, donc la section doit
       etre fournie entiere, conteneur vide compris. */
    var sectionClasses = P.avecTableau(
      P.section({
        titre: 'Classes de ' + an.libelle, icone: 'school',
        actions: P.peutEcrire()
          ? '<button type="button" id="btn-nouvelle-classe" class="py-2.5 px-5 bg-accent text-white font-bold rounded-2xl text-xs flex items-center gap-2">' +
            P.ico('plus', 14) + 'Nouvelle classe</button>'
          : '',
        contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>'
      }),
      table
    );

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Classes', valeur: String(actives.length), icone: 'school' }),
        P.carte({ label: 'Élèves inscrits', valeur: String(totalEleves), icone: 'users-round', couleur: 'text-blue-500' }),
        P.carte({
          label: 'Sans professeur principal', valeur: String(sansPP), icone: 'user-round-cog',
          couleur: sansPP ? 'text-amber-500' : 'text-green-500'
        }),
        P.carte({ label: 'Niveaux représentés', valeur: String(actives.reduce(function (acc, c) { if (acc.indexOf(c.niveau) === -1) acc.push(c.niveau); return acc; }, []).length), icone: 'layers', couleur: 'text-blue-500' })
      ]),

      sectionClasses,

      archivees.length ? P.section({
        titre: 'Classes archivées', icone: 'archive',
        contenu: '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
          archivees.map(function (c) {
            return '<div class="nm-inset rounded-2xl p-4 flex items-center justify-between">' +
              '<div><p class="font-bold text-sm">' + P.esc(c.nom) + '</p>' +
              '<p class="text-xs text-gray-400">' + P.esc(c.niveau) + '</p></div>' +
              '<span class="text-xs text-gray-400">archivée</span></div>';
          }).join('') + '</div>'
      }) : ''
    ]);

    var btn = document.getElementById('btn-nouvelle-classe');
    if (btn) btn.addEventListener('click', function () { formulaire(null); });
  }

  /* ------------------------------ PP ---------------------------------- */
  /* S.ppDeClasse renvoie l'identifiant de l'enseignant (une chaine) : il faut
     repasser par le store pour obtenir la fiche, sinon p.nom est undefined
     et toute classe ayant un PP s'affiche « non désigné ». */
  function PP(c) {
    var id = S.ppDeClasse(c.id);
    var p = id ? S.enseignantParId(id) : null;
    if (!p) {
      return '<span class="text-xs font-bold text-amber-500">non désigné</span>';
    }
    return '<span class="text-xs font-bold">' + P.esc(p.prenom + ' ' + p.nom) + '</span>';
  }

  function actions(c) {
    var groupe = document.createElement('div');
    groupe.className = 'flex items-center justify-end gap-2';
    var bEdit = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-accent', title: 'Modifier', html: P.ico('pencil', 14)
    });
    bEdit.addEventListener('click', function () { formulaire(c); });
    var bPP = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-blue-500', title: 'Professeur principal', html: P.ico('user-round-cog', 14)
    });
    bPP.addEventListener('click', function () { formulairePP(c); });
    var bExport = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-green-600',
      title: 'Exporter la liste des élèves en .xlsx', html: P.ico('file-down', 14)
    });
    bExport.addEventListener('click', function () { exporterClasse(c); });
    var bImport = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-amber-500',
      title: 'Importer une liste .xlsx (inscription automatique)', html: P.ico('file-up', 14)
    });
    bImport.addEventListener('click', function () { demanderImport(c); });
    var bArch = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-red-500', title: 'Archiver', html: P.ico('archive', 14)
    });
    bArch.addEventListener('click', function () { archiver(c); });
    groupe.appendChild(bEdit);
    groupe.appendChild(bPP);
    groupe.appendChild(bExport);
    groupe.appendChild(bImport);
    groupe.appendChild(bArch);
    return groupe;
  }

  /* --------------------------- Formulaire classe ------------------------ */
   /* Ordre impose : d'abord le sous-systeme, ensuite le niveau (limité aux
      niveaux de ce sous-systeme), enfin le nom de la classe. */
  function formulaire(c) {
    var sectionInitiale = c ? (c.section || 'francophone') : 'francophone';

    var fSection = UI.champ({
      label: 'Sous-système éducatif', type: 'select', valeur: sectionInitiale, requis: true,
      options: [{ valeur: 'francophone', libelle: 'Francophone (6ème - Terminale, 6 séquences/3 trimestres)' }, { valeur: 'anglophone', libelle: 'Anglophone (Form 1-5, Lower/Upper Sixth, GCE)' }]
    });

    var fNiveau = UI.champ({
      label: 'Niveau', type: 'select', valeur: c ? c.niveau : '', requis: true,
      options: [{ valeur: '', libelle: 'Sélectionner un niveau…' }]
    });

    function majNiveaux() {
      var section = fSection.valeur() === 'anglophone' ? 'anglophone' : 'francophone';
      var niveauActuel = fNiveau.valeur();
      fNiveau.input.innerHTML = '';
      var optVide = document.createElement('option');
      optVide.value = '';
      optVide.textContent = 'Sélectionner un niveau…';
      fNiveau.input.appendChild(optVide);
      NIVEAUX_PAR_SECTION[section].forEach(function (n) {
        var opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        if (niveauActuel === n) opt.selected = true;
        fNiveau.input.appendChild(opt);
      });
    }
    majNiveaux();
    fSection.input.addEventListener('change', majNiveaux);

    var fNom = UI.champ({ label: 'Nom de la classe', valeur: c ? c.nom : '', requis: true, placeholder: 'Ex. Terminale S1' });

    UI.modal({
      titre: c ? 'Modifier la classe' : 'Nouvelle classe',
      contenu: '<div class="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4" id="form-classe"></div>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: c ? 'Enregistrer' : 'Créer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fSection, fNiveau, fNom])) return false;
            var payload = {
              nom: fNom.valeur(), niveau: fNiveau.valeur(),
              section: fSection.valeur()
            };
            var r = c ? S.modifierClasse(c.id, payload) : S.creerClasse(Object.assign({ anneeId: an.id }, payload));
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast(c ? 'Classe mise à jour.' : 'Classe créée.', 'success');
            refresh();
          }
        }
      ]
    });
    var f = document.getElementById('form-classe');
    f.appendChild(fSection.element); f.appendChild(fNiveau.element); f.appendChild(fNom.element);
  }

  /* ------------------------- Formulaire PP ------------------------------ */
  /* La liste ne propose que les profs LIBRES : un prof deja PP ailleurs est
     signale plutot que desactive, pour que la regle soit visible. */
  function formulairePP(c) {
    var dispo = S.profsDisponiblesPourPP(an.id);
    var actuels = S.ppDeClasse(c.id);
    var options = [{ valeur: '', libelle: '— Aucun professeur principal —' }].concat(
      dispo.map(function (d) {
        return {
          valeur: d.enseignant.id,
          libelle: d.enseignant.prenom + ' ' + d.enseignant.nom +
            (d.indisponible && d.occupePar !== c.nom
              ? ' — déjà PP de ' + d.occupePar + ' (indisponible)' : '')
        };
      }));

    var fProf = UI.champ({
      label: 'Professeur principal', type: 'select', requis: true,
      valeur: actuels || '', options: options
    });

    UI.modal({
      titre: 'Professeur principal de ' + c.nom,
      contenu: '<div class="space-y-3" id="form-pp"></div>' +
        '<p class="text-xs text-gray-500">Un professeur principal ne dirige qu\'une seule classe pour ' +
        P.esc(an.libelle) + '. Le changement est inscrit au journal d\'audit.</p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: 'Attribuer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fProf])) return false;
            if (!fProf.valeur()) { UI.toast('Choisissez un professeur principal.', 'error'); return; }
            var r = S.definirPP(c.id, fProf.valeur());
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            var p = S.enseignantParId(fProf.valeur());
            UI.toast('Professeur principal : ' + (p ? p.prenom + ' ' + p.nom : '?'), 'success');
            refresh();
          }
        }
      ]
    });
    document.getElementById('form-pp').appendChild(fProf.element);
  }

  /* ---------------------------- Archivage -------------------------------- */
  /* Jamais de suppression physique : une classe porte des notes, son
     historique doit rester consultable. */
  function archiver(c) {
    var n = effectifDe(c);
    UI.confirmer({
      titre: 'Archiver la classe',
      message: 'Archiver <b>' + P.esc(c.nom) + '</b> ?' +
        (n ? '<br><br>Ses <b>' + n + '</b> élève(s) et les notes déjà saisies resteront consultables dans l\'historique.' : '')
    }).then(function (ok) {
      if (!ok) return;
      var r = S.archiverClasse(c.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast(r.conserve ? 'Classe archivée (historique conservé).' : 'Classe archivée.', 'info');
      refresh();
    });
  }

  /* ----------------------- Export / import .xlsx ------------------------ */
  /* L'export ecrit un .xlsx via ui.exporterXLSX (aucune bibliotheque) ;
     l'importe relit le meme format via ui.lireXLSX. Les en-tetes des deux
     sens sont identiques, donc le fichier exporte peut etre corrige dans
     Excel puis reimporte tel quel. L'import cree les fiches manquantes
     (matricule deja connu = fiche reutilisee) et inscrit automatiquement
     les eleves dans la classe choisie. */

  function colonnesEleves() {
    return [
      { titre: 'Matricule', valeurTri: function (e) { return e.matricule || ''; } },
      { titre: 'Nom', valeurTri: function (e) { return e.nom; } },
      { titre: 'Prénom', valeurTri: function (e) { return e.prenom; } },
      { titre: 'Sexe', valeurTri: function (e) { return e.sexe === 'F' ? 'F' : 'M'; } },
      { titre: 'Date de naissance', valeurTri: function (e) { return dateVersFr(e.dateNaissance); } },
      { titre: 'Lieu de naissance', valeurTri: function (e) { return e.lieuNaissance || ''; } },
      { titre: 'Téléphone', valeurTri: function (e) { return e.telephone || ''; } },
      { titre: 'Téléphone parent', valeurTri: function (e) { return e.telephoneParent || ''; } },
      { titre: 'Contact tuteur', valeurTri: function (e) { return e.contactTuteur || ''; } },
      { titre: 'Aptitude', valeurTri: function (e) { return e.aptitude === 'I' ? 'Inapte' : 'Apte'; } },
      { titre: 'Redoublant', valeurTri: function (e) { return e.redoublant === 'O' ? 'Oui' : 'Non'; } }
    ];
  }

  function dateVersFr(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }

  function exporterClasse(c) {
    var eleves = S.elevesDeClasse(c.id, an.id).filter(function (e) { return e && !e.archive; });
    UI.exporterXLSX(colonnesEleves(), eleves, 'eleves-' + c.nom, { titreFeuille: c.nom });
    UI.toast(eleves.length
      ? eleves.length + ' élève(s) exporté(s) dans « ' + c.nom + ' ».'
      : 'Classe vide : modèle .xlsx exporté (en-têtes seuls).', 'success');
  }

  /* Un seul input cache, reutilise d'une classe a l'autre : la classe
      visee est memorisee au moment du clic. */
  var fichierImport = null;
  var classeCible = null;

  function demanderImport(c) {
    if (!fichierImport) {
      fichierImport = document.createElement('input');
      fichierImport.type = 'file';
      fichierImport.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fichierImport.className = 'hidden';
      fichierImport.addEventListener('change', function () {
        var f = fichierImport.files && fichierImport.files[0];
        var cible = classeCible;
        fichierImport.value = '';
        classeCible = null;
        if (f && cible) traiterImport(cible, f);
      });
      document.body.appendChild(fichierImport);
    }
    classeCible = c;
    fichierImport.click();
  }

  function traiterImport(c, fichier) {
    UI.lireXLSX(fichier).then(function (lignes) {
      var objets = versObjets(lignes);
      if (!objets.length) {
        UI.toast('Fichier vide ou en-têtes introuvables (Matricule, Nom, Prénom…).', 'error');
        return;
      }
      importerDansClasse(c, objets);
    }, function () {
      UI.toast('Lecture du fichier .xlsx impossible.', 'error');
    });
  }

  /* Transforme les lignes de cellules en objets eleve, memes regles que
      l'import CSV d'eleves.js : en-tetes insensibles a la casse/accents,
      dates jj/mm/aaaa ou serial Excel converties en ISO. */
  function versObjets(lignes) {
    var utiles = (lignes || []).filter(function (l) { return l && l.join('').trim(); });
    if (utiles.length < 2) return [];
    function cle(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
    }
    var index = {};
    utiles[0].map(cle).forEach(function (h, i) { if (index[h] === undefined) index[h] = i; });
    if (index.nom === undefined || index.prenom === undefined) return [];
    var paires = [
      ['matricule', 'matricule'], ['nom', 'nom'], ['prenom', 'prenom'], ['sexe', 'sexe'],
      ['datedenaissance', 'dateNaissance'], ['lieudenaissance', 'lieuNaissance'],
      ['telephone', 'telephone'], ['telephoneparent', 'telephoneParent'],
      ['contacttuteur', 'contactTuteur'], ['contactparenttuteur', 'contactTuteur'],
      ['redoublant', 'redoublant'], ['aptitude', 'aptitude']
    ];
    return utiles.slice(1).map(function (ligne) {
      var o = {};
      paires.forEach(function (p) {
        var i = index[p[0]];
        if (i !== undefined && ligne[i] !== undefined && String(ligne[i]).trim() !== '') {
          o[p[1]] = String(ligne[i]).trim();
        }
      });
      if (o.sexe) o.sexe = /^f/i.test(o.sexe) ? 'F' : 'M';
      if (o.dateNaissance) o.dateNaissance = normaliserDate(o.dateNaissance);
      if (o.aptitude) o.aptitude = /^(i|inapte)/i.test(o.aptitude) ? 'I' : 'A';
      if (o.redoublant) o.redoublant = /^(o|oui)/i.test(o.redoublant) ? 'O' : 'N';
      return o;
    });
  }

  function normaliserDate(v) {
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    if (/^\d+(\.\d+)?$/.test(s)) {
      /* Date Excel : nombre de jours depuis le 30/12/1899. */
      var n = Math.round(Number(s));
      if (n > 0 && n < 80000) {
        return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
      }
    }
    return s;
  }

  function importerDansClasse(c, objets) {
    /* 1) Fiches : matricule deja connu -> fiche existante reutilisee ;
          sinon creation en lot via le store (controles et journal). */
    var existants = {};
    S.all('eleves').forEach(function (e) { if (e.matricule) existants[e.matricule.trim()] = e; });

    var aCreer = [], lignesAcreer = [], retenus = [], refus = [];
    objets.forEach(function (o, i) {
      var ex = o.matricule ? existants[o.matricule.trim()] : null;
      if (ex) { retenus.push({ ligne: i + 2, eleve: ex }); return; }  /* ligne 1 = en-tetes */
      aCreer.push(o);
      lignesAcreer.push(i + 2);
    });

    var nbCrees = 0;
    if (aCreer.length) {
      var r = S.importerEleves(aCreer);
      if (!r.ok) { UI.toast(r.motif, 'error'); return; }
      var refusees = {};
      r.refus.forEach(function (x) { refusees[x.ligne - 1] = true; });
      var num = 0;
      lignesAcreer.forEach(function (ligne, i) {
        if (refusees[i]) return;
        retenus.push({ ligne: ligne, eleve: r.crees[num++] });
      });
      nbCrees = num;
      r.refus.forEach(function (x) {
        refus.push({ ligne: lignesAcreer[x.ligne - 1], motif: x.motif });
      });
    }

    /* 2) Inscription automatique : une seule classe par eleve et par annee,
          deja inscrit ailleurs = signale, jamais deplacer silencieusement. */
    var inscrits = {};
    S.all('inscriptions').forEach(function (ins) {
      if (ins.anneeId === an.id && !ins.archive) inscrits[ins.eleveId] = ins;
    });
    var paires = [], deja = 0;
    retenus.forEach(function (t) {
      var ins = inscrits[t.eleve.id];
      if (ins) {
        if (ins.classeId === c.id) { deja++; return; }
        var autre = S.classeParId(ins.classeId);
        refus.push({ ligne: t.ligne, motif: 'Déjà inscrit en « ' + (autre ? autre.nom : '?') + ' » pour cette année.' });
        return;
      }
      paires.push({ eleveId: t.eleve.id, classeId: c.id });
    });

    var ri = { ok: true, inscrits: [], refus: [] };
    if (paires.length) {
      ri = S.inscrireLot(paires, an.id);
      if (!ri.ok) { UI.toast(ri.motif, 'error'); return; }
    }
    ri.refus.forEach(function (x) {
      var t = retenus.filter(function (z) { return z.eleve.id === x.eleveId; })[0];
      refus.push({ ligne: t ? t.ligne : '—', motif: x.motif });
    });

    /* 3) Bilan : creation, inscription, deja presents, refus detailles. */
    var morceaux = [];
    if (nbCrees) morceaux.push(nbCrees + ' élève(s) créé(s)');
    if (ri.inscrits.length) morceaux.push(ri.inscrits.length + ' inscrit(s) en ' + c.nom);
    if (deja) morceaux.push(deja + ' déjà inscrit(s)');
    if (refus.length) morceaux.push(refus.length + ' refus');
    if (!morceaux.length) { UI.toast('Aucune ligne à importer.', 'info'); return; }

    var succes = nbCrees + ri.inscrits.length > 0;
    UI.toast(morceaux.join(', ') + '.', succes ? 'success' : 'error');
    refresh();
    if (refus.length) montrerRefus(refus);
  }

  function montrerRefus(refus) {
    UI.modal({
      titre: 'Lignes refusées (' + refus.length + ')',
      contenu: '<div class="max-h-64 overflow-auto space-y-2">' +
        refus.slice(0, 40).map(function (r) {
          return '<p class="text-xs nm-inset rounded-xl p-2"><b>Ligne ' + r.ligne + ' :</b> ' + P.esc(r.motif) + '</p>';
        }).join('') +
        (refus.length > 40 ? '<p class="text-xs text-gray-400">… et ' + (refus.length - 40) + ' autres.</p>' : '') +
        '</div>',
      actions: [{ label: 'Fermer', classe: 'nm-soft-convex' }]
    });
  }

  refresh();
})();
