# Commande par lien et QR code

Vos clients commandent depuis un lien ou un QR code, la commande arrive en cuisine.

- **Identifiant** : `lien_qr` · version 1.0.0 · famille : canaux · disponible
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Permissions** : `commandes:creer`, `carte:lire`, `restaurant:lire`
- **Réglages** : `max_par_heure` (1 à 60, 20 par défaut)

## Ce que ça fait

Chaque restaurant a une page publique à une adresse stable, `…/commander/<nom-du-restaurant>`, sans connexion ni compte.
Le client y voit la carte à jour (ruptures exclues), choisit ses options, compose un panier, donne son prénom et son
téléphone, et la commande arrive en cuisine comme les autres (à emporter, payée sur place au retrait). Le gérant imprime
le QR code et le colle en vitrine, sur les tables, sur les flyers.

## Garde-fous

Activé par le gérant (désactivé par défaut), pause possible, plafond par heure ; prix recalculés par la base ; ruptures,
choix obligatoires et suppléments contrôlés ; 20 lignes et 500 € au plus ; une commande rejouée n'est créée qu'une fois ;
3 commandes par heure et par téléphone ; limite par adresse réseau ; champ piège contre les robots.

## Fichiers

- Base : `supabase/migrations/20261202090000_origine_lien_qr.sql`
- Base : `supabase/migrations/20261202100000_module_lien_qr.sql`
- Tests : `supabase/tests/zzzzzzzzzzzzzzzzzzzzzzzzzzz_lien_qr.sql`
- Serveur : `supabase/functions/commande-lien`
- Page publique : `maquette/commander.html`, `maquette/404.html`, `maquette/src/commander.js`
- QR code (côté logiciel, sans service externe) : `maquette/src/pelyo-qr.js`
- Savoir commercial : fiche `lien-qr` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md` et `docs/COMMANDE-LIEN-QR.md`.
