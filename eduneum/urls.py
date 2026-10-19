from django.urls import path, re_path

from . import views

urlpatterns = [
    # API
    path('api/bootstrap/', views.api_bootstrap),
    path('api/store/', views.api_store),
    path('api/reset/', views.api_reset),
    path('api/auth/otp/', views.api_otp),
    path('api/auth/resend/', views.api_otp),
    path('api/auth/verify/', views.api_verify),
    path('api/auth/refresh/', views.api_auth_refresh),
    path('api/auth/logout/', views.api_logout),
    path('api/comptes/', views.api_comptes),
    path('api/mot-de-passe/', views.api_mot_de_passe),
    # Front-end (pages + ressources) : tout le reste.
    re_path(r'^(?P<path>.*)$', views.serve_page),
]
