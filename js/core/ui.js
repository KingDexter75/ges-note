/* EduNeum - Composants d'interface partages : notifications, modales, confirmations,
   etats vides / chargement / erreur, et un tableau de donnees reutilisable
   (recherche + tri + filtres + pagination + export CSV). */
(function (global) {
  'use strict';

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function icon(name, size) {
    return '<iconify-icon icon="lucide:' + name + '" width="' + (size || 16) + '"></iconify-icon>';
  }

  /* ---------------------------- Notifications ---------------------------- */
  var TOAST_STYLE = {
    success: 'border-l-green-500', error: 'border-l-red-500',
    info: 'border-l-accent', warning: 'border-l-amber-500'
  };

  function toast(message, type) {
    type = type || 'info';
    var host = document.getElementById('eduneum-toasts');
    if (!host) {
      host = el('div', { id: 'eduneum-toasts', class: 'fixed bottom-6 right-6 z-[500] flex flex-col gap-3 pointer-events-none' });
      document.body.appendChild(host);
    }
    var t = el('div', {
      class: 'toast pointer-events-auto px-5 py-3 rounded-2xl nm-soft-convex bg-white dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 border-l-4 ' + (TOAST_STYLE[type] || TOAST_STYLE.info),
      role: 'status'
    }, [document.createTextNode(message)]);
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      setTimeout(function () { t.remove(); }, 300);
    }, 3200);
  }

  /* ------------------------------ Modale -------------------------------- */
  var modaleOuverte = null;

  function modal(opts) {
    fermerModale();
    var boite = el('div', { class: 'modal-overlay fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm' });
    var panneau = el('div', { class: 'nm-flat bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto' });
    panneau.appendChild(el('h3', { class: 'text-lg font-black display-font text-gray-800 dark:text-gray-100', text: opts.titre || '' }));
    var corps = el('div', { class: 'space-y-4' });
    if (typeof opts.contenu === 'string') corps.innerHTML = opts.contenu;
    else if (opts.contenu) corps.appendChild(opts.contenu);
    panneau.appendChild(corps);
    var barre = el('div', { class: 'flex flex-wrap justify-end gap-3 pt-2' });
    (opts.actions || [{ label: 'Fermer', classe: 'nm-soft-convex' }]).forEach(function (a) {
      barre.appendChild(el('button', {
        class: 'px-5 py-2 rounded-xl text-sm font-bold ' + (a.classe || 'nm-soft-convex') + ' text-gray-600 dark:text-gray-300',
        type: 'button',
        /* Un onClick qui renvoie false empeche la fermeture : sans cela, un
       formulaire refuse par la validation ou par le store se refermait
       quand meme et l'utilisateur perdait sa saisie. C'est le contrat
       utilise par tous les formulaires de l'application. */
        onclick: function () {
          var garder = a.onClick ? a.onClick() : undefined;
          if (a.ferme !== false && garder !== false) fermerModale();
        }
      }, [document.createTextNode(a.label)]));
    });
    panneau.appendChild(barre);
    boite.appendChild(panneau);
    boite.addEventListener('click', function (e) { if (e.target === boite && opts.fermable !== false) fermerModale(); });
    document.body.appendChild(boite);
    modaleOuverte = boite;
    return { element: boite, corps: corps, fermer: fermerModale };
  }

  function fermerModale() {
    if (modaleOuverte) { modaleOuverte.remove(); modaleOuverte = null; }
  }

  /* Confirmation obligatoire avant suppression / migration. */
  function confirmer(opts) {
    return new Promise(function (resolve) {
      modal({
        titre: opts.titre || 'Confirmation',
        contenu: '<p class="text-sm text-gray-600 dark:text-gray-300">' + (opts.message || 'Confirmez-vous cette action ?') + '</p>',
        fermable: true,
        actions: [
          { label: opts.annuler || 'Annuler', classe: 'nm-soft-convex', onClick: function () { resolve(false); } },
          { label: opts.valider || 'Confirmer', classe: 'bg-accent text-white', onClick: function () { resolve(true); } }
        ]
      });
    });
  }

  /* ---------------------- Etats vides / chargement --------------------- */
  function etatVide(message, actionHtml) {
    return '<div class="py-16 text-center space-y-3">' +
      '<div class="w-14 h-14 nm-inset rounded-full mx-auto flex items-center justify-center text-gray-400">' + icon('inbox', 24) + '</div>' +
      '<p class="text-sm font-bold text-gray-500 dark:text-gray-400">' + message + '</p>' +
      (actionHtml || '') + '</div>';
  }

  function chargement(message) {
    return '<div class="py-16 text-center space-y-3">' +
      '<div class="w-10 h-10 mx-auto nm-inset rounded-full flex items-center justify-center text-accent"><iconify-icon icon="lucide:loader-2" class="animate-spin" width="20"></iconify-icon></div>' +
      '<p class="text-sm font-bold text-gray-500 dark:text-gray-400">' + (message || 'Chargement…') + '</p></div>';
  }

  function erreur(message) {
    return '<div class="py-16 text-center space-y-3">' +
      '<div class="w-14 h-14 nm-inset rounded-full mx-auto flex items-center justify-center text-red-500">' + icon('triangle-alert', 24) + '</div>' +
      '<p class="text-sm font-bold text-gray-600 dark:text-gray-300">' + message + '</p></div>';
  }

  /* ------------------------------ Champs -------------------------------- */
  function champ(opts) {
    var id = 'f-' + Math.random().toString(36).slice(2, 8);
    var input = el(opts.type === 'select' ? 'select' : opts.type === 'textarea' ? 'textarea' : 'input', {
      id: id, name: opts.name || id,
      class: 'w-full p-3 nm-inset rounded-xl text-sm ' + (opts.classe || 'bg-transparent border-none outline-none text-gray-700 dark:text-gray-200'),
      placeholder: opts.placeholder || ''
    });
    if (opts.type === 'select') {
      (opts.options || []).forEach(function (o) {
        var v = typeof o === 'string' ? o : o.valeur;
        var l = typeof o === 'string' ? o : o.libelle;
        var opt = el('option', { value: v }, [document.createTextNode(l)]);
        if (opts.valeur !== undefined && String(opts.valeur) === String(v)) opt.selected = true;
        input.appendChild(opt);
      });
    } else {
      if (opts.type) input.type = opts.type;
      if (opts.valeur !== undefined && opts.valeur !== null) input.value = opts.valeur;
      if (opts.min !== undefined) input.min = opts.min;
      if (opts.max !== undefined) input.max = opts.max;
      if (opts.step !== undefined) input.step = opts.step;
    }
    if (opts.requis) input.required = true;
    var erreurEl = el('p', { class: 'hidden text-xs font-bold text-red-500 mt-1' });
    input.addEventListener('input', function () { erreurEl.classList.add('hidden'); input.classList.remove('border-red-400'); });
    /* validerChamps() lit ces regles sur le descripteur : sans ce recopie,
       min/max/type n'etaient jamais controles et le message d'erreur
       n'apparaitrait jamais. */
    return {
      element: el('div', { class: 'space-y-1' }, [
        el('label', { for: id, class: 'block text-xs font-bold uppercase tracking-wider text-gray-400' }, [document.createTextNode(opts.label || '')]),
        input, erreurEl
      ]),
      input: input,
      label: opts.label || '', type: opts.type || 'text', requis: !!opts.requis,
      min: opts.min, max: opts.max, regex: opts.regex,
      messageRegex: opts.messageRegex,
      valeur: function () { return input.value; },
      setErreur: function (msg) {
        erreurEl.textContent = msg;
        erreurEl.classList.remove('hidden');
        input.classList.add('border-red-400');
        input.focus();
      }
    };
  }

  /* Validation en temps reel : regles declarees par champ. */
  function validerChamps(champs) {
    var ok = true;
    champs.forEach(function (c) {
      if (!c || !c.input) return;
      var v = c.valeur();
      var msg = null;
      if (c.requis && (v === '' || v === null)) msg = 'Ce champ est obligatoire.';
      else if (c.type === 'number' && v !== '' && isNaN(Number(v))) msg = 'Saisissez un nombre valide.';
      else if (c.min !== undefined && v !== '' && Number(v) < c.min) msg = 'La valeur minimale est ' + c.min + '.';
      else if (c.max !== undefined && v !== '' && Number(v) > c.max) msg = 'La valeur maximale est ' + c.max + '.';
      else if (c.regex && v !== '' && !c.regex.test(v)) msg = c.messageRegex || 'Format invalide.';
      if (msg) { c.setErreur(msg); ok = false; }
    });
    return ok;
  }

  /* --------------------------- Tableau de donnees ------------------------ */
  /* colonnes : [{ cle, titre, classe?, rendu?(ligne), triable?, valeurTri?(ligne), largeur? }] */
  function tableau(opts) {
    var etat = {
      lignes: opts.lignes.slice(),
      recherche: '', tri: null, sens: 1, page: 1, parPage: opts.parPage || 10,
      filtres: {}
    };
    var racine = el('div', { class: 'space-y-4' });
    var barre = el('div', { class: 'flex flex-wrap items-center gap-3' });
    var champRecherche = el('input', {
      type: 'search', placeholder: opts.placeholderRecherche || 'Rechercher…',
      class: 'flex-1 min-w-[180px] p-3 nm-inset rounded-xl text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200'
    });
    champRecherche.addEventListener('input', function () { etat.recherche = champRecherche.value; etat.page = 1; render(); });
    barre.appendChild(champRecherche);
    (opts.filtres || []).forEach(function (f) {
      var sel = el('select', { class: 'p-3 nm-inset rounded-xl text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200' });
      f.options.forEach(function (o) {
        var opt = el('option', { value: o.valeur }, [document.createTextNode(o.libelle)]);
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { etat.filtres[f.cle] = sel.value; etat.page = 1; render(); });
      barre.appendChild(sel);
    });
    if (opts.export !== false) {
      barre.appendChild(el('button', {
        type: 'button', title: 'Exporter en CSV',
        class: 'p-3 nm-soft-convex rounded-xl text-accent',
        onclick: function () { exporterCSV(opts.colonnes, etat.lignes, opts.nomExport || 'export'); }
      }, [el('span', { html: icon('download', 16) })]));
    }
    racine.appendChild(barre);

    var zone = el('div');
    racine.appendChild(zone);
    var pagination = el('div', { class: 'flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400' });
    racine.appendChild(pagination);

    function filtrer() {
      var q = etat.recherche.trim().toLowerCase();
      return etat.lignes.filter(function (l) {
        if (q) {
          var texte = opts.colonnes.map(function (c) {
            return c.valeurTri ? c.valeurTri(l) : (l[c.cle] === undefined ? '' : String(l[c.cle]));
          }).join(' ').toLowerCase();
          if (texte.indexOf(q) === -1) return false;
        }
        return Object.keys(etat.filtres).every(function (k) {
          var v = etat.filtres[k];
          return v === '' || v === undefined || String(opts.filtreValeur(l, k)) === String(v);
        });
      });
    }

    function render() {
      var lignes = filtrer();
      if (etat.tri) {
        var col = opts.colonnes.filter(function (c) { return c.cle === etat.tri; })[0];
        if (col) {
          lignes.sort(function (a, b) {
            var va = col.valeurTri ? col.valeurTri(a) : a[col.cle];
            var vb = col.valeurTri ? col.valeurTri(b) : b[col.cle];
            if (va === null || va === undefined) va = '';
            if (vb === null || vb === undefined) vb = '';
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * etat.sens;
            return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * etat.sens;
          });
        }
      }
      var total = lignes.length;
      var pages = Math.max(1, Math.ceil(total / etat.parPage));
      if (etat.page > pages) etat.page = pages;
      var visibles = lignes.slice((etat.page - 1) * etat.parPage, etat.page * etat.parPage);

      zone.innerHTML = '';
      if (!total) {
        zone.innerHTML = etatVide(opts.messageVide || 'Aucun résultat.');
        pagination.textContent = '';
        return;
      }
      var table = el('table', { class: 'w-full text-sm' });
      var thead = el('thead');
      var tr = el('tr', { class: 'text-left text-xs uppercase tracking-wider text-gray-400' });
      opts.colonnes.forEach(function (c) {
        var th = el('th', { class: 'py-3 px-2 font-bold ' + (c.classe || '') });
        if (c.triable !== false) {
          var btn = el('button', { type: 'button', class: 'inline-flex items-center gap-1 hover:text-accent' });
          btn.appendChild(document.createTextNode(c.titre));
          if (etat.tri === c.cle) btn.appendChild(el('span', { html: icon(etat.sens === 1 ? 'chevron-up' : 'chevron-down', 14) }));
          btn.addEventListener('click', function () {
            if (etat.tri === c.cle) etat.sens = -etat.sens;
            else { etat.tri = c.cle; etat.sens = 1; }
            render();
          });
          th.appendChild(btn);
        } else th.textContent = c.titre;
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.appendChild(thead);
      var tbody = el('tbody');
      visibles.forEach(function (l) {
        var r = el('tr', { class: 'border-t border-gray-100 dark:border-gray-800' });
        opts.colonnes.forEach(function (c) {
          var td = el('td', { class: 'py-3 px-2 ' + (c.classeCellule || '') });
          if (c.rendu) {
            var out = c.rendu(l);
            if (out && out.nodeType) td.appendChild(out);
            else td.innerHTML = out === null || out === undefined ? '' : out;
          } else td.textContent = l[c.cle] === null || l[c.cle] === undefined ? '' : String(l[c.cle]);
          r.appendChild(td);
        });
        tbody.appendChild(r);
      });
      table.appendChild(tbody);
      /* Les tableaux larges defilent dans leur propre conteneur : la page
         ne deborde jamais horizontalement sur mobile. */
      zone.appendChild(el('div', { class: 'table-scroll' }, [table]));

      pagination.innerHTML = '';
      pagination.appendChild(el('span', { text: total + ' résultat' + (total > 1 ? 's' : '') }));
      var nav = el('div', { class: 'flex items-center gap-2' });
      nav.appendChild(el('button', {
        type: 'button', class: 'p-2 nm-soft-convex rounded-lg disabled:opacity-40', disabled: etat.page === 1,
        html: icon('chevron-left', 14), onclick: function () { etat.page--; render(); }
      }));
      nav.appendChild(el('span', { text: etat.page + ' / ' + pages }));
      nav.appendChild(el('button', {
        type: 'button', class: 'p-2 nm-soft-convex rounded-lg disabled:opacity-40', disabled: etat.page === pages,
        html: icon('chevron-right', 14), onclick: function () { etat.page++; render(); }
      }));
      pagination.appendChild(nav);
    }

    render();
    return {
      element: racine,
      recharger: function (lignes) { etat.lignes = lignes || []; etat.page = 1; render(); }
    };
  }

  function exporterCSV(colonnes, lignes, nom) {
    function cell(v) {
      var s = v === null || v === undefined ? '' : String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var head = colonnes.map(function (c) { return cell(c.titre); }).join(';');
    var body = lignes.map(function (l) {
      return colonnes.map(function (c) {
        return cell(c.valeurTri ? c.valeurTri(l) : l[c.cle]);
      }).join(';');
    }).join('\n');
    var blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (nom || 'export') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ------------------------------------------------------------------ */
  /* Exports binaires : .xlsx et .pdf sont ecrits a la main, sans        */
  /* bibliotheque externe. Le projet n'a ni build ni dependance, donc    */
  /* aucun CDN ne peut etre requis au moment de l'export.                */
  /* ------------------------------------------------------------------ */

  function telecharger(blob, nomFichier) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function horodatage() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  }

  /* ------------------------------ .xlsx -------------------------------- */
  /* Un .xlsx est une archive ZIP de parties XML OOXML. On ecrit des     */
  /* entrees non compressees (methode "stored") : le format l'autorise et */
  /* cela evite d'avoir a embarquer un inflate.                           */

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(octets) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < octets.length; i++) c = CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return unescape(encodeURIComponent(s));
  }

  /* Assemble une archive ZIP a partir de [nom -> contenu texte]. */
  function zip(fichiers) {
    var parts = [];   /* pieces ecrites dans l'ordre : locales puis central */
    var central = [];
    var offset = 0;
    var maintenant = new Date();
    var heure = ((maintenant.getHours() & 31) << 11) | ((maintenant.getMinutes() & 63) << 5) | ((maintenant.getSeconds() / 2) & 31);
    var jour = (((maintenant.getFullYear() - 1980) & 127) << 9) | (((maintenant.getMonth() + 1) & 15) << 5) | (maintenant.getDate() & 31);

    fichiers.forEach(function (f) {
      var nom = utf8(f.nom);
      var donnees = utf8(f.contenu);
      var somme = crc32(donnees);

      var entete = new Uint8Array(30 + nom.length);
      var v = new DataView(entete.buffer);
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);            /* version requise        */
      v.setUint16(6, 0, true);             /* indicateurs            */
      v.setUint16(8, 0, true);             /* compression : stored   */
      v.setUint16(10, heure, true);
      v.setUint16(12, jour, true);
      v.setUint32(14, somme, true);
      v.setUint32(18, donnees.length, true);
      v.setUint32(22, donnees.length, true);
      v.setUint16(26, nom.length, true);
      v.setUint16(28, 0, true);
      entete.set(nom, 30);

      var entreeCentral = new Uint8Array(46 + nom.length);
      var c = new DataView(entreeCentral.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, heure, true);
      c.setUint16(14, jour, true);
      c.setUint32(16, somme, true);
      c.setUint32(20, donnees.length, true);
      c.setUint32(24, donnees.length, true);
      c.setUint16(28, nom.length, true);
      c.setUint32(42, offset, true);
      entreeCentral.set(nom, 46);

      central.push(entreeCentral);
      parts.push(entete, donnees);
      offset += entete.length + donnees.length;
    });

    var tailleCentral = central.reduce(function (a, x) { return a + x.length; }, 0);
    var fin = new Uint8Array(22);
    var f = new DataView(fin.buffer);
    f.setUint32(0, 0x06054b50, true);
    f.setUint16(8, fichiers.length, true);
    f.setUint16(10, fichiers.length, true);
    f.setUint32(12, tailleCentral, true);
    f.setUint32(16, offset, true);

    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var archive = new Uint8Array(total + tailleCentral + 22);
    var curseur = 0;
    parts.forEach(function (p) { archive.set(p, curseur); curseur += p.length; });
    central.forEach(function (p) { archive.set(p, curseur); curseur += p.length; });
    archive.set(fin, curseur);
    return archive;
  }

  function xml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      /* Les caracteres de controle sont interdits en XML 1.0. */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function refColonne(i) {
    var s = '';
    i = i + 1;
    while (i > 0) {
      var reste = (i - 1) % 26;
      s = String.fromCharCode(65 + reste) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* colonnes : [{ cle, titre, valeurTri? }] comme exporterCSV.
     options.titreFeuille : nom de l'onglet (25 caracteres maximum Excel). */
  function exporterXLSX(colonnes, lignes, nom, options) {
    options = options || {};
    var nomFeuille = (options.titreFeuille || 'Export').slice(0, 31);

    var corps = '<row r="1">';
    colonnes.forEach(function (c, i) {
      corps += '<c r="' + refColonne(i) + '1" t="inlineStr"><is><t xml:space="preserve">' + xml(c.titre) + '</t></is></c>';
    });
    corps += '</row>';

    lignes.forEach(function (l, r) {
      var ligne = '<row r="' + (r + 2) + '">';
      colonnes.forEach(function (c, i) {
        var brut = c.valeurTri ? c.valeurTri(l) : l[c.cle];
        var ref = refColonne(i) + (r + 2);
        if (typeof brut === 'number' && isFinite(brut)) {
          ligne += '<c r="' + ref + '"><v>' + brut + '</v></c>';
        } else {
          var s = brut === null || brut === undefined ? '' : String(brut);
          if (s !== '') {
            ligne += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xml(s) + '</t></is></c>';
          } else {
            ligne += '<c r="' + ref + '"/>';
          }
        }
      });
      ligne += '</row>';
      corps += ligne;
    });

    var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var fichiers = [
      {
        nom: '[Content_Types].xml',
        contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>'
      },
      {
        nom: '_rels/.rels',
        contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>'
      },
      {
        nom: 'xl/workbook.xml',
        contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="' + NS + '" xmlns:r="' + REL + '">' +
          '<sheets><sheet name="' + xml(nomFeuille) + '" sheetId="1" r:id="rId1"/></sheets>' +
          '</workbook>'
      },
      {
        nom: 'xl/_rels/workbook.xml.rels',
        contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="' + REL + '/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>'
      },
      {
        nom: 'xl/worksheets/sheet1.xml',
        contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<worksheet xmlns="' + NS + '"><sheetData>' + corps + '</sheetData></worksheet>'
      }
    ];

    var octets = zip(fichiers);
    telecharger(new Blob([octets], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }), (nom || 'export') + '-' + horodatage() + '.xlsx');
    return true;
  }

  /* ---------------------------- .xlsx (lecture) ------------------------- */
  /* Lecture du .xlsx sans bibliotheque externe : le repertoire central du
     ZIP est lu a la main ; les entrees "stored" sont recopiees telles
     quelles et les entrees deflate passees par DecompressionStream
     (natif des navigateurs modernes), ce qui couvre les fichiers ecrits
     par le projet comme ceux produits par Excel/LibreOffice. */

  function lireZIP(octets) {
    var v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    var eocd = -1;
    var bas = Math.max(0, octets.length - 65558);
    for (var i = octets.length - 22; i >= bas; i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('Archive ZIP illisible.'));
    var nombre = v.getUint16(eocd + 10, true);
    var curseur = v.getUint32(eocd + 16, true);
    var decode = new TextDecoder('utf-8');
    var entrees = [];
    for (var n = 0; n < nombre; n++) {
      if (curseur + 46 > octets.length || v.getUint32(curseur, true) !== 0x02014b50) break;
      var methode = v.getUint16(curseur + 10, true);
      var tailleComp = v.getUint32(curseur + 20, true);
      var nomLen = v.getUint16(curseur + 28, true);
      var extraLen = v.getUint16(curseur + 30, true);
      var commentLen = v.getUint16(curseur + 32, true);
      var local = v.getUint32(curseur + 42, true);
      var nom = decode.decode(octets.subarray(curseur + 46, curseur + 46 + nomLen));
      curseur += 46 + nomLen + extraLen + commentLen;
      entrees.push({ nom: nom, methode: methode, local: local, tailleComp: tailleComp });
    }
    return Promise.all(entrees.map(function (e) {
      return extraitEntreeZIP(octets, v, e).then(function (d) { return { nom: e.nom, donnees: d }; });
    })).then(function (liste) {
      var d = {};
      liste.forEach(function (x) { d[x.nom] = x.donnees; });
      return d;
    });
  }

  function extraitEntreeZIP(octets, v, e) {
    if (e.local + 30 > octets.length) return Promise.reject(new Error('Entrée ZIP corrompue.'));
    var nomLen = v.getUint16(e.local + 26, true);
    var extraLen = v.getUint16(e.local + 28, true);
    var debut = e.local + 30 + nomLen + extraLen;
    var compresse = octets.subarray(debut, debut + e.tailleComp);
    if (e.methode === 0) return Promise.resolve(compresse);
    if (e.methode === 8 && typeof DecompressionStream !== 'undefined') {
      var flux = new Blob([compresse]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(flux).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    return Promise.reject(new Error('Compression ZIP non prise en charge (' + e.methode + ').'));
  }

  /* Ref colonne Excel (« AB » -> index) pour replacer une cellule dont la
     reference est explicite dans un range parsed creux. */
  function indexColonne(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return Math.max(0, n - 1);
  }

  /* Analyse une feuille : renvoie un tableau de lignes, chaque cellule etant
     une chaine (les nombres restent en texte ; c'est l'appelant qui decide
     de la conversion selon l'en-tete de colonne). */
  function lirePartiesXLSX(parties) {
    var decode = new TextDecoder('utf-8');
    function documentDe(cle) {
      if (!parties[cle]) return null;
      return new DOMParser().parseFromString(decode.decode(parties[cle]), 'application/xml');
    }
    var partages = [];
    var ss = documentDe('xl/sharedStrings.xml');
    if (ss) {
      var sis = ss.getElementsByTagName('si');
      for (var i = 0; i < sis.length; i++) {
        var ts = sis[i].getElementsByTagName('t');
        var s = '';
        for (var j = 0; j < ts.length; j++) s += ts[j].textContent;
        partages.push(s);
      }
    }
    var cleFeuille = 'xl/worksheets/sheet1.xml';
    if (!parties[cleFeuille]) {
      var cles = Object.keys(parties).filter(function (k) {
        return /^xl\/worksheets\/sheet\d+\.xml$/.test(k);
      }).sort();
      cleFeuille = cles[0];
    }
    var feuille = documentDe(cleFeuille);
    if (!feuille) return [];

    var lignes = [];
    var rows = feuille.getElementsByTagName('row');
    for (var r = 0; r < rows.length; r++) {
      var cellules = rows[r].getElementsByTagName('c');
      var ligne = [];
      for (var c = 0; c < cellules.length; c++) {
        var cel = cellules[c];
        var ref = cel.getAttribute('r') || '';
        var col = ref ? indexColonne(ref) : ligne.length;
        var type = cel.getAttribute('t');
        var valeur = '';
        if (type === 'inlineStr') {
          var ts2 = cel.getElementsByTagName('t');
          for (var k = 0; k < ts2.length; k++) valeur += ts2[k].textContent;
        } else {
          var vv = cel.getElementsByTagName('v');
          var brut = vv.length ? vv[0].textContent : '';
          valeur = (type === 's' && partages[Number(brut)] !== undefined)
            ? partages[Number(brut)] : brut;
        }
        ligne[col] = valeur;
      }
      for (var z = 0; z < ligne.length; z++) if (ligne[z] === undefined) ligne[z] = '';
      if (ligne.length) lignes.push(ligne);
    }
    return lignes;
  }

  /* Point d'entree cote page : lit un fichier .xlsx selectionne puis
     renvoie les lignes de la premiere feuille (promesse). */
  function lireXLSX(fichier) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onload = function () {
        var octets = new Uint8Array(fr.result);
        lireZIP(octets).then(function (parties) {
          try { ok(lirePartiesXLSX(parties)); }
          catch (e) { ko(e); }
        }, ko);
      };
      fr.onerror = function () { ko(new Error('Lecture du fichier impossible.')); };
      fr.readAsArrayBuffer(fichier);
    });
  }

  /* ------------------------------- .pdf -------------------------------- */
  /* Un PDF minimal mais conforme : catalogue, arbre de pages, police      */
  /* Helvetica standard (aucune police a embarquer) et flux de contenu.    */
  /* Le texte est code en WinAnsi, ce qui couvre les accents francais.      */

  var WINANSI = {
    0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134,
    0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140,
    0x017D: 142, 0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149,
    0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155,
    0x0153: 156, 0x017E: 158, 0x0178: 159
  };

  function versWinAnsi(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 0x0A) { out += '\\n'; continue; }
      if (c === 0x09) { out += '    '; continue; }
      if (c < 256) out += String.fromCharCode(c);
      else if (WINANSI[c]) out += String.fromCharCode(WINANSI[c]);
      else out += '?';
    }
    return out;
  }

  function echapperPdf(s) {
    return versWinAnsi(String(s === null || s === undefined ? '' : s))
      .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  /* Largeurs Helvetica (unites de 1/1000 em) pour l'ascii et les accents
     courants : sans elles, impossible de centrer un titre ou d'aligner une
     colonne de nombres a droite. */
  var LARGEUR = (function () {
    var ascii = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 ' +
      '556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 ' +
      '667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 ' +
      '722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 ' +
      '500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 ' +
      '278 556 500 722 500 500 500 334 260 334 584';
    var w = ascii.trim().split(/\s+/).map(Number);
    var t = new Uint16Array(256).fill(556);
    for (var i = 0; i < w.length; i++) t[32 + i] = w[i];
    return t;
  })();

  function largeurTexte(s, taille) {
    var total = 0;
    var w = versWinAnsi(s);
    for (var i = 0; i < w.length; i++) total += LARGEUR[w.charCodeAt(i)] || 556;
    return total * taille / 1000;
  }

/* A4 en points : 595 x 842. */
  var PAGE_L = 595, PAGE_H = 842, MARGE = 45, PIED = 28;

  /* Une page = une liste d'ordres de dessin PDF. La largeur des colonnes
     est calculee une fois, puis chaque ligne est une suite de Tj. */
  function pagePdf(opts, debut, totalPages, numero) {
    var cmds = [];
    var y = PAGE_H - MARGE;

    if (numero === 1) {
      y -= 10;
      var lw = largeurTexte(opts.titre || 'Rapport', 16);
      cmds.push('BT /F2 16 Tf 0 0 0 rg ' + Math.max(MARGE, (PAGE_L - lw) / 2).toFixed(1) + ' ' + y + ' Td (' + echapperPdf(opts.titre) + ') Tj ET');
      y -= 20;
      if (opts.sousTitre) {
        var ls = largeurTexte(opts.sousTitre, 10);
        cmds.push('BT /F1 10 Tf 0 0 0 rg ' + Math.max(MARGE, (PAGE_L - ls) / 2).toFixed(1) + ' ' + y + ' Td (' + echapperPdf(opts.sousTitre) + ') Tj ET');
        y -= 14;
      }
      if (opts.meta) {
        var lm = largeurTexte(opts.meta, 9);
        cmds.push('BT /F1 9 Tf 0.3 0.3 0.3 rg ' + Math.max(MARGE, (PAGE_L - lm) / 2).toFixed(1) + ' ' + y + ' Td (' + echapperPdf(opts.meta) + ') Tj ET');
        y -= 12;
      }
      y -= 10;
    } else {
      y -= 10;
      cmds.push('BT /F2 12 Tf 0 0 0 rg ' + MARGE + ' ' + y + ' Td (' + echapperPdf((opts.titre || 'Rapport') + ' (suite)') + ') Tj ET');
      y -= 22;
    }

    var entetes = opts.entetes || [];
    var dispo = PAGE_L - 2 * MARGE;
    var largeurs;
    if (opts.poids && opts.poids.length === entetes.length) {
      var somme = opts.poids.reduce(function (a, b) { return a + b; }, 0) || 1;
      largeurs = opts.poids.map(function (w) { return dispo * w / somme; });
    } else {
      largeurs = entetes.map(function () { return dispo / Math.max(1, entetes.length); });
    }

    /* Bandeau d'en-tete. */
    y -= 18;
    cmds.push('0.85 0.85 0.85 rg ' + MARGE + ' ' + y.toFixed(1) + ' ' + dispo.toFixed(1) + ' 18 re f');
    var x = MARGE;
    entetes.forEach(function (h, c) {
      cmds.push('BT /F2 9 Tf 0 0 0 rg ' + (x + 4).toFixed(1) + ' ' + (y + 5).toFixed(1) + ' Td (' + echapperPdf(h) + ') Tj ET');
      x += largeurs[c];
    });
    y -= 10;

    var fin = debut + (opts.parPage || 40);
    for (var idx = debut; idx < Math.min(fin, opts.lignes.length); idx++) {
      var ligne = opts.lignes[idx];
      if (y < MARGE + 24) break;

      /* Le fond alterne doit etre peint AVANT le texte : dans un flux
         PDF l'ordre de dessin compte, l'inverse recouvrirait la ligne. */
      if (idx % 2 === 1) {
        cmds.push('0.96 0.96 0.96 rg ' + MARGE + ' ' + (y - 2).toFixed(1) + ' ' + dispo.toFixed(1) + ' 13 re f');
      }

      var xx = MARGE;
      for (var c2 = 0; c2 < entetes.length; c2++) {
        var brut = ligne[c2] === null || ligne[c2] === undefined ? '' : String(ligne[c2]);
        var td = 9;
        var dispoCol = largeurs[c2] - 8;
        /* Une cellule trop large est tronquee : la largeur reelle est
           mesuree avec les metriques Helvetica, pas devinee. */
        while (brut.length > 1 && largeurTexte(brut, td) > dispoCol) brut = brut.slice(0, -1);
        var aDroite = opts.alignements && opts.alignements[c2] === 'droite';
        var tx = aDroite ? (xx + largeurs[c2] - 4 - largeurTexte(brut, td)) : (xx + 4);
        cmds.push('BT /F1 ' + td + ' Tf 0 0 0 rg ' + tx.toFixed(1) + ' ' + y.toFixed(1) + ' Td (' + echapperPdf(brut) + ') Tj ET');
        xx += largeurs[c2];
      }
      y -= 13;
    }

    cmds.push('BT /F1 8 Tf 0.45 0.45 0.45 rg ' + MARGE + ' ' + PIED + ' Td (' +
      echapperPdf('Page ' + numero + ' / ' + totalPages) + ') Tj ET');
    return cmds.join('\n');
  }

  /* Un PDF se lit en WinAnsiEncoding : chaque caractere occupe UN octet.
       Encoder le fichier en UTF-8 casserait les accents, qui seraient
       relus comme deux caracteres sans signification. On ecrit donc le
       fichier en Latin-1 : un octet par caractere, ce qui rend aussi les
       adresses du xref egales a la longueur des chaines. */
  function latin1(s) {
    var o = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xFF;
    return o;
  }

  /* options : { titre, sousTitre, meta, entetes, lignes, poids, alignements }
     poids : largeur relative de chaque colonne. alignements : 'droite'. */
  function exporterPDF(options) {
    options = options || {};
    var lignes = options.lignes || [];
    var parPage = options.parPage || 40;
    var totalPages = Math.max(1, Math.ceil(lignes.length / parPage));

    var flux = [];
    for (var p = 0; p < totalPages; p++) {
      flux.push(pagePdf(options, p * parPage, totalPages, p + 1));
    }

    /* Objets PDF numerotes a la suite, sans trou : le xref peut alors
       reporter des adresses reelles pour chaque objet. */
    var objets = [];      /* objets[0] est libre : l'objet 0 est le pointeur */
    function ajouter(contenu) { objets.push(contenu); return objets.length; }

    ajouter(null);        /* 1 : reserve au catalogue */
    var idPages = ajouter(null);
    var idPolice = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var idPoliceGras = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    var refsPages = flux.map(function (contenu) {
      /* /Length compte les octets du flux : le contenu est deja en WinAnsi,
         donc un octet par caractere. */
      var idFlux = ajouter('<< /Length ' + contenu.length + ' >>\nstream\n' + contenu + '\nendstream');
      return ajouter('<< /Type /Page /Parent ' + idPages + ' 0 R /MediaBox [0 0 ' + PAGE_L + ' ' + PAGE_H + '] ' +
        '/Resources << /Font << /F1 ' + idPolice + ' 0 R /F2 ' + idPoliceGras + ' 0 R >> >> /Contents ' + idFlux + ' 0 R >>');
    });

    objets[1] = '<< /Type /Catalog /Pages ' + idPages + ' 0 R >>';
    objets[idPages] = '<< /Type /Pages /Kids [' + refsPages.join(' ') + '] /Count ' + refsPages.length + ' >>';

    /* Les decalages du xref sont des adresses EN OCTETS. Le fichier est ecrit
       en Latin-1 (un octet par caractere, voir latin1), une longueur de
       chaine EST donc une adresse : le reste du calcul se fait en
       longueur de chaine, sans conversion. */
    var morceaux = [];
    var taille = 0;
    var positions = new Array(objets.length).fill(0);

    function ajouterOctets(s) {
      var o = latin1(s);
      morceaux.push(o);
      taille += o.length;
    }
    ajouterOctets('%PDF-1.4\n');
    /* Marqueur binaire : octets hauts bruts, comme attendu par la spec. */
    morceaux.push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    taille += 6;

    for (var o2 = 1; o2 < objets.length; o2++) {
      positions[o2] = taille;
      ajouterOctets(o2 + ' 0 obj\n' + objets[o2] + '\nendobj\n');
    }
    var debutXref = taille;
    var nb = objets.length;   /* objets[0] + chaque objet reel */

    var xref = 'xref\n0 ' + nb + '\n0000000000 65535 f \n';
    for (var q = 1; q < nb; q++) {
      xref += String(positions[q]).padStart(10, '0') + ' 00000 n \n';
    }

    var fin = latin1(xref +
      'trailer\n<< /Size ' + nb + ' /Root 1 0 R >>\nstartxref\n' + debutXref + '\n%%EOF');

    var archive = new Uint8Array(taille + fin.length);
    var pos = 0;
    morceaux.forEach(function (m) { archive.set(m, pos); pos += m.length; });
    archive.set(fin, pos);

    telecharger(new Blob([archive], { type: 'application/pdf' }),
      (options.nom || 'rapport') + '-' + horodatage() + '.pdf');
    return true;
  }


  /* ----------------------------- Impression --------------------------- */
  /* Une feuille d'impression dediee : le CSS @media print masque l'appli et
     n'affiche que cette feuille, ce qui evite d'imprimer la barre laterale
     et les boutons. */
  function imprimer(html, options) {
    options = options || {};
    var ancien = document.getElementById('eduneum-print');
    if (ancien) ancien.remove();

    var feuille = document.createElement('div');
    feuille.id = 'eduneum-print';
    feuille.innerHTML = (options.titre ? '<h1>' + xml(options.titre) + '</h1>' : '') +
      (options.sousTitre ? '<h2>' + xml(options.sousTitre) + '</h2>' : '') + html;

    var style = document.createElement('style');
    style.id = 'eduneum-print-style';
    style.textContent =
      '#eduneum-print{display:none}' +
      '@media print{' +
      '  body > *{display:none !important}' +
      '  #eduneum-print{display:block !important;color:#000;background:#fff;font-family:Helvetica,Arial,sans-serif;padding:0;margin:0}' +
      '  #eduneum-print h1{font-size:18px;margin:0 0 4px}' +
      '  #eduneum-print h2{font-size:12px;margin:0 0 10px;color:#444;font-weight:normal}' +
      '  #eduneum-print table{width:100%;border-collapse:collapse;font-size:11px}' +
      '  #eduneum-print th,#eduneum-print td{border:1px solid #999;padding:4px 6px;text-align:left}' +
      '  #eduneum-print thead{display:table-header-group}' +
      '  #eduneum-print tr{page-break-inside:avoid}' +
      '  @page{margin:12mm}' +
      '}';

    document.head.appendChild(style);
    document.body.appendChild(feuille);

    function nettoyer() {
      feuille.remove();
      style.remove();
    }
    if (typeof global.onafterprint !== 'undefined') global.onafterprint = nettoyer;
    global.print();
    setTimeout(nettoyer, 1500);
    return true;
  }

  /* ------------------- Responsive : conteneurs de tableaux ------------- */
  /* Les tableaux HTML bruts (hors UI.tableau) deborderaient la page sur
     mobile. On les enveloppe automatiquement dans .table-scroll, y compris
     ceux ajoutes dynamiquement par les modules (MutationObserver). */
  function emballerTableaux(racine) {
    var scope = racine || document;
    var tables = Array.prototype.slice.call(scope.querySelectorAll('table'));
    tables.forEach(function (t) {
      var p = t.parentNode;
      if (!p || p.nodeType !== 1) return;
      /* Deja dans un conteneur defilant ? on n'en rajoute pas. */
      if (p.classList && (p.classList.contains('table-scroll') || p.classList.contains('overflow-x-auto'))) return;
      var conteneur = el('div', { class: 'table-scroll' });
      p.insertBefore(conteneur, t);
      conteneur.appendChild(t);
    });
  }

  var minuteurTables = null;
  function planifierTableaux() {
    if (minuteurTables) return;
    minuteurTables = setTimeout(function () { minuteurTables = null; emballerTableaux(); }, 50);
  }

  function surveillerTableaux() {
    if (!global.MutationObserver || !document.body) return;
    new MutationObserver(planifierTableaux).observe(document.body, { childList: true, subtree: true });
  }

  /* ------------------------------ Format -------------------------------- */
  function nombre(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(d === undefined ? 2 : d).replace('.', ',');
  }
  function dateFr(iso) {
    if (!iso) return '—';
    var d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  global.EduNeum = global.EduNeum || {};
  global.EduNeum.ui = {
    el: el, icon: icon, toast: toast, modal: modal, fermerModale: fermerModale, confirmer: confirmer,
    etatVide: etatVide, chargement: chargement, erreur: erreur,
    champ: champ, validerChamps: validerChamps,
    tableau: tableau, exporterCSV: exporterCSV,
    exporterXLSX: exporterXLSX, lireXLSX: lireXLSX, exporterPDF: exporterPDF, imprimer: imprimer,
    telecharger: telecharger, emballerTableaux: emballerTableaux,
    nombre: nombre, dateFr: dateFr
  };

  /* Responsive : on emballe les tableaux deja presents, puis on surveille
     le DOM pour ceux construits ensuite par les modules. */
  function demarrerResponsive() {
    emballerTableaux();
    surveillerTableaux();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrerResponsive);
  else demarrerResponsive();
})(window);
