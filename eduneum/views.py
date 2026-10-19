"""Vues Django : service du front-end + API (auth OTP, instantane du magasin).

Le front-end d'origine etait 100 % statique. Ici, Django :

* sert chaque page HTML en y injectant la session courante ;
* protege l'acces cote serveur selon le role (matrice identique a acces.js) ;
* expose une API JSON d'authentification (flux OTP complet) et de
  synchronisation de la base (instantane JSON).
"""
import json
import logging
import mimetypes
import random
import re
from datetime import timedelta

from django.conf import settings
from django.http import (
    FileResponse, Http404, HttpResponse, HttpResponseRedirect, JsonResponse,
)
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from . import droits, jwtauth, models, sms, snapshot

logger = logging.getLogger(__name__)

ROOT = settings.BASE_DIR.resolve()

# Page HTML -> module de la matrice d'acces (identique a js/core/acces.js).
PAGE_MODULES = {
    'admin/tableau-de-bord.html': 'admin_dashboard',
    'admin/annee-scolaire.html': 'admin_annees',
    'admin/classes.html': 'admin_classes',
    'admin/matieres.html': 'admin_matieres',
    'admin/eleves.html': 'admin_eleves',
    'admin/personnel.html': 'admin_personnel',
    'admin/inscriptions.html': 'admin_inscriptions',
    'admin/migrations.html': 'admin_migrations',
    'admin/affectations.html': 'admin_affectations',
    'admin/affectations-surveillants.html': 'admin_affectations',
    'admin/notes.html': 'admin_notes',
    'admin/bulletins.html': 'admin_bulletins',
    'admin/statistiques.html': 'admin_statistiques',
    'admin/assiduite.html': 'admin_assiduite',
    'admin/rapports.html': 'admin_rapports',
    'admin/vie-scolaire.html': 'admin_vie_scolaire',
    'admin/journal.html': 'admin_journal',
    'admin/parametres.html': 'admin_parametres',
    'censeur/tableau-de-bord.html': 'censeur_dashboard',
    'censeur/vie-scolaire.html': 'censeur_vie_scolaire',
    'censeur/assiduite.html': 'censeur_assiduite',
    'censeur/eleves.html': 'censeur_eleves',
    'censeur/classes.html': 'censeur_classes',
    'censeur/notes.html': 'censeur_notes',
    'censeur/rapports.html': 'censeur_rapports',
    'censeur/statistiques.html': 'censeur_statistiques',
    'censeur/profil.html': 'censeur_profil',
    'enseignant/tableau-de-bord.html': 'teacher_dashboard',
    'enseignant/mes-classes.html': 'teacher_classes',
    'enseignant/saisie-notes.html': 'teacher_saisie',
    'enseignant/ma-classe.html': 'teacher_ma_classe',
    'enseignant/rapports.html': 'teacher_rapports',
    'enseignant/profil.html': 'teacher_profil',
}

