/* cuisine-fonctions.js — les pages « en savoir plus » des Réglages de la cuisine.

   Chaque réglage qui demande une explication a un petit « i » à côté de son nom. Il ouvre une page :
   à quoi ça sert, ce que ça fait vraiment, un exemple concret, ce qu'il faut savoir (limites, état réel).
   Les textes décrivent ce que le logiciel fait VRAIMENT : quand une fonction n'est pas encore branchée
   en vrai (imprimante, SMS, balance, mode livreur), la page le dit franchement.

   Règle de rédaction : on n'ajoute un « i » que pour un réglage dont le nom seul ne suffit pas.
   Ni l'alerte sonore, ni l'apparence, ni le compte n'en ont besoin.

   JavaScript ES5 strict. Une seule globale : PelyoFonctions. */
var PelyoFonctions = (function(){
  "use strict";

  /* etat : texte ajouté selon le mode (reel = compte connecté ; demo = compte de démonstration). */
  var F = {

    "rythme": {
      titre: "Rythme du service",
      lead: "Le rythme dit à l’IA du téléphone quel délai annoncer aux clients quand elle prend une commande.",
      fait: [
        "Quatre niveaux : <b>Normal</b>, <b>Rush</b>, <b>Très chargé</b> et <b>Pause</b>. Chacun correspond à un délai annoncé (par exemple 15, 30 et 45 minutes pour le retrait).",
        "Le délai change tout de suite pour les <b>prochaines</b> commandes. Une heure déjà promise à un client ne change jamais.",
        "En <b>Pause</b>, l’IA ne prend plus de commande et prévient les clients.",
        "On peut aussi fermer un seul canal (retrait ou livraison), régler les délais, et la capacité de la cuisine.",
        "<b>Rythme automatique</b> : la cuisine change de niveau toute seule selon le nombre de commandes en cours. La pause reste toujours manuelle."
      ],
      exemple: "Il est 19 h 30 et la cuisine déborde : vous passez en Rush. Un client qui appelle à 19 h 31 entend « votre commande sera prête vers 20 h 01 » au lieu de 19 h 46.",
      savoir: [
        "Le délai de livraison que vous réglez est un minimum : le calcul des tournées peut l’allonger, jamais le raccourcir.",
        "Le rythme automatique se règle dans la page Rythme (deux seuils) et reste sur cette tablette."
      ]
    },

    "min-lancer": {
      titre: "Minuteur : lancer la commande",
      lead: "Le temps dont la cuisine dispose, à partir de la réception d’une commande, pour la commencer.",
      fait: [
        "Sur chaque commande à préparer, le chrono « pour lancer » et la barre du ticket se remplissent pendant cette durée.",
        "Quand le délai est dépassé, le chrono passe en rouge avec un « + » : la commande est en retard.",
        "Cette durée sert aussi à estimer l’heure à laquelle la commande sera prête."
      ],
      exemple: "Réglé sur 5 min : une commande reçue à 19 h 00 doit être commencée avant 19 h 05. Avec 15 min de préparation, Pelyo estime qu’elle sera prête vers 19 h 20.",
      savoir: [
        "Réglable de 1 à 90 minutes avec les boutons − et +.",
        "Le réglage reste sur <b>cette tablette</b> : une autre tablette garde ses propres durées.",
        "Il organise le travail de la cuisine. Il ne change pas l’heure déjà promise au client."
      ]
    },

    "min-preparer": {
      titre: "Minuteur : préparer",
      lead: "La durée de préparation visée, à partir du moment où l’on touche « Commencer ».",
      fait: [
        "Le chrono « pour préparer » et la barre du ticket avancent pendant cette durée.",
        "Dépassée, la commande affiche un chrono rouge avec « de retard », pour qu’on la repère d’un coup d’œil.",
        "Elle entre aussi dans l’estimation de l’heure de fin."
      ],
      exemple: "Réglé sur 15 min : vous touchez « Commencer » à 19 h 05, la commande doit être prête avant 19 h 20.",
      savoir: [
        "Mettez la durée d’une commande ordinaire de votre cuisine : si vos plats prennent 8 minutes, réglez 8.",
        "Réglable de 1 à 90 minutes ; le réglage reste sur cette tablette."
      ]
    },

    "min-partir": {
      titre: "Minuteur : départ ou remise",
      lead: "Le temps accordé, une fois la commande « Prête », pour la remettre au client ou la confier au livreur.",
      fait: [
        "En retrait, le chrono dit « pour remettre » ; en livraison, « avant départ ».",
        "Passé ce délai, le chrono devient rouge : la commande attend trop longtemps au passe et risque de refroidir.",
        "La commande reste dans la colonne « Prêtes » jusqu’à ce que vous la passiez en « Terminée »."
      ],
      exemple: "Réglé sur 15 min : une commande prête à 19 h 20 doit être remise ou partir avant 19 h 35.",
      savoir: [
        "Réglable de 1 à 90 minutes ; le réglage reste sur cette tablette."
      ]
    },

    "papier": {
      titre: "Cuisine au papier",
      lead: "Pour les cuisines qui travaillent avec des tickets imprimés plutôt qu’avec l’écran.",
      fait: [
        "Personne ne touche « Commencer » ni « Prête » : Pelyo ne sait donc plus où en est une commande en cuisine.",
        "Pour une commande à emporter, Pelyo cesse d’essayer de deviner un retard et ne prévient plus le client à ce sujet.",
        "En livraison, c’est le <b>livreur</b> qui fait avancer la commande : il scanne le ticket en partant (elle passe « en route »), puis à la livraison."
      ],
      exemple: "Un snack avec une imprimante au passe : les tickets sortent tout seuls, le cuisinier les pique sur le passe, personne ne touche à l’écran. Le livreur scanne le ticket au départ : le client est prévenu que sa commande est en route.",
      savoir: [
        "Réglage propre à <b>cette tablette</b>.",
        "Le scan du livreur se joue dans le compte de démonstration."
      ]
    },

    "sms-prete": {
      titre: "SMS « commande prête »",
      lead: "Prévient le client par SMS dès que sa commande passe en « Prête ».",
      fait: [
        "Le client n’a pas à deviner ni à rappeler : il vient chercher sa commande au bon moment.",
        "Ce SMS s’ajoute au lien de suivi, qui part toujours avec le SMS de confirmation."
      ],
      exemple: "Sarah a commandé deux tacos à emporter. Vous touchez « Prête » à 19 h 12 : elle reçoit un SMS et passe les récupérer.",
      savoir: [
        "Désactivé par défaut.",
        "Le réglage est prêt, mais l’envoi réel des SMS dépend de la ligne téléphonique Pelyo, qui n’est pas encore en service."
      ]
    },

    "sms-route": {
      titre: "SMS « en route »",
      lead: "Prévient le client par SMS quand le livreur part avec sa commande.",
      fait: [
        "Au moment où le livreur scanne le ticket au départ, la commande passe « en route » et le client est prévenu.",
        "Le client sait alors qu’il peut se tenir prêt à recevoir sa livraison."
      ],
      exemple: "Mehdi attend sa livraison. Le livreur part à 19 h 40 : Mehdi reçoit le SMS et prépare la porte.",
      savoir: [
        "Activé par défaut.",
        "Le lien de suivi part toujours avec le SMS de confirmation, que ce réglage soit activé ou non.",
        "Le réglage est prêt, mais l’envoi réel des SMS dépend de la ligne téléphonique Pelyo, qui n’est pas encore en service."
      ]
    },

    "mode-livreur": {
      titre: "Passer ce téléphone en mode livreur",
      lead: "Transforme un téléphone en outil de livreur : il ne montre plus que les livraisons.",
      fait: [
        "Le livreur entre son prénom et le <b>code livreur</b> que le gérant affiche dans son espace (Gestion → Livreurs).",
        "Après l’accord du gérant, le téléphone est <b>verrouillé</b> : il ne montre que les livraisons à faire et ne permet rien de modifier. Seul le gérant peut le libérer.",
        "Le livreur voit sa mission du moment (adresse, navigation) sur une carte, et le gérant suit sa position."
      ],
      exemple: "Vous avez deux livreurs : chacun entre son prénom et le code, vous les activez depuis votre espace gérant. Ils voient leurs tournées, vous voyez où ils sont.",
      savoir: [
        "Prévoyez un téléphone dédié : une fois verrouillé, il ne sert plus à la cuisine.",
        "Il fonctionne aujourd’hui dans le compte de démonstration ; avec un compte connecté, il arrive dans une prochaine étape."
      ]
    },

    "impression-auto": {
      titre: "Impression automatique",
      lead: "Imprime tout seul le ticket de chaque nouvelle commande.",
      fait: [
        "Dès qu’une commande arrive (prise par l’IA ou saisie en caisse), son ticket part à l’imprimante : articles, options, consignes, mode (retrait ou livraison) et heure promise.",
        "Désactivée, rien ne sort tout seul : on imprime à la main avec le bouton « Imprimer » de la commande.",
        "Si l’imprimante est en panne depuis 90 secondes, le gérant reçoit la commande par SMS pour qu’elle ne soit pas perdue."
      ],
      exemple: "Le client appelle, l’IA prend la commande, il confirme : le ticket sort au passe avant même que vous ayez regardé l’écran.",
      savoir: [
        "L’impression automatique est construite mais <b>pas encore essayée sur une vraie imprimante</b>."
      ],
      etat: { reel: "Dans ce restaurant, l’imprimante n’est pas encore reliée : le réglage s’appliquera dès qu’elle le sera." }
    },

    "impression-annulations": {
      titre: "Impression des annulations",
      lead: "Imprime aussi un ticket quand une commande est annulée.",
      fait: [
        "Le ticket « ANNULATION — ARRÊTER LA PRÉPARATION » sort pour que personne ne prépare une commande annulée.",
        "Les <b>corrections</b> (commande modifiée, adresse changée) s’impriment toujours, avec la mention « CORRECTIF — NE PAS PRÉPARER EN DOUBLE ». Ce réglage ne concerne que les annulations."
      ],
      exemple: "Le client annule à 19 h 08 alors que le ticket est déjà au passe. Avec ce réglage activé, un ticket ANNULATION sort : le cuisinier s’arrête.",
      savoir: [
        "Désactivé par défaut : l’écran signale déjà l’annulation par « Annulation à lire ».",
        "Utile surtout si l’équipe regarde plus les tickets que l’écran."
      ]
    },

    "imprimante": {
      titre: "Imprimante",
      lead: "L’imprimante qui sort les tickets de cuisine.",
      fait: [
        "Elle doit être <b>reliée à internet</b> (câble réseau ou Wi-Fi), pas seulement branchée en USB sur la caisse : c’est elle qui va chercher les tickets sur internet.",
        "Compatibles : les imprimantes <b>Star CloudPRNT</b> (par exemple Star mC-Print3, TSP143IV) et <b>Epson Server Direct Print</b> (par exemple Epson TM-m30).",
        "Les modèles plus anciens ou d’entrée de gamme (par exemple Epson TM-T20) ne savent pas le faire."
      ],
      exemple: "Pour vérifier votre imprimante : prenez en photo l’étiquette sous l’appareil, on regarde le modèle.",
      savoir: [
        "Si votre imprimante n’est pas compatible, on peut en fournir une, ou utiliser une tablette Pelyo qui envoie les tickets à l’imprimante actuelle par le réseau du restaurant."
      ],
      etat: {
        reel: "Dans ce restaurant, l’imprimante n’est pas encore reliée : « Imprimer » passe par l’impression de cet appareil.",
        demo: "Dans la démo, l’imprimante (une Epson TM-m30) est simulée : aucun ticket réel ne sort."
      }
    },

    "balance": {
      titre: "Balance de portions",
      lead: "Guide la pesée des ingrédients pour que chaque portion soit la même, commande après commande.",
      fait: [
        "Le gérant règle les grammages et l’ordre de pesée (Pelyo Gérant → Gestion → Balance de portions). Ici, on <b>relie la balance</b> à la tablette.",
        "Quand une commande commence, l’écran de pesée s’ouvre tout seul et vous guide : viande, fromage, garniture, sauce.",
        "La balance dit si le poids est stable et si on est dans la tolérance (en grammes). La tare peut être automatique."
      ],
      exemple: "Un tacos viande : l’écran demande le grammage de viande, vous posez la portion, la balance annonce « stable » et c’est validé : on passe à l’ingrédient suivant.",
      savoir: [
        "La balance visée est la <b>A&amp;D SJ-6000WP-BT</b>, qui se relie en Bluetooth.",
        "Sans Bluetooth (iPad, Safari), une balance de démonstration prend le relais."
      ],
      etat: { reel: "Avec un compte connecté, la balance arrive dans une prochaine étape. Vous pouvez l’essayer dès maintenant dans le compte de démonstration." }
    },

    "connexions": {
      titre: "Caisse et connexions",
      lead: "L’état des liaisons de la cuisine : internet, serveur Pelyo, imprimante et caisse.",
      fait: [
        "<b>Internet</b> : si le réseau coupe, la tablette garde vos gestes (« Commencer », « Prête », « Terminée ») et les envoie dans l’ordre au retour du réseau. L’en-tête affiche alors « HORS LIGNE » et le nombre d’actions en attente.",
        "<b>Pelyo</b> : les commandes, la carte et le rythme se synchronisent en direct avec les autres écrans du restaurant.",
        "<b>Imprimante</b> et <b>caisse</b> : disent si elles sont reliées."
      ],
      exemple: "Le wifi tombe 30 secondes en plein coup de feu : vous touchez « Prête » sur trois commandes. Elles partent toutes seules, dans l’ordre, dès que le wifi revient.",
      savoir: [
        "Une action devenue inutile (par exemple un autre appareil a déjà avancé la commande) est abandonnée, et la cuisine est prévenue.",
        "La liaison avec les caisses n’est pas encore faite : on branchera d’abord la caisse la plus utilisée par les restaurants pilotes."
      ]
    },

    "taille": {
      titre: "Taille de l’affichage",
      lead: "Règle la taille des textes et des boutons de cette tablette.",
      fait: [
        "<b>Auto</b> : l’application mesure l’écran et choisit toute seule la meilleure taille. Elle le fait au premier lancement et le vérifie à chaque ouverture.",
        "<b>Grand</b> et <b>Très grand</b> : agrandissent les textes et les boutons.",
        "<b>Refaire le réglage</b> relance la mesure complète de l’écran."
      ],
      exemple: "Tablette posée loin du poste, mains enfarinées : passez en Très grand pour lire les chronos d’un coup d’œil.",
      savoir: [
        "Le choix est mémorisé sur cet appareil, pour chaque orientation.",
        "Sur un ordinateur (onglet de navigateur), l’affichage suit simplement la largeur de la fenêtre.",
        "Une tablette tenue à la verticale est automatiquement agrandie."
      ]
    }
  };

  function liste(items, classe){
    if (!items || !items.length) return "";
    return '<ul class="' + classe + '">' + items.map(function(x){ return "<li>" + x + "</li>"; }).join("") + "</ul>";
  }
  function echapper(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* La petite pastille « i » placée à côté du nom d'un réglage. */
  function pastille(id){
    var f = F[id]; if (!f) return "";
    return '<span class="k-info" role="button" tabindex="0" data-fonc="' + echapper(id) + '" aria-label="En savoir plus : ' + echapper(f.titre) + '" title="En savoir plus">i</span>';
  }

  /* La page complète. reel = compte connecté. */
  function page(id, reel){
    var f = F[id];
    if (!f) return '<div class="k-over k-legal-page k-fonc"><div class="k-ohead"><button data-ops-close>← Réglages</button></div><h2>Explication introuvable</h2></div>';
    var etat = f.etat && (reel ? f.etat.reel : f.etat.demo);
    return '<div class="k-over k-legal-page k-fonc">' +
      '<div class="k-ohead"><button data-ops-close>← Réglages</button></div>' +
      '<span class="k-eyebrow">EN SAVOIR PLUS</span>' +
      '<h2>' + f.titre + '</h2>' +
      '<p class="k-fonc-lead">' + f.lead + '</p>' +
      '<h3>Ce que ça fait vraiment</h3>' + liste(f.fait, "k-fonc-liste") +
      (f.exemple ? '<section class="k-fonc-exemple"><small>EXEMPLE</small><p>' + f.exemple + '</p></section>' : "") +
      ((f.savoir && f.savoir.length) || etat ? '<h3>À savoir</h3>' + liste(f.savoir, "k-fonc-liste") : "") +
      (etat ? '<p class="k-fonc-etat"><b>Dans votre cas :</b> ' + etat + '</p>' : "") +
      '<p class="k-fonc-aide">Une question ? <button class="k-btn2" data-aide>Demander au Centre d’aide</button></p>' +
      '</div>';
  }

  return { pastille: pastille, page: page, existe: function(id){ return !!F[id]; }, ids: function(){ var o = []; for (var k in F) if (F.hasOwnProperty(k)) o.push(k); return o; } };
})();

if (typeof module !== "undefined" && module.exports) module.exports = PelyoFonctions;
