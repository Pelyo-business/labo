# Plus d’avis Google

Après une commande réussie, un SMS demande un avis.

- **Identifiant** : `avis_google` · version 1.0.0 · famille : modules · bientôt
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Requiert** : `sms`
- **Écoute** : `commande.terminee`
- **Permissions** : `commandes:lire`, `clients:lire`, `sms:envoyer`

## Fichiers

- Tests : `supabase/tests/zzzz_avis_google.sql`
- Serveur : `supabase/functions/avis-google`

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