# Module -> roles autorises en LECTURE (acces.js).
# « direction » dispose des memes privileges que l'administrateur : on le
# retrouve donc partout ou figure « admin ». « surveillant » est charge de
# l'enregistrement des heures d'absences : il lit le tableau de bord, les
# eleves, les classes et l'assiduite (voir le menu dans js/core/routes.js).
LIRE = {
    'admin_dashboard': {'admin', 'direction', 'censeur', 'surveillant'},
    'admin_annees': {'admin', 'direction'},
    'admin_classes': {'admin', 'direction', 'censeur', 'surveillant'},
    'admin_matieres': {'admin', 'direction'},
    'admin_eleves': {'admin', 'direction', 'censeur', 'enseignant', 'surveillant'},
    'admin_personnel': {'admin', 'direction'},
    'admin_inscriptions': {'admin', 'direction'},
    'admin_migrations': {'admin', 'direction'},
    'admin_affectations': {'admin', 'direction'},
    'admin_notes': {'admin', 'direction', 'censeur', 'enseignant'},
    'admin_bulletins': {'admin', 'direction', 'censeur', 'enseignant'},
    'admin_statistiques': {'admin', 'direction', 'censeur'},
    'admin_assiduite': {'admin', 'direction', 'censeur', 'surveillant'},
    'admin_rapports': {'admin', 'direction', 'censeur'},
    'admin_vie_scolaire': {'admin', 'direction', 'censeur'},
    'admin_journal': {'admin', 'direction'},
    'admin_parametres': {'admin', 'direction'},
    'censeur_dashboard': {'censeur', 'admin', 'direction'},
    'censeur_vie_scolaire': {'censeur', 'admin', 'direction'},
    'censeur_assiduite': {'censeur', 'admin', 'direction', 'surveillant'},
    'censeur_eleves': {'censeur', 'admin', 'direction', 'surveillant'},
    'censeur_classes': {'censeur', 'admin', 'direction', 'surveillant'},
    'censeur_notes': {'censeur', 'admin', 'direction'},
    'censeur_rapports': {'censeur', 'admin', 'direction'},
    'censeur_statistiques': {'censeur', 'admin', 'direction'},
    'censeur_profil': {'censeur', 'admin', 'direction', 'surveillant'},
    'teacher_dashboard': {'enseignant'},
    'teacher_classes': {'enseignant'},
    'teacher_saisie': {'enseignant', 'admin', 'direction'},
    'teacher_rapports': {'enseignant', 'admin', 'direction'},
    'teacher_ma_classe': {'enseignant'},
    'teacher_profil': {'enseignant', 'admin', 'direction', 'censeur', 'surveillant'},
}

# Roles autorises a creer/modifier des comptes du personnel (section 8.2).
ROLES_GESTION_COMPTES = {'admin', 'direction'}

# Roles acceptes pour un compte de connexion.
ROLES_COMPTE = {'admin', 'direction', 'censeur', 'surveillant', 'enseignant'}


def accueil_pour(role):
    return 'enseignant/tableau-de-bord.html' if role == 'enseignant' else 'admin/tableau-de-bord.html'


def _session_compte(compte):
    email = ''
    if compte.enseignant_id:
        enseignant = models.Enseignant.objects.filter(id=compte.enseignant_id).first()
        if enseignant is not None:
            email = enseignant.email or ''
    return {
        'telephone': compte.telephone,
        'role': compte.role,
        'nom': compte.nom,
        'prenom': compte.prenom,
        'enseignantId': compte.enseignant_id or None,
        'email': email,
    }


def _json_body(request):
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except (ValueError, UnicodeDecodeError):
        return {}


# ---------------------------------------------------------------------------
# Service du front-end
# ---------------------------------------------------------------------------
# Types MIME explicites : sous Windows, mimetypes devine mal les fichiers web
# (.js servi en text/plain, ce qui fait refuser le script par le navigateur).
TYPES_MIME = {
    '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.map': 'application/json',
    '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
}


def _serve_asset(resolved):
    suffix = resolved.suffix.lower()
    content_type = TYPES_MIME.get(suffix)
    if content_type is None:
        content_type, _ = mimetypes.guess_type(str(resolved))
    response = FileResponse(open(resolved, 'rb'), content_type=content_type or 'application/octet-stream')
    return response


def _inject(html, session_json):
    bloc = (
        '<script>window.__EDUNEUM_SERVER__=true;'
        'window.__EDUNEUM_SESSION__=%s;</script>' % session_json
    )
    return re.sub(r'(?i)<head([^>]*)>', lambda m: '<head%s>%s' % (m.group(1), bloc), html, count=1)


