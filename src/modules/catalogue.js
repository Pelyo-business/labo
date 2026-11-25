/* GÉNÉRÉ par outils/modules.py à partir des manifestes (maquette/src/modules/<id>/manifest.json).
   Ne pas modifier à la main : python3 outils/modules.py */
window.PelyoCatalogue = {
 "api": 1,
 "familles": [
  {
   "id": "canaux",
   "libelle": "Canaux de commande",
   "sous_titre": "Par où arrivent les commandes."
  },
  {
   "id": "plateformes",
   "libelle": "Plateformes",
   "sous_titre": "Leurs commandes arrivent directement en cuisine."
  },
  {
   "id": "equipement",
   "libelle": "Équipement",
   "sous_titre": "Ce qui relie la cuisine au reste."
  },
  {
   "id": "modules",
   "libelle": "Modules",
   "sous_titre": "À activer en un geste. 14 jours offerts, sans engagement."
  }
 ],
 "slots": {
  "cuisine.rythme": {
   "description": "Une section de la page Rythme de l'écran cuisine."
  },
  "cuisine.carte": {
   "description": "Un bloc de la page Carte de l'écran cuisine."
  },
  "cuisine.phraseIA": {
   "description": "Remplace une phrase que l'IA dit au client."
  },
  "cuisine.arrivee": {
   "description": "Reçoit une commande qui arrive (peut la modifier).",
   "permission": "commandes:modifier"
  },
  "cuisine.promesse": {
   "description": "Ajuste l'heure promise d'une commande.",
   "permission": "commandes:modifier"
  },
  "cuisine.etiquette": {
   "description": "Une étiquette sur la carte d'une commande."
  },
  "cuisine.clic": {
   "description": "Reçoit les gestes faits dans les blocs du module (écran cuisine)."
  },
  "gerant.clients": {
   "description": "Un bloc sous la liste des clients de l'espace gérant."
  },
  "gerant.clic": {
   "description": "Reçoit les gestes faits dans les blocs du module (espace gérant)."
  }
 },
 "permissions": {
  "restaurant:lire": {
   "description": "Lire le nom et les réglages publics du restaurant."
  },
  "carte:lire": {
   "description": "Lire la carte et les ruptures."
  },
  "cuisine:lire": {
   "description": "Lire le rythme de la cuisine (charge, capacité, délais)."
  },
  "clients:lire": {
   "description": "Lire les clients du restaurant."
  },
  "commandes:lire": {
   "description": "Lire les commandes."
  },
  "commandes:creer": {
   "description": "Créer des commandes."
  },
  "commandes:modifier": {
   "description": "Modifier une commande qui arrive (lignes, heure promise)."
  },
  "sms:envoyer": {
   "description": "Envoyer des SMS aux clients (compte dans le forfait)."
  }
 },
 "evenements": [
  "charge.changee",
  "client.nouveau",
  "commande.annulee",
  "commande.confirmee",
  "commande.creee",
  "commande.en_preparation",
  "commande.expiree",
  "commande.prete",
  "commande.terminee",
  "module.desinstalle",
  "module.installe",
  "module.pause",
  "rupture.changee"
 ],
 "contexte": {
  "toujours": [
   "esc",
   "eur",
   "icone",
   "interrupteur",
   "pas",
   "hhmm",
   "toast",
   "vibrer",
   "repeindre",
   "reel"
  ],
  "par_permission": {
   "carte": "carte:lire",
   "stockEffectif": "carte:lire",
   "categorieCoupee": "carte:lire",
   "charge": "cuisine:lire",
   "capacite": "cuisine:lire",
   "retraitOuvert": "cuisine:lire",
   "chargeEnCours": "cuisine:lire",
   "annonceRetrait": "cuisine:lire",
   "minuteurs": "cuisine:lire",
   "resto": "restaurant:lire",
   "nomResto": "restaurant:lire",
   "nbClients": "clients:lire",
   "lesClients": "clients:lire"
  }
 },
 "modules": [
  {
   "id": "ia_telephone",
   "version": "1.0.0",
   "api": 1,
   "famille": "canaux",
   "ordre": 10,
   "nom": "Prise de commande au téléphone",
   "accroche": "L’assistant répond aux appels et envoie la commande en cuisine.",
   "statut": "disponible",
   "cycle": "automatique",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": "ia_pelyo",
   "reglages": {},
   "permissions": [
    "commandes:creer"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [
    "commande.creee"
   ],
   "etat_source": "etat_ia_telephone",
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z",
    "canal": true,
    "info": "canaux",
    "lien": "routage",
    "lienTexte": "Gestion des appels"
   }
  },
  {
   "id": "assistant_ia",
   "version": "1.0.0",
   "api": 1,
   "famille": "canaux",
   "ordre": 20,
   "nom": "Commande par ChatGPT",
   "accroche": "Vos clients commandent depuis ChatGPT, la commande arrive en cuisine.",
   "statut": "disponible",
   "cycle": "gerant",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": "assistant_ia",
   "reglages": {
    "max_par_heure": {
     "type": "entier",
     "min": 1,
     "max": 60,
     "defaut": 6,
     "libelle": "Plafond de commandes par heure",
     "erreur": "Le plafond par heure va de 1 à 60."
    }
   },
   "permissions": [
    "commandes:creer",
    "carte:lire",
    "restaurant:lire"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [
    "commande.creee"
   ],
   "etat_source": null,
   "sonde": "sonde_assistant_ia",
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
    "canal": true,
    "pilote": true,
    "info": "chatgpt"
   }
  },
  {
   "id": "lien_qr",
   "version": "1.0.0",
   "api": 1,
   "famille": "canaux",
   "ordre": 25,
   "nom": "Commande par lien et QR code",
   "accroche": "Vos clients commandent depuis un lien ou un QR code, la commande arrive en cuisine.",
   "statut": "disponible",
   "cycle": "gerant",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": "lien_qr",
   "reglages": {
    "max_par_heure": {
     "type": "entier",
     "min": 1,
     "max": 60,
     "defaut": 20,
     "libelle": "Plafond de commandes par heure",
     "erreur": "Le plafond par heure va de 1 à 60."
    }
   },
   "permissions": [
    "commandes:creer",
    "carte:lire",
    "restaurant:lire"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [
    "commande.creee"
   ],
   "etat_source": null,
   "sonde": "sonde_lien_qr",
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
    "canal": true,
    "pilote": true,
    "info": "lien_qr"
   }
  },
  {
   "id": "whatsapp",
   "version": "1.0.0",
   "api": 1,
   "famille": "canaux",
   "ordre": 30,
   "nom": "Commande par WhatsApp",
   "accroche": "Le client écrit ou envoie un vocal, Pelyo prend la commande.",
   "statut": "bientot",
   "cycle": "gerant",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": null,
   "reglages": {},
   "permissions": [
    "commandes:creer",
    "sms:envoyer"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [
    "commande.creee"
   ],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M4 20l1.3-4A8 8 0 1 1 8 18.7zM9.5 9.5c.3 2.2 2.3 4.2 4.5 4.5"
   }
  },
  {
   "id": "uber_eats",
   "version": "1.0.0",
   "api": 1,
   "famille": "plateformes",
   "ordre": 40,
   "nom": "Uber Eats",
   "accroche": "Les commandes Uber Eats arrivent directement en cuisine.",
   "statut": "disponible",
   "cycle": "integration",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": "uber_eats",
   "reglages": {},
   "permissions": [
    "commandes:creer"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [
    "commande.creee"
   ],
   "etat_source": "etat_uber_eats",
   "sonde": "sonde_plateforme",
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2",
    "canal": true,
    "info": "plateformes",
    "equipe": false,
    "integration": {
     "nom": "Uber Eats",
     "intermediaires": [
      "HubRise",
      "Deliverect",
      "Otter"
     ],
     "accord": "Uber Eats ouvre l'accès à ses commandes sur autorisation (accord de confidentialité, licence d'API, partner manager, revue d'intégration). Le plus simple : passer par un intermédiaire qui relaie les commandes d'Uber Eats, Deliveroo et Just Eat vers Pelyo.",
     "etapes": [
      "Touchez « Brancher Uber Eats » : Pelyo vous remet une clé secrète, une seule fois. Copiez-la tout de suite.",
      "Dans l'outil qui relaie vos commandes (votre intermédiaire ou l'accès partenaire de la plateforme), choisissez d'envoyer les commandes à une adresse, et collez l'adresse de réception ci-dessous.",
      "Ajoutez la clé en en-tête de chaque envoi : Authorization: Bearer pelyo_…",
      "Revenez ici et touchez « Envoyer une commande d'essai » : elle doit arriver en cuisine, puis s'effacer."
     ]
    }
   }
  },
  {
   "id": "deliveroo",
   "version": "1.0.0",
   "api": 1,
   "famille": "plateformes",
   "ordre": 50,
   "nom": "Deliveroo",
   "accroche": "Les commandes Deliveroo arrivent directement en cuisine.",
   "statut": "disponible",
   "cycle": "integration",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": "deliveroo",
   "reglages": {},
   "permissions": [
    "commandes:creer"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [
    "commande.creee"
   ],
   "etat_source": "etat_deliveroo",
   "sonde": "sonde_plateforme",
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2",
    "canal": true,
    "info": "plateformes",
    "equipe": false,
    "integration": {
     "nom": "Deliveroo",
     "intermediaires": [
      "HubRise",
      "Deliverect",
      "Otter"
     ],
     "accord": "Deliveroo ouvre l'accès à ses commandes aux partenaires qu'elle autorise. Le plus simple : passer par un intermédiaire qui relaie les commandes d'Uber Eats, Deliveroo et Just Eat vers Pelyo.",
     "etapes": [
      "Touchez « Brancher Deliveroo » : Pelyo vous remet une clé secrète, une seule fois. Copiez-la tout de suite.",
      "Dans l'outil qui relaie vos commandes (votre intermédiaire ou l'accès partenaire de la plateforme), choisissez d'envoyer les commandes à une adresse, et collez l'adresse de réception ci-dessous.",
      "Ajoutez la clé en en-tête de chaque envoi : Authorization: Bearer pelyo_…",
      "Revenez ici et touchez « Envoyer une commande d'essai » : elle doit arriver en cuisine, puis s'effacer."
     ]
    }
   }
  },
  {
   "id": "just_eat",
   "version": "1.0.0",
   "api": 1,
   "famille": "plateformes",
   "ordre": 60,
   "nom": "Just Eat",
   "accroche": "Les commandes Just Eat arrivent directement en cuisine.",
   "statut": "disponible",
   "cycle": "integration",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": "just_eat",
   "reglages": {},
   "permissions": [
    "commandes:creer"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [
    "commande.creee"
   ],
   "etat_source": "etat_just_eat",
   "sonde": "sonde_plateforme",
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2",
    "canal": true,
    "info": "plateformes",
    "equipe": false,
    "integration": {
     "nom": "Just Eat",
     "intermediaires": [
      "HubRise",
      "Deliverect",
      "Otter"
     ],
     "accord": "Just Eat ouvre l'accès à ses commandes aux partenaires qu'elle autorise. Le plus simple : passer par un intermédiaire qui relaie les commandes d'Uber Eats, Deliveroo et Just Eat vers Pelyo.",
     "etapes": [
      "Touchez « Brancher Just Eat » : Pelyo vous remet une clé secrète, une seule fois. Copiez-la tout de suite.",
      "Dans l'outil qui relaie vos commandes (votre intermédiaire ou l'accès partenaire de la plateforme), choisissez d'envoyer les commandes à une adresse, et collez l'adresse de réception ci-dessous.",
      "Ajoutez la clé en en-tête de chaque envoi : Authorization: Bearer pelyo_…",
      "Revenez ici et touchez « Envoyer une commande d'essai » : elle doit arriver en cuisine, puis s'effacer."
     ]
    }
   }
  },
  {
   "id": "caisse",
   "version": "1.0.0",
   "api": 1,
   "famille": "equipement",
   "ordre": 70,
   "nom": "Lien avec ma caisse",
   "accroche": "Les commandes de l’assistant arrivent directement dans votre caisse.",
   "statut": "bientot",
   "cycle": "gerant",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": null,
   "reglages": {},
   "permissions": [
    "commandes:lire"
   ],
   "slots": [],
   "ecoute": [
    "commande.confirmee",
    "commande.annulee",
    "commande.prete",
    "commande.terminee"
   ],
   "emet": [],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M4 10h16v10H4zM7 10V5h10v5M8 14h2M14 14h2M8 17h8"
   }
  },
  {
   "id": "livraison",
   "version": "1.0.0",
   "api": 1,
   "famille": "equipement",
   "ordre": 80,
   "nom": "Livraison",
   "accroche": "Vos livreurs, leurs tournées et le suivi pour le client.",
   "statut": "disponible",
   "cycle": "automatique",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": null,
   "reglages": {},
   "permissions": [
    "commandes:lire"
   ],
   "slots": [],
   "ecoute": [
    "commande.prete"
   ],
   "emet": [],
   "etat_source": "etat_livraison",
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 18.5a1.5 1.5 0 1 0 .01 0M17.5 18.5a1.5 1.5 0 1 0 .01 0",
    "lien": "livraison",
    "lienTexte": "Retrait et livraison"
   }
  },
  {
   "id": "sms",
   "version": "1.0.0",
   "api": 1,
   "famille": "equipement",
   "ordre": 90,
   "nom": "SMS aux clients",
   "accroche": "Les messages envoyés à vos clients (relances, confirmations).",
   "statut": "bientot",
   "cycle": "gerant",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": null,
   "reglages": {},
   "permissions": [
    "sms:envoyer",
    "clients:lire"
   ],
   "slots": [],
   "ecoute": [
    "commande.confirmee"
   ],
   "emet": [],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M4 5h16v11H9l-5 4zM8 9h8M8 12h5"
   }
  },
  {
   "id": "fidelite",
   "version": "1.0.0",
   "api": 1,
   "famille": "modules",
   "ordre": 100,
   "nom": "Relance des habitués",
   "accroche": "Vos habitués recommandent en répondant OUI à un SMS.",
   "statut": "disponible",
   "cycle": "gerant",
   "prix": {
    "mensuel_cents": 2400,
    "essai_jours": 14,
    "inclus": "150 SMS compris"
   },
   "requiert": [],
   "recommande": [
    "sms"
   ],
   "origine": null,
   "reglages": {},
   "permissions": [
    "clients:lire",
    "restaurant:lire",
    "commandes:modifier",
    "sms:envoyer"
   ],
   "slots": [
    "gerant.clients",
    "gerant.clic",
    "cuisine.arrivee"
   ],
   "ecoute": [
    "commande.terminee",
    "client.nouveau"
   ],
   "emet": [],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": "index.js",
   "presentation": {
    "icone": "M4 5h16v11H9l-5 4zM9 10.5l2 2 4-4",
    "ou": "Activité › Clients",
    "scene": [
     [
      "sms",
      "Karim, comme d’hab ce soir ? Tacos L poulet + Coca, 12,50 €. Répondez OUI."
     ],
     [
      "client",
      "OUI"
     ],
     [
      "effet",
      "La commande arrive en cuisine, sans un appel"
     ]
    ],
    "etapes": [
     "Pelyo repère les habitués qui tardent à revenir.",
     "Il leur envoie leur commande habituelle par SMS.",
     "Un OUI, et la commande part en cuisine."
    ],
    "gain": {
     "nb": 32,
     "quoi": "commandes en plus",
     "eur": 610
    }
   },
   "stockage_historique": [
    "pelyo:gerant:commedhab",
    "pelyo:gerant:commedhab-conf"
   ]
  },
  {
   "id": "heures-de-pointe",
   "version": "1.0.0",
   "api": 1,
   "famille": "modules",
   "ordre": 110,
   "nom": "Anti-rush",
   "accroche": "Quand la cuisine déborde, l’IA propose une heure plus calme.",
   "statut": "disponible",
   "cycle": "gerant",
   "prix": {
    "mensuel_cents": 1200,
    "essai_jours": 14,
    "inclus": "Aucun SMS"
   },
   "requiert": [],
   "recommande": [
    "ia_telephone"
   ],
   "origine": null,
   "reglages": {},
   "permissions": [
    "cuisine:lire",
    "commandes:modifier"
   ],
   "slots": [
    "cuisine.rythme",
    "cuisine.clic",
    "cuisine.phraseIA",
    "cuisine.arrivee",
    "cuisine.promesse",
    "cuisine.etiquette"
   ],
   "ecoute": [
    "charge.changee",
    "commande.confirmee"
   ],
   "emet": [],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": "index.js",
   "presentation": {
    "icone": "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l3 2M9 2h6",
    "ou": "Écran cuisine › Rythme",
    "scene": [
     [
      "voix",
      "Il y a du monde : prêt dans 35 min, ou à 20 h 15 avec la boisson offerte. Vous préférez ?"
     ],
     [
      "client",
      "20 h 15, parfait"
     ],
     [
      "effet",
      "Le client reste, la cuisine souffle"
     ]
    ],
    "etapes": [
     "Dès 80 % de la capacité, l’IA le voit.",
     "Elle propose une heure plus calme, avec un petit geste.",
     "La cuisine lance la commande juste à temps."
    ],
    "gain": {
     "nb": 18,
     "quoi": "clients gardés pendant le rush",
     "eur": 340
    }
   }
  },
  {
   "id": "anti-gaspi",
   "version": "1.0.0",
   "api": 1,
   "famille": "modules",
   "ordre": 120,
   "nom": "Fin de service sans perte",
   "accroche": "Ce qui reste en fin de service se vend au lieu d’être jeté.",
   "statut": "disponible",
   "cycle": "gerant",
   "prix": {
    "mensuel_cents": 1400,
    "essai_jours": 14,
    "inclus": "100 SMS compris"
   },
   "requiert": [],
   "recommande": [
    "sms"
   ],
   "origine": null,
   "reglages": {},
   "permissions": [
    "carte:lire",
    "restaurant:lire",
    "clients:lire",
    "commandes:modifier",
    "sms:envoyer"
   ],
   "slots": [
    "cuisine.carte",
    "cuisine.clic",
    "cuisine.arrivee",
    "cuisine.etiquette"
   ],
   "ecoute": [
    "rupture.changee"
   ],
   "emet": [],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": "index.js",
   "presentation": {
    "icone": "M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7",
    "ou": "Écran cuisine › Carte",
    "scene": [
     [
      "sms",
      "Il reste 6 tacos ce soir, −30 % jusqu’à 22 h 30. Répondez OUI pour en réserver un."
     ],
     [
      "client",
      "OUI"
     ],
     [
      "effet",
      "4 tacos vendus au lieu de partir à la poubelle"
     ]
    ],
    "etapes": [
     "La cuisine signale ce qui reste, en deux gestes.",
     "Pelyo prévient vos habitués proches, ou tous vos clients.",
     "Ils réservent par SMS jusqu’à la fermeture."
    ],
    "gain": {
     "nb": 60,
     "quoi": "produits vendus au lieu d’être jetés",
     "eur": 290
    }
   }
  },
  {
   "id": "avis_google",
   "version": "1.0.0",
   "api": 1,
   "famille": "modules",
   "ordre": 130,
   "nom": "Plus d’avis Google",
   "accroche": "Après une commande réussie, un SMS demande un avis.",
   "statut": "bientot",
   "cycle": "gerant",
   "prix": null,
   "requiert": [
    "sms"
   ],
   "recommande": [],
   "origine": null,
   "reglages": {},
   "permissions": [
    "commandes:lire",
    "clients:lire",
    "sms:envoyer"
   ],
   "slots": [],
   "ecoute": [
    "commande.terminee"
   ],
   "emet": [],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
   }
  },
  {
   "id": "fiche_client",
   "version": "1.0.0",
   "api": 1,
   "famille": "modules",
   "ordre": 140,
   "nom": "Fiche client unique",
   "accroche": "Un même client reconnu sur tous vos canaux : ses habitudes, vos notes, son accord pour les SMS.",
   "statut": "disponible",
   "cycle": "automatique",
   "prix": null,
   "requiert": [],
   "recommande": [],
   "origine": null,
   "reglages": {},
   "permissions": [
    "clients:lire"
   ],
   "slots": [],
   "ecoute": [
    "commande.creee",
    "commande.confirmee",
    "commande.terminee",
    "commande.annulee"
   ],
   "emet": [],
   "etat_source": "etat_fiche_client",
   "sonde": "sonde_fiche_client",
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
    "info": "clients",
    "lien": "clients",
    "lienTexte": "Ouvrir les clients"
   }
  },
  {
   "id": "stock",
   "version": "1.0.0",
   "api": 1,
   "famille": "modules",
   "ordre": 150,
   "nom": "Stock et ingrédients",
   "accroche": "Vos ingrédients se décomptent tout seuls. Épuisé, le produit passe en rupture.",
   "statut": "disponible",
   "cycle": "gerant",
   "prix": {
    "mensuel_cents": 1200,
    "essai_jours": 14,
    "inclus": "Ingrédients, alertes et historique sans limite"
   },
   "requiert": [],
   "recommande": [],
   "origine": null,
   "reglages": {
    "decrementer_a": {
     "type": "choix",
     "valeurs": [
      "confirmee",
      "terminee"
     ],
     "defaut": "confirmee",
     "libelle": "Décompter à la confirmation ou à la remise de la commande",
     "erreur": "Choisissez « à la confirmation » ou « à la remise »."
    },
    "auto_rupture": {
     "type": "booleen",
     "defaut": true,
     "libelle": "Mettre automatiquement en rupture un ingrédient épuisé",
     "erreur": "Réglage invalide."
    },
    "alerte_jours": {
     "type": "entier",
     "min": 1,
     "max": 30,
     "defaut": 2,
     "libelle": "Prévenir quand il reste moins de … jours de stock",
     "erreur": "Le délai d'alerte va de 1 à 30 jours."
    }
   },
   "permissions": [
    "commandes:lire",
    "carte:lire"
   ],
   "slots": [],
   "ecoute": [
    "commande.creee",
    "commande.confirmee",
    "commande.terminee",
    "commande.annulee"
   ],
   "emet": [],
   "etat_source": null,
   "sonde": "sonde_stock",
   "nettoyage": "nettoyer_stock",
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
    "ou": "Gestion › Stock et ingrédients",
    "ia": false,
    "lien": "stock",
    "lienTexte": "Ouvrir le stock",
    "scene": [
     [
      "client",
      "Trois tacos poulet arrivent en cuisine."
     ],
     [
      "effet",
      "Le stock descend : poulet 4,2 kg, galettes 38."
     ],
     [
      "effet",
      "Plus de poulet : les tacos poulet passent en rupture tout seuls."
     ]
    ],
    "etapes": [
     "Vous indiquez ce que vous avez en stock, une fois.",
     "Chaque commande retire ce qu'elle a utilisé, selon vos recettes.",
     "Épuisé, l'ingrédient et les produits qui l'utilisent passent en rupture ; ils reviennent quand vous réapprovisionnez."
    ],
    "gain": {
     "nb": 8,
     "quoi": "commandes évitées sur un produit déjà épuisé",
     "eur": 150
    }
   }
  },
  {
   "id": "export_compta",
   "version": "1.0.0",
   "api": 1,
   "famille": "modules",
   "ordre": 160,
   "nom": "Export comptable",
   "accroche": "Votre chiffre d'affaires et votre TVA, jour par jour, prêts pour votre comptable.",
   "statut": "disponible",
   "cycle": "gerant",
   "prix": {
    "mensuel_cents": 600,
    "essai_jours": 14,
    "inclus": "Exports CSV et écran, sur la période de votre choix"
   },
   "requiert": [],
   "recommande": [],
   "origine": null,
   "reglages": {
    "tva_retrait": {
     "type": "choix",
     "valeurs": [
      "0",
      "2.1",
      "5.5",
      "10",
      "20"
     ],
     "defaut": "10",
     "libelle": "TVA sur les ventes à emporter",
     "erreur": "Taux possibles : 0, 2,1, 5,5, 10 ou 20 %."
    },
    "tva_livraison": {
     "type": "choix",
     "valeurs": [
      "0",
      "2.1",
      "5.5",
      "10",
      "20"
     ],
     "defaut": "10",
     "libelle": "TVA sur les ventes en livraison (et ses frais)",
     "erreur": "Taux possibles : 0, 2,1, 5,5, 10 ou 20 %."
    }
   },
   "permissions": [
    "commandes:lire"
   ],
   "slots": [],
   "ecoute": [],
   "emet": [],
   "etat_source": null,
   "sonde": null,
   "nettoyage": null,
   "desinstallation": "garder_reglages",
   "ui": null,
   "presentation": {
    "icone": "M6 3h9l4 4v14H6zM14 3v5h5M9 9h2M9 13h6M9 17h6",
    "ou": "Gestion › Export comptable",
    "ia": false,
    "lien": "compta",
    "lienTexte": "Ouvrir l'export comptable",
    "scene": [
     [
      "client",
      "Fin de mois : votre comptable réclame le chiffre d'affaires."
     ],
     [
      "effet",
      "Vous choisissez le mois et touchez « Télécharger le CSV »."
     ],
     [
      "effet",
      "Ventes par jour, par canal et par taux de TVA, annulations à part."
     ]
    ],
    "etapes": [
     "Vous vérifiez les taux de TVA (10 % par défaut, modifiables par catégorie).",
     "Vous choisissez la période : aujourd'hui, la semaine, le mois ou des dates précises.",
     "Vous touchez « Télécharger le CSV » et vous l'envoyez à votre comptable."
    ],
    "gain": {
     "nb": 2,
     "quoi": "heures de saisie évitées chaque mois",
     "eur": 60
    }
   }
  }
 ],
 "packs": [
  {
   "id": "kebab-tacos",
   "ordre": 10,
   "nom": "Kebab et tacos",
   "accroche": "Beaucoup d’appels au rush, des habitués, de la livraison.",
   "modules": [
    "heures-de-pointe",
    "fidelite",
    "anti-gaspi",
    "livraison",
    "uber_eats",
    "lien_qr"
   ]
  },
  {
   "id": "pizzeria",
   "ordre": 20,
   "nom": "Pizzeria",
   "accroche": "Les soirs de match et de week-end, sans perdre un appel.",
   "modules": [
    "heures-de-pointe",
    "fidelite",
    "livraison",
    "uber_eats",
    "deliveroo",
    "lien_qr"
   ]
  },
  {
   "id": "burger",
   "ordre": 30,
   "nom": "Burger",
   "accroche": "Des clients qui commandent partout, y compris depuis ChatGPT.",
   "modules": [
    "heures-de-pointe",
    "fidelite",
    "anti-gaspi",
    "assistant_ia",
    "uber_eats",
    "lien_qr"
   ]
  },
  {
   "id": "dark-kitchen",
   "ordre": 40,
   "nom": "Dark kitchen",
   "accroche": "Toutes les plateformes dans une seule cuisine.",
   "modules": [
    "uber_eats",
    "deliveroo",
    "just_eat",
    "heures-de-pointe",
    "caisse"
   ]
  },
  {
   "id": "zero-appel-rate",
   "ordre": 50,
   "nom": "Je ne rate plus d’appels",
   "accroche": "L’assistant répond, la cuisine garde le rythme.",
   "modules": [
    "ia_telephone",
    "heures-de-pointe",
    "whatsapp"
   ]
  },
  {
   "id": "plus-de-clients",
   "ordre": 60,
   "nom": "Plus de clients",
   "accroche": "Faire revenir vos habitués et attirer de nouveaux clients.",
   "modules": [
    "fidelite",
    "assistant_ia",
    "lien_qr",
    "anti-gaspi",
    "avis_google"
   ]
  }
 ],
 "questions": [
  {
   "id": "appels-rates",
   "ordre": 10,
   "texte": "Vous ratez des appels pendant le rush ?",
   "modules": [
    "heures-de-pointe"
   ],
   "pourquoi": "L’Anti-rush propose une heure plus calme au lieu de perdre le client."
  },
  {
   "id": "habitues",
   "ordre": 20,
   "texte": "Vous voulez faire revenir vos habitués ?",
   "modules": [
    "fidelite"
   ],
   "pourquoi": "Un SMS avec leur commande habituelle, un OUI suffit."
  },
  {
   "id": "gaspillage",
   "ordre": 30,
   "texte": "Vous jetez des produits en fin de service ?",
   "modules": [
    "anti-gaspi"
   ],
   "pourquoi": "Ce qui reste se vend par SMS au lieu d’être jeté."
  },
  {
   "id": "chatgpt",
   "ordre": 40,
   "texte": "Vous voulez que vos clients puissent commander depuis ChatGPT ?",
   "modules": [
    "assistant_ia"
   ],
   "pourquoi": "La commande arrive en cuisine comme les autres."
  },
  {
   "id": "lien-qr",
   "ordre": 45,
   "texte": "Vous voulez que vos clients commandent avec un QR code (vitrine, tables, flyers) ?",
   "modules": [
    "lien_qr"
   ],
   "pourquoi": "Une page de commande à vous, sans commission, la commande arrive en cuisine."
  },
  {
   "id": "plateformes",
   "ordre": 50,
   "texte": "Vous êtes sur Uber Eats, Deliveroo ou Just Eat ?",
   "modules": [
    "uber_eats",
    "deliveroo",
    "just_eat"
   ],
   "pourquoi": "Leurs commandes arrivent dans la même cuisine, branchées avec l’équipe Pelyo."
  },
  {
   "id": "avis",
   "ordre": 60,
   "texte": "Vous voulez plus d’avis Google ?",
   "modules": [
    "avis_google"
   ],
   "pourquoi": "Un SMS demande un avis après une commande réussie (bientôt)."
  }
 ]
};
