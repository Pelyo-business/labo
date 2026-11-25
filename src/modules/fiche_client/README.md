# Fiche client unique

Un même client, reconnu par son numéro de téléphone sur tous les canaux (assistant vocal, caisse, plateformes, ChatGPT, page
publique), avec son historique, ses habitudes, les notes du gérant et son accord pour les SMS.

- **Famille** : modules, cycle `automatique` (inclus dans la base, rien à activer, toujours « connecté »).
- **Où** : espace gérant, Activité › Clients (liste, recherche, fiche, fusion, accord SMS, effacement).
- **Pour qui** : le gérant du restaurant, seulement pour son restaurant. Les tables ne sont lisibles par personne : tout passe par
  des fonctions qui vérifient le droit (`fiches_clients_lister`, `fiche_client_lire`, `fiche_client_ecrire`,
  `fiche_client_opposition`, `fiche_client_fusionner`, `fiche_client_effacer`).

## Comment ça marche

- **Clé** : le numéro normalisé (`telephone_normalise`) : `06 12 34 56 78`, `+33 6 12 34 56 78` et `0033612345678` sont la même
  fiche. Un numéro étranger sans indicatif reste séparé ; le gérant peut fusionner les deux fiches (la base propose les doublons
  probables : mêmes 9 derniers chiffres).
- **Mise à jour** : la fonction `prive.fiche_client_synchroniser` lit les événements `commande.*` du bus et recalcule les fiches
  touchées, une fois par minute (pg_cron) et à l'ouverture de la liste. Elle est idempotente : les chiffres sont recalculés depuis
  les commandes, jamais ajoutés un par un, et chaque événement n'est lu qu'une fois (`evenements_consommes`, consommateur
  `fiche_client`).
- **Ce qui compte** : les commandes prises (confirmée, en préparation, prête, terminée), hors commandes d'essai.
- **Habitudes** : jours et heures (fuseau du restaurant), canaux (par origine de commande), cinq produits les plus commandés.

## Données personnelles (RGPD)

- **Durée** : alignée sur le registre : les commandes sont anonymisées à 6 mois, la fiche disparaît 6 mois après la dernière
  commande (ménage de nuit `prive.fiche_client_nettoyer`). Les chiffres portent donc sur les 6 derniers mois.
- **Effacement** : `fiche_client_effacer` et l'écran existant « Ne plus reconnaître ce client » (`oublier_client`) anonymisent
  les commandes et suppriment la fiche.
- **Accord pour les SMS** : `fiche_client_opposition` enregistre le refus sur la fiche et dans `clients_oppositions`, sous forme
  d'une empreinte (jamais le numéro). Elle survit à l'effacement de la fiche. Les modules qui envoient des SMS doivent appeler
  `prive.client_sms_autorise(restaurant, numéro)` avant chaque envoi.
- **Notes** : texte libre du gérant, 1 000 caractères au plus. L'écran rappelle de ne pas y mettre de données de santé (les
  allergies restent dans les commandes).

## Fichiers

- Migration : `supabase/migrations/20261201090000_fiche_client.sql` (tables, fonctions, état, sonde, cron).
- Tests : `supabase/tests/zzzzzzzzzzzzzzzzzzzzzzzzzzzz_fiche_client.sql`.
- Écran : dans l'espace gérant (`maquette/src/app-gerant.js`, bloc « Fiche client unique »), car la liste des clients fait partie
  du noyau ; ce module apporte les données et les gestes.
- Fiche du savoir commercial : `fiche-client`.

Contrat : `manifest.json`. Voir `docs/ARCHITECTURE-MODULES.md`.
