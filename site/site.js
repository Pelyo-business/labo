/* Pelyo — site : formulaire « demander une démo ».
   La demande part au serveur « courriel » (POST /demo), qui la range dans la
   boîte mail de la console comme un prospect urgent. Tant que ce serveur
   n'est pas déployé (ENVOI vide), le formulaire ouvre un e-mail tout prêt. */
(function () {
  "use strict";
  var ENVOI = ""; /* ex. « https://pelyo-courriel.<compte>.workers.dev/demo » une fois déployé */
  var form = document.getElementById("form-demo"), retour = document.getElementById("retour-demo");
  if (!form) return;

  function dire(texte, ok) { retour.textContent = texte; retour.className = "s-large s-retour " + (ok ? "s-ok" : "s-ko"); }
  function valeur(nom) { return (form.elements[nom] && form.elements[nom].value || "").trim(); }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var d = { prenom: valeur("prenom"), restaurant: valeur("restaurant"), ville: valeur("ville"), telephone: valeur("telephone"),
      email: valeur("email"), message: valeur("message"), site: valeur("site") };
    if (!d.prenom || !d.restaurant || !d.ville || !d.telephone) return dire("Merci de remplir votre prénom, le restaurant, la ville et le téléphone.", false);
    if (d.telephone.replace(/\D/g, "").length < 9) return dire("Ce numéro de téléphone semble incomplet.", false);
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return dire("Cette adresse e-mail semble incorrecte.", false);
    if (d.site) return dire("Merci ! Nous vous rappelons sous 24 h.", true); /* robot : on ne dit rien */

    if (!ENVOI) {
      var corps = "Prénom : " + d.prenom + "\nRestaurant : " + d.restaurant + "\nVille : " + d.ville + "\nTéléphone : " + d.telephone +
        (d.email ? "\nE-mail : " + d.email : "") + (d.message ? "\n\n" + d.message : "");
      location.href = "mailto:bonjour@pelyo.eu?subject=" + encodeURIComponent("Demande de démo — " + d.restaurant) + "&body=" + encodeURIComponent(corps);
      return dire("Votre messagerie s’ouvre avec la demande prête : il ne reste qu’à l’envoyer.", true);
    }
    var bouton = form.querySelector("button[type=submit]");
    bouton.disabled = true; bouton.textContent = "Envoi…";
    fetch(ENVOI, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        form.reset();
        dire("Merci " + d.prenom + " ! Nous vous rappelons sous 24 h.", true);
      })
      .catch(function () { dire("L’envoi n’a pas marché. Écrivez-nous à bonjour@pelyo.eu, on vous répond vite.", false); })
      .then(function () { bouton.disabled = false; bouton.textContent = "Être rappelé pour une démo"; });
  });
})();
