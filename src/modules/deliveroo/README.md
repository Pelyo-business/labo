# Deliveroo

Les commandes Deliveroo arrivent directement en cuisine.

- **Identifiant** : `deliveroo` · version 1.0.0 · famille : plateformes · disponible
- **Qui l'active** : le gérant, depuis la fiche (cycle `integration` : clé d'intégration, adresse de réception, essai, pause, changement de clé)
- **Permissions** : `commandes:creer`

## Fichiers

- Base : `supabase/migrations/20261109100000_commandes_plateformes.sql`, `supabase/migrations/20261204090000_plateformes_connexion.sql`
- Tests : `supabase/tests/zzzzzzzzzzzzzzzzzzz_commandes_plateformes.sql`, `supabase/tests/zzzzzzzzzzzzzzzzzzzzzzzzzzz_plateformes_connexion.sql`
- Serveur : `supabase/functions/commande-externe`
- Guide : `docs/PLATEFORMES.md` (ce qui est prêt, ce qui dépend d'un accord de Deliveroo)
- Savoir commercial : fiche `commandes-plateformes` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
