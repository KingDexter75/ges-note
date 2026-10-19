"""Modeles de donnees EduNeum.

Chaque modele correspond a une collection du magasin localStorage d'origine
(js/core/store.js). Les identifiants sont des chaines : ils sont produits par
le front-end (ex. « e1 », « c1 », « an2025 ») et doivent rester stables pour
que les references croisees (classeId, eleveId, ...) continuent de fonctionner.

Les dates et horodatages sont stockes en texte ISO pour rester fideles aux
valeurs manipulees par le front-end (y compris les chaines vides).
"""
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class CompteManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, telephone, password, **extra):
        if not telephone:
            raise ValueError('Le numero de telephone est obligatoire.')
        telephone = str(telephone).strip()
        compte = self.model(telephone=telephone, **extra)
        compte.set_password(password)
        compte.save(using=self._db)
        return compte

    def create_user(self, telephone, password=None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create(telephone, password, **extra)

    def create_superuser(self, telephone, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('is_active', True)
        extra.setdefault('role', 'admin')
        return self._create(telephone, password, **extra)


class Compte(AbstractBaseUser, PermissionsMixin):
    """Compte de connexion (remplace les COMPTES_DEMO du front-end)."""

    ROLES = [
        ('admin', 'Administrateur'),
        ('direction', 'Direction'),
        ('censeur', 'Censeur'),
        ('surveillant', 'Surveillant général'),
        ('enseignant', 'Enseignant'),
    ]

    telephone = models.CharField(max_length=20, unique=True)
    role = models.CharField(max_length=20, choices=ROLES, default='enseignant')
    nom = models.CharField(max_length=80, blank=True)
    prenom = models.CharField(max_length=80, blank=True)
    # Reference par identifiant (les identifiants sont des chaines, comme partout
    # dans le magasin). Un vrai ForeignKey serait remis a NULL a chaque
    # reecriture de l'instantane (les enseignants sont recreees), ce qui
    # detacherait les comptes.
    enseignant_id = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_creation = models.DateTimeField(auto_now_add=True)

    objects = CompteManager()

    USERNAME_FIELD = 'telephone'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'eduneum_compte'
        verbose_name = 'compte'
        verbose_name_plural = 'comptes'

    def __str__(self):
        return '%s %s (%s)' % (self.prenom, self.nom, self.telephone)

    @property
    def identite(self):
        return {
            'telephone': self.telephone,
            'role': self.role,
            'nom': self.nom,
            'prenom': self.prenom,
            'enseignantId': self.enseignant_id,
        }


class RefreshToken(models.Model):
    """Jti du jeton de rafraichissement : enregistre pour pouvoir etre revoque
    (deconnexion) avant son expiration naturelle."""

    jti = models.CharField(max_length=64, unique=True)
    compte = models.ForeignKey(Compte, on_delete=models.CASCADE, related_name='refresh_tokens')
    expire_le = models.DateTimeField()
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'eduneum_refresh_token'

    def __str__(self):
        return '%s (%s)' % (self.compte_id, self.jti[:8])


class OTPCode(models.Model):
    """Code OTP a 6 chiffres pour la connexion en deux etapes."""

    telephone = models.CharField(max_length=20, db_index=True)
    code = models.CharField(max_length=6)
    cree_le = models.DateTimeField(auto_now_add=True)
    expire_le = models.DateTimeField()
    utilise = models.BooleanField(default=False)
    tentatives = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'eduneum_otp'
        ordering = ['-cree_le']

    def __str__(self):
        return '%s -> %s' % (self.telephone, self.code)


class Annee(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    libelle = models.CharField(max_length=40)
    active = models.BooleanField(default=False)
    cloturee = models.BooleanField(default=False)
    dateDebut = models.CharField(max_length=32, blank=True, default='')
    dateFin = models.CharField(max_length=32, blank=True, default='')

    class Meta:
        db_table = 'eduneum_annee'
        ordering = ['dateDebut']

    def __str__(self):
        return self.libelle


class Trimestre(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='trimestres')
    libelle = models.CharField(max_length=60, blank=True, default='')
    numero = models.IntegerField(default=1)
    dateDebut = models.CharField(max_length=32, blank=True, default='')
    dateFin = models.CharField(max_length=32, blank=True, default='')
    ouvert = models.BooleanField(default=False)
    valide = models.BooleanField(default=False)

    class Meta:
        db_table = 'eduneum_trimestre'
        ordering = ['annee_id', 'numero']


class Sequence(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='sequences')
    trimestre = models.ForeignKey(Trimestre, on_delete=models.CASCADE, related_name='sequences')
    numero = models.IntegerField(default=1)
    libelle = models.CharField(max_length=60, blank=True, default='')
    dateDebut = models.CharField(max_length=32, blank=True, default='')
    dateFin = models.CharField(max_length=32, blank=True, default='')
    ouverte = models.BooleanField(default=False)
    verrouillee = models.BooleanField(default=False)
    validee = models.BooleanField(default=False)

    class Meta:
        db_table = 'eduneum_sequence'
        ordering = ['annee_id', 'trimestre_id', 'numero']


class Section(models.Model):
    """Section d'enseignement (Francophone / Anglophone).

    Entite a part entiere de la specification : une classe appartient a une
    section identifiee. La chaine `Classe.section` est conservee pour la
    compatibilite du front-end ; elle doit rester alignee sur `Classe.sectionId`.
    """

    id = models.CharField(primary_key=True, max_length=64)
    nom = models.CharField(max_length=80)

    class Meta:
        db_table = 'eduneum_section'
        ordering = ['nom']

    def __str__(self):
        return self.nom


class Classe(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    nom = models.CharField(max_length=100)
    niveau = models.CharField(max_length=60, blank=True, default='')
    cycle = models.CharField(max_length=60, blank=True, default='')
    section = models.CharField(max_length=20, blank=True, default='francophone')
    sectionId = models.ForeignKey(
        Section, null=True, blank=True, on_delete=models.SET_NULL, related_name='classes'
    )
    effectifMax = models.IntegerField(default=30)
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='classes')
    archive = models.BooleanField(default=False)

    class Meta:
        db_table = 'eduneum_classe'
        ordering = ['nom']

    def __str__(self):
        return self.nom


class Matiere(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    code = models.CharField(max_length=20)
    nom = models.CharField(max_length=120)
    noteMax = models.IntegerField(default=20)
    archive = models.BooleanField(default=False)

    class Meta:
        db_table = 'eduneum_matiere'
        ordering = ['nom']

    def __str__(self):
        return self.nom


class Eleve(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    matricule = models.CharField(max_length=40, blank=True, default='', db_index=True)
    nom = models.CharField(max_length=80)
    prenom = models.CharField(max_length=80)
    dateNaissance = models.CharField(max_length=32, blank=True, default='')
    lieuNaissance = models.CharField(max_length=120, blank=True, default='')
    sexe = models.CharField(max_length=1, blank=True, default='')
    telephone = models.CharField(max_length=30, blank=True, default='')
    telephoneParent = models.CharField(max_length=30, blank=True, default='')
    contactTuteur = models.CharField(max_length=120, blank=True, default='')
    # Statut d'aptitude physique : 'A' = apte (defaut), 'I' = inapte.
    aptitude = models.CharField(max_length=1, blank=True, default='A')
    # Eleve redoublant : 'O' = oui, 'N' = non (defaut).
    redoublant = models.CharField(max_length=1, blank=True, default='N')
    photo = models.TextField(blank=True, default='')
    archive = models.BooleanField(default=False)
    dateCreation = models.CharField(max_length=32, blank=True, default='')

    class Meta:
        db_table = 'eduneum_eleve'
        ordering = ['nom', 'prenom']

    def __str__(self):
        return '%s %s' % (self.nom, self.prenom)


class Enseignant(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    matricule = models.CharField(max_length=40, blank=True, default='')
    nom = models.CharField(max_length=80)
    prenom = models.CharField(max_length=80)
    fonction = models.CharField(max_length=30, blank=True, default='enseignant')
    email = models.CharField(max_length=160, blank=True, default='', db_index=True)
    dateNaissance = models.CharField(max_length=32, blank=True, default='')
    telephone = models.CharField(max_length=30, blank=True, default='')
    archive = models.BooleanField(default=False)
    dateCreation = models.CharField(max_length=32, blank=True, default='')

    class Meta:
        db_table = 'eduneum_enseignant'
        ordering = ['nom', 'prenom']

    def __str__(self):
        return '%s %s' % (self.nom, self.prenom)


class Coefficient(models.Model):
    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name='coefficients')
    matiere = models.ForeignKey(Matiere, on_delete=models.CASCADE, related_name='coefficients')
    coefficient = models.IntegerField(default=0)

    class Meta:
        db_table = 'eduneum_coefficient'
        unique_together = [('classe', 'matiere')]


class Inscription(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='inscriptions')
    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name='inscriptions')
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='inscriptions')
    dateInscription = models.CharField(max_length=32, blank=True, default='')
    statut = models.CharField(max_length=20, blank=True, default='active')
    archive = models.BooleanField(default=False)
    dateMigration = models.CharField(max_length=32, blank=True, default='')

    class Meta:
        db_table = 'eduneum_inscription'
        ordering = ['annee_id', 'classe_id']


class Affectation(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name='affectations')
    matiere = models.ForeignKey(Matiere, on_delete=models.CASCADE, related_name='affectations')
    enseignant = models.ForeignKey(Enseignant, on_delete=models.CASCADE, related_name='affectations')
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='affectations')
    archive = models.BooleanField(default=False)

    class Meta:
        db_table = 'eduneum_affectation'
        ordering = ['annee_id', 'classe_id', 'matiere_id']


class AffectationCenseur(models.Model):
    """Attribution d'un censeur a une classe pour une annee (ATTRIBUTION_CENSEUR)."""

    id = models.CharField(primary_key=True, max_length=64)
    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name='affectations_censeurs')
    enseignant = models.ForeignKey(Enseignant, on_delete=models.CASCADE, related_name='affectations_censeurs')
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='affectations_censeurs')

    class Meta:
        db_table = 'eduneum_affectation_censeur'
        ordering = ['annee_id', 'classe_id']
        constraints = [
            models.UniqueConstraint(fields=['classe', 'enseignant', 'annee'],
                                    name='censeur_unique_classe_enseignant_annee'),
        ]


