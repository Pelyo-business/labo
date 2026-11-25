# Export comptable

Chiffre d'affaires par jour (par canal, par mode de paiement, par taux de TVA), annulations à part, total par mois, export CSV
pour l'expert-comptable. Prix provisoire : 6 € par mois, 14 jours offerts.

**À VALIDER PAR UN EXPERT-COMPTABLE** avant tout usage déclaratif : les taux de TVA par défaut (10 %) et la règle de date sont des
valeurs de départ raisonnables, pas un avis fiscal. Voir `docs/EXPORT-COMPTABLE.md`.

## Fonctionnement

- **Tout se calcule en base** : `compta_export(restaurant, debut, fin)` (JSON pour l'écran) et `compta_export_csv(...)` (le même
  chiffre en texte CSV). Les deux passent par les mêmes fonctions internes `prive.compta_*`, donc ne peuvent pas diverger.
- **Ce qui compte** : commandes `terminee`, au jour de leur remise dans le fuseau du restaurant, hors commandes d'essai.
  Annulations : jour d'annulation, hors chiffre d'affaires.
- **TVA** : prix TTC ; HT = TTC / (1 + taux), arrondi au centime par ligne de synthèse (jour, canal, paiement, taux). Taux par
  mode (`tva_retrait`, `tva_livraison`, réglages du manifeste), par catégorie de la carte (`compta_categories_taux`), frais de
  livraison au taux de la livraison.
- **Pourboires** : non gérés aujourd'hui.
- **Période** : de 1 à 366 jours.

## Fonctions du gérant (RPC)

`compta_export`, `compta_export_csv`, `compta_taux_regler`, `compta_categorie_regler`, `compta_categories`.
Écran : Gestion › Export comptable (feuille `compta` de `app-gerant.js`).
