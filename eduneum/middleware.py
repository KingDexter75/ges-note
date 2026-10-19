"""Middleware d'authentification JWT.

Definit `request.user` a partir du jeton (cookie HttpOnly ou en-tete
Authorization: Bearer) pour que toutes les vues — qui verifient deja
`request.user.is_authenticated` — fonctionnent sans session Django.
"""
from . import jwtauth


class JWTAuthenticationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        compte = jwtauth.compte_depuis_requete(request)
        if compte is not None:
            request.user = compte
        return self.get_response(request)