class ProfPrincipal(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name='profs_principaux')
    enseignant = models.ForeignKey(Enseignant, on_delete=models.CASCADE, related_name='profs_principaux')
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='profs_principaux')

    class Meta:
        db_table = 'eduneum_prof_principal'
        ordering = ['annee_id', 'classe_id']
        constraints = [
            # Une classe n'a qu'un seul professeur principal par année.
            models.UniqueConstraint(fields=['classe', 'annee'], name='pp_unique_classe_annee'),
            # Un enseignant ne dirige qu'une seule classe par année.
            models.UniqueConstraint(fields=['enseignant', 'annee'], name='pp_unique_enseignant_annee'),
        ]


class Note(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name='notes')
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='notes')
    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name='notes')
    matiere = models.ForeignKey(Matiere, on_delete=models.CASCADE, related_name='notes')
    valeur = models.FloatField(null=True, blank=True)
    statut = models.CharField(max_length=20, blank=True, default='note')
    remarque = models.TextField(blank=True, default='')
    appreciation = models.TextField(blank=True, default='')
    dateSaisie = models.CharField(max_length=40, blank=True, default='')
    modifiePar = models.CharField(max_length=64, blank=True, default='')
    modifieLe = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        db_table = 'eduneum_note'
        ordering = ['sequence_id', 'classe_id', 'matiere_id']
        constraints = [
            # Une seule evaluation par (eleve, matiere, sequence).
            models.UniqueConstraint(fields=['eleve', 'matiere', 'sequence'],
                                    name='note_unique_eleve_matiere_sequence'),
        ]


