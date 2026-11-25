# Livraison

Vos livreurs, leurs tournées et le suivi pour le client.

- **Identifiant** : `livraison` · version 1.0.0 · famille : equipement · disponible
- **Qui l'active** : personne : son état se lit sur le restaurant
- **Écoute** : `commande.prete`
- **Permissions** : `commandes:lire`

## Fichiers

- Savoir commercial : fiche `livraison` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
