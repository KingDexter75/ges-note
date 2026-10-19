"""Authentification JWT (HS256) sans dependance externe.

Le venv ne contient ni PyJWT ni DRF : les jetons sont signes a la main avec
HMAC-SHA256 (bibliotheque standard). Deux jetons sont emis a la connexion :

* access  : TTL court (12 h par defaut), porte l'identite (telephone, role,
            enseignantId) ; vehicule en cookie HttpOnly ou `Authorization`.
* refresh : TTL long (7 j), porte un `jti` unique enregistre en base afin
            qu'une deconnexion puisse le revoquer reellement.

Les cookies HttpOnly empechent le vol de jeton par XSS ; SameSite=Lax
empeche les envois cross-site (equivalent CSRF pour nos POST).
"""
import base64
import hashlib
import hmac
import json
import secrets
import time

from django.conf import settings

COOKIE_ACCES = 'eduneum_access'
COOKIE_REFRESH = 'eduneum_refresh'


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _b64url_decode(texte):
    pad = '=' * (-len(texte) % 4)
    return base64.urlsafe_b64decode(texte + pad)


def _secret():
    return str(getattr(settings, 'JWT_SECRET', None) or settings.SECRET_KEY)


def _signer(entete, charge):
    donnees = ('%s.%s' % (entete, charge)).encode('ascii')
    return hmac.new(_secret().encode('utf-8'), donnees, hashlib.sha256).digest()


def emettre(compte, type_token='access'):
    """Produit un jeton signe pour `compte`. Renvoie (jeton, charge_utile)."""
    ttl = (getattr(settings, 'JWT_ACCESS_TTL_SECONDS', 43200) if type_token == 'access'
           else getattr(settings, 'JWT_REFRESH_TTL_SECONDS', 604800))
    maintenant = int(time.time())
    charge = {
        'sub': compte.telephone,
        'role': compte.role,
        'ens': compte.enseignant_id or '',
        'typ': type_token,
        'iat': maintenant,
        'exp': maintenant + ttl,
    }
    if type_token == 'refresh':
        charge['jti'] = secrets.token_hex(16)
    entete = _b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    corps = _b64url(json.dumps(charge, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    jeton = '%s.%s.%s' % (entete, corps, _b64url(_signer(entete, corps)))
    return jeton, charge


def verifier(jeton, type_token='access'):
    """Valide un jeton et renvoie sa charge, ou None si invalide/expire."""
    if not jeton or jeton.count('.') != 2:
        return None
    entete, corps, sig = jeton.split('.')
    try:
        if not hmac.compare_digest(sig, _b64url(_signer(entete, corps))):
            return None
        charge = json.loads(_b64url_decode(corps).decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return None
    if charge.get('typ') != type_token:
        return None
    if int(charge.get('exp') or 0) < int(time.time()):
        return None
    return charge


def poser_cookies(reponse, acces, refresh):
    reponse.set_cookie(
        COOKIE_ACCES, acces,
        max_age=getattr(settings, 'JWT_ACCESS_TTL_SECONDS', 43200),
        httponly=True, samesite='Lax', path='/')
    reponse.set_cookie(
        COOKIE_REFRESH, refresh,
        max_age=getattr(settings, 'JWT_REFRESH_TTL_SECONDS', 604800),
        httponly=True, samesite='Lax', path='/api/auth/')
    return reponse


def effacer_cookies(reponse):
    reponse.delete_cookie(COOKIE_ACCES, path='/')
    reponse.delete_cookie(COOKIE_REFRESH, path='/api/auth/')
    return reponse


def jeton_depuis_requete(request):
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if auth[:7].lower() == 'bearer ':
        return auth[7:].strip()
    return request.COOKIES.get(COOKIE_ACCES) or ''


def compte_depuis_requete(request):
    charge = verifier(jeton_depuis_requete(request), 'access')
    if not charge:
        return None
    from . import models
    return models.Compte.objects.filter(telephone=charge.get('sub'), is_active=True).first()


def emettre_paire(compte):
    """Produit access + refresh et enregistre le jti en base (revocable)."""
    from datetime import timedelta

    from django.utils import timezone

    from . import models
    access, _ = emettre(compte, 'access')
    refresh, charge = emettre(compte, 'refresh')
    models.RefreshToken.objects.filter(expire_le__lt=timezone.now()).delete()
    models.RefreshToken.objects.create(
        jti=charge['jti'], compte=compte,
        expire_le=timezone.now() + timedelta(
            seconds=getattr(settings, 'JWT_REFRESH_TTL_SECONDS', 604800)))
    return access, refresh