@ensure_csrf_cookie
def serve_page(request, path):
    path = (path or '').replace('\\', '/').lstrip('/')
    if path == '':
        path = 'index.html'
    if path.endswith('/'):
        path += 'index.html'

    candidate = (ROOT / path)
    try:
        resolved = candidate.resolve()
    except OSError:
        raise Http404('Chemin invalide.')
    if resolved != ROOT and ROOT not in resolved.parents:
        raise Http404('Chemin invalide.')
    if not resolved.is_file():
        raise Http404('Fichier introuvable : %s' % path)

    if resolved.suffix.lower() != '.html':
        return _serve_asset(resolved)

    compte = request.user if request.user.is_authenticated else None

    if path == 'index.html':
        if compte is not None:
            return HttpResponseRedirect('/' + accueil_pour(compte.role))
        session = None
    else:
        if compte is None:
            return HttpResponseRedirect('/index.html?suite=' + path)
        module = PAGE_MODULES.get(path)
        if module is not None:
            autorises = LIRE.get(module, set())
            if compte.role not in autorises:
                return HttpResponseRedirect('/' + accueil_pour(compte.role))
        session = _session_compte(compte)

    html = resolved.read_text(encoding='utf-8')
    session_json = json.dumps(session, ensure_ascii=False)
    html = _inject(html, session_json)
    return HttpResponse(html, content_type='text/html; charset=utf-8')


# ---------------------------------------------------------------------------
# API : authentification
# ---------------------------------------------------------------------------
def _creer_otp(telephone):
    models.OTPCode.objects.filter(telephone=telephone, utilise=False).delete()
    code = '%06d' % random.randint(0, 999999)
    expire = timezone.now() + timedelta(seconds=getattr(settings, 'OTP_TTL_SECONDS', 300))
    models.OTPCode.objects.create(telephone=telephone, code=code, expire_le=expire)
    _envoyer_otp_sms(telephone, code)
    return code


