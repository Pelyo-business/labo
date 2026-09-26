# Maquette — les trois applications dans un téléphone

Prototype interactif de Resto IA. Un téléphone à l'écran, trois applications
réellement cliquables. Tout le contenu vient du business plan **v1.7**.

En ligne : <https://haydenrouet2104-web.github.io/resto-ia-maquette/>
Version précédente, pour comparaison : `/v1/` · Directions et audit : `/directions/`

> **Tu viens modifier la maquette ?** Lis `CONTRIBUER.md` d'abord.

## Refonte : trois applications, trois langues visuelles

L'interface héritée de devis60 a été entièrement remplacée. Le reproche était
juste et mesurable : 25 composants partagés par les trois applications, 163
`border-radius`, aucune hiérarchie. Trois directions ont été dessinées par
application (voir `/directions/`) ; celles-ci ont été retenues :

| Application | Direction | Principe |
|---|---|---|
| **Cuisine** | C · Tableau de production | Afficheur de gare. Un seul tableau, filets horizontaux, minuteurs géants en colonne, bouton plein en bout de ligne. **S'ouvre en tablette 1024 × 768 paysage.** |
| **Gérant** | B · Console silencieuse | Anthracite mat, accent cuivre. Un élément domine l'écran, le reste est relégué à faible opacité. Aucune bordure, aucun fond de bloc. |
| **Commercial** | A · Carte d'abord | La carte occupe tout l'écran, une feuille glissante à trois hauteurs porte la liste, une seule action flottante. |

### Ce qui rend la refonte possible

Le runtime **n'impose plus aucun chrome**. Avant, il fournissait à toutes les
applications la même barre de titre, la même barre d'onglets et la même barre
d'action : c'est mécaniquement ce qui produisait les composants partagés.
Désormais il ouvre une scène vide et chaque application y dessine la totalité
de son écran, avec sa propre feuille de style et un **préfixe de classe
obligatoire** — `k-` cuisine, `g-` gérant, `m-` commercial. Aucune application
ne peut repeindre une autre, même par accident.

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
v1/                     la version précédente, archivée telle quelle
directions/             l'audit et les neuf directions dessinées
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

La maquette est en ligne ici, et c'est l'adresse à partager :

**https://haydenrouet2104-web.github.io/resto-ia-maquette/**

Elle est servie par le dépôt **public** `haydenrouet2104-web/resto-ia-maquette`,
qui ne contient *que* ce dossier (aucun business plan, aucun autre projet).
Le dépôt privé `hayden-rouet` reste la source de vérité : on édite ici, on
publie là-bas.

### Publier une modification

Depuis la racine du dépôt privé, une fois les changements commités :

```
git remote add public https://github.com/haydenrouet2104-web/resto-ia-maquette.git   # une seule fois
git subtree push --prefix=resto-ia/maquette public main
```

GitHub Pages reconstruit en 30 à 60 secondes ; il suffit ensuite d'actualiser
la page. Aucun workflow GitHub Actions n'est ajouté, et l'intégration Git de
Cloudflare qui déploie `devis60` n'est pas touchée.

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
