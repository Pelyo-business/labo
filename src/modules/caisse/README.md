# Lien avec ma caisse

Les commandes de l’assistant arrivent directement dans votre caisse.

- **Identifiant** : `caisse` · version 1.0.0 · famille : equipement · bientôt
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Écoute** : `commande.confirmee`, `commande.annulee`, `commande.prete`, `commande.terminee`
- **Permissions** : `commandes:lire`

## Fichiers

- Savoir commercial : fiche `caisse` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