def _envoyer_otp_sms(telephone, code):
    """Envoie le code OTP par SMS. Le code n'est jamais renvoye a l'interface.

    Si la passerelle est indisponible, le code est trace dans les journaux du
    serveur : le flux reste utilisable en developpement sans jamais exposer le
    code cote navigateur.
    """
    ttl = getattr(settings, 'OTP_TTL_SECONDS', 300)
    minutes = max(1, int(ttl) // 60)
    message = 'EduNeum : votre code de connexion est %s. Valable %d min.' % (code, minutes)
    ok, detail = sms.envoyer_sms(telephone, message)
    if not ok:
        logger.warning('OTP %s pour %s (SMS non envoye : %s)', code, telephone, detail)
    return ok


def _otp_obligatoire():
    """L'OTP est exige si la passerelle SMS est disponible (ou si la config le force)."""
    reglage = getattr(settings, 'OTP_OBLIGATOIRE', None)
    if reglage is not None:
        return bool(reglage)
    return sms.est_configure()


@csrf_exempt
@require_POST
def api_otp(request):
    data = _json_body(request)
    telephone = str(data.get('telephone') or '').strip()
    mot_de_passe = data.get('motDePasse') or ''
    if not telephone or not mot_de_passe:
        return JsonResponse({'ok': False, 'motif': 'Téléphone et mot de passe requis.'}, status=400)

    compte = models.Compte.objects.filter(telephone=telephone).first()
    if compte is None or not compte.check_password(mot_de_passe) or not compte.is_active:
        return JsonResponse(
            {'ok': False, 'motif': 'Compte inconnu ou mot de passe incorrect.'}, status=401)

    # Sans passerelle SMS (ou si l'OTP est desactive), connexion directe avec
    # telephone + mot de passe : aucun code n'est exige ni renvoye.
    if not _otp_obligatoire():
        return _reponse_connexion(compte, direct=True)

    _creer_otp(telephone)
    # Le code part par SMS via la passerelle Africa's Talking ; il est jamais
    # renvoye dans la reponse HTTP.
    return JsonResponse({'ok': True, 'telephone': telephone,
                         'ttl': getattr(settings, 'OTP_TTL_SECONDS', 300)})


def _reponse_connexion(compte, direct=False):
    """Emet les jetons JWT (cookies HttpOnly + corps JSON) et renvoie la
    session ainsi que la destination selon le role."""
    access, refresh = jwtauth.emettre_paire(compte)
    reponse = JsonResponse({
        'ok': True, 'direct': direct,
        'session': _session_compte(compte),
        'destination': accueil_pour(compte.role),
        'accessToken': access, 'refreshToken': refresh,
    })
    jwtauth.poser_cookies(reponse, access, refresh)
    return reponse


@csrf_exempt
@require_POST
def api_verify(request):
    data = _json_body(request)
    telephone = str(data.get('telephone') or '').strip()
    code = str(data.get('code') or '').strip()
    if not telephone or len(code) != 6:
        return JsonResponse({'ok': False, 'motif': 'Code invalide. Réessayez.'}, status=400)

    otp = models.OTPCode.objects.filter(telephone=telephone, utilise=False).first()
    if otp is None:
        return JsonResponse({'ok': False, 'motif': 'Aucun code en attente. Renvoyez un code.'}, status=400)
    if otp.expire_le < timezone.now():
        return JsonResponse({'ok': False, 'motif': 'Code expiré. Renvoyez un code.'}, status=400)
    if otp.tentatives >= getattr(settings, 'OTP_MAX_ATTEMPTS', 5):
        return JsonResponse({'ok': False, 'motif': 'Trop de tentatives. Renvoyez un code.'}, status=429)
    if otp.code != code:
        otp.tentatives += 1
        otp.save(update_fields=['tentatives'])
        return JsonResponse({'ok': False, 'motif': 'Code invalide. Réessayez.'}, status=401)

    otp.utilise = True
    otp.save(update_fields=['utilise'])

    compte = models.Compte.objects.filter(telephone=telephone).first()
    if compte is None or not compte.is_active:
        return JsonResponse({'ok': False, 'motif': 'Compte indisponible.'}, status=401)

    return _reponse_connexion(compte)


@csrf_exempt
@require_POST
def api_auth_refresh(request):
    """Renouvelle l'access token a partir du refresh token (cookie ou Bearer).

    Le refresh token est tourne : le jti precedent est marque revoque, un nouveau
    est emis, ce qui empeche toute reutilisation du jeton vole apres deconnexion.
    """
    jeton = request.COOKIES.get(jwtauth.COOKIE_REFRESH) or ''
    if not jeton:
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth[:7].lower() == 'bearer ':
            jeton = auth[7:].strip()
    charge = jwtauth.verifier(jeton, 'refresh')
    if charge is None:
        return JsonResponse({'ok': False, 'motif': 'Session expirée. Reconnectez-vous.'}, status=401)

    ligne = models.RefreshToken.objects.filter(jti=charge.get('jti')).select_related('compte').first()
    if ligne is None or ligne.expire_le < timezone.now():
        return JsonResponse({'ok': False, 'motif': 'Session expirée. Reconnectez-vous.'}, status=401)

    compte = ligne.compte
    if not compte.is_active:
        return JsonResponse({'ok': False, 'motif': 'Compte indisponible.'}, status=401)

    # Rotation : on revoque l'ancien jti et on en emet un nouveau.
    models.RefreshToken.objects.filter(jti=ligne.jti).delete()
    access, refresh = jwtauth.emettre_paire(compte)
    reponse = JsonResponse({
        'ok': True, 'session': _session_compte(compte),
        'destination': accueil_pour(compte.role),
        'accessToken': access, 'refreshToken': refresh,
    })
    jwtauth.poser_cookies(reponse, access, refresh)
    return reponse


@csrf_exempt
@require_POST
def api_logout(request):
    """Revoque le refresh token courant et efface les cookies de jeton."""
    jeton = request.COOKIES.get(jwtauth.COOKIE_REFRESH) or ''
    if jeton:
        charge = jwtauth.verifier(jeton, 'refresh')
        if charge and charge.get('jti'):
            models.RefreshToken.objects.filter(jti=charge['jti']).delete()
    reponse = JsonResponse({'ok': True})
    jwtauth.effacer_cookies(reponse)
    return reponse


# ---------------------------------------------------------------------------
# API : donnees
# ---------------------------------------------------------------------------
@never_cache
@require_GET
def api_bootstrap(request):
    if not request.user.is_authenticated:
        return JsonResponse({'ok': False, 'motif': 'Connexion requise.'}, status=401)
    return JsonResponse({
        'ok': True,
        'session': _session_compte(request.user),
        'db': snapshot.snapshot(),
    })


@csrf_exempt
@require_POST
def api_store(request):
    """Recoit l'instantane complet du navigateur et le restaure en base.

    Le controle d'acces est rejoue cote serveur : matrice des droits
    (refus par defaut), portee enseignant sur les notes, sequences
    verrouillees et annees cloturees. Toute violation est tracee au
    journal et refusee avec 403 — le navigateur ne peut plus forcer une
    ecriture en poussant un instantane qu'il a fabrique.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'ok': False, 'motif': 'Connexion requise.'}, status=401)
    data = _json_body(request)
    if not isinstance(data, dict) or 'classes' not in data:
        return JsonResponse({'ok': False, 'motif': 'Instantane invalide.'}, status=400)

    refus = droits.verifier_ecriture_instantane(request.user, data)
    if refus is not None:
        logger.warning(
            'Ecriture refusee (%s) : %s',
            request.user.telephone, refus.get('motif'))
        return JsonResponse(
            {'ok': False, 'motif': refus.get('motif') or 'Écriture refusée.'},
            status=403)

    try:
        snapshot.restore(data)
    except Exception as exc:  # pragma: no cover - defense en profondeur
        return JsonResponse({'ok': False, 'motif': str(exc)}, status=500)
    return JsonResponse({'ok': True, 'version': 4})


@csrf_exempt
@require_POST
def api_reset(request):
    """Remet a zero les donnees metier (eleves, notes, inscriptions...).

    Le jeu de demonstration n'est plus recharge : l'application doit partir
    de donnees vides. Les parametres, l'etablissement et les comptes sont
    conserves.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'ok': False, 'motif': 'Connexion requise.'}, status=401)
    if request.user.role not in ('admin', 'direction'):
        return JsonResponse({'ok': False, 'motif': 'Rôle non autorisé.'}, status=403)
    try:
        snapshot.wipe_business()
    except Exception as exc:  # pragma: no cover - defense en profondeur
        return JsonResponse({'ok': False, 'motif': str(exc)}, status=500)
    return JsonResponse({'ok': True, 'version': 4})


