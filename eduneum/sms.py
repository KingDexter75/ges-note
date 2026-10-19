"""Envoi de SMS via la passerelle Africa's Talking.

Le code OTP (et les notifications) sortent desormais par une vraie passerelle
au lieu d'etre seulement affiches. La configuration se fait par variables
d'environnement afin de ne jamais mettre de secret dans le depot :

* AT_USERNAME  : nom d'utilisateur Africa's Talking (obligatoire)
* AT_API_KEY   : cle API (obligatoire)
* AT_SENDER_ID : expediteur alphanumerique (facultatif, ex. « EduNeum »)
* AT_SANDBOX   : « 0 » pour la production ; par defaut, bac a sable
* SMS_PAYS     : indicatif pays par defaut (+237 Cameroun)

Le module n'utilise que la bibliotheque standard (urllib) : pas de dependance
supplementaire a installer.
"""
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

API_URL = 'https://api.africastalking.com/version1/messaging'
SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging'


def _config():
    return {
        'username': os.environ.get('AT_USERNAME', '').strip(),
        'api_key': os.environ.get('AT_API_KEY', '').strip(),
        'sender_id': os.environ.get('AT_SENDER_ID', '').strip(),
        'sandbox': os.environ.get('AT_SANDBOX', '1').strip().lower() not in ('0', 'false', 'non', ''),
        'pays': os.environ.get('SMS_PAYS', '+237').strip() or '+237',
    }


def est_configure():
    """Vrai si la passerelle possede le minimum requis pour envoyer."""
    c = _config()
    return bool(c['username'] and c['api_key'])


def normaliser_telephone(telephone, pays=None):
    """Retourne le numero au format E.164 (+2376xxxxxxxx) ou '' si invalide."""
    c = _config()
    pays = (pays or c['pays'])
    chiffres = ''.join(ch for ch in str(telephone or '') if ch.isdigit())
    if not chiffres:
        return ''
    if chiffres.startswith('00'):
        chiffres = chiffres[2:]
    indicatif = pays.lstrip('+')
    if chiffres.startswith(indicatif):
        return '+' + chiffres
    # Numero local prefixe d'un 0 (0 6 XX...) : on retire le 0.
    if len(chiffres) == 10 and chiffres.startswith('0') and chiffres[1] == '6':
        chiffres = chiffres[1:]
    # Numero local camerounais : 9 chiffres commencant par 6.
    if len(chiffres) == 9 and chiffres.startswith('6'):
        return '+' + indicatif + chiffres
    return '+' + chiffres


def envoyer_sms(telephone, message):
    """Envoie un SMS. Retourne ``(ok, detail)`` sans jamais lever d'exception.

    L'appelant (flux OTP) doit pouvoir poursuivre meme si la passerelle est
    indisponible ; le code reste trace dans les journaux du serveur.
    """
    destinataire = normaliser_telephone(telephone)
    if not destinataire:
        return False, 'Numero de telephone invalide.'

    c = _config()
    if not est_configure():
        logger.warning('SMS non envoye (passerelle non configuree) vers %s : %s',
                       destinataire, message)
        return False, 'Passerelle SMS non configuree (AT_USERNAME / AT_API_KEY).'

    url = SANDBOX_URL if c['sandbox'] else API_URL
    donnees = {'username': c['username'], 'to': destinataire, 'message': message}
    if c['sender_id']:
        donnees['from'] = c['sender_id']
    requete = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(donnees).encode('utf-8'),
        headers={
            'apiKey': c['api_key'],
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(requete, timeout=15) as reponse:
            corps = reponse.read().decode('utf-8', 'replace')
        logger.info('SMS envoye vers %s : %s', destinataire, corps[:200])
        return True, corps
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', 'replace')
        logger.error('Echec SMS vers %s (HTTP %s) : %s', destinataire, exc.code, detail[:200])
        return False, 'Erreur passerelle (%s).' % exc.code
    except (urllib.error.URLError, OSError) as exc:
        logger.error('Echec SMS vers %s : %s', destinataire, exc)
        return False, 'Passerelle SMS injoignable.'
