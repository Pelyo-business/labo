# `maquette/` — le code des trois applications

Ce dossier contient les trois applications de Pelyo (cuisine, gérant, commercial). Le nom `maquette` est
historique : ce n'est plus une maquette, c'est le logiciel. Il est publié tel quel sur le labo
(https://pelyo-business.github.io/labo/).

- **Dernière version en ligne** : https://pelyo-business.github.io/labo/version.json (champ `affichage`).
- **Pour modifier** : lire `CONTRIBUER.md` d'abord, puis `../AGENTS.md`.
- **Design** : la charte est `../docs/CHARTE-DESIGN.md` (jamais de bouton plein ; l'orange est la seule couleur d'action).

## Les fichiers

```
index.html                  source HTML commune. Les pages cuisine.html, gerant.html, commercial.html, demo.html et
                            demo-cuisine.html sont GÉNÉRÉES par ../outils/postes.sh : ne jamais les éditer à la main
llms.txt, version.json      points d'entrée pour une IA (publiés à la racine du labo) ; version.json est écrit à chaque déploiement
sw.js                       service worker (cache, notifications)

src/app.js                  le socle : écran de chargement, ouverture d'une application, minuteurs
src/base.css                le socle visuel : scène, écran de chargement, transitions
src/pelyo-boot.js           le démarrage vérifié (code, appareil, ressources, version, session, données, écran)
src/pelyo-donnees.js        la connexion à la base Supabase (NE PAS MODIFIER)
src/pelyo-config.js         les adresses et clés publiques (NE PAS MODIFIER)
src/pelyo-ecran.js          le robot qui règle la taille d'affichage sur la tablette
src/pelyo-file.js           les actions de la cuisine gardées si le réseau coupe
src/pelyo-erreurs.js        remontée des erreurs vers la base

src/app-cuisine.js          + src/cuisine.css          l'écran de cuisine (préfixe de classes .k-)
src/cuisine-ops.js          règles locales de la cuisine (états, urgence, impression)
src/cuisine-fonctions.js    les pages « en savoir plus » des Réglages (le petit « i »)
src/pelyo-balance.js        la balance de portions
src/pelyo-tournee.js        le mode livreur : mission, navigation
src/pelyo-suivi.js          le suivi GPS du livreur
src/app-gerant.js           + src/gerant.css           l'espace gérant (préfixe .g-)
src/gerant-demarrage.js, src/gerant-comprendre.js     mise en route et explications du gérant
src/app-commercial.js       + src/commercial.css       l'application commerciale (préfixe .m-)
src/data.js                 les données de démonstration
src/modules.js, src/modules/  les modules optionnels (fidélité, anti-gaspillage, heures de pointe)
src/pelyo-notifications.js  les notifications
src/tirer-actualiser.js     le geste « tirer pour actualiser »
assets/                     logos, icônes, photos
```

## Règles de code (résumé)

- JavaScript **ES5** : `var` et `function`, pas de modules, pas de compilation.
- Préfixes de classes obligatoires : `.k-` cuisine, `.g-` gérant, `.m-` commercial.
- L'argent est en **centimes entiers**, les durées en secondes.
- Les ressources portent un `?v=` réécrit à chaque déploiement : un rechargement suffit après une mise en ligne.
- **Contrôles** avant tout envoi : `bash ../outils/postes.sh && bash ../outils/verifier.sh`.

## Publication

Le dépôt privé `Pelyo-business/app`, branche `dev`, est la source de vérité. Le déploiement du labo est
automatique après chaque envoi sur `dev`. Les trois étages (labo, test, production) sont décrits dans
`../docs/ENVIRONNEMENTS.md`.
