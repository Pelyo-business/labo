# Instructions de travail sur la maquette

> **Premier réflexe : dans quel dépôt es-tu ?**
>
> - Si l'URL du dépôt est **`haydenrouet2104-web/hayden-rouet`** (privé) → tu es
>   au bon endroit, continue.
> - Si l'URL du dépôt est **`haydenrouet2104-web/resto-ia-maquette`** (public) →
>   **n'édite rien ici.** Ce dépôt est un miroir de publication, écrasé à chaque
>   mise en ligne. Va travailler dans le dépôt privé, dossier
>   `resto-ia/maquette/`.

---

## 1. Comment le système fonctionne

```
        TU TRAVAILLES ICI                        CE QUE LE MONDE VOIT
  ┌──────────────────────────────┐          ┌────────────────────────────┐
  │  hayden-rouet   (PRIVÉ)      │          │  resto-ia-maquette (PUBLIC)│
  │                              │          │                            │
  │  resto-ia/maquette/  ────────┼─────────▶│  /  (le même dossier,      │
  │    index.html                │ subtree  │      à la racine)          │
  │    src/…                     │  push    │                            │
  │                              │          │            │               │
  │  resto-ia/docs/   (PRD…)     │          │            ▼               │
  │  devis60/         (autre     │          │     GitHub Pages           │
  │                    projet)   │          │     reconstruit 30–60 s    │
  └──────────────────────────────┘          └────────────────────────────┘
                                                         │
                                                         ▼
                        https://haydenrouet2104-web.github.io/resto-ia-maquette/
```

- Le **dépôt privé** est la source de vérité. Tout l'historique, le PRD, le
  schéma de base de données et la maquette y vivent ensemble.
- Le **dépôt public** ne contient que le dossier `maquette/`, remonté à sa
  racine. Il existe uniquement pour servir le site : Hayden actualise la page
  et voit les changements.
- La copie est **à sens unique** : privé → public. Un commit fait directement
  dans le public sera perdu et bloquera la publication suivante.

Le site est **entièrement statique** : pas de serveur, pas de base de données,
pas de compte, pas de clé d'API. Ce sont des fichiers ouverts par le navigateur.

## 2. À lire avant de toucher quoi que ce soit

1. `resto-ia/maquette/README.md` — l'architecture et le contrat d'une application.
   Il explique surtout **d'où vient la forme** : tout est repris de `devis60/`.
2. `resto-ia/maquette/directions/` — l'audit et les neuf directions dessinées.
   Les trois retenues (cuisine C, gérant B, commercial A) sont la référence
   visuelle : on ne s'en écarte pas sans raison.
3. `resto-ia/docs/prd.md` — la décision produit. Elle fait foi.
4. Le business plan le plus récent (`BUSINESS_PLAN_v1.7.pdf` chez Hayden) pour
   les chiffres. **Ne jamais inventer un chiffre** : tout ce qui s'affiche dans
   la maquette doit venir du business plan ou être une donnée d'exemple
   assumée (un nom de client, une adresse).

## 3. Où modifier quoi

Tous les chemins sont relatifs à `resto-ia/maquette/` dans le dépôt privé.

| Ce que tu veux changer | Le fichier à ouvrir | À ne pas toucher |
|---|---|---|
| Un écran, un onglet, une animation de l'app **gérant** | `src/app-gerant.js` | les deux autres apps |
| Idem pour l'app **cuisine** | `src/app-cuisine.js` | les deux autres apps |
| Idem pour l'app **commercial** | `src/app-commercial.js` | les deux autres apps |
| Un prix, un menu, un prospect, un forfait, un texte de règle | `src/data.js` | ne jamais écrire un chiffre en dur dans une app |
| L'apparence de l'app **cuisine** | `src/cuisine.css` | les deux autres feuilles |
| Idem **gérant** | `src/gerant.css` | les deux autres feuilles |
| Idem **commercial** | `src/commercial.css` | les deux autres feuilles |
| L'écran d'accueil, l'ouverture d'appli, les toasts, le châssis | `src/app.js`, `src/base.css` | |
| Le châssis, la barre d'état | `index.html` | |

**Ajouter une quatrième application** : créer `src/app-xxx.js` sur le même
contrat que les trois autres (il se termine par un `RIA.register({…})`), puis
ajouter sa balise `<script>` dans `index.html`. Elle apparaît automatiquement
sur l'écran d'accueil.

## 4. Les règles qui ne se négocient pas

1. **Chaque application a sa feuille et son préfixe : `k-` cuisine, `g-`
   gérant, `m-` commercial.** Une classe sans préfixe dans un fichier
   d'application est un bug. `src/base.css` ne contient que le châssis et
   l'écran d'accueil : aucun composant applicatif n'y entre, sinon les trois
   applications recommencent à se ressembler — c'est précisément ce que la
   refonte a supprimé.
