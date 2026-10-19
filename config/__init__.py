import pymysql

# Le pilote MySQL est fourni par PyMySQL (100 % Python, aucune compilation),
# expose comme MySQLdb pour que le backend "django.db.backends.mysql" l'utilise.
pymysql.install_as_MySQLdb()
