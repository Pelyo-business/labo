# Maquette — les trois applications dans un téléphone

Prototype interactif de Pelyo. Les applications sont réellement cliquables et
partagent un socle technique commun sans partager leur identité visuelle.

Dernière version de travail : <https://pelyo-business.github.io/labo/>

Les anciennes interfaces ne sont plus copiées dans le dépôt. L'historique Git
est la seule archive afin qu'une IA ou un développeur ne confonde jamais une
ancienne proposition avec l'application actuelle.

> **Tu viens modifier la maquette ?** Lis `CONTRIBUER.md` d'abord.

## Refonte : trois applications, trois langues visuelles

L'interface héritée de devis60 a été entièrement remplacée. Chaque application
possède maintenant sa propre direction, directement matérialisée dans sa
feuille de style actuelle :

| Application | Direction | Principe |
|---|---|---|
| **Cuisine** | C · Tableau de production | Afficheur de gare. Un seul tableau, filets horizontaux, minuteurs géants en colonne, bouton plein en bout de ligne. **S'ouvre en tablette 1024 × 768 paysage.** |
| **Gérant** | B · Console silencieuse | Anthracite mat, accent cuivre. Un élément domine l'écran, le reste est relégué à faible opacité. Aucune bordure, aucun fond de bloc. |
| **Commercial** | A · Carte d'abord | La carte occupe tout l'écran, une feuille glissante à trois hauteurs porte la liste, une seule action flottante. |

### Ce qui rend la refonte possible

Le runtime **n'impose plus aucun chrome**. Chaque application dessine la
totalité de son écran dans une scène vide, avec sa propre feuille de style et
un **préfixe de classe obligatoire** — `k-` cuisine, `g-` gérant, `m-`
commercial. Aucune application ne peut repeindre une autre, même par accident.

## Fichiers

```
index.html              le châssis, la barre d'état, l'écran d'accueil
src/base.css            la scène, le châssis, l'écran d'accueil, le toast
                        — aucun composant applicatif
src/app.js              le runtime : accueil, ouverture d'appli, minuteurs
src/data.js             toutes les données, tirées du business plan v1.7
src/cuisine.css     + src/app-cuisine.js       ┐
src/gerant.css      + src/app-gerant.js        ├ une application = deux fichiers
src/commercial.css  + src/app-commercial.js    ┘
../worker/               relais IA du chat de ruptures (cuisine) — optionnel,
                        voir worker/README.md ; sans lui, repli local automatique
```

### Contrat d'une application

```js
RIA.register({
  id, nom, badge,          // l'icône sur l'écran d'accueil et sa pastille
  fond, encre, glyph,      // son apparence
  format,                  // "phone" ou "tablet" — le châssis s'adapte
  css,                     // sa feuille, chargée à l'ouverture
  monter: function(scene, api){ … return demonter; }
});
```

`api` fournit : `data`, `esc`, `eur`, `eur0`, `dur`, `chrono`, `norm`, `heure`,
`toast`, `fermer`, `vibrer`, `reduit`, `every`, `after`, `badge`, `ouvrir`.
Les minuteurs passés à `every` / `after` sont annulés automatiquement.

### Conventions

- **L'argent est en centimes entiers**, les durées en secondes — même règle que
  `resto-ia/supabase/migrations`.
- ES5 : `var` et `function`, pas de modules, pas de build.
- Les ressources portent un `?v=` : un rechargement simple suffit après une
  mise en ligne.
- `D.commandes[].total` **inclut déjà** les frais de livraison.

## Publication — le lien public

La dernière version de travail est en ligne ici :

**https://pelyo-business.github.io/labo/**

Le dépôt privé `Pelyo-business/app`, branche `dev`, reste la source de vérité.
Le déploiement du Labo est automatique après une fusion dans `dev`.

### Publier une modification

Depuis la racine du dépôt privé, avant chaque commit :

```
bash outils/postes.sh
bash outils/verifier.sh
```

Après fusion dans `dev`, GitHub Pages reconstruit le Labo en 30 à 60 secondes.

### Un domaine à soi

Pour remplacer l'adresse `github.io` par un vrai domaine (`maquette.restoia.fr`
par exemple) : acheter le domaine, puis Settings → Pages → Custom domain sur le
dépôt public. C'est gratuit côté GitHub.

## Reprendre le développement (avec une autre IA)

Tout est en clair, sans build : ouvrir le dossier, éditer, recharger.

- **Changer l'apparence d'une application** → sa feuille : `src/cuisine.css`,
  `src/gerant.css` ou `src/commercial.css`. Chacune est indépendante et
  préfixée ; `src/base.css` ne porte que le châssis.
- **Ajouter un écran à une application** → le fichier `src/app-*.js`
  correspondant, plus sa feuille. Chaque application est autonome : ses classes
  sont préfixées (`k-`, `g-`, `m-`), elle ne peut pas casser les deux autres.
- **Changer une donnée affichée** → `src/data.js`. Aucun chiffre ne doit être
  écrit en dur dans une application.
- **Ajouter une quatrième application** → créer `src/app-xxx.js` sur le même
  contrat (il se termine par `RIA.register({…})`), puis ajouter sa balise
  `<script>` dans `index.html`. Elle apparaît automatiquement sur l'écran
  d'accueil.
- **Tester** → `python3 -m http.server 8080` dans ce dossier (les modules ES
  ne se chargent pas en `file://`), puis `http://localhost:8080`.
- **Vérifier la syntaxe d'un module** →
  `cp src/app-gerant.js /tmp/t.mjs && node --check /tmp/t.mjs`.
