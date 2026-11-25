# SMS aux clients

Les messages envoyés à vos clients (relances, confirmations).

- **Identifiant** : `sms` · version 1.0.0 · famille : equipement · bientôt
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Écoute** : `commande.confirmee`
- **Permissions** : `sms:envoyer`, `clients:lire`

## Fichiers

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
