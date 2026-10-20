/* EduNeum - Élèves : fiches permanentes réemployées d'une année à l'autre.
   Point cle : l'élève est une ENTITE PERMANENTE, pas une ligne d'année. Il
   appartient donc à une classe par annee (voir le module Inscriptions), et
   une fiche qui porte des notes n'est jamais effacée, seulement archivée. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  /* Garde de route : acces.exiger() refuse ET redirige. layout.init()
     refait le meme controle au DOMContentLoaded ; cette garde evite
     simplement d'afficher le contenu avant la redirection. */
  if (!E.acces.exiger('admin_eleves')) return;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  function refresh() {
    var toutes = S.all('eleves');
    var actifs = toutes.filter(function (e) { return !e.archive; });
    var archives = toutes.filter(function (e) { return e.archive; });
    var inscrits = S.all('inscriptions').filter(function (i) { return i.anneeId === an.id && !i.archive; });
    var classes = S.classesDe(an.id);
    var parClasse = {};
    inscrits.forEach(function (i) { parClasse[i.classeId] = (parClasse[i.classeId] || 0) + 1; });
    var sansClasse = actifs.filter(function (e) {
      return !inscrits.some(function (i) { return i.eleveId === e.id; });
    }).length;

    /* La classe d'un eleve n'est PAS une propriete de sa fiche : elle vient
       de son inscription pour l'annee consultee. On enrichit donc les lignes
       du tableau avec classeId, sinon le filtre et la colonneAfficheraient
       toujours « non inscrit ». */
    var classeDe = {};
    inscrits.forEach(function (i) { classeDe[i.eleveId] = i.classeId; });
    var lignes = actifs.map(function (e) {
      return Object.assign({}, e, { classeId: classeDe[e.id] || '' });
    });

    var table = UI.tableau({
      lignes: lignes,
      placeholderRecherche: 'Rechercher un nom, prénom ou matricule…',
      parPage: 12,
      nomExport: 'eleves-' + an.libelle,
      messageVide: 'Aucun élève enregistré.',
      filtres: [
        {
          cle: 'classe', options: [{ valeur: '', libelle: 'Toutes les classes' }].concat(
            [{ valeur: '__aucune', libelle: 'Non inscrits' }].concat(
              classes.map(function (c) { return { valeur: c.id, libelle: c.nom }; })))
        },
        { cle: 'sexe', options: [{ valeur: '', libelle: 'Filles et garçons' }, { valeur: 'F', libelle: 'Filles' }, { valeur: 'M', libelle: 'Garçons' }] }
      ],
      filtreValeur: function (l, k) {
        if (k === 'sexe') return l.sexe;
        var c = l.classeId;
        return c || '__aucune';
      },
      colonnes: [
        {
          cle: 'nom', titre: 'Élève',
          valeurTri: function (l) { return l.nom + ' ' + l.prenom; },
          rendu: function (l) {
            return '<div class="flex items-center gap-3">' + avatar(l) +
              '<div><p class="font-bold">' + P.esc(l.nom + ' ' + l.prenom) + '</p>' +
              '<p class="text-xs text-gray-400">' + P.esc(l.matricule || 'sans matricule') + '</p></div></div>';
          }
        },
        {
          cle: 'classe', titre: 'Classe ' + an.libelle, triable: false,
          valeurTri: function (l) { var c = S.classeParId(l.classeId); return c ? c.nom : ''; },
          rendu: function (l) {
            var c = S.classeParId(l.classeId);
            return c
              ? '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + P.esc(c.nom) + '</span>'
              : '<span class="text-xs text-amber-500 font-bold">non inscrit</span>';
          }
        },
        {
          cle: 'naissance', titre: 'Naissance', triable: false,
          valeurTri: function (l) { return l.dateNaissance || ''; },
          rendu: function (l) {
            if (!l.dateNaissance) return '<span class="text-xs text-gray-400">—</span>';
            return '<span class="text-xs">' + UI.dateFr(l.dateNaissance) +
              (l.lieuNaissance ? '<br><span class="text-gray-400">' + P.esc(l.lieuNaissance) + '</span>' : '') + '</span>';
          }
        },
        {
          cle: 'contact', titre: 'Contact tuteur', triable: false,
          valeurTri: function (l) { return l.contactTuteur || ''; },
          rendu: function (l) {
            return l.contactTuteur
              ? '<span class="text-xs">' + P.esc(l.contactTuteur) + '</span>'
              : '<span class="text-xs text-gray-400">—</span>';
          }
        },
        {
          cle: 'actions', titre: '', triable: false, classe: 'text-right',
          rendu: function (l) { return P.peutEcrire() ? actions(l) : ''; }
        }
      ]
    });

    var entete = P.peutEcrire()
      ? '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" id="btn-nouvel-eleve" class="py-2.5 px-5 bg-accent text-white font-bold rounded-2xl text-xs flex items-center gap-2">' +
        P.ico('user-plus', 14) + 'Nouvel élève</button>' +
        '<button type="button" id="btn-import" class="py-2.5 px-4 nm-soft-convex rounded-2xl text-xs font-bold flex items-center gap-2">' +
        P.ico('file-up', 14) + 'Importer un fichier</button>' +
        '<input type="file" id="fichier-import" accept=".csv,text/csv" class="hidden">' +
        '</div>'
      : '';

    var sectionEleves = P.avecTableau(
      P.section({ titre: 'Élèves', icone: 'users-round', actions: entete, contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
      table
    );

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Élèves', valeur: String(actifs.length), icone: 'users' }),
        P.carte({ label: 'Inscrits en ' + an.libelle, valeur: String(inscrits.length), icone: 'badge-check', couleur: 'text-blue-500' }),
        P.carte({
          label: 'Non inscrits', valeur: String(sansClasse), icone: 'user-x',
          couleur: sansClasse ? 'text-amber-500' : 'text-green-500'
        }),
        P.carte({ label: 'Archivés', valeur: String(archives.length), icone: 'archive', couleur: 'text-gray-400' })
      ]),

      sectionEleves,

      P.section({
        titre: 'Répartition par classe', icone: 'chart-pie',
        contenu: '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' +
          (classes.length ? classes.map(function (c) {
            var n = parClasse[c.id] || 0;
            return '<div class="nm-flat rounded-[32px] p-5">' +
              '<div class="flex items-center justify-between"><p class="font-bold text-sm">' + P.esc(c.nom) + '</p>' +
              '<span class="text-xs font-bold nm-inset px-2 py-1 rounded-full">' + n + ' élève(s)</span></div></div>';
          }).join('') : UI.etatVide('Aucune classe pour cette année.')) + '</div>'
      }),

      archives.length ? P.section({
        titre: 'Élèves archivés', icone: 'archive',
        contenu: '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
          archives.map(function (e) {
            return '<div class="nm-inset rounded-2xl p-4 flex items-center gap-3">' + avatar(e) +
              '<div><p class="font-bold text-sm">' + P.esc(e.nom + ' ' + e.prenom) + '</p>' +
              '<p class="text-xs text-gray-400">' + P.esc(e.matricule || 'sans matricule') + '</p></div></div>';
          }).join('') + '</div>'
      }) : ''
    ]);

    var b1 = document.getElementById('btn-nouvel-eleve');
    if (b1) b1.addEventListener('click', function () { formulaire(null); });
    var b2 = document.getElementById('btn-import');
    var fi = document.getElementById('fichier-import');
    if (b2 && fi) {
      b2.addEventListener('click', function () { fi.click(); });
      fi.addEventListener('change', function () {
        if (fi.files && fi.files[0]) importer(fi.files[0]);
        fi.value = '';
      });
    }
  }

  /* ------------------------------ Helpers ------------------------------- */
  function avatar(e) {
    if (e.photo) {
      return '<img src="' + P.esc(e.photo) + '" alt="" class="w-9 h-9 rounded-full object-cover nm-inset">';
    }
    var initiales = ((e.nom || ' ') + ' ' + (e.prenom || '')).trim().charAt(0) +
      (e.prenom || '').trim().charAt(0);
    return '<span class="w-9 h-9 rounded-full bg-gradient-to-tr from-accent to-purple-400 text-white flex items-center ' +
      'justify-center text-[10px] font-black shrink-0">' + P.esc(initiales.toUpperCase()) + '</span>';
  }

  function actions(e) {
    var g = document.createElement('div');
    g.className = 'flex items-center justify-end gap-2';
    var bEdit = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-accent', title: 'Modifier', html: P.ico('pencil', 14) });
    bEdit.addEventListener('click', function () { formulaire(e); });
    var bArch = UI.el('button', { class: 'p-2 nm-soft-convex rounded-lg text-red-500', title: 'Archiver', html: P.ico('archive', 14) });
    bArch.addEventListener('click', function () { archiver(e); });
    g.appendChild(bEdit);
    g.appendChild(bArch);
    return g;
  }

  /* ---------------------------- Formulaire ------------------------------ */
  /* Bloc photo : apercu + choix de fichier. L'image est lue par le
     navigateur puis stockee en data-URL dans le champ `photo` de l'eleve,
     pour que la fiche reste autonome (aucun fichier externe). Le meme
     format est compris par l'affichage de liste (avatar) et les bulletins. */
  function blocPhoto(etat) {
    var boite = UI.el('div', { class: 'space-y-2 md:col-span-2' });
    var apercu = UI.el('div', { class: 'w-20 h-20 rounded-2xl nm-inset flex items-center justify-center overflow-hidden shrink-0' });
    function rafraichir() {
      if (etat.valeur) {
        apercu.innerHTML = '';
        apercu.appendChild(UI.el('img', { src: etat.valeur, alt: 'Photo de l\'élève', class: 'w-full h-full object-cover' }));
      } else {
        apercu.innerHTML = '<iconify-icon icon="lucide:user" width="30" class="text-gray-400"></iconify-icon>';
      }
    }
    rafraichir();

    var champFichier = UI.el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    champFichier.addEventListener('change', function () {
      var f = champFichier.files && champFichier.files[0];
      if (!f) return;
      if (f.type.indexOf('image/') !== 0) { UI.toast('Le fichier doit être une image.', 'error'); champFichier.value = ''; return; }
      if (f.size > 300 * 1024) { UI.toast('Image trop lourde (300 Ko maximum).', 'error'); champFichier.value = ''; return; }
      var lecteur = new FileReader();
      lecteur.onload = function () { etat.valeur = String(lecteur.result || ''); rafraichir(); };
      lecteur.readAsDataURL(f);
    });

    var btnChoisir = UI.el('label', {
      class: 'px-4 py-2.5 nm-soft-convex rounded-2xl text-xs font-bold text-accent cursor-pointer inline-flex items-center gap-2',
      html: '<iconify-icon icon="lucide:image-plus" width="16"></iconify-icon>Choisir une image'
    });
    btnChoisir.appendChild(champFichier);
    var btnRetirer = UI.el('button', {
      type: 'button',
      class: 'px-4 py-2.5 nm-soft-convex rounded-2xl text-xs font-bold text-red-500 inline-flex items-center gap-2',
      html: '<iconify-icon icon="lucide:trash-2" width="16"></iconify-icon>Retirer'
    });
    btnRetirer.addEventListener('click', function () { etat.valeur = ''; champFichier.value = ''; rafraichir(); });

    var commandes = UI.el('div', { class: 'space-y-2' }, [
      UI.el('label', { class: 'block text-xs font-bold uppercase tracking-wider text-gray-400', text: 'Photo de l\'élève' }),
      UI.el('div', { class: 'flex flex-wrap gap-2' }, [btnChoisir, btnRetirer])
    ]);
    boite.appendChild(UI.el('div', { class: 'flex items-center gap-4' }, [apercu, commandes]));
    boite.appendChild(UI.el('p', { class: 'text-xs text-gray-500', text: 'PNG ou JPG, 300 Ko maximum.' }));
    return boite;
  }

  function formulaire(e) {
    var etatPhoto = { valeur: e && e.photo ? e.photo : '' };
    var fMat = UI.champ({ label: 'Matricule', valeur: e ? e.matricule : '', placeholder: 'Ex. 2025-0142' });
    var fNom = UI.champ({ label: 'Nom', valeur: e ? e.nom : '', requis: true });
    var fPre = UI.champ({ label: 'Prénom', valeur: e ? e.prenom : '', requis: true });
    var fSexe = UI.champ({
      label: 'Sexe', type: 'select', valeur: e ? e.sexe : 'M',
      options: [{ valeur: 'M', libelle: 'Masculin' }, { valeur: 'F', libelle: 'Féminin' }]
    });
    var fNaiss = UI.champ({ label: 'Date de naissance', type: 'date', valeur: e ? e.dateNaissance : '' });
    var fLieu = UI.champ({ label: 'Lieu de naissance', valeur: e ? e.lieuNaissance : '' });
    var fTel = UI.champ({ label: 'Téléphone élève', type: 'tel', valeur: e ? e.telephone : '' });
    var fRedoublant = UI.champ({
      label: 'Redoublant', type: 'select', valeur: e && e.redoublant === 'O' ? 'O' : 'N',
      options: [{ valeur: 'N', libelle: 'Non' }, { valeur: 'O', libelle: 'Oui' }]
    });
    var fAptitude = UI.champ({
      label: 'Aptitude', type: 'select', valeur: e && e.aptitude === 'I' ? 'I' : 'A',
      options: [{ valeur: 'A', libelle: 'Apte (A)' }, { valeur: 'I', libelle: 'Inapte (I)' }]
    });
    var fTuteur = UI.champ({ label: 'Contact parent / tuteur', valeur: e ? e.contactTuteur : '', placeholder: 'Nom et téléphone' });

    UI.modal({
      titre: e ? 'Modifier la fiche élève' : 'Nouvel élève',
      contenu: '<div class="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4" id="form-eleve"></div>' +
        '<p class="text-xs text-gray-500 mt-2">La fiche élève est permanente : elle est réutilisée d\'une année scolaire à l\'autre. ' +
        'L\'inscription dans une classe se fait depuis le module Inscriptions.</p>',
      actions: [
        { label: 'Annuler', classe: 'nm-soft-convex' },
        {
          label: e ? 'Enregistrer' : 'Créer', classe: 'bg-accent text-white',
          onClick: function () {
            if (!UI.validerChamps([fNom, fPre])) return false;
            var payload = {
              matricule: fMat.valeur(), nom: fNom.valeur(), prenom: fPre.valeur(),
              sexe: fSexe.valeur(), dateNaissance: fNaiss.valeur(), lieuNaissance: fLieu.valeur(),
              telephone: fTel.valeur(),
              aptitude: fAptitude.valeur(), redoublant: fRedoublant.valeur(),
              contactTuteur: fTuteur.valeur(), photo: etatPhoto.valeur
            };
            var r = e ? S.modifierEleve(e.id, payload) : S.creerEleve(payload);
            if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
            UI.toast(e ? 'Fiche mise à jour.' : 'Élève créé.', 'success');
            refresh();
          }
        }
      ]
    });
    var f = document.getElementById('form-eleve');
    f.appendChild(blocPhoto(etatPhoto));
    f.appendChild(fMat.element); f.appendChild(fNom.element);
    f.appendChild(fPre.element); f.appendChild(fSexe.element);
    f.appendChild(fNaiss.element); f.appendChild(fLieu.element);
    f.appendChild(fTel.element); f.appendChild(fRedoublant.element);
    f.appendChild(fAptitude.element); f.appendChild(fTuteur.element);
  }

  /* ----------------------------- Archivage ------------------------------ */
  function archiver(e) {
    UI.confirmer({
      titre: 'Archiver la fiche élève',
        message: 'Archiver <b>' + P.esc(e.nom + ' ' + e.prenom) + '</b> ?<br><br>' +
        'Sa fiche n\'est jamais effacée : ses notes et son historique restent consultables. ' +
        'L\'élève ne sera plus proposé aux inscriptions.'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.archiverEleve(e.id);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Fiche archivée.', 'info');
      refresh();
    });
  }

  /* ------------------------------ Import CSV ---------------------------- */
  /* Colonnes reconnues (en-tetes, insensible a la casse et aux accents) :
     matricule, nom, prenom, sexe, dateNaissance/lieuNaissance/contactTuteur.
     Chaque ligne est validee par le store et les refus sont listes, pour
     qu'un fichier partiellement errone ne soit pas silencieusement perdu. */
  function importer(fichier) {
    var fr = new FileReader();
    fr.onload = function () {
      var lignes = parseCSV(String(fr.result));
      if (!lignes.length) { UI.toast('Fichier vide ou illisible.', 'error'); return; }
      var r = S.importerEleves(lignes);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      if (!r.crees.length) {
        UI.toast('Aucun élève importé : toutes les lignes ont été refusées.', 'error');
        montrerRefus(r.refus);
        return;
      }
      UI.toast(r.crees.length + ' élève(s) importé(s)' + (r.refus.length ? ', ' + r.refus.length + ' refus' : '') + '.', 'success');
      refresh();
      if (r.refus.length) montrerRefus(r.refus);
    };
    fr.onerror = function () { UI.toast('Lecture du fichier impossible.', 'error'); };
    fr.readAsText(fichier, 'utf-8');
  }

  function parseCSV(contenu) {
    var lignes = contenu.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lignes.length < 2) return [];
    function decoupe(l) {
      var out = [], cur = '', dansGuillemets = false;
      for (var i = 0; i < l.length; i++) {
        var c = l[i];
        if (c === '"') {
          if (dansGuillemets && l[i + 1] === '"') { cur += '"'; i++; }
          else dansGuillemets = !dansGuillemets;
        } else if (c === ';' && !dansGuillemets) { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out.map(function (x) { return x.trim(); });
    }
    function cle(s) {
      return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
    }
    var entetes = decoupe(lignes[0]).map(cle);
    var index = {};
    entetes.forEach(function (h, i) { index[h] = i; });
    if (index.nom === undefined || index.prenom === undefined) return [];
    var paires = [['matricule', 'matricule'], ['nom', 'nom'], ['prenom', 'prenom'], ['sexe', 'sexe'],
      ['datedenaissance', 'dateNaissance'], ['lieudenaissance', 'lieuNaissance'],
      ['telephone', 'telephone'], ['contactparenttuteur', 'contactTuteur'],
      ['redoublant', 'redoublant'], ['aptitude', 'aptitude']];
    return lignes.slice(1).map(function (l) {
      var c = decoupe(l), o = {};
      paires.forEach(function (p) {
        var i = index[p[0]];
        if (i !== undefined && c[i] !== undefined && c[i] !== '') o[p[1]] = c[i];
      });
      if (o.sexe) o.sexe = /^f/i.test(o.sexe) ? 'F' : 'M';
      if (o.dateNaissance && /^\d{2}\/\d{2}\/\d{4}$/.test(o.dateNaissance)) {
        var p = o.dateNaissance.split('/');
        o.dateNaissance = p[2] + '-' + p[1] + '-' + p[0];
      }
      return o;
    });
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
