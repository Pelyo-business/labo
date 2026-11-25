# Relance des habitués

Vos habitués recommandent en répondant OUI à un SMS.

- **Identifiant** : `fidelite` · version 1.0.0 · famille : modules · disponible
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Recommandé avec** : `sms`
- **Prix** : 24 € par mois, 14 jours d'essai · 150 SMS compris (provisoire)
- **Branché sur** : `gerant.clients`, `gerant.clic`, `cuisine.arrivee`
- **Écoute** : `commande.terminee`, `client.nouveau`
- **Permissions** : `clients:lire`, `restaurant:lire`, `commandes:modifier`, `sms:envoyer`

## Fichiers

- Interface : `index.js` (dans ce dossier)
- Savoir commercial : fiche `extensions` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
