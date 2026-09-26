/* =========================================================================
   Pelyo — adresse du projet Supabase et clé PUBLIQUE.

   La clé « publishable » (sb_publishable_…) est faite pour vivre dans le
   navigateur : elle n'ouvre que ce que les règles de sécurité de la base
   autorisent (voir supabase/migrations). La clé SECRÈTE (sb_secret_…) ne
   doit JAMAIS apparaître ici ni ailleurs dans le dépôt : l'intégration
   continue refuse tout fichier qui en contient une.

   Clé vide = seul le compte démo fonctionne ; la connexion réelle affiche
   un message au lieu d'échouer.
   ========================================================================= */
var PELYO_CONFIG = {
  supabaseUrl: "https://nusevswiifovftwojwgi.supabase.co",
  supabaseCle: "sb_publishable_kdnLi023Qu5aaJvX-oEx6g_yYTwkoSx"
};
