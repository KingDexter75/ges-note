from django.contrib import admin

from . import models

for modele in (
    models.Annee, models.Trimestre, models.Sequence, models.Classe, models.Matiere,
    models.Eleve, models.Enseignant, models.Coefficient, models.Inscription,
    models.Affectation, models.ProfPrincipal, models.Note, models.Absence,
    models.Sanction, models.MigrationEleve, models.Decision, models.Appreciation,
    models.BulletinValide, models.JournalEntry, models.SmsLog, models.Compte,
    models.OTPCode, models.Parametres,
):
    admin.site.register(modele)
