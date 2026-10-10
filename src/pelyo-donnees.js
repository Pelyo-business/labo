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
        /* labo et test partagent la même origine (pelyo-business.github.io) :
           une session par environnement, sinon l'une écraserait l'autre. */
        auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true,
               storageKey:config().environnement && config().environnement !== "developpement" ? "pelyo-session-" + config().environnement : "pelyo-session" }
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
    [/should be different from the old password/i, "Choisissez un mot de passe différent de l'ancien."],
    [/Password should be/i, "Mot de passe trop court : 8 caractères au moins."],
    [/Unable to validate email|invalid format|email address.*invalid/i, "Adresse e-mail invalide."],
    [/Anonymous sign-ins are disabled/i, "Les tablettes cuisine ne sont pas encore activées sur ce projet."],
    [/security purposes.*after (\d+) seconds?/i, "Par sécurité, patientez une minute avant de redemander un lien."],
    [/rate limit|too many|security purposes/i, "Trop de tentatives. Réessayez dans quelques minutes."],
    [/Failed to fetch|NetworkError|Load failed|network/i, "Pas de connexion internet. Réessayez."],
    [/JWT expired|invalid JWT|refresh token/i, "Session expirée. Reconnectez-vous."],
    [/Auth session missing|session_not_found/i, "Ce lien n'est plus valide : redemandez un e-mail de mot de passe."]
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

  /* Envoie le lien « nouveau mot de passe ». Supabase ne dit pas si
     l'adresse existe : la réponse est la même dans tous les cas. */
  function motDePasseOublie(email, cb){
    if (!init()) return indisponible(cb);
    client.auth.resetPasswordForEmail(email, { redirectTo:location.origin + location.pathname })
      .then(function(r){ cb(r.error ? message(r.error) : null); }, echec(cb));
  }

  /* Après le lien reçu par e-mail (session de récupération), ou depuis
     l'appli une fois l'ancien mot de passe vérifié. Un mot de passe changé
     ferme toutes les autres sessions du compte : si quelqu'un d'autre
     l'utilisait, il est déconnecté. */
  function changerMotDePasse(mdp, cb){
    if (!init()) return indisponible(cb);
    client.auth.updateUser({ password:mdp }).then(function(r){
      if (r.error) return cb(message(r.error));
      client.auth.signOut({ scope:"others" }).then(function(){ cb(null); }, function(){ cb(null); });
    }, echec(cb));
  }

  /* Adresse du compte connecté (écran « Connexion et sécurité »). */
  function emailCompte(cb){
    session(function(e, s){ cb(e, s && s.user ? s.user.email || "" : ""); });
  }

  /* Changer de mot de passe depuis l'appli : un téléphone resté ouvert ne
     suffit pas, l'actuel est redemandé et vérifié par Supabase. */
  function changerMotDePasseConnecte(actuel, nouveau, cb){
    if (!init()) return indisponible(cb);
    emailCompte(function(e, email){
      if (e) return cb(e);
      if (!email) return cb("Session expirée. Reconnectez-vous.");
      client.auth.signInWithPassword({ email:email, password:actuel }).then(function(r){
        if (r.error) return cb(/Invalid login credentials/i.test(r.error.message || "") ? "Mot de passe actuel incorrect." : message(r.error));
        changerMotDePasse(nouveau, cb);
      }, echec(cb));
    });
  }

  /* Nouvelle adresse de connexion : le mot de passe est redemandé, puis
     Supabase envoie un lien de confirmation (e-mail « Changement
     d'adresse ») ; l'adresse ne change qu'après le clic. */
  function changerEmail(actuel, nouvel, cb){
    if (!init()) return indisponible(cb);
    emailCompte(function(e, email){
      if (e) return cb(e);
      if (!email) return cb("Session expirée. Reconnectez-vous.");
      if (String(nouvel).trim().toLowerCase() === email.toLowerCase()) return cb("C'est déjà votre adresse de connexion.");
      client.auth.signInWithPassword({ email:email, password:actuel }).then(function(r){
        if (r.error) return cb(/Invalid login credentials/i.test(r.error.message || "") ? "Mot de passe actuel incorrect." : message(r.error));
        client.auth.updateUser({ email:String(nouvel).trim() }, { emailRedirectTo:location.origin + location.pathname })
          .then(function(u){ cb(u.error ? message(u.error) : null); }, echec(cb));
      }, echec(cb));
    });
  }

  /* Ferme les sessions du compte sur tous les autres téléphones et
     ordinateurs (les tablettes cuisine ont leur propre accès). */
  function deconnecterAutres(cb){
    if (!init()) return indisponible(cb);
    client.auth.signOut({ scope:"others" }).then(function(r){ cb(r && r.error ? message(r.error) : null); }, echec(cb));
  }

  function deconnexion(cb){
    arreterEcoutes();
    mode = "demo"; contexte = null; restaurant = null;
    if (!client) return cb && cb();
    client.auth.signOut().then(function(){ if (cb) cb(); }, function(){ if (cb) cb(); });
  }

  /* Oublie la session sur cet appareil seulement (appli gérant : connexion
     redemandée à chaque ouverture). */
  function oublierSessionLocale(cb){
    arreterEcoutes();
    mode = "demo"; contexte = null; restaurant = null;
    if (!init()) return cb && cb();
    client.auth.signOut({ scope:"local" }).then(function(){ if (cb) cb(); }, function(){ if (cb) cb(); });
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

  /* Le journal d'une commande → son historique affiché en cuisine. On n'y
     montre que ce qui change la commande ; les étapes du passe et les
     lectures restent dans le journal complet. */
  var HISTORIQUE = { modification:"modification", livraison:"coordonnées de livraison", annulation:"annulation",
                     probleme:"problème", resolution:"résolution" };
  var VALIDATION = { modification:"Accord du client confirmé en cuisine", livraison:"Coordonnées vérifiées avec le client" };

  function versHistorique(journal){
    return (journal || []).filter(function(j){ return HISTORIQUE[j.type]; })
      .sort(function(a, b){ return a.id - b.id; })
      .map(function(j){
        /* Seuls les changements de la commande portent une version : un
           problème ne s'imprime pas comme un correctif. */
        var versionne = j.type === "modification" || j.type === "livraison" || j.type === "annulation";
        return { type:HISTORIQUE[j.type], version:versionne ? j.version : undefined, at:ms(j.created_at),
                 details:Array.isArray(j.details) ? j.details : [], validation:VALIDATION[j.type] || "" };
      });
  }

  function versProbleme(p){
    if (!p) return null;
    return { motif:p.motif || "", note:p.note || "", route:p.suite || "", at:ms(p.at), appareil:p.appareil || "" };
  }

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
      version:r.version, ackVersion:r.version_vue_cuisine, historique:versHistorique(r.journal), probleme:versProbleme(r.probleme),
      motif:r.motif_annulation || "",
      referenceCommande:r.origine === "restaurant" ? (r.reference_caisse || "") : "PLY-" + r.numero,
      referenceCaisse:r.reference_caisse || "", syncCaisse:r.sync_caisse, encaissement:r.encaissement,
      promesseAt:ms(r.promise_at), prete:hhmm(r.promise_at), recueAt:recue,
      commenceAt:ms(r.commencee_at) || recue, preteAt:ms(r.prete_at) || null,
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
    client.from("commandes").select("*, commande_lignes(*), journal(id,type,version,details,created_at)")
      .eq("restaurant_id", restaurant.id)
      .or('etat.in.(appel,attente,confirmee,preparation,prete),recue_at.gte."' + depuis + '"')
      .order("recue_at", { ascending:false })
      .limit(200)
      .then(function(r){
        if (r.error) return cb(message(r.error));
        cb(null, r.data.map(versCuisine));
      }, echec(cb));
  }

  /* Appli gérant : tout le tableau de bord en un appel (calculé dans la
     base, voir la migration « tableau_gerant »). */
  function tableauGerant(cb){
    client.rpc("tableau_gerant", { p_restaurant:restaurant.id }).then(rappel(cb), echec(cb));
  }
  /* Réglages du restaurant que le gérant modifie lui-même (colonnes
     autorisées par la base ; le rythme passe par reglerService). */
  function majRestaurant(champs, cb){
    client.from("restaurants").update(champs).eq("id", restaurant.id).then(rappel(cb), echec(cb));
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
      .select("id,nom,charge,delai_retrait_min,delai_livraison_min,capacite,retrait_ouvert,livraison_ouverte,impression_auto,impression_annulations," +
        "adr_numero,adr_rue,adr_code_postal,adr_ville,telephone_public")
      .eq("id", restaurant.id).single().then(rappel(cb), echec(cb));
  }

  function changerEtat(uuid, de, vers, cb){
    client.rpc("changer_etat_commande", { p_commande:uuid, p_de:de, p_vers:vers }).then(rappel(cb), echec(cb));
  }

  function commandeDemo(cb){
    client.rpc("creer_commande_demo", { p_restaurant:restaurant.id }).then(rappel(cb), echec(cb));
  }

  /* ------------------------ gestes sur une commande ------------------------ */
  /* version : celle que l'appareil avait sous les yeux. Si un autre appareil
     a changé la commande entre-temps, la base refuse au lieu d'écraser. */
  function versLigneBase(l){
    return { id:l.cuisineLineId || "", nom:l.nom, quantite:l.q, prix_total_cents:l.prix,
             options:l.opt || "", supplements:l.sup || "", consigne:l.dem || "", allergie:l.allergie || "" };
  }

  function modifierCommande(uuid, version, lignes, details, confirme, cb){
    client.rpc("modifier_commande", { p_commande:uuid, p_version:version, p_lignes:lignes.map(versLigneBase),
      p_details:details || [], p_confirme:!!confirme }).then(rappel(cb), echec(cb));
  }

  function corrigerLivraison(uuid, version, a, telephone, details, confirme, cb){
    client.rpc("corriger_livraison", { p_commande:uuid, p_version:version,
      p_adresse:{ numero:a.numero || "", rue:a.rue || "", code_postal:a.codePostal || "", ville:a.ville || "",
                  complement:a.complement || "", acces:a.acces || "" },
      p_telephone:telephone || "", p_details:details || [], p_confirme:!!confirme }).then(rappel(cb), echec(cb));
  }

  function annulerCommande(uuid, version, motif, cb){
    client.rpc("annuler_commande", { p_commande:uuid, p_version:version, p_motif:motif }).then(rappel(cb), echec(cb));
  }

  function signalerProbleme(uuid, motif, note, suite, cb){
    client.rpc("signaler_probleme", { p_commande:uuid, p_motif:motif, p_note:note || "", p_suite:suite || "" })
      .then(rappel(cb), echec(cb));
  }

  function resoudreProbleme(uuid, cb){
    client.rpc("resoudre_probleme", { p_commande:uuid }).then(rappel(cb), echec(cb));
  }

  function marquerVue(uuid, version, cb){
    client.rpc("marquer_vue", { p_commande:uuid, p_version:version }).then(rappel(cb), echec(cb));
  }

  /* ------------------------- rythme et réglages ------------------------- */
  /* reglages ne porte que ce qui change : {charge:"rush", delai_retrait_min:30}. */
  function reglerService(reglages, cb){
    client.rpc("regler_service", { p_restaurant:restaurant.id, p_reglages:reglages }).then(rappel(cb), echec(cb));
  }

  /* Le rythme changé ailleurs (autre tablette, gérant) arrive ici. */
  function ecouterReglages(surReglages){
    var r = restaurant.id;
    var canal = client.channel("reglages-" + r)
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"restaurants", filter:"id=eq." + r },
        function(p){ if (p["new"]) surReglages(p["new"]); })
      .subscribe();
    function arret(){ client.removeChannel(canal); }
    ecoutes.push(arret);
    return arret;
  }

  /* ------------------------------ la carte ------------------------------ */
  /* Disponible si rien ne l'a suspendu, ou si la rupture datée est passée
     (la base ne repasse pas la ligne à « disponible » d'elle-même). */
  function dispo(x){ return !!x.disponible || (!!x.rupture_jusqu_a && Date.parse(x.rupture_jusqu_a) <= Date.now()); }
  function fin(x){ return !dispo(x) && x.rupture_jusqu_a ? Date.parse(x.rupture_jusqu_a) : null; }
  function parPosition(a, b){ return (a.position || 0) - (b.position || 0); }

  /* La carte au format de la maquette ({cat, items:[…]}), plus les
     identifiants dont la cuisine a besoin pour poser une rupture. */
  function chargerCarte(cb){
    var r = restaurant.id;
    function q(t, champs){ return client.from(t).select(champs).eq("restaurant_id", r); }
    Promise.all([
      q("carte_categories", "id,nom,position,disponible,rupture_jusqu_a"),
      q("carte_produits", "id,categorie_id,nom,prix_cents,disponible,rupture_jusqu_a,populaire,inclus,precisions,allergenes,consignes_admises,position," +
        "carte_groupes(nom,min_choix,max_choix,position,carte_choix(nom,position)),carte_produit_supplements(supplement_id,prix_cents,position)"),
      q("carte_supplements", "id,nom,disponible,rupture_jusqu_a"),
      q("carte_ingredients", "id,nom,disponible,rupture_jusqu_a,carte_produit_ingredients(produit_id)")
    ]).then(function(res){
      for (var i = 0; i < res.length; i++) if (res[i].error) return cb(message(res[i].error));
      var sups = {};
      res[2].data.forEach(function(s){ sups[s.id] = s; });
      var menu = res[0].data.slice().sort(parPosition).map(function(c){
        return {
          id:c.id, cat:c.nom, dispo:dispo(c), fin:fin(c),
          items:res[1].data.filter(function(p){ return p.categorie_id === c.id; }).sort(parPosition).map(function(p){
            return {
              id:p.id, nom:p.nom, prix:p.prix_cents, dispo:dispo(p), fin:fin(p), pop:!!p.populaire, inclus:p.inclus || "",
              prec:p.precisions || "", dem:(p.consignes_admises || []).join(" · "), allergenes:p.allergenes || [],
              obl:(p.carte_groupes || []).slice().sort(parPosition).map(function(g){
                return { nom:g.nom, min:g.min_choix, max:g.max_choix,
                         choix:(g.carte_choix || []).slice().sort(parPosition).map(function(x){ return x.nom; }).join(" · ") };
              }),
              sup:(p.carte_produit_supplements || []).slice().sort(parPosition).filter(function(x){ return sups[x.supplement_id]; })
                .map(function(x){ var s = sups[x.supplement_id]; return { id:s.id, nom:s.nom, prix:x.prix_cents, dispo:dispo(s), fin:fin(s) }; })
            };
          })
        };
      });
      cb(null, {
        menu:menu,
        supplements:res[2].data.map(function(s){ return { id:s.id, nom:s.nom, dispo:dispo(s), fin:fin(s) }; }),
        ingredients:res[3].data.map(function(x){
          return { id:x.id, nom:x.nom, dispo:dispo(x), fin:fin(x),
                   produits:(x.carte_produit_ingredients || []).map(function(l){ return l.produit_id; }) };
        })
      });
    }, echec(cb));
  }

  /* type : produit | categorie | supplement | ingredient ; jusqua : heure
     de fin en millisecondes, ou null pour « jusqu'à réactivation ». */
  function changerDisponibilite(type, id, disponible, jusqua, cb){
    client.rpc("changer_disponibilite", { p_type:type, p_id:id, p_disponible:!!disponible,
      p_jusqu_a:jusqua ? new Date(jusqua).toISOString() : null }).then(rappel(cb), echec(cb));
  }

  /* Démarrage : le gérant a-t-il fini l'assistant ? (migration « demarrage ») */
  function etatDemarrage(cb){
    client.from("restaurants").select("demarrage_fini_at,numero_pelyo").eq("id", restaurant.id).single().then(rappel(cb), echec(cb));
  }

  /* Carte composée par le gérant (voir la migration « carte_gerant »). */
  function enregistrerProduit(produit, cb){
    client.rpc("enregistrer_produit", { p_restaurant:restaurant.id, p:produit }).then(rappel(cb), echec(cb));
  }
  function supprimerProduit(id, cb){
    client.rpc("supprimer_produit", { p_restaurant:restaurant.id, p_id:id }).then(rappel(cb), echec(cb));
  }
  function modifierCategorie(id, nom, cb){
    client.rpc("modifier_categorie", { p_restaurant:restaurant.id, p_id:id, p_nom:nom }).then(rappel(cb), echec(cb));
  }

  function chargerCarteExemple(cb){
    client.rpc("charger_carte_exemple", { p_restaurant:restaurant.id }).then(rappel(cb), echec(cb));
  }

  /* Une rupture posée sur une autre tablette ou chez le gérant arrive ici. */
  function ecouterCarte(surChangement){
    var r = restaurant.id, attente = null;
    function signaler(){ clearTimeout(attente); attente = setTimeout(surChangement, 300); }
    var canal = client.channel("carte-" + r);
    ["carte_categories", "carte_produits", "carte_supplements", "carte_ingredients"].forEach(function(t){
      canal = canal.on("postgres_changes", { event:"*", schema:"public", table:t, filter:"restaurant_id=eq." + r }, signaler);
    });
    canal.subscribe();
    function arret(){ clearTimeout(attente); client.removeChannel(canal); }
    ecoutes.push(arret);
    return arret;
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

  /* ----------------------------- commercial ----------------------------- */
  /* Le commercial n'ouvre pas de restaurant : il travaille sur ses zones.
     Toutes les règles (réservation, blocage, protection, preuve) sont
     appliquées par la base ; l'appli ne fait qu'afficher et demander. */
  function ouvrirCommercial(){ mode = "reel"; }
  function commercialReel(){
    return mode === "reel" && !!client && !!contexte &&
      (contexte.role === "commercial" || contexte.role === "fondateur");
  }
  function moi(){ return contexte ? contexte.utilisateur : null; }

  /* Supabase renvoie 1 000 lignes au plus par requête : on page. */
  function toutesLesLignes(requete, cb){
    var lignes = [], TAILLE = 1000;
    function page(debut){
      requete().range(debut, debut + TAILLE - 1).then(function(r){
        if (r.error) return cb(message(r.error));
        lignes = lignes.concat(r.data || []);
        if ((r.data || []).length === TAILLE) page(debut + TAILLE); else cb(null, lignes);
      }, echec(cb));
    }
    page(0);
  }

  var COLONNES_PROSPECT = "id,zone_id,nom,type,adr_numero,adr_rue,adr_code_postal,adr_ville,latitude,longitude," +
    "telephone,statut,reserve_par,reserve_jusqu_a,protege_jusqu_a,retour_le,commercial_id";

  function versProspect(x){
    var adr = [x.adr_numero, x.adr_rue].filter(Boolean).join(" ");
    return {
      id:x.id, zone:x.zone_id, nom:x.nom, genre:x.type,
      adr:adr, ville:[x.adr_code_postal, x.adr_ville].filter(Boolean).join(" "),
      lat:x.latitude, lon:x.longitude, tel:x.telephone || "",
      statut:x.statut, reservePar:x.reserve_par, reserveJusqua:ms(x.reserve_jusqu_a),
      protegeJusqua:ms(x.protege_jusqu_a), retourLe:x.retour_le, suiviPar:x.commercial_id
    };
  }

  /* Charge tout ce que l'appli commercial affiche, après avoir laissé la
     base expirer les réservations échues. */
  function chargerCrm(cb){
    if (!init()) return indisponible(cb);
    client.rpc("rafraichir_crm").then(function(r){
      if (r.error) return cb(message(r.error));
      var res = {}, reste = 5, fini = false;
      function un(cle){ return function(e, v){
        if (fini) return;
        if (e){ fini = true; return cb(e); }
        res[cle] = v;
        if (--reste === 0){ fini = true; cb(null, res); }
      }; }
      toutesLesLignes(function(){ return client.from("prospects").select(COLONNES_PROSPECT).order("id"); }, function(e, l){
        un("prospects")(e, l && l.map(versProspect));
      });
      client.from("zones").select("id,nom").order("nom").then(function(r){ un("zones")(r.error && message(r.error), r.data); }, echec(un("zones")));
      client.from("prospect_actions").select("prospect_id,type,resultat,objection,preuve_photo_chemin,latitude,created_at")
        .eq("commercial_id", moi()).order("created_at", { ascending:false }).limit(1000)
        .then(function(r){ un("actions")(r.error && message(r.error), r.data); }, echec(un("actions")));
      client.from("prospect_blocages").select("prospect_id,jusqu_a").eq("commercial_id", moi())
        .then(function(r){ un("blocages")(r.error && message(r.error), r.data); }, echec(un("blocages")));
      client.from("commissions").select("mois,montant_cents,statut").eq("commercial_id", moi())
        .order("mois", { ascending:false }).limit(24)
        .then(function(r){ un("commissions")(r.error && message(r.error), r.data); }, echec(un("commissions")));
    }, echec(cb));
  }

  function reserverProspect(id, cb){
    client.rpc("reserver_prospect", { p_prospect:id }).then(function(r){
      if (r.error) return cb(message(r.error));
      cb(null, ms(r.data));
    }, echec(cb));
  }

  function libererProspect(id, cb){
    client.rpc("liberer_prospect", { p_prospect:id }).then(rappel(cb), echec(cb));
  }

  /* a : { prospect, type (appel|message|porte_a_porte), suite (sansrep|
     attente|refus|essai|stop), resultat, objection, retourLe, photo, lat, lon } */
  function enregistrerAction(a, cb){
    client.rpc("enregistrer_action", {
      p_prospect:a.prospect, p_type:a.type, p_suite:a.suite,
      p_resultat:a.resultat || null, p_objection:a.objection || null, p_retour_le:a.retourLe || null,
      p_photo:a.photo || null, p_latitude:a.lat == null ? null : a.lat, p_longitude:a.lon == null ? null : a.lon
    }).then(rappel(cb), echec(cb));
  }

  /* Dépose la photo de devanture (déjà réduite) dans le dossier privé du
     commercial ; renvoie son chemin, à passer à enregistrerAction. */
  function deposerPhoto(prospectId, fichier, cb){
    var chemin = moi() + "/" + prospectId + "-" + Date.now() + ".jpg";
    client.storage.from("preuves").upload(chemin, fichier, { contentType:"image/jpeg", upsert:false })
      .then(function(r){ if (r.error) return cb(message(r.error)); cb(null, chemin); }, echec(cb));
  }

  function ecouterProspects(surChangement){
    var canal = client.channel("prospects-" + moi())
      .on("postgres_changes", { event:"*", schema:"public", table:"prospects" },
        function(p){ if (p["new"] && p["new"].id) surChangement(versProspect(p["new"])); })
      .subscribe();
    function arret(){ client.removeChannel(canal); }
    ecoutes.push(arret);
    return arret;
  }

  /* ---------------------------- centre d'aide ---------------------------- */
  /* Une question à l'assistant Pelyo (fonction serveur « aide »). Envoie le
     texte et/ou la réponse à une action proposée ; reçoit la réponse, les
     nouvelles propositions et l'identifiant de conversation à renvoyer. */
  function aide(demande, cb){
    if (!init() || !restaurant) return indisponible(cb);
    var corps = { restaurant_id:restaurant.id };
    for (var k in demande) if (Object.prototype.hasOwnProperty.call(demande, k)) corps[k] = demande[k];
    client.functions.invoke("aide", { body:corps }).then(function(r){
      if (!r.error) return cb(null, r.data);
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === "function"){
        ctx.json().then(function(j){ cb((j && j.erreur) || "L'assistant ne répond pas. Réessayez."); },
                        function(){ cb("L'assistant ne répond pas. Réessayez."); });
      } else cb(message(r.error));
    }, echec(cb));
  }

  /* Import de carte (fonction serveur « import-carte ») : photos ou PDF en
     base64 et/ou texte collé → brouillon { categories, remarques }. Rien
     n'est écrit dans la carte : le gérant relit puis enregistre produit par
     produit. */
  function importerCarte(demande, cb){
    if (!init() || !restaurant) return indisponible(cb);
    var corps = { restaurant_id:restaurant.id, fichiers:demande.fichiers || [], texte:demande.texte || "" };
    client.functions.invoke("import-carte", { body:corps }).then(function(r){
      if (!r.error) return cb(null, r.data);
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === "function"){
        ctx.json().then(function(j){ cb((j && j.erreur) || "La lecture n'a pas marché. Réessayez."); },
                        function(){ cb("La lecture n'a pas marché. Réessayez."); });
      } else cb(message(r.error));
    }, echec(cb));
  }

  /* ----------------------------- plantages ----------------------------- */
  /* Appelé par pelyo-erreurs.js ; sans réponse attendue. */
  function signalerErreur(x){
    if (!init()) return;
    client.rpc("signaler_erreur", { p_app:x.app, p_message:x.message, p_source:x.source, p_ligne:x.ligne, p_colonne:x.colonne,
      p_pile:x.pile, p_page:x.page, p_version:x.version, p_navigateur:x.navigateur }).then(function(){}, function(){});
  }

  /* ------------------------------ données (RGPD) ------------------------------ */
  /* Avant un export avec les coordonnées des clients, le mot de passe est
     redemandé : un téléphone resté ouvert ne suffit pas. */
  function verifierMotDePasse(mdp, cb){
    if (!init()) return indisponible(cb);
    emailCompte(function(e, email){
      if (e) return cb(e);
      if (!email) return cb("Session expirée. Reconnectez-vous.");
      client.auth.signInWithPassword({ email:email, password:mdp }).then(function(r){
        if (r.error) return cb(/Invalid login credentials/i.test(r.error.message || "") ? "Mot de passe incorrect." : message(r.error));
        cb(null);
      }, echec(cb));
    });
  }
  function exporterDonnees(avecClients, cb){
    if (!init() || !restaurant) return indisponible(cb);
    client.rpc("exporter_donnees", { p_restaurant:restaurant.id, p_clients:!!avecClients }).then(rappel(cb), echec(cb));
  }
  function oublierClient(telephone, cb){
    if (!init() || !restaurant) return indisponible(cb);
    client.rpc("oublier_client", { p_restaurant:restaurant.id, p_telephone:telephone }).then(rappel(cb), echec(cb));
  }

  /* ----------------------------- notifications ----------------------------- */
  /* Clé publique du serveur « notifications » (pour abonner l'appareil). */
  function cleNotifications(cb){
    if (!init()) return indisponible(cb);
    client.functions.invoke("notifications", { method:"GET" }).then(function(r){
      if (r.error || !r.data || !r.data.cle_publique) return cb("Les notifications ne sont pas encore prêtes sur le serveur.");
      cb(null, r.data.cle_publique);
    }, echec(cb));
  }
  function abonnerNotifications(sub, appareil, prefs, cb){
    if (!init() || !restaurant) return indisponible(cb);
    client.rpc("abonner_notifications", { p_restaurant:restaurant.id, p_endpoint:sub.endpoint, p_p256dh:(sub.keys || {}).p256dh,
      p_auth:(sub.keys || {}).auth, p_appareil:appareil, p_commandes:prefs.commandes !== false, p_appareils:prefs.appareils !== false })
      .then(rappel(cb), echec(cb));
  }
  function desabonnerNotifications(endpoint, cb){
    if (!init()) return indisponible(cb);
    client.rpc("desabonner_notifications", { p_endpoint:endpoint }).then(rappel(cb), echec(cb));
  }
  function testerNotification(cb){
    if (!init() || !restaurant) return indisponible(cb);
    client.rpc("tester_notification", { p_restaurant:restaurant.id }).then(rappel(cb), echec(cb));
  }
  /* Appareils que CE compte a abonnés pour ce restaurant. */
  function mesNotifications(cb){
    if (!init() || !restaurant) return indisponible(cb);
    client.from("notif_abonnements").select("id,appareil,commandes,appareils,created_at")
      .eq("restaurant_id", restaurant.id).order("created_at").then(rappel(cb), echec(cb));
  }

  return {
    aide:aide, importerCarte:importerCarte,
    cleNotifications:cleNotifications, abonnerNotifications:abonnerNotifications, desabonnerNotifications:desabonnerNotifications,
    testerNotification:testerNotification, mesNotifications:mesNotifications,
    verifierMotDePasse:verifierMotDePasse, exporterDonnees:exporterDonnees, oublierClient:oublierClient, signalerErreur:signalerErreur,
    ouvrirCommercial:ouvrirCommercial, commercialReel:commercialReel, moi:moi,
    chargerCrm:chargerCrm, reserverProspect:reserverProspect, libererProspect:libererProspect,
    enregistrerAction:enregistrerAction, deposerPhoto:deposerPhoto, ecouterProspects:ecouterProspects,
    disponible:disponible, session:session, connexion:connexion, inscription:inscription,
    motDePasseOublie:motDePasseOublie, changerMotDePasse:changerMotDePasse,
    emailCompte:emailCompte, changerEmail:changerEmail, changerMotDePasseConnecte:changerMotDePasseConnecte, deconnecterAutres:deconnecterAutres,
    deconnexion:deconnexion, chargerContexte:chargerContexte, creerRestaurant:creerRestaurant,
    relierTablette:relierTablette, attendreDecision:attendreDecision,
    ouvrirRestaurant:ouvrirRestaurant, modeDemo:modeDemo, reel:reel, oublierSessionLocale:oublierSessionLocale,
    restaurant:restaurantCourant, contexte:contexteCourant,
    chargerCommandes:chargerCommandes, tableauGerant:tableauGerant, majRestaurant:majRestaurant, ecouterCommandes:ecouterCommandes, arreterEcoutes:arreterEcoutes,
    chargerReglages:chargerReglages, changerEtat:changerEtat, commandeDemo:commandeDemo,
    modifierCommande:modifierCommande, corrigerLivraison:corrigerLivraison, annulerCommande:annulerCommande,
    signalerProbleme:signalerProbleme, resoudreProbleme:resoudreProbleme, marquerVue:marquerVue,
    reglerService:reglerService, ecouterReglages:ecouterReglages,
    chargerCarte:chargerCarte, changerDisponibilite:changerDisponibilite, chargerCarteExemple:chargerCarteExemple,
    etatDemarrage:etatDemarrage, enregistrerProduit:enregistrerProduit, supprimerProduit:supprimerProduit, modifierCategorie:modifierCategorie,
    ecouterCarte:ecouterCarte,
    chargerAcces:chargerAcces, deciderAppareil:deciderAppareil, revoquerAppareil:revoquerAppareil,
    renouvelerCode:renouvelerCode, changerPermission:changerPermission, ecouterAppareils:ecouterAppareils,
    versCuisine:versCuisine
  };
})();
