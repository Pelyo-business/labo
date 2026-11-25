# Commande par WhatsApp

Le client écrit ou envoie un vocal, Pelyo prend la commande.

- **Identifiant** : `whatsapp` · version 1.0.0 · famille : canaux · bientôt
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Permissions** : `commandes:creer`, `sms:envoyer`

## Fichiers

- Savoir commercial : fiche `whatsapp` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
