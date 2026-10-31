# Instructions de travail sur la maquette Pelyo

Le dépôt privé `Pelyo-business/app` est la source de vérité. La branche de
référence du travail en cours est `dev`. Le dépôt public `Pelyo-business/labo`
est uniquement une sortie de déploiement automatique : ne jamais l'éditer.

## Points d'entrée

| Application | JavaScript | CSS | Page générée |
|---|---|---|---|
| Cuisine | `src/app-cuisine.js` | `src/cuisine.css` | `cuisine.html` |
| Gérant | `src/app-gerant.js` | `src/gerant.css` | `gerant.html` |

`index.html` est la source HTML commune. `cuisine.html`, `gerant.html`,
`demo.html` et `demo-cuisine.html` sont générés par `../outils/postes.sh` et ne
doivent jamais être modifiés à la main.

Il n'existe volontairement aucune copie `v1` ni aucun dossier d'anciennes
directions visuelles. Pour consulter ou restaurer une version antérieure,
utiliser l'historique Git.

## Règles obligatoires

1. Repartir de la dernière version distante de `dev` avant chaque phase de
   modification.
2. JavaScript ES5 strict : pas de `const`, `let`, fonction fléchée, template
   literal, spread, `for...of` ni `async/await`.
3. Toutes les classes Cuisine commencent par `.k-` et toutes les classes
   Gérant par `.g-`.
4. Ne jamais modifier `src/pelyo-donnees.js` ni `src/pelyo-config.js`.
5. Dans les fichiers `app-*.js`, préserver la logique de tous les passages
   contenant `reel` ou `PelyoDonnees`.
6. L'argent est stocké en centimes entiers et les durées en secondes.
7. Aucun bouton mort et aucun changement qui casse le téléphone ou la tablette.

## Workflow

Depuis la racine du dépôt :

```sh
git fetch origin dev
git switch -c codex/nom-de-la-tache origin/dev

# modifier les sources, puis :
bash outils/postes.sh
bash outils/verifier.sh
git diff --check

git add -A
git commit -m "Description du changement"
git push -u origin codex/nom-de-la-tache
```

Toutes les gardes doivent passer avant le push. Le travail est fusionné dans
`dev` par pull request ; cette fusion déclenche le déploiement automatique sur
<https://pelyo-business.github.io/labo/>.

## Vérification visuelle

- Cuisine : téléphone étroit, tablette 768 px et tablette 1180 px.
- Gérant : téléphone étroit, tablette 768 px et tablette 1180 px.
- Modes clair et sombre.
- Navigation, feuilles, boutons, formulaires et états vides.
- Aucun débordement horizontal et aucun texte illisible.