# ---------------------------------------------------------------------------
# API : comptes du personnel (creation/modification reserves aux admins)
# ---------------------------------------------------------------------------
def _telephone_normalise(brut):
    """Ramene un numero camerounais a sa forme locale (6XXXXXXXX)."""
    tel = re.sub(r'\s+', '', str(brut or ''))
    if tel.startswith('+'):
        tel = re.sub(r'^\+237', '', tel)
    return tel


def _telephone_valide(tel):
    return re.fullmatch(r'6\d{8}', tel) is not None


def _compte_json(compte):
    return {
        'enseignantId': compte.enseignant_id,
        'telephone': compte.telephone,
        'role': compte.role,
        'nom': compte.nom,
        'prenom': compte.prenom,
        'actif': compte.is_active,
    }


@csrf_exempt
def api_comptes(request):
    """Gestion des comptes de connexion du personnel.

    * GET  : liste des comptes existants (indicateur « a un compte » cote UI).
    * POST : cree ou met a jour le compte rattache a un membre du personnel.

    Reserve aux administrateurs (et a la direction, qui a les memes droits) :
    « seuls les admins peuvent creer des comptes au personnel ».
    """
    if not request.user.is_authenticated:
        return JsonResponse({'ok': False, 'motif': 'Connexion requise.'}, status=401)
    if request.user.role not in ROLES_GESTION_COMPTES:
        return JsonResponse(
            {'ok': False, 'motif': 'Seuls les administrateurs peuvent gérer les comptes du personnel.'},
            status=403)

    if request.method == 'GET':
        comptes = [_compte_json(c) for c in models.Compte.objects.all().order_by('nom', 'prenom')]
        return JsonResponse({'ok': True, 'comptes': comptes})

    if request.method != 'POST':
        return JsonResponse({'ok': False, 'motif': 'Méthode non autorisée.'}, status=405)

    data = _json_body(request)
    enseignant_id = str(data.get('enseignantId') or '').strip()
    if not enseignant_id:
        return JsonResponse({'ok': False, 'motif': 'Membre du personnel non précisé.'}, status=400)

    compte = models.Compte.objects.filter(enseignant_id=enseignant_id).first()

    # Desactivation (archivage du membre) : le compte ne permet plus de se connecter.
    if 'actif' in data and data.get('actif') is False:
        if compte is None:
            return JsonResponse({'ok': True, 'compte': None})
        compte.is_active = False
        compte.save(update_fields=['is_active'])
        return JsonResponse({'ok': True, 'compte': _compte_json(compte)})

    role = str(data.get('role') or '').strip()
    if role not in ROLES_COMPTE:
        return JsonResponse({'ok': False, 'motif': 'Rôle de compte invalide.'}, status=400)

    telephone = _telephone_normalise(data.get('telephone'))
    if not _telephone_valide(telephone):
        return JsonResponse(
            {'ok': False, 'motif': 'Numéro de téléphone invalide (format CM : 6XXXXXXXX).'}, status=400)

    mot_de_passe = data.get('motDePasse') or ''
    nom = str(data.get('nom') or '').strip()
    prenom = str(data.get('prenom') or '').strip()

    doublon = models.Compte.objects.filter(telephone=telephone).exclude(
        pk=compte.pk if compte else None).first()
    if doublon is not None:
        return JsonResponse({'ok': False, 'motif': 'Ce numéro est déjà utilisé par un autre compte.'}, status=409)

    if compte is None:
        if not mot_de_passe:
            return JsonResponse({'ok': False, 'motif': 'Un mot de passe est requis pour créer le compte.'}, status=400)
        compte = models.Compte(
            telephone=telephone, role=role, nom=nom, prenom=prenom,
            enseignant_id=enseignant_id, is_active=True,
            is_staff=False, is_superuser=False)
        compte.set_password(mot_de_passe)
        compte.save()
    else:
        compte.telephone = telephone
        compte.role = role
        compte.nom = nom or compte.nom
        compte.prenom = prenom or compte.prenom
        compte.is_active = True
        champs = ['telephone', 'role', 'nom', 'prenom', 'is_active']
        if mot_de_passe:
            compte.set_password(mot_de_passe)
            champs.append('password')
        compte.save(update_fields=champs)

    return JsonResponse({'ok': True, 'compte': _compte_json(compte)})


