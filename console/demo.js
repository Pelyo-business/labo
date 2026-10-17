/* Console Pelyo — données de démonstration.
   Tout est fictif. Les montants sont en centimes HT, les durées en minutes.
   Les vraies données viendront de la base (rôle fondateur, lecture seule). */
window.DEMO = {

  /* Forfaits du business plan (mêmes chiffres que maquette/src/data.js).
     dep = prix d'une minute au-delà du forfait. */
  forfaits: {
    payg:  { nom: "PAYG",         prix: 0,     incluses: 0,    dep: 49 },
    basic: { nom: "Basic",        prix: 3200,  incluses: 100,  dep: 45 },
    pro:   { nom: "Pro",          prix: 6600,  incluses: 300,  dep: 35 },
    biz:   { nom: "Business",     prix: 10000, incluses: 500,  dep: 28 },
    big:   { nom: "Big Business", prix: 25000, incluses: 1500, dep: 20 }
  },

  /* parJour = minutes d'appel moyennes par jour (sert à la simulation). */
  comptes: [
    { id: "compt", code: "COMPT", nom: "Snack Le Comptoir",   ville: "Lyon 7e",       forfait: "pro",   statut: "actif", depuis: "05/07", commercial: "Yanis", parJour: 13 },
    { id: "istkb", code: "ISTKB", nom: "Istanbul Kebab",      ville: "Lyon 7e",       forfait: "pro",   statut: "actif", depuis: "12/07", commercial: "Yanis", parJour: 9 },
    { id: "bosph", code: "BOSPH", nom: "Le Bosphore",         ville: "Lyon 7e",       forfait: "basic", statut: "actif", depuis: "02/08", commercial: "Yanis", parJour: 6 },
    { id: "mamap", code: "MAMAP", nom: "Mama Pizza",          ville: "Lyon 7e",       forfait: "biz",   statut: "actif", depuis: "28/08", commercial: "Yanis", parJour: 19 },
    { id: "tacav", code: "TACAV", nom: "Tacos Avenue",        ville: "Villeurbanne",  forfait: "payg",  statut: "actif", depuis: "03/09", commercial: null,    parJour: 4 },
    { id: "tacrh", code: "TACRH", nom: "Tacos du Rhône",      ville: "Lyon 8e",       forfait: "basic", statut: "actif", depuis: "09/09", commercial: "Yanis", parJour: 2.5 },
    { id: "naplx", code: "NAPLX", nom: "Napoli Express",      ville: "Lyon 3e",       forfait: "big",   statut: "actif", depuis: "15/07", commercial: null,    parJour: 46 },
    { id: "chksp", code: "CHKSP", nom: "Chicken Spot",        ville: "Le Mans",       forfait: "pro",   statut: "actif", depuis: "18/09", commercial: "Inès",  parJour: 11 },
    { id: "brgf",  code: "BRGFT", nom: "Burger Factory",      ville: "Le Mans",       forfait: "basic", statut: "essai", depuis: "29/09", commercial: "Inès",  parJour: 7 },
    { id: "kbhal", code: "KBHAL", nom: "Kebab des Halles",    ville: "Chartres",      forfait: "payg",  statut: "actif", depuis: "21/09", commercial: "Inès",  parJour: 3 },
    { id: "snksp", code: "SNKSP", nom: "Snack Saint-Pierre",  ville: "Le Mans",       forfait: "pro",   statut: "essai", depuis: "01/10", commercial: "Inès",  parJour: 8 },
    { id: "bella", code: "BELLA", nom: "Pizzeria Bella",      ville: "Paris 15e",     forfait: "biz",   statut: "actif", depuis: "06/08", commercial: null,    parJour: 15 },
    { id: "wokex", code: "WOKEX", nom: "Wok Express",         ville: "Paris 14e",     forfait: "basic", statut: "impaye", depuis: "20/08", commercial: null,   parJour: 4 },
    { id: "grill", code: "GRILL", nom: "Grill House",         ville: "Versailles",    forfait: "pro",   statut: "actif", depuis: "11/09", commercial: null,    parJour: 10 }
  ],

  /* Vue en lecture seule d'un compte : ce que le gérant et la cuisine voient. */
  etats: {
    compt: { service: "Rush · 30 min", ouvert: true, commandes: 6, ruptures: ["Boursin", "Pizza merguez"], appareils: 2, alerte: null },
    istkb: { service: "Normal · 15 min", ouvert: true, commandes: 3, ruptures: [], appareils: 1, alerte: null },
    bosph: { service: "Pause · reprise 19 h 30", ouvert: false, commandes: 0, ruptures: ["Galette"], appareils: 1, alerte: "Service en pause depuis 2 h 10 : les appels partent sur répondeur." },
    mamap: { service: "Très chargé · 45 min", ouvert: true, commandes: 11, ruptures: ["Pâte sans gluten"], appareils: 3, alerte: null },
    tacav: { service: "Normal · 15 min", ouvert: true, commandes: 1, ruptures: [], appareils: 1, alerte: null },
    tacrh: { service: "Normal · 15 min", ouvert: true, commandes: 0, ruptures: [], appareils: 0, alerte: "Aucune tablette cuisine reliée : les commandes ne s'affichent nulle part." },
    naplx: { service: "Rush · 30 min", ouvert: true, commandes: 17, ruptures: ["Tiramisu"], appareils: 4, alerte: null },
    chksp: { service: "Normal · 20 min", ouvert: true, commandes: 4, ruptures: [], appareils: 2, alerte: null },
    brgf:  { service: "Normal · 15 min", ouvert: true, commandes: 2, ruptures: [], appareils: 1, alerte: "Essai : fin dans 8 jours, pas encore de moyen de paiement." },
    kbhal: { service: "Normal · 15 min", ouvert: true, commandes: 1, ruptures: [], appareils: 1, alerte: null },
    snksp: { service: "Normal · 15 min", ouvert: true, commandes: 2, ruptures: ["Sauce samouraï"], appareils: 1, alerte: null },
    bella: { service: "Normal · 25 min", ouvert: true, commandes: 5, ruptures: [], appareils: 2, alerte: null },
    wokex: { service: "Normal · 15 min", ouvert: true, commandes: 1, ruptures: [], appareils: 1, alerte: "Prélèvement d'octobre rejeté (provision insuffisante)." },
    grill: { service: "Normal · 15 min", ouvert: true, commandes: 3, ruptures: ["Bacon"], appareils: 1, alerte: null }
  },

  /* Courriels reçus sur @pelyo.eu, déjà triés par l'IA. Les publicités et
     notifications sans intérêt sont rangées à part (compteur « masqués »). */
  mails: [
    { id: 1, de: "Mehmet — Le Bosphore", adresse: "lebosphore.lyon@gmail.com", sujet: "L'IA prend plus les commandes ??", heure: "08:42", cat: "client", urgence: "haute", compte: "bosph",
      texte: "Bonjour, depuis hier soir les clients me disent qu'ils tombent sur un message. J'ai rien touché. On perd des commandes là, rappelez-moi vite svp.",
      resume: "Le service du Bosphore est en pause depuis hier soir (réglage Rythme). Le gérant ne l'a probablement pas vu.",
      action: "Lui expliquer comment reprendre le service, ou le reprendre pour lui avec son accord.",
      brouillon: "Bonjour Mehmet,\n\nVotre service est en pause depuis hier 21 h 12 (Rythme → Pause), c'est pour ça que l'IA ne prend plus les commandes. Pour reprendre : Cuisine → Rythme → Normal.\n\nSi vous voulez, je peux le remettre en route pour vous tout de suite, répondez simplement « oui ».\n\nHayden — Pelyo" },
    { id: 2, de: "Sarah Benali", adresse: "s.benali@lafringale.fr", sujet: "Demande de démo — La Fringale (Tours)", heure: "07:55", cat: "prospect", urgence: "haute", compte: null,
      texte: "Bonjour, j'ai vu votre site. On a 2 snacks à Tours et on rate beaucoup d'appels le vendredi soir. Est-ce qu'on peut avoir une démo cette semaine ?",
      resume: "Prospect chaud : 2 snacks à Tours, problème d'appels manqués le vendredi. Demande une démo cette semaine.",
      action: "Proposer deux créneaux de démo. Tours est hors des zones ouvertes : ouvrir la zone ou la traiter toi-même.",
      brouillon: "Bonjour Sarah,\n\nMerci pour votre message. Je peux vous montrer Pelyo en 20 minutes, en visio ou par téléphone : jeudi 10 h ou vendredi 15 h, qu'est-ce qui vous arrange ?\n\nHayden — Pelyo" },
    { id: 3, de: "Pizzeria Bella", adresse: "contact@pizzeriabella.paris", sujet: "Facture septembre", heure: "Hier", cat: "client", urgence: "normale", compte: "bella",
      texte: "Bonjour, pouvez-vous m'envoyer la facture de septembre au nom de la SARL BELLA PARIS svp, pour mon comptable.",
      resume: "Demande la facture de septembre avec la raison sociale SARL BELLA PARIS.",
      action: "Renvoyer la facture avec la bonne raison sociale (corriger la fiche du compte).",
      brouillon: "Bonjour,\n\nVoici la facture de septembre au nom de la SARL BELLA PARIS. La fiche est corrigée pour les prochaines.\n\nBonne journée,\nHayden — Pelyo" },
    { id: 4, de: "Twilio", adresse: "no-reply@twilio.com", sujet: "Action required: Primary Customer Profile", heure: "Hier", cat: "fournisseur", urgence: "haute", compte: null,
      texte: "Your Primary Customer Profile requires additional information before it can be approved.",
      resume: "Twilio attend une pièce d'identité pour valider le profil. Sans ça, pas de numéro de téléphone.",
      action: "Téléverser le passeport dès que tu l'as.",
      brouillon: "" },
    { id: 5, de: "Wok Express", adresse: "wokexpress14@gmail.com", sujet: "Re: Prélèvement rejeté", heure: "Hier", cat: "client", urgence: "normale", compte: "wokex",
      texte: "Désolé, souci de banque. Vous pouvez représenter le prélèvement lundi ?",
      resume: "Le prélèvement rejeté peut être représenté lundi.",
      action: "Programmer une nouvelle tentative de prélèvement lundi.",
      brouillon: "Bonjour,\n\nPas de souci, le prélèvement sera représenté lundi.\n\nHayden — Pelyo" },
    { id: 6, de: "Inès (commerciale)", adresse: "ines@pelyo.eu", sujet: "Snack Saint-Pierre veut le forfait Pro", heure: "Sam.", cat: "equipe", urgence: "normale", compte: "snksp",
      texte: "Il est content de l'essai, il veut passer en Pro à la fin. Je lui envoie le mandat SEPA ?",
      resume: "Snack Saint-Pierre veut passer en Pro après l'essai. Inès demande si elle envoie le mandat SEPA.",
      action: "Valider : envoyer le mandat SEPA.",
      brouillon: "Oui, vas-y, envoie-lui le mandat. Bravo !" },
    { id: 7, de: "Supabase", adresse: "billing@supabase.io", sujet: "Your invoice for September", heure: "Sam.", cat: "fournisseur", urgence: "basse", compte: null,
      texte: "Invoice #SB-20931 — $25.00 — paid.",
      resume: "Facture Supabase de septembre : 25 $, déjà payée.",
      action: "Rien à faire, à transmettre au comptable.",
      brouillon: "" },
    { id: 8, de: "Le Progrès — rédaction", adresse: "redaction.lyon@leprogres.fr", sujet: "Article sur les commandes par IA", heure: "Ven.", cat: "presse", urgence: "normale", compte: null,
      texte: "Bonjour, nous préparons un article sur l'IA dans la restauration rapide à Lyon. Seriez-vous disponible pour un échange de 15 minutes ?",
      resume: "Le Progrès veut 15 minutes d'échange pour un article sur l'IA dans les snacks lyonnais.",
      action: "Accepter : bonne visibilité locale. Proposer un client satisfait (Snack Le Comptoir) comme témoin.",
      brouillon: "Bonjour,\n\nAvec plaisir. Je suis disponible mercredi ou jeudi après-midi. Je peux aussi vous mettre en contact avec un restaurant qui utilise Pelyo à Lyon.\n\nHayden — Pelyo" }
  ],
  mailsMasques: 23,

  /* Résultat de la recherche du matin. */
  avis: {
    scan: "07:00",
    sources: 12,
    liste: [
      { id: 1, source: "Google", ou: "Fiche Pelyo", note: 5, auteur: "Karim D.", quand: "Hier", nouveau: true, ton: "positif",
        texte: "Installé dans mon snack il y a un mois. Plus aucun appel raté le vendredi, et l'IA comprend même les commandes compliquées.",
        reponse: "Merci Karim ! Ravi que les vendredis soient plus calmes. On reste dispo si besoin." },
      { id: 2, source: "Trustpilot", ou: "pelyo.eu", note: 4, auteur: "Nadia", quand: "Hier", nouveau: true, ton: "positif",
        texte: "Très pratique. Juste la voix qui parle un peu vite au début, mais on peut la régler.",
        reponse: "Merci Nadia ! Oui, la vitesse se règle dans Gérant → Assistant. N'hésitez pas à nous écrire." },
      { id: 3, source: "Reddit", ou: "r/france", note: null, auteur: "u/snack_lyon", quand: "Il y a 2 j", nouveau: true, ton: "mitigé",
        texte: "Quelqu'un a testé les IA qui prennent les commandes au téléphone ? Pelyo par ex. J'ai peur que les clients raccrochent.",
        reponse: "Bonjour ! Je suis le fondateur de Pelyo. Dans nos restaurants, la majorité des appelants vont au bout de la commande. Je peux vous faire écouter des exemples anonymisés si vous voulez." },
      { id: 4, source: "Google", ou: "Fiche Pelyo", note: 2, auteur: "Julien M.", quand: "Il y a 3 j", nouveau: false, ton: "négatif",
        texte: "J'ai appelé un resto, l'IA n'a pas compris mon adresse deux fois. J'ai fini par raccrocher.",
        reponse: "Bonjour Julien, désolé pour cette expérience. Pouvez-vous nous écrire à bonjour@pelyo.eu avec le nom du restaurant ? On regarde l'appel pour corriger." },
      { id: 5, source: "Facebook", ou: "Groupe Restaurateurs Lyon", note: null, auteur: "Ahmed B.", quand: "Il y a 4 j", nouveau: false, ton: "positif",
        texte: "Je recommande Pelyo, le commercial est passé, mis en place en une journée.",
        reponse: "" }
    ]
  },

  /* Assistant : réponses préparées pour la démo. Chaque action proposée
     attend ta validation. */
  ia: [
    { q: "Pourquoi Le Bosphore ne prend plus de commandes ?",
      r: "Le Bosphore est en **pause** depuis hier 21 h 12 (réglage Rythme, fait depuis la tablette cuisine). Depuis, 14 appels sont tombés sur le répondeur. Le gérant a écrit ce matin, il ne sait pas pourquoi.",
      action: { texte: "Remettre le Bosphore en service Normal (15 min)", compte: "bosph", effet: "service" } },
    { q: "Quels comptes me font perdre de l'argent ?",
      r: "Ce mois-ci, deux comptes coûtent plus qu'ils ne rapportent : **Burger Factory** et **Snack Saint-Pierre**, tous deux en essai gratuit (environ 25 € et 30 € d'IA à fin de mois). **Wok Express** est en impayé. Tous les autres sont rentables.",
      action: { texte: "Relancer Wok Express : nouvelle tentative de prélèvement lundi", compte: "wokex", effet: "relance" } },
    { q: "Tacos du Rhône n'a aucune tablette, c'est grave ?",
      r: "Oui : l'IA prend les commandes mais elles ne s'affichent nulle part en cuisine. Aujourd'hui 2 commandes ont été enregistrées sans être vues. Il faut relier une tablette avec le code cuisine.",
      action: { texte: "Envoyer au gérant un SMS avec le code cuisine et le lien d'aide", compte: "tacrh", effet: "sms" } }
  ]
};

