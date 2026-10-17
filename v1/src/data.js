/* =========================================================================
   Resto IA — données de la maquette, tirées du business plan v1.7.
   Même convention que resto-ia/supabase : l'argent est en CENTIMES entiers,
   les durées d'appel en SECONDES. ES5, une seule variable globale.
   ========================================================================= */
var D = {

  resto: {
    nom:"Snack Le Comptoir",
    adresse:"12 rue Garibaldi, Lyon 7e",
    tel:"04 78 •• •• 12",
    assistant:"Sofiane",
    forfait:"pro",
    minutes:147,
    charge:"rush"
  },

  /* §3 — niveaux de charge du service */
  charges: [
    { id:"normal", nom:"Normal",             delai:15, pill:"signe",   dit:"Délai annoncé sans commentaire." },
    { id:"rush",   nom:"Rush",               delai:30, pill:"attente", dit:"L'IA demande si le délai convient avant d'enregistrer." },
    { id:"charge", nom:"Très chargé",        delai:45, pill:"refuse",  dit:"Choix séparé de garder ou non le retrait et la livraison." },
    { id:"stop",   nom:"Commandes stoppées", delai:0,  pill:"refuse",  dit:"Plus aucune commande. L'IA indique l'heure de reprise." }
  ],

  /* §7 — forfaits */
  forfaits: [
    { id:"payg",  nom:"PAYG",         prix:0,     minutes:0,    dep:49, note:"Commission 10 % du CA" },
    { id:"basic", nom:"Basic",        prix:3200,  minutes:100,  dep:45, note:"Coût IA ≈ 12 €" },
    { id:"pro",   nom:"Pro",          prix:6600,  minutes:300,  dep:35, note:"Coût IA ≈ 36 €" },
    { id:"biz",   nom:"Business",     prix:10000, minutes:500,  dep:28, note:"Coût IA ≈ 60 €" },
    { id:"big",   nom:"Big Business", prix:25000, minutes:1500, dep:20, note:"Coût IA 100 à 180 €" }
  ],
  coutMinute: 12,      /* centimes par minute d'appel */
  commission: 750,     /* centimes par mois et par client actif */

  /* §3 — voix de l'assistant */
  voix: {
    prenom:"Sofiane",
    ton:"dynamique",
    vitesse:"normale",
    langues:["Français","Arabe"],
    accueil:"Bonsoir, assistant vocal automatisé du Comptoir, je prends votre commande ?",
    signature:false
  },
  tons: ["chaleureux","dynamique","professionnel","de quartier"],
  vitesses: ["lente","normale","rapide"],

  /* §3 — menu intelligent */
  menu: [
    { cat:"Tacos", items:[
      { id:"tacos-m", nom:"Tacos M", prix:950, dispo:true, pop:true,
        inclus:"Frites et une boisson incluses",
        obl:[ {nom:"Taille", min:1, max:1, choix:"M"},
              {nom:"Viande", min:1, max:1, choix:"Poulet · Kebab · Merguez · Cordon bleu · Steak haché"},
              {nom:"Sauce",  min:1, max:2, choix:"Algérienne · Blanche · Samouraï · Biggy · Harissa"} ],
        sup:[ {nom:"Cheddar",prix:100,dispo:true}, {nom:"Boursin",prix:100,dispo:false},
              {nom:"Double viande",prix:200,dispo:true}, {nom:"Boisson 1,5 L",prix:200,dispo:true} ],
        prec:"Halal · contient gluten, lait",
        dem:"Sans oignons · sauce à part · frites sans sel · bien cuit" },
      { id:"tacos-l", nom:"Tacos L — 2 viandes", prix:1200, dispo:true,
        inclus:"Frites et une boisson incluses",
        obl:[ {nom:"Viandes", min:2, max:2, choix:"Poulet · Kebab · Merguez · Cordon bleu"},
              {nom:"Sauce",   min:1, max:2, choix:"Algérienne · Blanche · Samouraï · Biggy"} ],
        sup:[ {nom:"Cheddar",prix:100,dispo:true}, {nom:"Triple viande",prix:300,dispo:true} ],
        prec:"Halal", dem:"Sans oignons · sauce à part" }
    ]},
    { cat:"Sandwichs & burgers", items:[
      { id:"kebab-xl", nom:"Kebab XL", prix:900, dispo:true, pop:true, inclus:"",
        obl:[ {nom:"Pain",  min:1, max:1, choix:"Galette · Pain kebab · Assiette"},
              {nom:"Sauce", min:1, max:2, choix:"Blanche · Harissa · Samouraï · Ketchup"} ],
        sup:[ {nom:"Cheddar",prix:100,dispo:true}, {nom:"Frites dedans",prix:150,dispo:true} ],
        prec:"Halal", dem:"Sans oignons · sans crudités" },
      { id:"burger", nom:"Burger maison", prix:1050, dispo:true, inclus:"Frites incluses",
        obl:[ {nom:"Cuisson", min:1, max:1, choix:"À point · Bien cuit"} ],
        sup:[ {nom:"Bacon de dinde",prix:150,dispo:true}, {nom:"Œuf",prix:100,dispo:true} ],
        prec:"Contient gluten, lait, œufs", dem:"Sans cornichons · sauce à part" }
    ]},
    { cat:"Pizzas", items:[
      { id:"4from", nom:"Pizza 4 fromages", prix:1150, dispo:true, inclus:"",
        obl:[ {nom:"Base",   min:1, max:1, choix:"Tomate · Crème"},
              {nom:"Taille", min:1, max:1, choix:"Moyenne · Grande"} ],
        sup:[ {nom:"Bien cuite",prix:0,dispo:true}, {nom:"Piment",prix:0,dispo:true} ],
        prec:"Végétarien · contient gluten, lait", dem:"Bien cuite · coupée en 8" },
      { id:"merguez", nom:"Pizza merguez", prix:1250, dispo:false, inclus:"",
        obl:[ {nom:"Base", min:1, max:1, choix:"Tomate"} ],
        sup:[], prec:"Halal", dem:"" }
    ]},
    { cat:"À côté", items:[
      { id:"frites", nom:"Frites", prix:350, dispo:true, inclus:"",
        obl:[ {nom:"Taille", min:1, max:1, choix:"Petite · Grande"} ],
        sup:[ {nom:"Cheddar fondu",prix:150,dispo:true} ], prec:"", dem:"Sans sel" },
      { id:"tiramisu", nom:"Tiramisu maison", prix:300, dispo:true, inclus:"",
        obl:[], sup:[], prec:"Contient lait, œufs, gluten", dem:"" },
      { id:"boisson", nom:"Boisson 33 cl", prix:180, dispo:true, inclus:"",
        obl:[ {nom:"Parfum", min:1, max:1, choix:"Oasis tropical · Coca · Ice Tea · Eau"} ],
        sup:[], prec:"", dem:"" }
    ]}
  ],

  /* §4 — commandes en cuisine. etat : appel | attente | confirmee | preparation | prete | expiree */
  commandes: [
    { id:251, etat:"appel", mode:"retrait", heure:"19:44", client:"", depuis:38,
      lignes:[], total:0, paiement:"", imprime:false },
    { id:250, etat:"attente", mode:"livraison", heure:"19:43", client:"Karim", expire:64,
      adresse:"8 rue Jaboulay, bât. B, 3e étage, digicode 47A29", km:2.1,
      lignes:[ {q:2, nom:"Kebab XL", opt:"Galette · sauce blanche", dem:"Sans oignons", prix:1800},
               {q:1, nom:"Frites", opt:"Grande", dem:"", prix:350} ],
      total:2400, frais:250, paiement:"Carte au livreur", imprime:false },
    { id:248, etat:"confirmee", mode:"retrait", heure:"19:41", prete:"19:48", client:"Sarah",
      lignes:[ {q:1, nom:"Tacos M", opt:"Poulet · sauce algérienne · frites + Oasis", dem:"", sup:"Cheddar", prix:1050} ],
      total:1050, paiement:"Sur place", imprime:false },
    { id:247, etat:"preparation", mode:"livraison", heure:"19:38", prete:"20:05", client:"Mehdi",
      adresse:"24 av. Berthelot, 1er étage", km:3.4,
      lignes:[ {q:1, nom:"Pizza 4 fromages", opt:"Crème · grande", dem:"Bien cuite", prix:1150},
               {q:1, nom:"Tiramisu maison", opt:"", dem:"", prix:300} ],
      total:1700, frais:250, paiement:"Espèces au livreur", imprime:true },
    { id:245, etat:"prete", mode:"retrait", heure:"19:30", prete:"19:45", client:"Yanis",
      lignes:[ {q:3, nom:"Burger maison", opt:"Bien cuit", dem:"Sans cornichons · sauce à part", prix:3150} ],
      total:3150, paiement:"Sur place", imprime:true },
    { id:244, etat:"expiree", mode:"retrait", heure:"19:26", client:"",
      lignes:[ {q:1, nom:"Tacos L — 2 viandes", opt:"Poulet + kebab · samouraï", dem:"", prix:1200} ],
      total:1200, paiement:"", imprime:false, motif:"Aucune validation du client" }
  ],

  /* §2 — l'appel de démonstration, seconde par seconde */
  appel: [
    { t:2,  qui:"bot", txt:"Bonsoir ! Vous êtes en ligne avec l'assistant vocal automatisé du Comptoir. Je prends votre commande ?" },
    { t:11, qui:"me",  txt:"Ouais bonsoir, je voudrais un tacos M poulet sauce algérienne.",
      panier:{ q:1, nom:"Tacos M", opt:"Poulet · sauce algérienne", prix:950 } },
    { t:19, qui:"bot", txt:"C'est noté. Le tacos M vient avec frites et une boisson — je vous mets quoi comme boisson ?" },
    { t:28, qui:"me",  txt:"Un Oasis. Et rajoutez du cheddar.",
      maj:{ opt:"Poulet · sauce algérienne · frites + Oasis", sup:"Cheddar", prix:1050 } },
    { t:30, qui:"sys", txt:"Cheddar +1,00 € — panier mis à jour" },
    { t:37, qui:"bot", txt:"Cheddar ajouté. Je vous propose un tiramisu maison à 3 € pour finir ?" },
    { t:44, qui:"me",  txt:"Non c'est bon. Je passe le prendre." },
    { t:47, qui:"sys", txt:"Récapitulatif préparé — SMS envoyé au 06 •• •• •• 47", sms:true },
    { t:58, qui:"bot", txt:"Je vous ai envoyé le récapitulatif par SMS : un tacos M poulet sauce algérienne avec cheddar, boisson Oasis, 10,50 € à régler sur place. Vous me confirmez ?" },
    { t:66, qui:"me",  txt:"Oui je valide.", confirme:true },
    { t:74, qui:"bot", txt:"Parfait, c'est envoyé en cuisine. Ce sera prêt dans 15 minutes au comptoir. Bonne soirée !" },
    { t:78, qui:"sys", txt:"Commande #248 confirmée → écran cuisine", fin:true }
  ],

  sms:"SNACK LE COMPTOIR — commande #248\n1x Tacos M poulet, sauce algérienne\n   + cheddar · boisson Oasis\nRetrait à 19h48 — 10,50 € sur place\n\nRépondez OK pour valider, MODIF pour changer.\nConfidentialité : lecomptoir.fr/vie-privee",

  /* journal des appels */
  appels: [
    { h:"19:41", duree:92,  issue:"commande",  num:"06 •• •• •• 47", montant:1050, cmd:248 },
    { h:"19:36", duree:44,  issue:"question",  num:"07 •• •• •• 03", montant:0, info:"Horaires du dimanche" },
    { h:"19:31", duree:131, issue:"commande",  num:"06 •• •• •• 88", montant:3150, cmd:245 },
    { h:"19:24", duree:58,  issue:"transfert", num:"06 •• •• •• 12", montant:0, info:"Allergie évoquée" },
    { h:"19:19", duree:26,  issue:"expiree",   num:"masqué",         montant:0, cmd:244 },
    { h:"19:12", duree:104, issue:"commande",  num:"06 •• •• •• 51", montant:1700, cmd:247 }
  ],

  jour: { appels:31, commandes:24, expirees:6, ca:41280, panier:1720, minutes:147, transferts:2 },

  horaires: [
    { j:"Lun – Jeu", c:"11h30–14h30 · 18h00–23h00" },
    { j:"Vendredi",  c:"11h30–14h30 · 18h00–01h00" },
    { j:"Samedi",    c:"11h30–15h00 · 18h00–01h00" },
    { j:"Dimanche",  c:"18h00–23h00" }
  ],
  exceptions: [ { d:"24 décembre", r:"Fermé" }, { d:"31 décembre", r:"Jusqu'à 01h00" } ],
  livraison: { rayon:"4,5 km", minimum:1500, frais:250, paiement:"Espèces + carte au livreur", delai:35 },

  /* §5 — CRM */
  statuts: {
    jamais:  { nom:"Jamais démarché",   pill:"",        def:"Disponible dans le canal autorisé." },
    reserve: { nom:"Réservé",           pill:"signe",   def:"Réservation de 3 jours après « Je prends ce prospect »." },
    sansrep: { nom:"Sans réponse",      pill:"",        def:"Tentative réalisée ; relance planifiable." },
    refus:   { nom:"Refus",             pill:"refuse",  def:"Date de retour à définir, ou Ne plus contacter." },
    attente: { nom:"En attente",        pill:"attente", def:"Intérêt, démonstration ou rappel programmé." },
    essai:   { nom:"Période d'essai",   pill:"attente", def:"Le restaurant teste le produit." },
    client:  { nom:"Client actif",      pill:"signe",   def:"Restaurant payant ; commission calculée." },
    stop:    { nom:"Ne plus contacter", pill:"refuse",  def:"Opposition respectée par tous." }
  },

  prospects: [
    { id:1,  nom:"Istanbul Kebab",  type:"Kebab",  adr:"34 av. Jean-Jaurès",     statut:"client",  dist:120, info:"Client depuis le 12/07 — forfait Pro" },
    { id:2,  nom:"Tacos Avenue",    type:"Tacos",  adr:"7 rue Sébastien Gryphe", statut:"reserve", dist:180, info:"Réservé jusqu'au 19/09",
      derniere:"16/09 — porte-à-porte 14h20", preuve:"photo de devanture", objection:"« déjà débordé, rappeler hors service »" },
    { id:3,  nom:"Pizza Del Sole",  type:"Pizza",  adr:"21 rue de Marseille",    statut:"attente", dist:260, info:"Rappel programmé lundi 10h" },
    { id:4,  nom:"Burger 7",        type:"Burger", adr:"3 place Gabriel Péri",   statut:"jamais",  dist:300, info:"" },
    { id:5,  nom:"Snack Étoile",    type:"Kebab",  adr:"88 grande rue",          statut:"essai",   dist:420, info:"Essai — jour 5 sur 14" },
    { id:6,  nom:"Le Bosphore",     type:"Kebab",  adr:"12 rue Salomon",         statut:"client",  dist:510, info:"Client depuis le 02/08 — forfait Basic" },
    { id:7,  nom:"Chicken Street",  type:"Burger", adr:"45 cours Gambetta",      statut:"sansrep", dist:540, info:"Relance jeudi" },
    { id:8,  nom:"Pizzeria Napoli", type:"Pizza",  adr:"2 rue Béchevelin",       statut:"refus",   dist:610, info:"Retour en janvier" },
    { id:9,  nom:"Tacos King",      type:"Tacos",  adr:"19 av. Berthelot",       statut:"jamais",  dist:700, info:"" },
    { id:10, nom:"Sandwicherie Sud",type:"Kebab",  adr:"60 rue Pasteur",         statut:"stop",    dist:760, info:"Opposition explicite" },
    { id:11, nom:"Mama Pizza",      type:"Pizza",  adr:"33 rue Chevreul",        statut:"client",  dist:820, info:"Client depuis le 28/08 — forfait Business" },
    { id:12, nom:"Le Comptoir",     type:"Tacos",  adr:"12 rue Garibaldi",       statut:"client",  dist:900, info:"Client depuis le 05/07 — forfait Pro" }
  ],

  commercial: {
    nom:"Nadia B.",
    zone:"Lyon 7e — secteur Guillotière",
    cibles:42,
    gains: [ {m:"Juin",v:4500}, {m:"Juillet",v:8250}, {m:"Août",v:11250}, {m:"Septembre",v:14250} ],
    entonnoir: [ {e:"Chargés au CRM",n:248}, {e:"Visités",n:176}, {e:"Démos faites",n:54},
                 {e:"Essais lancés",n:31}, {e:"Clients payants",n:21}, {e:"Ne plus contacter",n:9} ],
    objections: [
      { q:"« J'ai pas le temps »",          r:"L'installation prend 10 minutes : vous gardez votre numéro, on active juste le renvoi sur non-réponse. Je peux le faire maintenant, hors rush." },
      { q:"« Ça va faire robot »",          r:"On choisit ensemble le prénom, le ton et la vitesse. Vous validez un appel test sur votre vrai menu avant que ça parte en ligne." },
      { q:"« Et si l'IA se trompe ? »",     r:"Rien ne part en cuisine sans confirmation du client. En cas d'allergie, de grosse commande ou de doute, elle transfère." },
      { q:"« C'est cher »",                 r:"Essai gratuit d'abord : on mesure votre vrai volume d'appels. Un seul tacos récupéré par jour paie déjà le forfait Basic." },
      { q:"« Je rappelle les gens après »", r:"Aux heures de pointe, un client qui tombe sur un répondeur commande ailleurs. C'est ça qu'on récupère." }
    ],
    regles: [
      { t:"Réservation de 3 jours", x:"« Je prends ce prospect » le verrouille 3 jours. Sans action il retourne au commun : le même commercial ne peut plus le reprendre pendant 2 mois, un autre le peut immédiatement." },
      { t:"Protection de 30 jours", x:"Après une action valide et un suivi, le prospect est protégé 30 jours depuis la dernière action." },
      { t:"Preuve de visite",       x:"Appel depuis le numéro professionnel, message depuis le canal Resto IA, ou photo de devanture sans visages ni plaques. L'audio ne sert pas de preuve ; la géolocalisation est ponctuelle, jamais continue." },
      { t:"Fin de mandat",          x:"Résiliable avec préavis dans les deux sens. La commission court jusqu'à la fin du cycle d'engagement de 6 mois en cours, puis s'arrête. À valider juridiquement avant tout recrutement." }
    ]
  },

  /* textes de cadrage repris du business plan */
  regles: {
    renvoi:"Renvoi conditionnel chez l'opérateur : **61*NUMERO# sur non-réponse, **67*NUMERO# sur occupation. Désactivation : ##61# et ##67#. Codes GSM standardisés, réversibles en deux minutes.",
    confirmation:"Une commande ne part en cuisine qu'après confirmation. L'IA reste en ligne jusqu'à 45 secondes, propose la confirmation par SMS, puis laisse la commande expirer après 2 minutes.",
    modification:"Une modification ne crée jamais deux commandes : le panier est corrigé, l'ancien récapitulatif invalidé, un nouveau SMS envoyé. Le ticket porte la mention MODIFICATION COMMANDE #…",
    transfert:"L'IA ne doit pas insister si le client demande un humain, semble énervé, évoque une allergie, demande une très grosse commande, formule une demande hors menu, ou reste incertaine après deux tentatives.",
    allergenes:"Les informations d'allergènes sont formulées comme « selon les informations du restaurant ». L'IA ne garantit jamais l'absence d'allergène.",
    paiement:"Resto IA ne collecte jamais le paiement des commandes, ne stocke pas de carte, ne rembourse pas et ne gère pas les litiges. L'entreprise facture uniquement son abonnement.",
    rgpd:"L'IA annonce en début d'appel que le client parle à un assistant automatisé (RGPD et AI Act). Base légale : exécution du contrat. Audio brut conservé 30 jours."
  }
};