2. **ES5 uniquement, comme devis60** : `var` et `function`, pas de `const`
   ni `let`, pas de fonction fléchée, pas de gabarit `` `…` ``, pas de module
   ES. Les fichiers sont chargés par des `<script>` classiques.
3. **L'argent est en centimes entiers, les durées en secondes.** Comme le
   schéma `resto-ia/supabase/migrations`. Les euros et les minutes sont
   calculés à l'affichage, avec les fonctions de `fmt` dans `src/data.js`.
4. **Aucun bouton mort.** Si un bouton existe, il fait quelque chose de
   visible. Une maquette dont la moitié des boutons ne répondent pas ne sert
   à rien pour montrer le produit.
5. **Tous les minuteurs passent par `RIA.every()` et `RIA.after()`.** Ils sont
   annulés automatiquement quand on change d'onglet ou qu'on ferme l'appli. Un
   `setInterval` direct continue de tourner et finit par faire ramer la page.
6. **`prefers-reduced-motion` est respecté** : `api.reduit()` sert à couper
   les animations longues.
7. **Ne pas toucher `devis60/` ni `wrangler.toml` à la racine.** C'est un autre
   projet, déployé automatiquement sur Cloudflare à chaque push sur la branche
   par défaut. En particulier : ne jamais éditer `devis60/src/app-html.js`,
   c'est une chaîne JavaScript de 175 000 signes qui casse le Worker au moindre
   faux pas.
8. **Toute modification d'un fichier de `src/` incrémente le `?v=` dans
   `index.html`** — tous les scripts et `base.css`, d'un coup.
   Les navigateurs gardent l'ancienne version sinon, et on se retrouve avec un
   noyau périmé qui fait tourner du code neuf : l'appli casse à l'écran sans
   qu'aucun fichier soit en cause.
9. **Pas de workflow GitHub Actions.** GitHub Pages sert la branche
   directement, et Cloudflare a déjà son intégration Git. Un workflow ferait
   doublon.

## 5. La boucle de travail, pas à pas

```bash
# 1. toujours repartir de l'état à jour
git checkout claude/coding-capabilities-iqz2jp && git pull

# 2. travailler sur une branche
git checkout -b claude/ma-modification

# 3. éditer les fichiers concernés (voir le tableau du §3)

# 4. essayer pour de vrai
cd resto-ia/maquette && python3 -m http.server 8080
#    puis ouvrir http://localhost:8080 et cliquer partout
#    (après une modification : recharge en forçant, ou incrémente le ?v= d'index.html)

# 5. vérifier la syntaxe de chaque fichier modifié
node --check src/app-gerant.js

# 6. commiter
git add -A && git commit -m "…"

# 7. pousser le dépôt privé (le travail)
git push -u origin claude/ma-modification

# 8. publier le site (une fois la modification validée et fusionnée)
git subtree push --prefix=resto-ia/maquette public main
```

Le remote `public` se crée une seule fois :

```bash
git remote add public https://github.com/haydenrouet2104-web/resto-ia-maquette.git
```

## 6. Checklist avant de publier

- [ ] La page s'ouvre sans **aucune erreur** dans la console du navigateur.
- [ ] Les **trois** applications s'ouvrent et se ferment (barre d'accueil en bas).
- [ ] Les onglets de chaque application s'affichent tous.
- [ ] Ça tient à **375 px de large** (outils de développement, mode téléphone).
- [ ] Aucun chiffre inventé : tout vient du business plan ou de `data.js`.
- [ ] `node --check` passe sur chaque fichier modifié.
- [ ] Aucune classe CSS inventée, aucun `<style>`, aucun `const`/`let`/fléchée.
- [ ] Le `?v=` d'`index.html` a été incrémenté.

## 7. Pièges connus

- **Un `<svg>` sans `width`/`height` occupe 300 × 150 px** et fait éclater son
  conteneur. `RIA.svg()` pose une taille par défaut ; si tu écris un `<svg>` à
  la main, donne-lui la sienne.
- **Une enveloppe `.docsheetOv` laissée en permanence dans le DOM floute tout
  l'écran** : la couche de production lui applique un `backdrop-filter`.
  `RIA.sheet()` la crée puis la retire, comme le fait devis60.
- **Le site semble ne pas se mettre à jour** : GitHub Pages met 30 à 60
  secondes à reconstruire, et le navigateur garde l'ancienne version en cache.
  Recharger en forçant (Cmd+Shift+R).
- **`git subtree push` refusé** : quelqu'un a commité directement dans le
  dépôt public. Le contenu du public n'a aucune valeur, on le remplace :
  ```bash
  git push public `git subtree split --prefix=resto-ia/maquette HEAD`:main --force
  ```
- **Une appli ne s'ouvre pas** : regarde la console. Une erreur dans un
  `src/app-*.js` empêche son `RIA.register()` de s'exécuter, et son icône
  disparaît simplement de l'écran d'accueil.
