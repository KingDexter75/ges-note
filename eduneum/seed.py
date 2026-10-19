"""Valeurs par defaut des reglages de l'application.

Ces valeurs sont reutilisees a la lecture de l'instantane : un enregistrement
partiel ne doit jamais laisser le front-end sans bareme d'appreciation ni
compteurs d'identifiants (pages vides). Aucune donnee de demonstration n'est
generee ici : le projet demarre vide et n'accepte que des donnees reelles.
"""

PARAMETRES_DEFAUT = {
    'etablissement': {'nom': 'Lycée Bilingue Example', 'sigle': 'LBE', 'logo': '', 'adresse': '', 'telephone': ''},
    'baremeAppreciationFrancophone': [
        {'min': 16, 'label': 'Excellent'}, {'min': 14, 'label': 'Très Bien'},
        {'min': 12, 'label': 'Bien'}, {'min': 10, 'label': 'Assez Bien'},
        {'min': 8, 'label': 'Passable'}, {'min': 0, 'label': 'Insuffisant'},
    ],
    'baremeCompetences': [
        {'min': 16, 'label': 'Excellent'}, {'min': 12, 'label': 'Acquis'},
        {'min': 8, 'label': "En cours d'acquisition"}, {'min': 0, 'label': 'Non Acquis'},
    ],
    'gceGradeScale': [
        {'min': 75, 'grade': 'A', 'label': 'Excellent'},
        {'min': 70, 'grade': 'B', 'label': 'Very Good'},
        {'min': 65, 'grade': 'C', 'label': 'Good'},
        {'min': 60, 'grade': 'D', 'label': 'Satisfactory'},
        {'min': 50, 'grade': 'E', 'label': 'Pass'},
        {'min': 0, 'grade': 'U', 'label': 'Fail'},
    ],
    'baremeAppreciation': [
        {'min': 16, 'label': 'Excellent travail'}, {'min': 14, 'label': 'Très bon travail'},
        {'min': 12, 'label': 'Bon travail'}, {'min': 10, 'label': 'Ensemble satisfaisant'},
        {'min': 8, 'label': 'Passable'}, {'min': 0, 'label': 'Insuffisant'},
    ],
    'moyennePassage': 10,
    'arrondi': 2,
    'sections': {
        'francophone': {'noteMax': 20, 'appreciationType': 'competences'},
        'anglophone': {'noteMax': 100, 'appreciationType': 'gce'},
    },
}

SEQUENCEUR_DEFAUT = {
    'eleve': 1, 'inscription': 1, 'affectation': 1, 'note': 1, 'migration': 1, 'absence': 1,
    'journal': 1, 'annee': 1, 'classe': 1, 'matiere': 1, 'enseignant': 1, 'pp': 1,
    'decision': 1, 'appreciation': 1, 'bulletinvalide': 1,
}