/* Portefeuille de démonstration à l'échelle d'un lancement déjà établi.
   Les 14 comptes nommés ci-dessus restent disponibles pour les scénarios
   détaillés ; 86 restaurants cohérents complètent automatiquement la base.
   Tous les totaux de la console sont ensuite calculés à partir de ces 100
   comptes, sans multiplicateur artificiel sur les indicateurs financiers. */
(function completerPortefeuille() {
  "use strict";
  var D = window.DEMO, cible = 100;
  var enseignes = [
    "Le Comptoir", "Tacos Factory", "Pizza Roma", "Chicken Corner",
    "O'Kebab", "Burger District", "La Braise", "Casa Napoli",
    "Le Bosphore", "Street Food", "Grill Express", "Mama Pasta",
    "Snack Central", "Wok Avenue", "L'Atelier du Tacos", "Chez Sam"
  ];
  var villes = [
    "Lyon", "Villeurbanne", "Paris", "Marseille", "Toulouse", "Bordeaux",
    "Montpellier", "Nantes", "Lille", "Strasbourg", "Grenoble", "Dijon",
    "Tours", "Le Mans", "Nice", "Rouen", "Reims", "Clermont-Ferrand"
  ];
  /* Répartition cible : 10 % PAYG, 20 % Basic, 40 % Pro,
     20 % Business et 10 % Big Business. */
  var forfaits = ["pro", "basic", "pro", "biz", "pro", "basic", "big", "payg", "biz", "pro"];
  var commerciaux = ["Yanis", "Inès", "Léa", null, "Yanis", "Inès", null, "Léa"];
  var jours = ["04/04", "18/04", "07/05", "22/05", "11/06", "26/06", "09/07", "24/07", "08/08", "19/08", "02/09", "16/09"];
  var baseJour = { payg: 4, basic: 8, pro: 17, biz: 28, big: 55 };
  var i, n, id, plan, statut, nom, ville, variation;
  for (i = D.comptes.length; i < cible; i++) {
    n = i + 1;
    id = "demo" + String(n).padStart(3, "0");
    plan = forfaits[i % forfaits.length];
    statut = i % 43 === 0 ? "impaye" : (i % 29 === 0 ? "essai" : "actif");
    ville = villes[(i * 7) % villes.length];
    nom = enseignes[(i * 5) % enseignes.length] + " " + ville + " " + (Math.floor(i / enseignes.length) + 1);
    variation = 0.78 + ((i * 17) % 45) / 100;
    D.comptes.push({
      id: id,
      code: "CL" + String(n).padStart(3, "0"),
      nom: nom,
      ville: ville,
      forfait: plan,
      statut: statut,
      depuis: jours[i % jours.length],
      commercial: commerciaux[i % commerciaux.length],
      parJour: Math.round(baseJour[plan] * variation * 10) / 10
    });
    D.etats[id] = {
      service: "Rush · 30 min",
      ouvert: true,
      commandes: 3 + (i * 7) % 19,
      ruptures: i % 17 === 0 ? ["Sauce maison"] : [],
      appareils: 1 + i % 4,
      alerte: null
    };
  }
  D.mailsMasques = 148;
})();
