/* =========================================================================
   Pelyo — couche de données : le seul fichier qui parle à Supabase.

   Les applications ne connaissent pas Supabase. Elles demandent si elles
   tournent « pour de vrai » (reel()), reçoivent des commandes déjà
   converties au format de la maquette, et appellent des actions nommées.
   Le design reste dans app-*.js et *.css ; ce fichier ne dessine rien.

   Chaque action prend un rappel cb(erreur, resultat) : l'erreur est
   toujours une phrase en français, prête à afficher.

   ES5 strict (voir outils/gardes/es5.sh). Les promesses de supabase-js
   sont consommées avec .then(function(){…}).
   ========================================================================= */
var PelyoDonnees = (function(){
  "use strict";

  var client = null;
  var mode = "demo";        /* demo | reel */
  var contexte = null;      /* réponse de mon_contexte() */
  var restaurant = null;    /* {id, nom, acces:'gerant'|'cuisine'} ouvert */

  function config(){ return window.PELYO_CONFIG || {}; }

  function disponible(){
    return !!(window.supabase && window.supabase.createClient && config().supabaseUrl && config().supabaseCle);
  }

  function init(){
    if (!client && disponible()){
      client = window.supabase.createClient(config().supabaseUrl, config().supabaseCle, {
        auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:"pelyo-session" }
      });
    }
    return client;
  }

  /* ------------------------------ erreurs ------------------------------ */
  /* Les fonctions de la base lèvent déjà des messages en français ; seules
     les erreurs de Supabase Auth et du réseau sont traduites ici. */
  var TRADUCTIONS = [
    [/Invalid login credentials/i, "E-mail ou mot de passe incorrect."],
    [/Email not confirmed/i, "Confirmez d'abord votre adresse avec le lien reçu par e-mail."],
    [/User already registered/i, "Un compte existe déjà avec cette adresse. Connectez-vous."],
    [/Password should be/i, "Mot de passe trop court : 8 caractères au moins."],
    [/Unable to validate email|invalid format|email address.*invalid/i, "Adresse e-mail invalide."],
    [/Anonymous sign-ins are disabled/i, "Les tablettes cuisine ne sont pas encore activées sur ce projet."],
    [/rate limit|too many|security purposes/i, "Trop de tentatives. Réessayez dans quelques minutes."],
    [/Failed to fetch|NetworkError|Load failed|network/i, "Pas de connexion internet. Réessayez."],
    [/JWT expired|invalid JWT|refresh token/i, "Session expirée. Reconnectez-vous."]
  ];

  function message(err){
    var texte = err ? (err.message || err.error_description || String(err)) : "";
    for (var i = 0; i < TRADUCTIONS.length; i++){
      if (TRADUCTIONS[i][0].test(texte)) return TRADUCTIONS[i][1];
    }
    return texte || "Une erreur inattendue est survenue.";
  }

  function rappel(cb){
    return function(res){ if (res.error) cb(message(res.error)); else cb(null, res.data); };
  }
  function echec(cb){ return function(e){ cb(message(e)); }; }

  function indisponible(cb){
    cb("La connexion au service n'est pas encore configurée. Utilisez le compte démo.");
  }

  /* ------------------------------- comptes ------------------------------- */
  function session(cb){
    if (!init()) return cb(null, null);
    client.auth.getSession().then(function(r){ cb(null, r.data ? r.data.session : null); }, echec(cb));
  }

  function connexion(email, motDePasse, cb){
    if (!init()) return indisponible(cb);
    client.auth.signInWithPassword({ email:email, password:motDePasse }).then(rappel(cb), echec(cb));
  }

  /* Avec la confirmation d'e-mail activée, Supabase ne signale pas un
     compte déjà existant (pour ne pas révéler qui est inscrit) : il renvoie
     un utilisateur sans identité. On le détecte pour guider la personne. */
  function inscription(email, motDePasse, prenom, cb){
    if (!init()) return indisponible(cb);
    client.auth.signUp({
      email:email, password:motDePasse,
      options:{ emailRedirectTo:location.origin + location.pathname, data:{ prenom:prenom } }
    }).then(function(r){
      if (r.error) return cb(message(r.error));
      var u = r.data && r.data.user;
      if (u && u.identities && u.identities.length === 0){
        return cb("Un compte existe déjà avec cette adresse. Connectez-vous.");
      }
      cb(null, { aConfirmer:!(r.data && r.data.session) });
    }, echec(cb));
  }

  function deconnexion(cb){
    arreterEcoutes();
    mode = "demo"; contexte = null; restaurant = null;
    if (!client) return cb && cb();
    client.auth.signOut().then(function(){ if (cb) cb(); }, function(){ if (cb) cb(); });
  }

  function chargerContexte(cb){
    if (!init()) return indisponible(cb);
    client.rpc("mon_contexte").then(function(r){
      if (r.error) return cb(message(r.error));
      contexte = r.data;
      cb(null, contexte);
    }, echec(cb));
  }

  function creerRestaurant(nom, cb){
    client.rpc("creer_restaurant", { p_nom:nom }).then(rappel(cb), echec(cb));
  }

  /* --------------------------- tablette cuisine --------------------------- */
  /* Une tablette n'a ni e-mail ni mot de passe : elle ouvre une session
     anonyme, puis demande l'accès avec le code du restaurant. Elle ne voit
     rien tant que le gérant ne l'a pas autorisée. */
  function relierTablette(code, nom, cb){
    if (!init()) return indisponible(cb);
    client.auth.getSession().then(function(r){
      var s = r.data ? r.data.session : null;
      if (s && s.user && !s.user.is_anonymous){
        return cb("Vous êtes connecté avec un compte gérant : ouvrez directement la Cuisine.");
      }
      if (s) return demander();
      client.auth.signInAnonymously().then(function(a){
        if (a.error) return cb(message(a.error));
        demander();
      }, echec(cb));
    }, echec(cb));
    function demander(){
      client.rpc("demander_acces_cuisine", { p_code:code, p_nom:nom }).then(rappel(cb), echec(cb));
    }
  }

  /* Attend la décision du gérant : temps réel sur sa propre demande, plus un
     contrôle toutes les 5 secondes au cas où la connexion temps réel décroche.
     Renvoie une fonction qui arrête l'attente. */
  function attendreDecision(appareilId, cb){
    var fini = false;
    var canal = client.channel("appareil-" + appareilId)
      .on("postgres_changes",
        { event:"UPDATE", schema:"public", table:"cuisine_appareils", filter:"id=eq." + appareilId },
        function(p){ conclure(p["new"] && p["new"].statut); })
      .subscribe();
    var minuteur = setInterval(function(){
      chargerContexte(function(e, ctx){ if (!e && ctx && ctx.appareil) conclure(ctx.appareil.statut); });
    }, 5000);
    function arreter(){
      fini = true;
      clearInterval(minuteur);
      client.removeChannel(canal);
    }
    function conclure(statut){
      if (fini || !statut || statut === "demande") return;
      arreter();
      cb(statut);
    }
    return arreter;
  }

  /* --------------------------- restaurant ouvert --------------------------- */
  function ouvrirRestaurant(r){ restaurant = r; mode = "reel"; }
  function modeDemo(){ arreterEcoutes(); mode = "demo"; }
  function reel(){ return mode === "reel" && !!restaurant && !!client; }
  function restaurantCourant(){ return restaurant; }
  function contexteCourant(){ return contexte; }

  /* ------------------------------ commandes ------------------------------ */
  var PAIEMENTS = { sur_place:"Sur place", especes_livreur:"Espèces au livreur", carte_livreur:"Carte au livreur" };

  function deux(n){ return (n < 10 ? "0" : "") + n; }
  function hhmm(iso){
    if (!iso) return "";
    var d = new Date(iso);
    return deux(d.getHours()) + ":" + deux(d.getMinutes());
  }
  function ms(iso){ return iso ? Date.parse(iso) : null; }

  /* Une ligne de la base → une commande au format de la maquette cuisine.
     c.id reste le numéro affiché (#12) : c'est lui que l'interface utilise ;
     c.uuid est l'identifiant réel, pour les actions. */
  function versCuisine(r){
    var lignes = (r.commande_lignes || []).slice().sort(function(a, b){ return a.position - b.position; })
      .map(function(l){
        return { q:l.quantite, nom:l.nom, opt:l.options || "", sup:l.supplements || "", dem:l.consigne || "",
                 allergie:l.allergie || "", prix:l.prix_total_cents, cuisineLineId:l.id };
      });
    var recue = ms(r.recue_at);
    var c = {
      uuid:r.id, id:r.numero, etat:r.etat, mode:r.mode, origine:r.origine, test:!!r.est_test,
      client:r.client_nom || "", telephoneClient:r.client_telephone || "",
      heure:hhmm(r.recue_at), date:new Date(recue).toLocaleDateString("fr-FR"),
      lignes:lignes, total:r.total_cents, frais:r.frais_livraison_cents, paiement:PAIEMENTS[r.paiement] || "",
      version:r.version, ackVersion:r.version_vue_cuisine, historique:[], probleme:r.probleme || null,
      motif:r.motif_annulation || "",
      referenceCommande:r.origine === "restaurant" ? (r.reference_caisse || "") : "PLY-" + r.numero,
      referenceCaisse:r.reference_caisse || "", syncCaisse:r.sync_caisse, encaissement:r.encaissement,
      promesseAt:ms(r.promise_at), prete:hhmm(r.promise_at),
      commenceAt:ms(r.commencee_at) || recue,
      expireAt:ms(r.expire_at) || recue
    };
    c.depuis = Math.max(0, Math.floor((Date.now() - c.commenceAt) / 1000));
    c.reste = Math.max(0, Math.ceil((c.expireAt - Date.now()) / 1000));
    if (r.mode === "livraison"){
      c.adresseDetail = { numero:r.adr_numero || "", rue:r.adr_rue || "", codePostal:r.adr_code_postal || "",
                          ville:r.adr_ville || "", complement:r.adr_complement || "", acces:r.adr_acces || "" };
      c.adresse = [r.adr_numero, r.adr_rue, r.adr_code_postal, r.adr_ville].filter(Boolean).join(" ");
      c.km = r.distance_m == null ? null : Math.round(r.distance_m / 100) / 10;
      c.distanceARevoir = !!r.distance_a_revoir;
    }
    return c;
  }

  /* Les commandes encore en cours, plus celles des 18 dernières heures :
     le service du soir et l'historique récent des tickets. */
  function chargerCommandes(cb){
    var depuis = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
    client.from("commandes").select("*, commande_lignes(*)")
      .eq("restaurant_id", restaurant.id)
      .or('etat.in.(appel,attente,confirmee,preparation,prete),recue_at.gte."' + depuis + '"')
      .order("recue_at", { ascending:false })
      .limit(200)
      .then(function(r){
        if (r.error) return cb(message(r.error));
        cb(null, r.data.map(versCuisine));
      }, echec(cb));
  }

  var ecoutes = [];
  function arreterEcoutes(){
    var liste = ecoutes; ecoutes = [];
    liste.forEach(function(arret){ try { arret(); } catch(e){} });
  }

  /* Recharge la liste à chaque changement reçu en temps réel. Filets de
     sécurité pour une tablette qui reste allumée toute la soirée : au retour
     du réseau, au réveil de l'écran, et toutes les 30 secondes. */
  function ecouterCommandes(surListe){
    var r = restaurant.id, attente = null, actif = true;
    function recharger(){
      clearTimeout(attente);
      attente = setTimeout(function(){
        if (!actif) return;
        chargerCommandes(function(e, liste){ if (!e && actif) surListe(liste); });
      }, 200);
    }
    function reveil(){ if (document.visibilityState === "visible") recharger(); }
    var canal = client.channel("cuisine-" + r)
      .on("postgres_changes", { event:"*", schema:"public", table:"commandes", filter:"restaurant_id=eq." + r }, recharger)
      .on("postgres_changes", { event:"*", schema:"public", table:"commande_lignes", filter:"restaurant_id=eq." + r }, recharger)
      .subscribe(function(statut){ if (statut === "SUBSCRIBED") recharger(); });
    var minuteur = setInterval(recharger, 30000);
    window.addEventListener("online", recharger);
    document.addEventListener("visibilitychange", reveil);
    function arret(){
      actif = false;
      clearTimeout(attente); clearInterval(minuteur);
      window.removeEventListener("online", recharger);
      document.removeEventListener("visibilitychange", reveil);
      client.removeChannel(canal);
    }
    ecoutes.push(arret);
    return arret;
  }

  function chargerReglages(cb){
    client.from("restaurants")
      .select("id,nom,charge,delai_retrait_min,delai_livraison_min,capacite,retrait_ouvert,livraison_ouverte,impression_auto,impression_annulations")
      .eq("id", restaurant.id).single().then(rappel(cb), echec(cb));
  }

  function changerEtat(uuid, de, vers, cb){
    client.rpc("changer_etat_commande", { p_commande:uuid, p_de:de, p_vers:vers }).then(rappel(cb), echec(cb));
  }

  function commandeDemo(cb){
    client.rpc("creer_commande_demo", { p_restaurant:restaurant.id }).then(rappel(cb), echec(cb));
  }

  /* --------------------------- accès cuisine (gérant) --------------------------- */
  var DROITS = ["modifier", "annuler", "adresse", "ruptures", "rush", "pause"];

  function chargerAcces(cb){
    var r = restaurant.id;
    client.from("restaurants")
      .select("code_cuisine,perm_modifier,perm_annuler,perm_adresse,perm_ruptures,perm_rush,perm_pause")
      .eq("id", r).single()
      .then(function(a){
        if (a.error) return cb(message(a.error));
        client.from("cuisine_appareils").select("id,nom,statut,demande_at,decide_at")
          .eq("restaurant_id", r).in("statut", ["demande", "autorise"]).order("demande_at")
          .then(function(b){
            if (b.error) return cb(message(b.error));
            var permissions = {};
            DROITS.forEach(function(d){ permissions[d] = !!a.data["perm_" + d]; });
            cb(null, {
              code:a.data.code_cuisine, permissions:permissions,
              demandes:b.data.filter(function(x){ return x.statut === "demande"; }),
              appareils:b.data.filter(function(x){ return x.statut === "autorise"; })
            });
          }, echec(cb));
      }, echec(cb));
  }

  function deciderAppareil(id, autoriser, cb){
    client.rpc("decider_appareil", { p_appareil:id, p_autoriser:autoriser }).then(rappel(cb), echec(cb));
  }
  function revoquerAppareil(id, cb){
    client.rpc("revoquer_appareil", { p_appareil:id }).then(rappel(cb), echec(cb));
  }
  function renouvelerCode(cb){
    client.rpc("renouveler_code_cuisine", { p_restaurant:restaurant.id }).then(rappel(cb), echec(cb));
  }

  function changerPermission(droit, valeur, cb){
    if (DROITS.indexOf(droit) === -1) return cb("Permission inconnue.");
    var maj = {}; maj["perm_" + droit] = !!valeur;
    client.from("restaurants").update(maj).eq("id", restaurant.id).select("id").then(function(r){
      if (r.error) return cb(message(r.error));
      if (!r.data || !r.data.length) return cb("Seul le gérant peut changer les permissions.");
      cb(null);
    }, echec(cb));
  }

  function ecouterAppareils(surChangement){
    var r = restaurant.id;
    var canal = client.channel("appareils-" + r)
      .on("postgres_changes", { event:"*", schema:"public", table:"cuisine_appareils", filter:"restaurant_id=eq." + r },
        function(p){ surChangement(p.eventType, p["new"] || {}); })
      .subscribe();
    function arret(){ client.removeChannel(canal); }
    ecoutes.push(arret);
    return arret;
  }

  return {
    disponible:disponible, session:session, connexion:connexion, inscription:inscription,
    deconnexion:deconnexion, chargerContexte:chargerContexte, creerRestaurant:creerRestaurant,
    relierTablette:relierTablette, attendreDecision:attendreDecision,
    ouvrirRestaurant:ouvrirRestaurant, modeDemo:modeDemo, reel:reel,
    restaurant:restaurantCourant, contexte:contexteCourant,
    chargerCommandes:chargerCommandes, ecouterCommandes:ecouterCommandes, arreterEcoutes:arreterEcoutes,
    chargerReglages:chargerReglages, changerEtat:changerEtat, commandeDemo:commandeDemo,
    chargerAcces:chargerAcces, deciderAppareil:deciderAppareil, revoquerAppareil:revoquerAppareil,
    renouvelerCode:renouvelerCode, changerPermission:changerPermission, ecouterAppareils:ecouterAppareils,
    versCuisine:versCuisine
  };
})();
