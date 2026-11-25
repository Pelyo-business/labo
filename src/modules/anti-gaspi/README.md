# Fin de service sans perte

Ce qui reste en fin de service se vend au lieu d’être jeté.

- **Identifiant** : `anti-gaspi` · version 1.0.0 · famille : modules · disponible
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Recommandé avec** : `sms`
- **Prix** : 14 € par mois, 14 jours d'essai · 100 SMS compris (provisoire)
- **Branché sur** : `cuisine.carte`, `cuisine.clic`, `cuisine.arrivee`, `cuisine.etiquette`
- **Écoute** : `rupture.changee`
- **Permissions** : `carte:lire`, `restaurant:lire`, `clients:lire`, `commandes:modifier`, `sms:envoyer`

## Fichiers

- Interface : `index.js` (dans ce dossier)
- Savoir commercial : fiche `extensions` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
