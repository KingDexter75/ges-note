/* EduNeum - Bulletins : generation, apercu, impression.

   Regle metier structurante du module : l'impression est fermee tant que
   l'administrateur n'a pas valide la periode pour la classe. Le store porte
   la regle (bulletinsValides), l'interface se contente de ne pas proposer
   l'action.

   Choix : le telechargement PDF est assure hors ligne par des bibliotheques
   embarquees dans le projet (js/core/html2canvas.min.js et
   js/core/jspdf.umd.min.js) : chaque bulletin est rendu en A4 strict, capture
   puis pose dans un fichier .pdf (une page par eleve). L'impression papier
   passe toujours par la boite d'impression du navigateur. */
(function () {
  'use strict';

  var E = window.EduNeum;
  var S = E.store, C = E.calculs, P = E.page, UI = E.ui;

  /* Garde de route explicite : le store protegerait l'ecriture, mais une
     page de consultation ne doit pas s'afficher pour un role qui n'y a pas
     acces. exiger() refuse ET redirige vers le tableau de bord du role. */
  if (!E.acces.exiger('admin_bulletins')) return;
  if (!E.auth.estConnecte()) return;

  var an = E.layout.anneeChoisie();
  if (!an) { P.rendre(UI.etatVide('Aucune année scolaire disponible.')); return; }

  var classes = S.classesDe(an.id).filter(function (c) { return !c.archive; });
  var trimestres = an.trimestres || [];

  /* Professeur principal : il n'imprime que les bulletins de SA (ou ses)
     classe(s) — le menu n'expose la page qu'aux PP (profPrincipalOnly). */
  if (E.acces.estEnseignant()) {
    classes = classes.filter(function (c) { return E.acces.estPPDe(c.id); });
    if (!classes.length) {
      P.rendre(UI.etatVide(
        'Vous n\'êtes professeur principal d\'aucune classe pour ' + an.libelle + ' : ' +
        'l\'impression des bulletins est réservée aux professeurs principaux.'));
      return;
    }
  }

  /* Seule l'administration valide la periode (ouverture de l'impression) :
     le PP ne voit que l'etat, jamais le bouton de validation. */
  var peutValider = P.peutEcrire('admin_bulletins');

  /* L'etat courant est porte par le selecteur, pas par l'URL : la page
     reste ainsi utilisable apres un changement d'annee par l'en-tete.

     Le selecteur doit distinguer trois portees (annee, trimestre, sequence).
     Comme un <select> ne renvoie qu'une chaine, la portee est encodee dans
     la valeur : 'annuel', 't:<idTrimestre>' ou 's:<idSequence>'. Le prefixe
     est retire avant d'appeler le store, donc les cles de validation et les
     appreciations enregistrees avec les anciennes valeurs restent
     valides et rien n'est migre. */
  var etat = { classeId: classes.length ? classes[0].id : null, periode: 'annuel', apercuId: null };

  function porteeDe(v) {
    if (v === 'annuel') return 'annuel';
    return v.charAt(0) === 's' ? 'sequence' : 'trimestre';
  }
  /* Identifiant nu, celui utilise comme cle de stockage dans le store. */
  function idPeriode(v) { return v === 'annuel' ? v : v.slice(2); }

  /* Periodes proposables : l'annuel n'a de sens qu'une fois les trois
     trimestres saisis, mais il reste selectionnable pour visualiser.
     Les bulletins de sequence sont proposes pour chaque sequence : une
     sequence validee reste consultable, elle est seulement figee. */
  function periodes() {
    var liste = [{ valeur: 'annuel', libelle: 'Année complète ' + an.libelle }];
    trimestres.forEach(function (t) {
      liste.push({ valeur: 't:' + t.id, libelle: t.libelle });
      S.sequencesDeTrimestre(t.id).forEach(function (s) {
        liste.push({
          valeur: 's:' + s.id,
          libelle: t.libelle + ' · ' + s.libelle + (s.validee ? ' (validée)' : '')
        });
      });
    });
    return liste;
  }
  function libellePeriode(v) {
    if (v === 'annuel') return 'Année ' + an.libelle;
    var id = idPeriode(v);
    var t = trimestres.filter(function (x) { return x.id === id; })[0];
    if (t) return t.libelle;
    var s = S.sequenceParId(id);
    if (s) {
      var tri = trimestres.filter(function (x) { return x.id === s.trimestreId; })[0];
      return (tri ? tri.libelle + ' · ' : '') + s.libelle;
    }
    return v;
  }
  function matriculeDeClasse() {
    return an.libelle.replace(/[^0-9A-Za-z]+/g, '-');
  }

  /* Nom de fichier / reference du document : bulletin-{annee}-{nom lycee}.
     Le nom de l'etablissement vient des parametres (et non du code). */
  function slugTexte(s) {
    return String(s || '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  }
  function nomEtablissement() {
    var etab = S.parametres().etablissement || {};
    return etab.nom || 'Établissement';
  }
  function referenceBulletin() {
    return 'bulletin-' + matriculeDeClasse() + '-' + slugTexte(nomEtablissement());
  }

  /* Photo de l'eleve (data URL) ou, a defaut, ses initiales. */
  function photoEleve(e) {
    if (e && e.photo) {
      return '<div class="bul-photo"><img src="' + P.esc(e.photo) + '" alt="Photo de l\'élève"></div>';
    }
    var ini = ((e && e.nom ? e.nom : ' ') + ' ' + (e && e.prenom ? e.prenom : '')).trim();
    var lettres = (ini.charAt(0) + (e && e.prenom ? e.prenom.trim().charAt(0) : '')).toUpperCase();
    return '<div class="bul-photo bul-photo-vide"><span>' + P.esc(lettres) + '</span></div>';
  }

  /* Charge utile du code QR : nom complet, classe, moyenne, professeur
     principal, annee scolaire et etablissement. En JSON compact, lisible et
     exploitable par n'importe quel lecteur de code-barres. */
  function contenuQR(b) {
    var e = b.eleve;
    var bareme = baremeDe(b);
    var moyenne = b.moyenneGenerale === null || b.moyenneGenerale === undefined
      ? '' : C.arrondir(b.moyenneGenerale, 2) + ' / ' + bareme;
    return JSON.stringify({
      type: 'bulletin-scolaire',
      eleve: (e.nom + ' ' + e.prenom).trim(),
      classe: b.classe.nom,
      moyenne: moyenne,
      profPrincipal: b.pp || '',
      anneeScolaire: an.libelle,
      etablissement: nomEtablissement()
    });
  }
  function imageQR(b) {
    try {
      if (typeof qrcode !== 'function') return '';
      if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      }
      var qr = qrcode(0, 'M');
      qr.addData(contenuQR(b), 'Byte');
      qr.make();
      return qr.createSvgTag({
        cellSize: 3, margin: 2, scalable: true,
        alt: 'Code QR du bulletin de ' + b.eleve.nom + ' ' + b.eleve.prenom
      });
    } catch (err) { return ''; }
  }

  /* Bareme de reference : la note maximale de la matiere. Si les matieres
     de la classe n'ont pas toutes le meme bareme, on affiche "/20" plutot
     qu'un "/20" trompeur. */
  function baremeDe(b) {
    if (!b.lignes.length) return 20;
    var max = b.lignes[0].matiere.noteMax;
    var homogene = b.lignes.every(function (l) { return l.matiere.noteMax === max; });
    return homogene ? max : '20';
  }

  /* ---------------------- Categories de matieres ---------------------- */
  /* Le store ne porte pas de categorie : elle est deduite du code de la
     matiere, puis de son nom en repli. Quatre groupes, comme sur le bulletin
     officiel camerounais. */
  var CATEGORIES = [
    { cle: 'langues', nom: 'LANGUES', nomEn: 'LANGUAGES', codes: ['FRAN', 'ANG', 'LIT', 'ALLEMAND', 'ESPAGNOL', 'LATIN'] },
    { cle: 'sciences_exactes', nom: 'SCIENCES EXACTES', nomEn: 'EXACT SCIENCES', codes: ['MATH', 'F.MATH', 'FMATH', 'PHCH', 'SVT', 'BIO', 'CHEM', 'PHYS', 'COMP', 'INFO', 'TIC'] },
    { cle: 'sciences_humaines', nom: 'SCIENCES HUMAINES', nomEn: 'HUMANITIES', codes: ['HIG', 'HIST', 'GEOG', 'ECO', 'PHIL', 'ECM', 'REL', 'EDHC'] },
    { cle: 'autres', nom: 'AUTRES ACTIVITÉS', nomEn: 'OTHER ACTIVITIES', codes: ['EPS', 'SPORT', 'ART', 'MUS', 'DESSIN'] }
  ];

  var CAT_NOM_EN = {};
  CATEGORIES.forEach(function (c) { CAT_NOM_EN[c.nom] = c.nomEn; });

  function codeNormalise(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function categorieDe(m) {
    var code = codeNormalise(m.code);
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].codes.some(function (c) { return codeNormalise(c) === code; })) return CATEGORIES[i];
    }
    var nom = String(m.nom || '').toLowerCase();
    if (/math|physi|chim|science|bio|informat|comput/.test(nom)) return CATEGORIES[1];
    if (/fran|angl|lettre|litt|langue|espagn|allemand/.test(nom)) return CATEGORIES[0];
    if (/hist|g[eé]o|philo|morale|civique|econo|relig/.test(nom)) return CATEGORIES[2];
    return CATEGORIES[3];
  }

  /* Sequences couvertes par la periode affichee (pour les colonnes SEQ1/SEQ2). */
  function porteeCourante() { return porteeDe(etat.periode); }

  /* Toutes les sequences de l'annee, trimestres croissants puis sequences
     croissantes : sert au bulletin annuel (colonnes SEQ1 a SEQn) et a la
     numerotation globale des sequences (SEQ1..SEQ6 sur l'annee). */
  function toutesSequencesAnnee() {
    var out = [];
    trimestres.slice().sort(function (a, b) { return a.numero - b.numero; }).forEach(function (t) {
      S.sequencesDeTrimestre(t.id).forEach(function (s) { out.push(s); });
    });
    return out;
  }

  /* Numero global d'une sequence sur l'annee (1..n), conserve dans un cache
     le temps d'un affichage : les sequences d'un trimestre repartent de 1,
     l'utilisateur raisonne en revanche sur une numerotation continue. */
  var cacheNumerosSeq = null;
  function numerosGlobaux() {
    if (cacheNumerosSeq) return cacheNumerosSeq;
    cacheNumerosSeq = {};
    toutesSequencesAnnee().forEach(function (s, i) { cacheNumerosSeq[s.id] = i + 1; });
    return cacheNumerosSeq;
  }
  function numeroGlobalSequence(s) {
    var g = numerosGlobaux();
    return s ? (g[s.id] || s.numero) : null;
  }

  function sequencesDePeriode() {
    var portee = porteeCourante();
    if (portee === 'sequence') {
      var s = S.sequenceParId(idPeriode(etat.periode));
      return s ? [s] : [];
    }
    if (portee === 'trimestre') return S.sequencesDeTrimestre(idPeriode(etat.periode));
    /* Annuel : toutes les sequences de l'annee remplissent les colonnes SEQ
       (sinon elles restaient vides alors que des notes existaient). */
    return toutesSequencesAnnee();
  }

  /* Numero du trimestre affiche (pour le badge « Xe TRIMESTRE »), ou null. */
  function numeroTrimestreCourant() {
    var portee = porteeCourante();
    var id = idPeriode(etat.periode);
    if (portee === 'trimestre') {
      var t = trimestres.filter(function (x) { return x.id === id; })[0];
      return t ? t.numero : null;
    }
    if (portee === 'sequence') {
      var sq = S.sequenceParId(id);
      if (!sq) return null;
      var tr = trimestres.filter(function (x) { return x.id === sq.trimestreId; })[0];
      return tr ? tr.numero : null;
    }
    return null;
  }

  /* Moyennes cumulees de l'eleve par periode, pour la carte « Moyennes par
     periode » placee a cote du resultat annuel. La logique suit l'avancement
     dans l'annee :
       - bulletin du 1er trimestre : Moyenne Seq1, Moyenne Seq2 ;
       - 2e trimestre : Moyenne Trim1, Moyenne Seq3, Moyenne Seq4 ;
       - 3e trimestre : Moyenne Trim1, Moyenne Trim2, Moyenne Seq5, Moyenne Seq6 ;
       - bulletin annuel : Moyenne Trim1, Moyenne Trim2, Moyenne Trim3.
     La moyenne de chaque periode est la moyenne generale (total des points /
     total des coefficients) sur cette seule periode. */
  function moyennesParPeriode(b, estAnglophone) {
    var eleveId = b.eleve.id;
    var items = [];
    var libTrim = function (t) { return (estAnglophone ? 'Average Term ' : 'Moyenne Trim') + t.numero; };
    var libSeq = function (s) { return (estAnglophone ? 'Average Seq ' : 'Moyenne Seq') + numeroGlobalSequence(s); };
    var moyenneTrimestre = function (t) {
      return C.moyenneGenerale({ eleveId: eleveId, classeId: etat.classeId, anneeId: an.id, trimestreId: t.id }).valeur;
    };
    var moyenneSequence = function (s) {
      return C.moyenneGenerale({ eleveId: eleveId, classeId: etat.classeId, anneeId: an.id, sequenceId: s.id }).valeur;
    };
    var croissants = trimestres.slice().sort(function (a, b) { return a.numero - b.numero; });
    var portee = porteeCourante();
    if (portee === 'annuel') {
      croissants.forEach(function (t) { items.push({ label: libTrim(t), valeur: moyenneTrimestre(t) }); });
      return items;
    }
    var trimCourant = null, seqCourante = null;
    if (portee === 'trimestre') {
      trimCourant = croissants.filter(function (x) { return x.id === idPeriode(etat.periode); })[0] || null;
    } else {
      seqCourante = S.sequenceParId(idPeriode(etat.periode));
      trimCourant = seqCourante ? croissants.filter(function (x) { return x.id === seqCourante.trimestreId; })[0] || null : null;
    }
    if (!trimCourant) return items;
    croissants.forEach(function (t) {
      if (t.numero >= trimCourant.numero) return;
      items.push({ label: libTrim(t), valeur: moyenneTrimestre(t) });
    });
    var borne = seqCourante ? numeroGlobalSequence(seqCourante) : null;
    S.sequencesDeTrimestre(trimCourant.id).forEach(function (s) {
      if (borne !== null && numeroGlobalSequence(s) > borne) return;
      items.push({ label: libSeq(s), valeur: moyenneSequence(s) });
    });
    return items;
  }


  var cacheGeneral = {};
  function classementGeneral() {
    var cle = etat.classeId + '|' + etat.periode;
    if (cacheGeneral[cle]) return cacheGeneral[cle];
    var eleves = S.elevesDeClasse(etat.classeId, an.id);
    var matieres = S.matieresDeClasse(etat.classeId);
    /* Garantit que chaque matiere de la classe a deja ete classee (donc que
       la moyenne de chaque eleve est connue) sans rescanner les notes. */
    matieres.forEach(function (m) { classementMatiere(m.id, null); });
    var parEleve = {};
    eleves.forEach(function (e) {
      var numerateur = 0, denominateur = 0, nonNotees = [];
      matieres.forEach(function (m) {
        var coef = S.coefficient(etat.classeId, m.id);
        var moy = cacheClassement[m.id + '|' + etat.periode][e.id];
        /* Le coefficient est toujours compte au diviseur (matiere non notee
           = 0 point) : la moyenne est le total des points divise par le total
           des coefficients de la classe. */
        denominateur += coef;
        if (moy === null || moy === undefined) { nonNotees.push(m.id); return; }
        numerateur += moy * coef;
      });
      parEleve[e.id] = {
        valeur: denominateur ? C.arrondir(numerateur / denominateur) : null,
        matieresNonNotees: nonNotees,
        points: numerateur,
        coefficients: denominateur
      };
    });
    var classement = C.classer(eleves.map(function (e) { return e.id; }), function (id) {
      return parEleve[id].valeur;
    });
    cacheGeneral[cle] = { classement: classement, parEleve: parEleve };
    return cacheGeneral[cle];
  }

  /* Profil de la classe sur la periode : moyenne, reussite, max/min.
     Calcule une seule fois par (classe, periode) puis mis en cache, car il
     fait le tour de tous les eleves. */
  var cacheProfil = {};
  function profilClasse() {
    var cle = etat.classeId + '|' + etat.periode;
    if (cacheProfil[cle]) return cacheProfil[cle];
    var classement = classementGeneral().classement;
    var seuil = Number(S.parametres().moyennePassage) || 10;
    var notes = classement.lignes.filter(function (l) { return l.valeur !== null; });
    var reussite = notes.filter(function (l) { return l.valeur >= seuil; }).length;
    cacheProfil[cle] = {
      moyenne: classement.moyenne,
      meilleure: classement.meilleure,
      pire: classement.pire,
      effectif: classement.effectif,
      tauxReussite: notes.length ? Math.round((reussite / notes.length) * 100) : null
    };
    return cacheProfil[cle];
  }

  /* ---------------------- Donnees d'un bulletin ----------------------- */
  /* Un bulletin est calcule a la demande, jamais stocke : il n'existe que
     comme vue. Seul l'etat "valide" est stocke. */
  function bulletinDe(eleveId) {
    var classe = S.classeParId(etat.classeId);
    var portee = porteeDe(etat.periode);
    var annuel = portee === 'annuel';
    var idPeriodeCourante = idPeriode(etat.periode);
    var matieres = S.matieresDeClasse(etat.classeId);

    /* La moyenne par matiere passe par la fonction partagee
       moyenneMatierePortee() : le rang par matiere et la moyenne affichee
       doivent toujours porter sur la meme portee. */
    var sequences = sequencesDePeriode();
    var lignes = matieres.map(function (m) {
      var moy = moyenneMatierePortee(eleveId, m.id);
      /* Rang PAR MATIERRE : c'est le classement de la classe sur la moyenne
         de la matiere, pas celui de l'eleve sur sa moyenne generale. */
      var rangMatiere = classementMatiere(m.id, eleveId);
      /* Resultat de la matiere sur chacune des sequences de la periode
         (SEQ1, SEQ2...) : c'est ce qui remplit les colonnes du bulletin. */
      var seqVals = sequences.map(function (sq) {
        return C.moyenneMatiereSequence({ eleveId: eleveId, sequenceId: sq.id, matiereId: m.id });
      });
      return {
        matiere: m,
        categorie: categorieDe(m),
        coefficient: S.coefficient(etat.classeId, m.id),
        moyenne: moy,
        seq: seqVals,
        pondere: moy === null ? null : C.arrondir(moy * S.coefficient(etat.classeId, m.id)),
        /* Rang de la note de l'eleve dans cette matiere, parmi ses
           condisciples : classementMatiere renvoie { rang, classe }. */
        rang: rangMatiere.rang,
        moyenneClasse: rangMatiere.classe,
        enseignant: enseignantDe(m.id)
      };
    });

    /* Regroupement par categorie, avec la moyenne et le total des
       coefficients de chaque groupe (lignes « Moyenne - ... »). */
    var groupes = CATEGORIES.map(function (cat) {
      var l = lignes.filter(function (x) { return x.categorie.cle === cat.cle; });
      if (!l.length) return null;
      var totalCoef = l.reduce(function (s, x) { return s + (x.coefficient || 0); }, 0);
      var sommePonderee = 0;
      l.forEach(function (x) {
        if (x.moyenne !== null) sommePonderee += x.moyenne * x.coefficient;
      });
      return {
        cle: cat.cle, nom: cat.nom, lignes: l, totalCoef: totalCoef,
        totalPondere: C.arrondir(sommePonderee),
        /* Meme regle que la moyenne generale : le total des coefficients du
           groupe est toujours le diviseur (matiere non notee = 0 point). */
        moyenne: totalCoef ? C.arrondir(sommePonderee / totalCoef) : null
      };
    }).filter(Boolean);

    /* Classement general de la classe, calcule une seule fois pour la periode
       (cf. classementGeneral). La moyenne generale de l'eleve et ses matieres
       non notees viennent du meme calcul : moyenne et rang portent donc
       toujours sur la meme portee. */
    var general = classementGeneral();
    var classement = general.classement;
    var genEleve = general.parEleve[eleveId] || { valeur: null, matieresNonNotees: [], points: 0, coefficients: 0 };
    var maLigne = classement.lignes.filter(function (l) { return l.eleveId === eleveId; })[0] || {};
    var abs = S.absencesDe(an.id).filter(function (a) { return a.eleveId === eleveId; });
    var appreciation = S.appreciationDe(eleveId, an.id, idPeriodeCourante);
    var decision = S.decisionDe(eleveId, an.id);
    var ppId = S.ppDeClasse(etat.classeId);
    var pp = ppId ? S.enseignantParId(ppId) : null;

    return {
      eleve: S.eleveParId(eleveId),
      classe: classe,
      annuel: annuel,
      sequences: sequences,
      lignes: lignes,
      groupes: groupes,
      moyenneGenerale: genEleve.valeur,
      /* Total des points = somme(moyenne par matiere x coefficient), les
         matieres non notees comptant 0. La moyenne generale en est le
         quotient par le total des coefficients. */
      totalPoints: genEleve.points,
      totalCoefficients: genEleve.coefficients,
      matieresNonNotees: genEleve.matieresNonNotees,
      rang: maLigne.rang === undefined ? null : maLigne.rang,
      moyenneClasse: classement.moyenne,
      meilleure: classement.meilleure,
      pire: classement.pire,
      effectif: classement.effectif,
      absences: abs.length,
      heuresAbsence: abs.reduce(function (s, a) { return s + (Number(a.heures) || 0); }, 0),
      nonJustifiees: abs.filter(function (a) { return !a.justifiee; }).length,
      appreciation: appreciation ? appreciation.texte : '',
      conduite: appreciation && appreciation.conduite !== null ? appreciation.conduite : null,
      decision: decision ? decision.decision : '',
      pp: pp ? pp.prenom + ' ' + pp.nom : '',
      profil: profilClasse(),
      valide: S.bulletinsValides(etat.classeId, an.id, idPeriode(etat.periode))
    };
  }

  /* Moyenne de la classe sur UNE matiere, et rang de l'eleve dans cette
     matiere. Le classement se recalcule par matiere : c'est coherent avec
     ce que l'enseignant affiche dans "Consultation des notes". */
  /* Le meme calcul de moyenne que dans bulletinDe() est utilise ici pour tous
     les eleves de la classe : on le factorise plutot que de le dupliquer, sinon
     le rang par matiere pourrait porter sur une autre portee que la moyenne
     affichee juste au-dessus. */
  function moyenneMatierePortee(eleveId, matiereId) {
    var portee = porteeDe(etat.periode);
    var id = idPeriode(etat.periode);
    if (portee === 'sequence') {
      return C.moyenneMatiereSequence({ eleveId: eleveId, sequenceId: id, matiereId: matiereId });
    }
    if (portee === 'annuel') {
      return C.moyenneMatiereAnnuelle({ eleveId: eleveId, anneeId: an.id, matiereId: matiereId });
    }
    return C.moyenneMatiereTrimestre({ eleveId: eleveId, trimestreId: id, matiereId: matiereId });
  }

  var cacheClassement = {};
  function classementMatiere(matiereId, eleveId) {
    var cle = matiereId + '|' + etat.periode;
    if (!cacheClassement[cle]) {
      cacheClassement[cle] = {};
      S.elevesDeClasse(etat.classeId, an.id).forEach(function (e) {
        cacheClassement[cle][e.id] = moyenneMatierePortee(e.id, matiereId);
      });
      var classement = C.classer(
        S.elevesDeClasse(etat.classeId, an.id).map(function (e) { return e.id; }),
        function (id) { return cacheClassement[cle][id]; }
      );
      cacheClassement[cle].rang = {};
      cacheClassement[cle].moyenneClasse = classement.moyenne;
      classement.lignes.forEach(function (l) { cacheClassement[cle].rang[l.eleveId] = l.rang; });
    }
    return {
      rang: cacheClassement[cle].rang[eleveId] === undefined ? null : cacheClassement[cle].rang[eleveId],
      classe: cacheClassement[cle].moyenneClasse
    };
  }

  function enseignantDe(matiereId) {
    var a = S.affectationsDe(an.id).filter(function (x) {
      return x.classeId === etat.classeId && x.matiereId === matiereId && !x.archive;
    })[0];
    var p = a ? S.enseignantParId(a.enseignantId) : null;
    return p ? p.prenom + ' ' + p.nom : '—';
  }

  /* ------------------------------ Rendu ---------------------------------- */
  function refresh() {
    cacheClassement = {};
    cacheProfil = {};
    cacheGeneral = {};
    cacheNumerosSeq = null;
    etat.apercuId = null;

    var fClasse = UI.champ({
      label: 'Classe', type: 'select', valeur: etat.classeId,
      options: classes.length
        ? classes.map(function (c) { return { valeur: c.id, libelle: c.nom + ' (' + c.niveau + ')' }; })
        : [{ valeur: '', libelle: 'Aucune classe' }]
    });
    var fPeriode = UI.champ({
      label: 'Période', type: 'select', valeur: etat.periode,
      options: periodes()
    });

    P.rendre([
      P.section({
        titre: 'Génération des bulletins', icone: 'award',
        contenu: '<div class="nm-flat p-6 rounded-[32px]">' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="form-filtres"></div>' +
          '<p class="text-xs text-gray-500 mt-4">L\'impression est bloquée tant que l\'administrateur n\'a pas validé la période pour cette classe.</p>' +
          '</div>'
      }),

      P.section({ titre: '', icone: '', contenu: '<div id="zone-liste"></div>' })
    ]);

    var f = document.getElementById('form-filtres');
    f.appendChild(fClasse.element);
    f.appendChild(fPeriode.element);
    fClasse.element.addEventListener('change', function () {
      etat.classeId = fClasse.valeur();
      refresh();
    });
    fPeriode.element.addEventListener('change', function () {
      etat.periode = fPeriode.valeur();
      refresh();
    });

    rendreListe();
  }

  function rendreListe() {
    var zone = document.getElementById('zone-liste');
    if (!zone) return;
    zone.innerHTML = '';

    /* UI.etatVide renvoie du HTML, pas un noeud : on assigne innerHTML. */
    if (!etat.classeId) { zone.innerHTML = UI.etatVide('Aucune classe pour ' + an.libelle + '.'); return; }

    var eleves = S.elevesDeClasse(etat.classeId, an.id);
    var valide = S.bulletinsValides(etat.classeId, an.id, idPeriode(etat.periode));
    var lignes = eleves.map(function (e) { return bulletinDe(e.id); });

    var sansMoyenne = lignes.filter(function (b) { return b.moyenneGenerale === null; }).length;
    var nonValides = lignes.filter(function (b) { return !b.valide; }).length;

    var table = UI.tableau({
      lignes: lignes,
      placeholderRecherche: 'Rechercher un élève…',
      parPage: 12,
      nomExport: 'bulletins-' + matriculeDeClasse() + '-' + libellePeriode(etat.periode),
      messageVide: 'Aucun élève inscrit dans cette classe.',
      colonnes: [
        {
          cle: 'eleve', titre: 'Élève',
          valeurTri: function (b) { return b.eleve.nom + ' ' + b.eleve.prenom; },
          rendu: function (b) {
            return '<div><p class="font-bold">' + P.esc(b.eleve.nom + ' ' + b.eleve.prenom) + '</p>' +
              '<p class="text-xs text-gray-400">' + P.esc(b.eleve.matricule) + '</p></div>';
          }
        },
        {
          cle: 'moyenne', titre: 'Moyenne générale',
          valeurTri: function (b) { return b.moyenneGenerale === null ? -1 : b.moyenneGenerale; },
          rendu: function (b) {
            if (b.moyenneGenerale === null) return '<span class="text-xs text-amber-500 font-bold">non calculée</span>';
            return '<span class="font-black text-accent">' + C.arrondir(b.moyenneGenerale, 2) +
              ' / ' + baremeDe(b) + '</span>';
          }
        },
        {
          cle: 'rang', titre: 'Rang', valeurTri: function (b) { return b.rang === null ? 9999 : b.rang; },
          rendu: function (b) {
            return b.rang === null ? '<span class="text-xs text-gray-400">—</span>'
              : '<span class="text-xs font-bold">' + b.rang + '<span class="text-gray-400"> / ' + b.effectif + '</span></span>';
          }
        },
        {
          cle: 'appreciation', titre: 'Appréciation', triable: false,
          valeurTri: function (b) { return b.appreciation || ''; },
          rendu: function (b) {
            return '<span class="text-xs">' + P.esc(b.appreciation || C.appreciationAuto(b.moyenneGenerale)) + '</span>';
          }
        },
        {
          cle: 'decision', titre: 'Décision', triable: false,
          valeurTri: function (b) { return b.decision || ''; },
          rendu: function (b) {
            if (!b.decision) return '<span class="text-xs text-gray-400">—</span>';
            var couleur = b.decision === 'admis' ? 'text-green-500' : b.decision === 'exclu' ? 'text-red-500' : 'text-amber-500';
            return '<span class="text-xs font-bold ' + couleur + '">' + P.esc(b.decision) + '</span>';
          }
        },
        {
          cle: 'etat', titre: 'Impression', triable: false,
          valeurTri: function (b) { return b.valide ? 1 : 0; },
          rendu: function (b) {
            return b.valide
              ? '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-green-500">validé</span>'
              : '<span class="text-[10px] font-bold nm-inset px-2 py-1 rounded-full text-amber-500">en attente</span>';
          }
        },
        {
          cle: 'actions', titre: '', triable: false, classe: 'text-right',
          rendu: function (b) { return actionsBulletin(b); }
        }
      ]
    });

    var entete = '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">' +
      '<div><h2 class="text-lg font-bold display-font">' + P.esc(libellePeriode(etat.periode)) + ' — ' +
      P.esc(S.classeParId(etat.classeId).nom) + '</h2>' +
      '<p class="text-xs text-gray-400">' + eleves.length + ' élève(s) · ' + sansMoyenne + ' sans moyenne · ' +
      nonValides + ' bulletin(s) non validé(s)</p></div>' +
      '<div class="flex items-center gap-2">' +
      (valide
        ? '<span class="text-[10px] font-bold nm-inset px-3 py-2 rounded-full text-green-500">impression ouverte</span>'
        : peutValider
          ? '<button type="button" id="btn-valider-bulletins" class="py-2.5 px-5 bg-accent text-white font-bold rounded-2xl text-xs flex items-center gap-2">' +
            P.ico('badge-check', 14) + 'Valider les bulletins</button>'
          : '<span class="text-[10px] font-bold nm-inset px-3 py-2 rounded-full text-amber-500" ' +
            'title="Seule l\'administration valide la période">en attente de validation</span>') +
      '<button type="button" id="btn-imprimer-classe" class="py-2.5 px-5 nm-soft-convex rounded-2xl text-xs font-bold flex items-center gap-2' +
      (valide ? '' : ' opacity-50') + '"' + (valide ? '' : ' disabled') + '>' +
      P.ico('printer', 14) + 'Imprimer la classe</button>' +
      '<button type="button" id="btn-pdf-classe" class="py-2.5 px-5 nm-soft-convex rounded-2xl text-xs font-bold flex items-center gap-2' +
      (valide ? ' text-rose-500' : ' opacity-50') + '"' + (valide ? '' : ' disabled') + '>' +
      P.ico('download', 14) + 'Télécharger tout (PDF)</button>' +
      '</div></div>';

    var bloc = P.avecTableau(
      P.section({
        titre: 'Bulletins de la classe', icone: 'file-text',
        contenu: '<div class="nm-flat p-6 rounded-[32px]">' + entete + '<div id="table-bulletins"></div></div>'
      }),
      table
    );

    zone.appendChild(bloc);

    var bValider = document.getElementById('btn-valider-bulletins');
    if (bValider) bValider.addEventListener('click', validerPeriode);
    var bImprimer = document.getElementById('btn-imprimer-classe');
    if (bImprimer) bImprimer.addEventListener('click', function () { imprimerClasse(); });
    var bPdf = document.getElementById('btn-pdf-classe');
    if (bPdf) bPdf.addEventListener('click', function () { telechargerPdfClasse(); });
  }

  /* --------------------------- Actions par eleve ------------------------- */
  function actionsBulletin(b) {
    var groupe = document.createElement('div');
    groupe.className = 'flex items-center justify-end gap-2';

    var bApercu = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg text-blue-500', title: 'Aperçu',
      html: P.ico('eye', 14)
    });
    bApercu.addEventListener('click', function () { apercu(b.eleve.id); });

    var bImprimer = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg ' + (b.valide ? 'text-accent' : 'text-gray-300'),
      title: b.valide ? 'Imprimer' : 'Impression bloquée : période non validée',
      html: P.ico('printer', 14)
    });
    if (b.valide) bImprimer.addEventListener('click', function () { imprimer([b.eleve.id]); });

    var bPdf = UI.el('button', {
      class: 'p-2 nm-soft-convex rounded-lg ' + (b.valide ? 'text-rose-500' : 'text-gray-300'),
      title: b.valide ? 'Télécharger en PDF' : 'Téléchargement bloqué : période non validée',
      html: P.ico('download', 14)
    });
    if (b.valide) bPdf.addEventListener('click', function () { telechargerPdf([b.eleve.id]); });

    groupe.appendChild(bApercu);
    groupe.appendChild(bImprimer);
    groupe.appendChild(bPdf);
    return groupe;
  }

  /* ----------------------------- Validation -------------------------------- */
  function validerPeriode() {
    var nonCalculees = S.elevesDeClasse(etat.classeId, an.id).filter(function (e) {
      var b = bulletinDe(e.id);
      return b.moyenneGenerale === null;
    });
    UI.confirmer({
      titre: 'Valider les bulletins',
      message: 'Valider les bulletins de <b>' + P.esc(S.classeParId(etat.classeId).nom) + '</b> pour <b>' +
        P.esc(libellePeriode(etat.periode)) + '</b> ?<br><br>L\'impression sera alors autorisée.' +
        (nonCalculees.length
          ? '<br><br><b>' + nonCalculees.length + ' élève(s)</b> n\'ont pas de moyenne calculable : leurs bulletins resteront partiels.'
          : '')
    }).then(function (ok) {
      if (!ok) return;
      var r = S.validerBulletins(etat.classeId, an.id, idPeriode(etat.periode));
      if (!r.ok) { UI.toast(r.motif, 'error'); return; }
      UI.toast('Bulletins validés pour ' + libellePeriode(etat.periode) + '.', 'success');
      refresh();
    });
  }

  /* ------------------------------ Apercu ----------------------------------- */
  /* L'apercu reste possible meme non valide : l'administrateur doit pouvoir
     controler le rendu avant de delivrer. Seul l'impression est fermee. */
  function apercu(eleveId) {
    var b = bulletinDe(eleveId);
    etat.apercuId = eleveId;
    var zone = document.getElementById('preview-container');
    zone.classList.remove('hidden');
    zone.innerHTML = page(b) +
      '<div class="flex flex-wrap items-center gap-3 mt-4 no-print">' +
      '<button type="button" id="btn-apercu-imprimer" class="py-2.5 px-5 ' +
      (b.valide ? 'bg-accent text-white' : 'nm-soft-convex opacity-50') + ' rounded-2xl text-xs font-bold flex items-center gap-2"' +
      (b.valide ? '' : ' disabled') + '>' + P.ico('printer', 14) + 'Imprimer</button>' +
      '<button type="button" id="btn-apercu-pdf" class="py-2.5 px-5 ' +
      (b.valide ? 'nm-soft-convex text-rose-500' : 'nm-soft-convex opacity-50') + ' rounded-2xl text-xs font-bold flex items-center gap-2"' +
      (b.valide ? '' : ' disabled') + '>' + P.ico('download', 14) + 'Télécharger PDF</button>' +
      '<button type="button" id="btn-apercu-fermer" class="py-2.5 px-5 nm-soft-convex rounded-2xl text-xs font-bold">Fermer</button>' +
      '<span class="text-xs text-gray-400">' +
      (b.valide ? 'Période validée : impression et PDF autorisés.'
        : 'Période non validée : l\'aperçu est visible mais l\'impression est bloquée.') +
      '</span></div>';

    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('btn-apercu-fermer').addEventListener('click', function () {
      zone.classList.add('hidden');
      zone.innerHTML = '';
      etat.apercuId = null;
    });
    var bImp = document.getElementById('btn-apercu-imprimer');
    if (bImp && b.valide) bImp.addEventListener('click', function () { imprimer([b.eleve.id]); });
    var bPdf = document.getElementById('btn-apercu-pdf');
    if (bPdf && b.valide) bPdf.addEventListener('click', function () { telechargerPdf([b.eleve.id]); });
  }

  function page(b) {
    var e = b.eleve;
    var baremeMatiere = baremeDe(b);
    /* Section de la classe : priorite a l'entite Section (sectionId), repli
       sur la chaine `section`. La langue du bulletin en decoule. */
    var section = (function () {
      var c = b.classe || {};
      if (c.sectionId) {
        var sec = S.all('sections').filter(function (s) { return s.id === c.sectionId; })[0];
        if (sec && sec.nom) return String(sec.nom).toLowerCase();
      }
      return String(c.section || 'francophone').toLowerCase();
    })();
    var estAnglophone = section.indexOf('angl') !== -1;
    /* Date et heure d'impression : affichees au pied de page, jamais dans
       l'en-tete (l'en-tete navigateur est neutralise via @page margin:0). */
    var maintenant = new Date();
    var locale = estAnglophone ? 'en-GB' : 'fr-FR';
    var dateImpression = maintenant.toLocaleDateString(locale);
    var heureImpression = maintenant.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    /* Identite de l'etablissement, parametrable depuis les reglages. */
    var etab = S.parametres().etablissement;
    var profil = b.profil || {};

    function appreciationPour(moyenne) {
      if (moyenne === null || moyenne === undefined) return L.nonRenseignee;
      if (estAnglophone) {
        var gce = C.noteVersGCE ? C.noteVersGCE(moyenne) : { grade: 'U', label: 'Fail' };
        return gce.grade + ' (' + gce.label + ')';
      }
      return C.appreciationAuto(moyenne, b.classe.id);
    }

    /* Couleur de l'appreciation, ramenee sur /20 quelle que soit la section. */
    function classeApp(moyenne) {
      if (moyenne === null || moyenne === undefined) return '';
      var max = Number(baremeMatiere) || 20;
      var sur20 = (moyenne / max) * 20;
      if (sur20 >= 14) return 'good';
      if (sur20 >= 10) return 'mid';
      return 'low';
    }

    /* Libelles du bulletin dans la langue de la section : francophone ->
       francais, anglophone -> anglais. L'en-tete officiel reste bilingue
       (ministeres FR/EN), mais le bloc de la section est place en premier. */
    var L = estAnglophone ? {
      blocGauche: '<p class="bul-country">Republic of Cameroon</p>' +
        '<p class="bul-devise">Peace — Work — Fatherland</p>' +
        '<p class="bul-min">Ministry of Secondary Education</p>' +
        '<p>Regional Delegation · Divisional Delegation</p>',
      blocDroite: '<p class="bul-country">République du Cameroun</p>' +
        '<p class="bul-devise">Paix — Travail — Patrie</p>' +
        '<p class="bul-min">Ministère des Enseignements Secondaires</p>' +
        '<p>Délégation Régionale · Délégation Départementale</p>',
      nonRenseignee: 'Not filled',
      anneeScolaire: 'School year',
      valideOk: 'Validated document',
      valideNon: 'Unvalidated document',
      nomPrenom: 'Full name',
      matricule: 'Matricule',
      classeEffectif: 'Class / Enrolment',
      dateLieu: 'Date and place of birth',
      enseignantPrincipal: 'Class teacher',
      sexe: 'Sex',
      matiereVide: 'No subject taught in this class.',
      nonNote: 'Not graded',
      avertissement: 'Warning',
      blame: 'Blame',
      resultatAnnuel: 'ANNUAL RESULT',
      profilClasse: 'CLASS PROFILE',
      travailEleve: 'STUDENT WORK',
      conduiteEleve: 'STUDENT CONDUCT',
      totalPoints: 'Total points',
      moyenneGenerale: 'Average',
      moyennesPeriode: 'AVERAGES BY PERIOD',
      rang: 'Rank',
      mention: 'Mention',
      moyenneClasse: 'Class average',
      reussite: 'Success rate',
      maxMin: 'Max / Min',
      tableauHonneur: 'Honour roll',
      encouragements: 'Encouragements',
      felicitations: 'Congratulations',
      avertBlam: 'Warning / Blame',
      absencesTotales: 'Total absences',
      nonJustifiees: 'Unexcused',
      exclusions: 'Exclusions',
      conduite: 'Conduct',
      oui: 'Yes',
      signParent: 'Parent / guardian signature',
      signConseil: 'Class council decision',
      signChef: 'Head of establishment',
      dateImpression: 'Print date',
      heure: 'Time',
      nonNoteSuite: 'Counted as 0: the coefficient is kept in the overall average (total points ÷ total coefficients).'
    } : {
      blocGauche: '<p class="bul-country">République du Cameroun</p>' +
        '<p class="bul-devise">Paix — Travail — Patrie</p>' +
        '<p class="bul-min">Ministère des Enseignements Secondaires</p>' +
        '<p>Délégation Régionale · Délégation Départementale</p>',
      blocDroite: '<p class="bul-country">Republic of Cameroon</p>' +
        '<p class="bul-devise">Peace — Work — Fatherland</p>' +
        '<p class="bul-min">Ministry of Secondary Education</p>' +
        '<p>Regional Delegation · Divisional Delegation</p>',
      nonRenseignee: 'Non renseignée',
      anneeScolaire: 'Année scolaire',
      valideOk: 'Document validé',
      valideNon: 'Document non validé',
      nomPrenom: 'Nom et prénom',
      matricule: 'Matricule',
      classeEffectif: 'Classe / Effectif',
      dateLieu: 'Date et lieu de naissance',
      enseignantPrincipal: 'Enseignant(e) principal(e)',
      sexe: 'Sexe',
      matiereVide: 'Aucune matière suivie dans cette classe.',
      nonNote: 'Non notée',
      avertissement: 'Avertissement',
      blame: 'Blâme',
      resultatAnnuel: 'RÉSULTAT ANNUEL',
      profilClasse: 'PROFIL CLASSE',
      travailEleve: 'TRAVAIL ÉLÈVE',
      conduiteEleve: 'CONDUITE ÉLÈVE',
      totalPoints: 'Total des points',
      moyenneGenerale: 'Moyenne',
      moyennesPeriode: 'MOYENNES PAR PÉRIODE',
      rang: 'Rang',
      mention: 'Mention',
      moyenneClasse: 'Moyenne de classe',
      reussite: '% de réussite',
      maxMin: 'Max / Min',
      tableauHonneur: 'Tableau d\'honneur',
      encouragements: 'Encouragements',
      felicitations: 'Félicitations',
      avertBlam: 'Avertissement / Blâme',
      absencesTotales: 'Absences totales',
      nonJustifiees: 'Non justifiées',
      exclusions: 'Exclusions',
      conduite: 'Conduite',
      oui: 'Oui',
      signParent: 'Signature du parent / tuteur',
      signConseil: 'Décision du conseil de classe',
      signChef: 'Le Chef d\'établissement',
      dateImpression: 'Date d\'impression',
      heure: 'Heure',
      nonNoteSuite: 'Comptée(s) 0 point : leur coefficient reste intégré au calcul de la moyenne générale (total des points ÷ total des coefficients).'
    };

    /* Badge bilingue « BULLETIN SCOLAIRE - Xe TRIMESTRE ». */
    var numTrim = numeroTrimestreCourant();
    var badgeFr, badgeEn;
    if (b.annuel) {
      badgeFr = 'BULLETIN SCOLAIRE - ANNÉE';
      badgeEn = 'ANNUAL REPORT CARD';
    } else if (numTrim) {
      badgeFr = 'BULLETIN SCOLAIRE - ' + numTrim + (numTrim === 1 ? 'ER' : 'E') + ' TRIMESTRE';
      badgeEn = numTrim + (numTrim === 1 ? 'ST' : numTrim === 2 ? 'ND' : numTrim === 3 ? 'RD' : 'TH') + ' TERM REPORT CARD';
    } else {
      badgeFr = 'BULLETIN SCOLAIRE';
      badgeEn = 'REPORT CARD';
    }

    /* Colonnes SEQ : autant que de sequences couvertes. La numerotation est
       globale sur l'annee (SEQ1..SEQ6), pour rester continue d'un trimestre a
       l'autre ; un bulletin annuel affiche donc toutes les sequences. */
    var seqCols = b.sequences || [];
    var nbSeqCols = seqCols.length || 2;
    var nbCols = 2 + nbSeqCols + 5;
    var seqHeaders = '';
    for (var si = 0; si < nbSeqCols; si++) {
      seqHeaders += '<th class="c">SEQ ' + (seqCols[si] ? numeroGlobalSequence(seqCols[si]) : (si + 1)) + '</th>';
    }

    /* Corps du tableau : lignes par matiere, clôturees par la moyenne du groupe. */
    var corps = '';
    (b.groupes || []).forEach(function (g) {
      var nomGroupe = estAnglophone ? (CAT_NOM_EN[g.nom] || g.nom) : g.nom;
      corps += '<tr class="bul-cat-row"><td class="bul-cat" colspan="' + nbCols + '">' + P.esc(nomGroupe) + '</td></tr>';
      (g.lignes || []).forEach(function (l, idx) {
        var alt = idx % 2 === 1 ? ' bul-alt' : '';
        var row = '<td class="bul-mat">' + P.esc(l.matiere.nom) + '</td>' +
          '<td class="bul-ens">' + P.esc(l.enseignant) + '</td>';
        for (var i = 0; i < nbSeqCols; i++) {
          var v = l.seq ? l.seq[i] : null;
          row += '<td class="c">' + (v === null || v === undefined ? '—' : C.arrondir(v, 2)) + '</td>';
        }
        row += '<td class="c bul-moy">' + (l.moyenne === null ? '—' : C.arrondir(l.moyenne, 2)) + '</td>' +
          '<td class="c">' + l.coefficient + '</td>' +
          '<td class="c">' + (l.pondere === null ? '—' : l.pondere) + '</td>' +
          '<td class="c">' + (l.rang === null ? '—' : l.rang) + '</td>' +
          '<td class="bul-app ' + classeApp(l.moyenne) + '">' + P.esc(appreciationPour(l.moyenne)) + '</td>';
        corps += '<tr class="bul-mat-row' + alt + '">' + row + '</tr>';
      });
      corps += '<tr class="bul-cat-avg">' +
        '<td class="bul-cat-lab" colspan="' + (2 + nbSeqCols) + '">' + (estAnglophone ? 'Average' : 'Moyenne') + ' - ' + P.esc(estAnglophone ? (CAT_NOM_EN[g.nom] || g.nom) : g.nom) + '</td>' +
        '<td class="c bul-moy">' + (g.moyenne === null ? '—' : C.arrondir(g.moyenne, 2)) + '</td>' +
        '<td class="c">' + g.totalCoef + '</td>' +
        '<td class="c">' + (g.totalPondere === null ? '—' : g.totalPondere) + '</td>' +
        '<td class="c">—</td>' +
        '<td class="bul-app ' + classeApp(g.moyenne) + '">' + P.esc(appreciationPour(g.moyenne)) + '</td>' +
        '</tr>';
    });
    if (!corps) corps = '<tr><td class="c" colspan="' + nbCols + '">' + P.esc(L.matiereVide) + '</td></tr>';

    /* Valeurs de synthese utilisees dans les cartes du bas. */
    var moy = b.moyenneGenerale;
    var moyGenAffiche = moy === null ? '—'
      : estAnglophone
        ? (function () { var gce = C.noteVersGCE(moy); return C.arrondir(moy, 2) + ' (' + gce.grade + ') / 100'; })()
        : C.arrondir(moy, 2) + ' / ' + baremeMatiere;
    var mention = moy === null ? '—'
      : estAnglophone
        ? (function () { var gce = C.noteVersGCE(moy); return gce.grade + ' — ' + gce.label; })()
        : C.appreciationAuto(moy, b.classe.id);
    var enHonneur = moy !== null && moy >= 14;
    var encouragements = moy !== null && moy >= 12 && moy < 14;
    var felicitations = moy !== null && moy >= 16;
    var avertissement = b.nonJustifiees >= 3 ? L.avertissement : b.decision === 'exclu' ? L.blame : '—';
    var logo = etab.logo
      ? '<img src="' + P.esc(etab.logo) + '" alt="">'
      : '<span>' + P.esc(S.initialesEtablissement(etab)) + '</span>';
    var contact = [etab.adresse, etab.telephone].filter(function (x) { return x; })
      .map(function (x) { return P.esc(x); }).join(' · ');

    /* Contenu de la carte « Moyennes par periode » : moyenne generale de
       l'eleve sur chaque periode deja couverte (cf. moyennesParPeriode). */
    var periodesItems = moyennesParPeriode(b, estAnglophone);

    function kv(k, v) {
      return '<div class="bul-kv"><span class="k">' + P.esc(k) + '</span><span class="v">' + v + '</span></div>';
    }
    function carte(titre, contenu) {
      return '<div class="bul-card"><div class="bul-card-t">' + P.esc(titre) + '</div>' +
        '<div class="bul-card-b">' + contenu + '</div></div>';
    }

    return '<div class="bulletin-page bul-officiel">' +

      /* En-tete officiel bilingue : ministeres a gauche/droite, logo au centre. */
      '<div class="bul-header">' +
      '<div class="bul-official">' + L.blocGauche + '</div>' +
      '<div class="bul-logo">' + logo + '</div>' +
      '<div class="bul-official bul-official--right">' + L.blocDroite + '</div>' +
      '</div>' +

      /* Identite de l'etablissement + badge + annee scolaire. */
      '<div class="bul-etab">' +
      '<div class="bul-nom">' + P.esc(etab.nom) + '</div>' +
      (contact ? '<div class="bul-contact">' + contact + '</div>' : '') +
      '<span class="bul-badge">' + P.esc(estAnglophone ? badgeEn : badgeFr) + '</span>' +
      '<span class="bul-badge-en">' + P.esc(estAnglophone ? badgeFr : badgeEn) + '</span>' +
      '<div class="bul-annee">' + P.esc(L.anneeScolaire) + ' ' + P.esc(an.libelle) +
      (b.valide ? ' · <b class="bul-ok">' + P.esc(L.valideOk) + '</b>' : ' · <b class="bul-warn">' + P.esc(L.valideNon) + '</b>') +
      '</div>' +
      '</div>' +

      /* Bloc informations de l'élève : photo à gauche, champs au centre,
         code QR en haut à droite. */
      '<div class="bul-info">' +
      photoEleve(e) +
      '<div class="bul-info-fields">' +
      '<div class="bul-f"><span class="bul-lab">' + P.esc(L.nomPrenom) + '</span><span class="bul-val">' + P.esc(e.nom + ' ' + e.prenom) + '</span></div>' +
      '<div class="bul-f"><span class="bul-lab">' + P.esc(L.matricule) + '</span><span class="bul-val">' + P.esc(e.matricule) + '</span></div>' +
      '<div class="bul-f"><span class="bul-lab">' + P.esc(L.classeEffectif) + '</span><span class="bul-val">' + P.esc(b.classe.nom) + ' · ' + b.effectif + '</span></div>' +
      '<div class="bul-f"><span class="bul-lab">' + P.esc(L.dateLieu) + '</span><span class="bul-val">' +
      (e.dateNaissance ? UI.dateFr(e.dateNaissance) : '—') + ' · ' + P.esc(e.lieuNaissance || '—') + '</span></div>' +
      '<div class="bul-f"><span class="bul-lab">' + P.esc(L.enseignantPrincipal) + '</span><span class="bul-val">' + P.esc(b.pp || '—') + '</span></div>' +
      '<div class="bul-f"><span class="bul-lab">' + P.esc(L.sexe) + '</span><span class="bul-val">' + P.esc(e.sexe || '—') + '</span></div>' +
      '</div>' +
      '<div class="bul-qr">' + imageQR(b) + '</div>' +
      '</div>' +

      /* Tableau des notes groupe par categorie. */
      '<table class="bul-table">' +
      '<thead><tr>' +
      '<th class="bul-th-mat">' + (estAnglophone ? 'SUBJECTS' : 'MATIÈRES') + '</th>' +
      '<th>' + (estAnglophone ? 'TEACHER' : 'ENSEIGNANT') + '</th>' +
      seqHeaders +
      '<th class="c">' + (estAnglophone ? 'AVG' : 'MOY') + '</th><th class="c">COEF</th><th class="c">TOTAL</th>' +
      '<th class="c">' + (estAnglophone ? 'RANK' : 'RANG') + '</th><th>' + (estAnglophone ? 'REMARK' : 'APPRÉCIATION') + '</th>' +
      '</tr></thead><tbody>' + corps + '</tbody></table>' +

      (b.matieresNonNotees.length
        ? '<p class="bul-note">' + (estAnglophone ? 'Subject(s) not graded: ' : 'Matière(s) sans note : ') +
          P.esc(b.matieresNonNotees.map(function (id) {
            var m = S.matiereParId(id);
            return m ? m.nom : id;
          }).join(', ')) + '. ' + P.esc(L.nonNoteSuite) + '</p>'
        : '') +

      /* Quatre cartes : resultat, profil classe, travail et conduite. */
      '<div class="bul-cards">' +
      carte(L.resultatAnnuel,
        kv(L.totalPoints, '<b>' + C.arrondir(b.totalPoints, 2) +
          (b.totalCoefficients ? ' / ' + b.totalCoefficients : '') + '</b>') +
        kv(L.moyenneGenerale, '<b class="bul-moy">' + moyGenAffiche + '</b>') +
        kv(L.rang, b.rang === null ? '—' : b.rang + ' / ' + b.effectif) +
        kv(L.mention, '<b class="bul-app ' + classeApp(moy) + '">' + P.esc(mention) + '</b>')) +
      carte(L.moyennesPeriode,
        periodesItems.length
          ? periodesItems.map(function (it) {
            return kv(it.label, '<b class="bul-moy">' + (it.valeur === null || it.valeur === undefined
              ? '—' : C.arrondir(it.valeur, 2) + ' / ' + baremeMatiere) + '</b>');
          }).join('')
          : kv(L.nonRenseignee, '—')) +
      carte(L.profilClasse,
        kv(L.moyenneClasse, '<b>' + (profil.moyenne === null || profil.moyenne === undefined ? '—' : C.arrondir(profil.moyenne, 2)) + '</b>') +
        kv(L.reussite, profil.tauxReussite === null || profil.tauxReussite === undefined ? '—' : profil.tauxReussite + ' %') +
        kv(L.maxMin, (profil.meilleure === null || profil.meilleure === undefined ? '—' : C.arrondir(profil.meilleure, 2) + ' / ' + C.arrondir(profil.pire, 2)))) +
      carte(L.travailEleve,
        kv(L.tableauHonneur, enHonneur ? '<b class="bul-app good">' + P.esc(L.oui) + '</b>' : '—') +
        kv(L.encouragements, encouragements ? '<b class="bul-app good">' + P.esc(L.oui) + '</b>' : '—') +
        kv(L.felicitations, felicitations ? '<b class="bul-app good">' + P.esc(L.oui) + '</b>' : '—') +
        kv(L.avertBlam, P.esc(avertissement === '—' ? '—' : avertissement))) +
      carte(L.conduiteEleve,
        kv(L.absencesTotales, b.absences + ' (' + C.arrondir(b.heuresAbsence, 1) + ' h)') +
        kv(L.nonJustifiees, '<b class="' + (b.nonJustifiees ? 'bul-app low' : '') + '">' + b.nonJustifiees + '</b>') +
        kv(L.exclusions, '—') +
        kv(L.conduite, b.conduite === null ? '—' : (estAnglophone ? '—' : C.arrondir(b.conduite, 2) + ' / ' + baremeMatiere))) +
      '</div>' +

      /* Trois blocs de signature : seuls les intitulés sont conservés. */
      '<div class="bul-signs">' +
      '<div class="bul-sign">' +
      '<p class="bul-sign-t">' + P.esc(L.signParent) + '</p>' +
      '</div>' +
      '<div class="bul-sign">' +
      '<p class="bul-sign-t">' + P.esc(L.signConseil) + '</p>' +
      '</div>' +
      '<div class="bul-sign">' +
      '<p class="bul-sign-t">' + P.esc(L.signChef) + '</p>' +
      '</div>' +
      '</div>' +

      /* Pied de page : date et heure d'impression + référence du document. */
      '<div class="bul-bas">' +
      '<div class="bul-footer">' +
      '<span class="bul-imp">' + P.esc(L.dateImpression) + ' : ' + P.esc(dateImpression) +
      ' — ' + P.esc(L.heure) + ' : ' + P.esc(heureImpression) + '</span>' +
      '<span class="bul-ref">' + P.esc(referenceBulletin()) + '</span>' +
      '</div>' +
      '</div>' +

      '</div>';
  }

  /* ----------------------------- Impression -------------------------------- */
  /* Un seul bulletin : on n'affiche que celui-ci. Toute la classe : on
     concatene les pages, une par eleve, avec un saut de page entre elles. */
  function imprimer(elevesIds) {
    var zone = document.getElementById('preview-container');
    var htmlPrecedent = zone.innerHTML;
    var html = elevesIds.map(function (id) { return page(bulletinDe(id)); }).join('');

    zone.classList.remove('hidden');
    zone.innerHTML = html;

    /* Le titre sert uniquement de nom de fichier PDF (l'en-tete navigateur
       est neutralise par la marge nulle de @page). */
    var titre = referenceBulletin() + '-' +
      elevesIds.map(function (id) { var e = S.eleveParId(id); return e ? e.nom : ''; }).join('-');
    var ancienTitre = document.title;
    document.title = titre;

    /* leave le temps au navigateur de recalculer la mise en page avant
       d'ouvrir la boite de dialogue. */
    setTimeout(function () {
      window.print();
      setTimeout(function () {
        document.title = ancienTitre;
        if (htmlPrecedent) { zone.innerHTML = htmlPrecedent; } else { zone.classList.add('hidden'); }
      }, 400);
    }, 150);
  }

  function imprimerClasse() {
    var eleves = S.elevesDeClasse(etat.classeId, an.id).map(function (e) { return e.id; });
    if (!eleves.length) { UI.toast('Aucun élève dans cette classe.', 'error'); return; }
    UI.confirmer({
      titre: 'Imprimer toute la classe',
      message: 'Générer les bulletins de <b>' + P.esc(S.classeParId(etat.classeId).nom) + '</b> (' +
        eleves.length + ' élève(s)) ?<br><br>Dans la boite d\'impression, choisissez <b>Enregistrer au format PDF</b> pour obtenir un seul fichier contenant toute la classe.'
    }).then(function (ok) {
      if (!ok) return;
      imprimer(eleves);
    });
  }

  /* --------------------------- Téléchargement PDF -------------------------- */
  /* Un vrai fichier .pdf (une page A4 par eleve) : le bulletin est rendu hors
     ecran en A4 strict, rasterise par html2canvas, puis pose dans un PDF A4.
     Aucune connexion requise : jsPDF et html2canvas sont embarques dans le
     projet (js/core). */
  function moteurPdfDisponible() {
    return typeof window.html2canvas === 'function' &&
      window.jspdf && typeof window.jspdf.jsPDF === 'function';
  }

  function telechargerPdf(elevesIds) {
    if (!moteurPdfDisponible()) {
      UI.toast('Génération PDF indisponible : bibliothèque non chargée.', 'error');
      return;
    }
    if (!elevesIds.length) { UI.toast('Aucun bulletin à télécharger.', 'error'); return; }

    var stage = document.getElementById('pdf-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'pdf-stage';
      document.body.appendChild(stage);
    }
    stage.innerHTML = elevesIds.map(function (id) { return page(bulletinDe(id)); }).join('');
    var pages = Array.prototype.slice.call(stage.querySelectorAll('.bulletin-page'));

    UI.toast('Génération du PDF (' + pages.length + ' page(s))…', 'info');
    var JsPDF = window.jspdf.jsPDF;
    var pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    var numero = 0;
    function pageSuivante() {
      if (numero >= pages.length) {
        pdf.save(referenceBulletin() + '.pdf');
        stage.innerHTML = '';
        UI.toast('PDF téléchargé : ' + pages.length + ' page(s).', 'success');
        return;
      }
      var el = pages[numero];
      window.html2canvas(el, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
      }).then(function (canvas) {
        var img = canvas.toDataURL('image/jpeg', 0.92);
        if (numero > 0) pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        numero++;
        pageSuivante();
      }).catch(function (err) {
        stage.innerHTML = '';
        UI.toast('Erreur PDF : ' + ((err && err.message) || err), 'error');
      });
    }
    pageSuivante();
  }

  function telechargerPdfClasse() {
    var eleves = S.elevesDeClasse(etat.classeId, an.id).map(function (e) { return e.id; });
    if (!eleves.length) { UI.toast('Aucun élève dans cette classe.', 'error'); return; }
    UI.confirmer({
      titre: 'Télécharger toute la classe en PDF',
      message: 'Générer un fichier PDF de <b>' + P.esc(S.classeParId(etat.classeId).nom) + '</b> (' +
        eleves.length + ' élève(s)) ?<br><br>Une page A4 par élève sera téléchargée.'
    }).then(function (ok) {
      if (!ok) return;
      telechargerPdf(eleves);
    });
  }

  refresh();
})();
