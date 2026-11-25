# Stock et ingrédients

Le gérant suit la quantité de ses ingrédients ; chaque commande les décompte ; un ingrédient épuisé met ses produits en
rupture tout seul, et ils reviennent au réapprovisionnement. Journal de chaque mouvement, alertes « bientôt en rupture ».
Prix provisoire : 12 € par mois, 14 jours offerts.

## Fonctionnement

- **Tables** (réservées au serveur) : `stock_ingredients` (quantité, unité, seuil, « coupé par le stock »), `stock_recettes`
  (quantité d'un ingrédient dans un produit, 1 par défaut), `stock_mouvements` (le journal), `stock_incidents`.
- **Événements** : le module écoute le bus (`commande.creee`, `.confirmee`, `.terminee`, `.annulee`), traité chaque minute par
  `prive.stock_traiter()` (tâche `pelyo-stock`). Une commande créée directement « confirmée » (ChatGPT, plateformes) n'émet pas
  `confirmee` : `creee` la remplace. Il ne lit jamais les commandes autrement que pour compter leurs lignes.
- **Idempotence** : un index unique `(commande_id, ingredient_id, type)` ; une commande ne décompte et ne remet en stock qu'une fois.
- **Rupture automatique** : `prive.stock_synchroniser` passe `carte_ingredients.disponible` à faux à zéro et le remet à vrai au
  réapprovisionnement, seulement si c'est le stock qui l'avait coupé (`coupe_par_stock`). Une rupture posée à la main n'est jamais levée.
- **Canaux** : `prive.produit_servable(produit)` (produit disponible, hors rupture, aucun ingrédient en rupture) est utilisée par
  ChatGPT (`assistant_ia_carte`, `assistant_ia_commander`). L'IA au téléphone la suivra à la mise en service du téléphone.
- **Réglages** (manifeste) : `decrementer_a` (confirmation ou remise), `auto_rupture`, `alerte_jours`.
- **Santé** : `sonde_stock` (ingrédients épuisés, bientôt épuisés, commandes non décomptées). **Désinstallation** : `nettoyer_stock`
  remet en vente ce que le stock avait coupé ; les quantités sont gardées.

## Fonctions du gérant (RPC)

`stock_lister`, `stock_suivre`, `stock_mouvement` (réappro, perte, inventaire), `stock_ingredient_regler`, `stock_arreter`,
`stock_recette_regler`, `stock_historique`. Écran : Gestion › Stock et ingrédients (feuille `stock` de `app-gerant.js`).

## Limites connues

Pas d'achats, de fournisseurs, de dates de péremption, de lots ni de valeur du stock en euros. Un produit modifié après sa confirmation
est décompté sur ses lignes au moment du traitement (dans la minute). Voir `docs/STOCK-INGREDIENTS.md`.
