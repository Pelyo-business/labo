# Commande par ChatGPT

Vos clients commandent depuis ChatGPT, la commande arrive en cuisine.

- **Identifiant** : `assistant_ia` · version 1.0.0 · famille : canaux · disponible
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Permissions** : `commandes:creer`, `carte:lire`, `restaurant:lire`
- **Réglages** : `max_par_heure`

## Fichiers

- Base : `supabase/migrations/20261110100000_assistant_ia.sql`
- Base : `supabase/migrations/20261111090000_assistant_ia_verifier.sql`
- Tests : `supabase/tests/zzzzzzzzzzzzzzzzzzzz_assistant_ia.sql`
- Serveur : `supabase/functions/assistant-ia`
- Savoir commercial : fiche `connexions` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