class Absence(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    sequence = models.ForeignKey(Sequence, null=True, blank=True, on_delete=models.CASCADE, related_name='absences')
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='absences')
    classe = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.CASCADE, related_name='absences')
    annee = models.ForeignKey(Annee, null=True, blank=True, on_delete=models.CASCADE, related_name='absences')
    date = models.CharField(max_length=32, blank=True, default='')
    periode = models.CharField(max_length=60, blank=True, default='')
    motif = models.CharField(max_length=200, blank=True, default='')
    heures = models.FloatField(null=True, blank=True)
    justifiees = models.FloatField(null=True, blank=True)
    nonJustifiees = models.FloatField(null=True, blank=True)
    modifiePar = models.CharField(max_length=64, blank=True, default='')
    modifieLe = models.CharField(max_length=40, blank=True, default='')
    archive = models.BooleanField(default=False)

    class Meta:
        db_table = 'eduneum_absence'


class Sanction(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    sequence = models.ForeignKey(Sequence, null=True, blank=True, on_delete=models.CASCADE, related_name='sanctions')
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='sanctions')
    classe = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.CASCADE, related_name='sanctions')
    type = models.CharField(max_length=40, blank=True, default='')
    duree = models.FloatField(null=True, blank=True)
    motif = models.CharField(max_length=200, blank=True, default='')
    modifiePar = models.CharField(max_length=64, blank=True, default='')
    modifieLe = models.CharField(max_length=40, blank=True, default='')
    archive = models.BooleanField(default=False)

    class Meta:
        db_table = 'eduneum_sanction'


