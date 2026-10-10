/* =========================================================================
   Pelyo — adresse du projet Supabase et clé PUBLIQUE, par environnement.

   La clé « publishable » (sb_publishable_…) est faite pour vivre dans le
   navigateur : elle n'ouvre que ce que les règles de sécurité de la base
   autorisent (voir supabase/migrations). La clé SECRÈTE (sb_secret_…) ne
   doit JAMAIS apparaître ici ni ailleurs dans le dépôt : l'intégration
   continue refuse tout fichier qui en contient une.

   Chaque environnement a sa propre base (docs/ENVIRONNEMENTS.md) :
     labo et poste local → développement   (pelyo business, Irlande)
     test                → test            (pelyo test, Paris)
     vitrine             → production      (pas encore créée)
   Sans base (clé vide), seul le compte démo fonctionne ; la connexion
   réelle affiche un message au lieu d'échouer.
   ========================================================================= */
var PELYO_ENVIRONNEMENTS = {
  developpement: { supabaseUrl:"https://nusevswiifovftwojwgi.supabase.co", supabaseCle:"sb_publishable_kdnLi023Qu5aaJvX-oEx6g_yYTwkoSx" },
  test:          { supabaseUrl:"https://qlzubsfdlvjfyqjsbxav.supabase.co", supabaseCle:"sb_publishable_kHIESNLrQ_nEL63To69q6g_stA7baO0" },
  production:    { supabaseUrl:"", supabaseCle:"" }
};

var PELYO_CONFIG = (function(){
  var chemin = window.location.pathname;
  var nom = /^\/test\//.test(chemin) ? "test" : /^\/vitrine\//.test(chemin) ? "production" : "developpement";
  var c = PELYO_ENVIRONNEMENTS[nom];
  return { environnement:nom, supabaseUrl:c.supabaseUrl, supabaseCle:c.supabaseCle };
})();
