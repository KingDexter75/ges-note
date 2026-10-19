"""Cree (ou reinitialise) le compte administrateur de l'application.

Usage :
    python manage.py admin_init                      # 672647904 / admin1234
    python manage.py admin_init 6XXXXXXX mdp         # autres identifiants

Le compte est mis a jour s'il existe deja : le mot de passe est redefini,
le role est force a « admin » et le compte est reactive. Aucune donnee de
demonstration n'est chargee.
"""
from django.core.management.base import BaseCommand

from eduneum.models import Compte

TELEPHONE_DEFAUT = '672647904'
MOT_DE_PASSE_DEFAUT = 'admin1234'


class Command(BaseCommand):
    help = 'Cree ou reinitialise le compte administrateur (telephone/mot de passe).'

    def add_arguments(self, parser):
        parser.add_argument('--telephone', default=TELEPHONE_DEFAUT)
        parser.add_argument('--mot-de-passe', default=MOT_DE_PASSE_DEFAUT)

    def handle(self, *args, **options):
        telephone = options['telephone'].strip()
        mot_de_passe = options['mot_de_passe']
        compte, created = Compte.objects.get_or_create(
            telephone=telephone,
            defaults={
                'role': 'admin', 'nom': 'Administrateur', 'prenom': 'GesNote',
                'enseignant_id': '', 'is_active': True,
                'is_staff': True, 'is_superuser': True,
            },
        )
        if not created:
            compte.role = 'admin'
            compte.is_active = True
            compte.is_staff = True
            compte.is_superuser = True
            compte.save(update_fields=['role', 'is_active', 'is_staff', 'is_superuser'])
        compte.set_password(mot_de_passe)
        compte.save(update_fields=['password'])
        action = 'Cree' if created else 'Reinitialise'
        self.stdout.write(self.style.SUCCESS(
            '%s compte admin : %s / %s' % (action, telephone, mot_de_passe)))
