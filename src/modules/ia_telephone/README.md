# Prise de commande au téléphone

L’assistant répond aux appels et envoie la commande en cuisine.

- **Identifiant** : `ia_telephone` · version 1.0.0 · famille : canaux · disponible
- **Qui l'active** : personne : son état se lit sur le restaurant
- **Permissions** : `commandes:creer`

## Fichiers

- Base : `supabase/migrations/20261114090000_connexions.sql`
- Tests : `supabase/tests/zzzzzzzzzzzzzzzzzzzzzzzzz_connexions.sql`
- Serveur : `appel/serveur`
- Savoir commercial : fiche `trajet-appel` (`docs/assistant-commercial/savoir.md`)
- Savoir commercial : fiche `ce-que-sait-ia` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