# ---------------------------------------------------------------------------
# API : changement de mot de passe par l'utilisateur connecte
# ---------------------------------------------------------------------------
@csrf_exempt
@require_POST
def api_mot_de_passe(request):
    """Permet a tout membre connecte de changer son propre mot de passe."""
    if not request.user.is_authenticated:
        return JsonResponse({'ok': False, 'motif': 'Connexion requise.'}, status=401)
    data = _json_body(request)
    actuel = data.get('actuel') or ''
    nouveau = data.get('nouveau') or ''
    if not request.user.check_password(actuel):
        return JsonResponse({'ok': False, 'motif': 'Mot de passe actuel incorrect.'}, status=400)
    if len(nouveau) < 6:
        return JsonResponse(
            {'ok': False, 'motif': 'Le nouveau mot de passe doit contenir au moins 6 caractères.'}, status=400)
    if nouveau == actuel:
        return JsonResponse(
            {'ok': False, 'motif': 'Le nouveau mot de passe doit être différent de l\'ancien.'}, status=400)
    request.user.set_password(nouveau)
    request.user.save(update_fields=['password'])
    # Avec JWT, le mot de passe change ne touche pas au jeton en cours : on
    # revoque les refresh tokens pour forcer une reconnexion propre partout.
    models.RefreshToken.objects.filter(compte=request.user).delete()
    return JsonResponse({'ok': True})
