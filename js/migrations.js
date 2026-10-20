/* EduNeum - Migrations : transfert d'un eleve vers une autre classe.
   Regle : la migration est historisee et la confirmation est obligatoire. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, P = E.page, UI = E.ui;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire active.')); return; }

  var fRecherche = null, fEleve = null, fCible = null;

  function refresh() {
    var migrations = S.migrationsDe(an.id).slice().reverse();
    var classes = S.classesDe(an.id);

    var table = UI.tableau({
      lignes: migrations.map(function (m) {
        var e = S.eleveParId(m.eleveId);
        return {
          eleve: e ? e.nom + ' ' + e.prenom : '—',
          de: S.classeParId(m.deClasseId) ? S.classeParId(m.deClasseId).nom : '—',
          vers: S.classeParId(m.versClasseId) ? S.classeParId(m.versClasseId).nom : '—',
          auteur: m.auteurId ? (S.enseignantParId(m.auteurId) || {}).nom || '—' : '—',
          date: m.date
        };
      }),
      colonnes: [
        { cle: 'date', titre: 'Date', rendu: function (l) { return UI.dateFr(l.date); } },
        { cle: 'eleve', titre: 'Élève' },
        { cle: 'de', titre: 'Depuis', triable: false },
        { cle: 'vers', titre: 'Vers', triable: false },
        { cle: 'auteur', titre: 'Par' }
      ],
      nomExport: 'migrations-' + an.libelle,
      messageVide: 'Aucune migration enregistrée.'
    });

    P.rendre([
      P.grilleKPI([
        P.carte({ label: 'Migrations', valeur: String(migrations.length), icone: 'shuffle' }),
        P.carte({ label: 'Classes', valeur: String(classes.length), icone: 'school', couleur: 'text-blue-500' }),
        P.carte({ label: 'Ce mois', valeur: String(migrations.filter(function (m) { return (m.date || '').slice(0, 7) === new Date().toISOString().slice(0, 7); }).length), icone: 'calendar', couleur: 'text-green-500' })
      ]),
      P.section({
        titre: 'Transférer un élève', icone: 'arrow-left-right',
        contenu: P.peutEcrire() && classes.length > 1
          ? '<div class="nm-flat p-6 rounded-[32px] grid grid-cols-1 md:grid-cols-4 gap-4 items-end" id="form-migration"></div>'
          : UI.etatVide(P.peutEcrire() ? 'Il faut au moins deux classes pour transférer un élève.' : 'Seul un administrateur peut effectuer une migration.')
      }),
      P.avecTableau(
        P.section({ titre: 'Historique des migrations', icone: 'history', contenu: '<div class="nm-flat p-6 rounded-[32px]"></div>' }),
        table)
    ]);

    if (P.peutEcrire() && classes.length > 1) {
      fRecherche = UI.champ({
        label: 'Rechercher un élève', type: 'text',
        placeholder: 'Nom, prénom ou matricule…'
      });
      fEleve = UI.champ({
        label: 'Élève', type: 'select', requis: true,
        options: optionsEleves('')
      });
      fCible = UI.champ({
        label: 'Classe de destination', type: 'select', requis: true,
        options: [{ valeur: '', libelle: 'Sélectionner un élève…' }]
      });

      fRecherche.input.addEventListener('input', function () {
        var recherche = fRecherche.valeur();
        remplirOptions(fEleve.input, optionsEleves(recherche), '');
        majClasseDestination('');
      });
      fEleve.input.addEventListener('change', function () {
        majClasseDestination(fEleve.valeur());
      });

      var form = document.getElementById('form-migration');
      form.appendChild(fRecherche.element);
      form.appendChild(fEleve.element);
      form.appendChild(fCible.element);
      var btn = UI.el('button', { class: 'py-3 px-6 bg-accent text-white font-bold rounded-2xl text-sm', type: 'button', text: 'Transférer' });
      btn.addEventListener('click', transferer);
      form.appendChild(btn);
    }
  }

  /* Eleves inscrits cette annee, libelle « Prenom Nom · matricule »,
     filtres par la recherche (insensible a la casse). */
  function optionsEleves(recherche) {
    var q = (recherche || '').toLowerCase().trim();
    var inscrits = S.all('inscriptions').filter(function (i) { return i.anneeId === an.id && !i.archive; });
    return [{ valeur: '', libelle: 'Sélectionner…' }].concat(inscrits.map(function (i) {
      var e = S.eleveParId(i.eleveId);
      if (!e) return null;
      var libelle = e.nom + ' ' + e.prenom + ' · ' + e.matricule;
      if (q && libelle.toLowerCase().indexOf(q) === -1) return null;
      return { valeur: i.eleveId, libelle: libelle };
    }).filter(Boolean));
  }

  function remplirOptions(select, options, valeurCourante) {
    select.innerHTML = '';
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.valeur;
      opt.textContent = o.libelle;
      if (String(valeurCourante) !== '' && String(o.valeur) === String(valeurCourante)) opt.selected = true;
      select.appendChild(opt);
    });
  }

  /* La classe de destination n'affiche pas la classe actuelle de l'eleve :
     y transférer serait de toute facon refuse. */
  function majClasseDestination(eleveId) {
    var depart = eleveId ? S.classeDeEleve(eleveId, an.id) : null;
    var classes = S.classesDe(an.id).filter(function (c) { return !depart || c.id !== depart.id; });
    remplirOptions(fCible.input,
      [{ valeur: '', libelle: depart ? 'Sélectionner…' : 'Choisissez d\'abord un élève…' }]
        .concat(classes.map(function (c) { return { valeur: c.id, libelle: c.nom }; })),
      '');
  }

  function transferer() {
    if (!UI.validerChamps([fEleve, fCible])) return false;
    var eleveId = fEleve.valeur(), vers = fCible.valeur();
    var depart = S.classeDeEleve(eleveId, an.id);
    if (!depart) { UI.toast('Cet élève n\'est inscrit dans aucune classe.', 'error'); return; }
    if (depart.id === vers) { UI.toast('L\'élève est déjà dans cette classe.', 'error'); return; }

    var e = S.eleveParId(eleveId);
    var cible = S.classeParId(vers);
    UI.confirmer({
      titre: 'Confirmer le transfert',
      message: 'Transférer <b>' + P.esc(e.nom + ' ' + e.prenom) + '</b> de <b>' + P.esc(depart.nom) +
        '</b> vers <b>' + P.esc(cible.nom) + '</b> ?<br><br>Les notes déjà saisies dans la classe d\'origine restent rattachées à celle-ci.'
    }).then(function (ok) {
      if (!ok) return;
      /* L'eleve et la classe de destination suffisent : le store
         retrouve lui-meme la classe d'origine, controle l'effectif et
         trace l'operation. */
      var r = S.transfererEleve(eleveId, vers);
      if (!r.ok) { UI.toast(r.motif, 'error'); return false; }
      UI.toast('Transfert enregistré : ' + r.de + ' → ' + r.vers, 'success');
      refresh();
    });
  }

  refresh();
})();
