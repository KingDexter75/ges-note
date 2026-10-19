"""Configuration Django du projet GesNote2 (EduNeum).

La base de donnees est MySQL (base « gesnotes2 »). Le front-end statique
existant (HTML/CSS/JS) est servi par Django, qui assure l'authentification,
la persistance et le controle d'acces cote serveur.
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-eduneum-gesnote2-changez-moi-en-production'

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'eduneum',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # Definit request.user a partir du JWT (cookie HttpOnly ou Bearer).
    'eduneum.middleware.JWTAuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

# La base de demonstration (50 eleves par classe) produit un instantane JSON de
# plusieurs megaoctets ; la limite par defaut de 2,5 Mo ferait echouer tout
# enregistrement (Erreur 500 / "Enregistrement impossible").
DATA_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = None

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# --- MySQL -----------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'gesnotes2',
        'USER': 'root',
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '3306',
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

AUTH_USER_MODEL = 'eduneum.Compte'

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Douala'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

SESSION_ENGINE = 'django.contrib.sessions.backends.db'
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

# Duree de validite d'un code OTP (secondes).
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5

# Exiger un code OTP avant la connexion.
#   None  : automatique — OTP requis si la passerelle SMS est configuree,
#           sinon la connexion se fait directement avec telephone + mot de passe.
#   True  : OTP toujours exige.  False : jamais (connexion directe).
OTP_OBLIGATOIRE = None

# --- Passerelle SMS (Africa's Talking) -------------------------------------
# L'envoi des codes OTP est confie a eduneum/sms.py, configure par variables
# d'environnement (jamais de secret dans le depot) :
#   AT_USERNAME  nom d'utilisateur Africa's Talking (obligatoire)
#   AT_API_KEY   cle API (obligatoire)
#   AT_SENDER_ID expediteur alphanumerique (facultatif)
#   AT_SANDBOX   « 0 » pour la production (defaut : bac a sable)
#   SMS_PAYS     indicatif pays par defaut (+237 Cameroun)

# --- Jetons JWT (eduneum/jwtauth.py, HS256) ---------------------------------
# JWT_SECRET vaut SECRET_KEY si non defini (jamais de secret en clair ici).
# Access : 12 h (cookie HttpOnly, path /). Refresh : 7 j (cookie HttpOnly,
# path /api/auth/, rotation a chaque usage, jti revoquable en base).
JWT_ACCESS_TTL_SECONDS = 12 * 3600
JWT_REFRESH_TTL_SECONDS = 7 * 24 * 3600