class Discipline(models.Model):
    """Bilan disciplinaire agrege par (eleve, sequence) — DISCIPLINE.

    Regroupe les heures d'absence non justifiees / justifiees ainsi que les
    sanctions de conduite, au lieu de les repartir sur des lignes par date.
    """

    id = models.CharField(primary_key=True, max_length=64)
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='disciplines')
    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name='disciplines')
    heures_nj = models.FloatField(default=0)
    heures_j = models.FloatField(default=0)
    avertissement = models.BooleanField(default=False)
    blame = models.BooleanField(default=False)
    exclusion_jours = models.IntegerField(default=0)

    class Meta:
        db_table = 'eduneum_discipline'
        ordering = ['sequence_id', 'eleve_id']
        constraints = [
            models.UniqueConstraint(fields=['eleve', 'sequence'],
                                    name='discipline_unique_eleve_sequence'),
        ]


class MigrationEleve(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    type = models.CharField(max_length=30, blank=True, default='')
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='migrations')
    deClasse = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    versClasse = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    annee = models.ForeignKey(Annee, null=True, blank=True, on_delete=models.SET_NULL, related_name='migrations')
    decision = models.CharField(max_length=30, blank=True, default='')
    motif = models.CharField(max_length=200, blank=True, default='')
    auteurId = models.CharField(max_length=64, blank=True, default='')
    date = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        db_table = 'eduneum_migration'


class Decision(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='decisions')
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='decisions')
    decision = models.CharField(max_length=30, blank=True, default='')
    moyenneAnnuelle = models.FloatField(null=True, blank=True)
    modifiePar = models.CharField(max_length=64, blank=True, default='')
    modifieLe = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        db_table = 'eduneum_decision'


class Appreciation(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='appreciations')
    classe = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    annee = models.ForeignKey(Annee, on_delete=models.CASCADE, related_name='appreciations')
    periode = models.CharField(max_length=40, blank=True, default='')
    texte = models.TextField(blank=True, default='')
    conduite = models.FloatField(null=True, blank=True)
    auteurId = models.CharField(max_length=64, blank=True, default='')
    date = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        db_table = 'eduneum_appreciation'


class BulletinValide(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    cle = models.CharField(max_length=160, unique=True)
    classe = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    annee = models.ForeignKey(Annee, null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    periode = models.CharField(max_length=40, blank=True, default='')
    date = models.CharField(max_length=40, blank=True, default='')
    validePar = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        db_table = 'eduneum_bulletin_valide'


class JournalEntry(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    date = models.CharField(max_length=40, blank=True, default='')
    action = models.CharField(max_length=80, blank=True, default='')
    cible = models.CharField(max_length=160, blank=True, default='')
    details = models.TextField(blank=True, default='')
    auteurId = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        db_table = 'eduneum_journal'
        ordering = ['-date']


class SmsLog(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    destinataire = models.CharField(max_length=30, blank=True, default='')
    message = models.TextField(blank=True, default='')
    date = models.CharField(max_length=40, blank=True, default='')
    statut = models.CharField(max_length=30, blank=True, default='')
    modifiePar = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        db_table = 'eduneum_sms'


class Parametres(models.Model):
    """Singleton : parametres de l'etablissement + compteurs d'identifiants."""

    id = models.IntegerField(primary_key=True, default=1)
    donnees = models.JSONField(default=dict)
    sequenceur = models.JSONField(default=dict)

    class Meta:
        db_table = 'eduneum_parametres'

    @classmethod
    def charger(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj
