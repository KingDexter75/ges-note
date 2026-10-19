# GesNote2 (EduNeum)

Application web de gestion des notes, bulletins et disciplines scolaires.
Backend **Django 6.1** (Python 3.14) + **MySQL**, front-end HTML/CSS/JS servi par Django,
authentification JWT (cookies HttpOnly) avec code OTP par SMS optionnel.

## Prérequis

- Python **3.14** (ou supérieur)
- **MySQL 8** (ou MariaDB 10.6+) accessible sur `127.0.0.1:3306`
- Accès réseau au démarrage du navigateur (CDN requis : `cdn.tailwindcss.com`, `code.iconify.design`)

## 1. Récupérer le code

```bash
git clone <url-du-depot> GesNote2
cd GesNote2
```

## 2. Créer l'environnement virtuel

Sous Windows (PowerShell) :

```powershell
python -m venv env
env\Scripts\Activate.ps1
```

Sous Linux / macOS :

```bash
python3 -m venv env
source env/bin/activate
```

Puis installer les dépendances depuis `requirements.txt` :

```bash
pip install -r requirements.txt
```

> `requirements.txt` liste **Django 6.1.2**, **PyMySQL 1.2.3** (pilote MySQL,
> activé dans `config/__init__.py`) et les dépendances transitives
> (`asgiref`, `sqlparse`, `tzdata`).

## 3. Créer la base de données

Se connecter à MySQL (compte `root` par défaut) puis :

```sql
CREATE DATABASE gesnotes2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Les identifiants sont ceux définis dans `config/settings.py` :

| Paramètre | Valeur par défaut |
|---|---|
| `NAME` | `gesnotes2` |
| `USER` | `root` |
| `PASSWORD` | *(vide)* |
| `HOST` | `127.0.0.1` |
| `PORT` | `3306` |

> Pour une autre configuration (machine distante, mot de passe, port), modifiez le
> bloc `DATABASES` dans `config/settings.py` (lignes 65-78).

## 4. Appliquer les migrations

```bash
python manage.py migrate
```

## 5. Créer le compte administrateur

```bash
python manage.py admin_init
```

Compte créé par défaut : **téléphone `672647904` / mot de passe `admin1234`**
(changeables via `--telephone` et `--mot-de-passe`).

```bash
python manage.py admin_init --telephone 6XXXXXXXX --mot-de-passe MonMotDePasse
```

## 6. Démarrer le serveur

```bash
python manage.py runserver
```

Ouvrir ensuite <http://127.0.0.1:8000/> (page de connexion `index.html`).

## Variables d'environnement (optionnel — passerelle SMS)

L'envoi des codes OTP utilise Africa's Talking, configuré par variables
d'environnement (`eduneum/sms.py`) :

| Variable | Obligatoire | Défaut | Description |
|---|---|---|---|
| `AT_USERNAME` | oui* | `''` | Utilisateur Africa's Talking |
| `AT_API_KEY` | oui* | `''` | Clé API |
| `AT_SENDER_ID` | non | `''` | Expéditeur alphanumérique |
| `AT_SANDBOX` | non | `1` | `0` = production, `1` = bac à sable |
| `SMS_PAYS` | non | `+237` | Indicatif pays par défaut |

\* Si ces variables ne sont pas définies, l'OTP est désactivé : la connexion se fait
directement avec téléphone + mot de passe (`OTP_OBLIGATOIRE = None` dans
`config/settings.py`).

Exemple (PowerShell) :

```powershell
$env:AT_USERNAME = "mon-utilisateur"
$env:AT_API_KEY = "ma-cle-api"
$env:AT_SANDBOX = "1"
```

## Commandes utiles

| Commande | Rôle |
|---|---|
| `python manage.py runserver` | Serveur de développement |
| `python manage.py migrate` | Applique les migrations (`eduneum/migrations/`) |
| `python manage.py makemigrations` | Génère de nouvelles migrations |
| `python manage.py admin_init` | Crée/réinitialise le compte admin |
| `python manage.py createsuperuser` | Superuser Django (admin Django sur `/django-admin/`) |
| `python manage.py shell` | Console Python avec le projet chargé |

## Notes importantes

- **Avant la mise en production** : changez `SECRET_KEY`, passez `DEBUG = False`
  et restreignez `ALLOWED_HOSTS` dans `config/settings.py`.
- Le projet démarre **vide** : aucune donnée de démonstration n'est insérée.
- L'interface d'administration Django est disponible sur `/django-admin/`.
- Rôles applicatifs : `admin`, `direction`, `censeur`, `surveillant`, `enseignant`.
- Le dossier `env/` est l'environnement virtuel : **ne pas le versionner**
  (ajoutez-le au `.gitignore` avec `__pycache__/` et `*.pyc`).
- Point d'entrée API principal : `GET /api/bootstrap/` (session + données).

## Documentation

La documentation complète du projet (architecture, modèles, API, droits,
authentification, front-end) se trouve dans **`doc-ges-note.txt`**.
