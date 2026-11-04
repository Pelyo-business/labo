/* ES5. Règles locales de la maquette ; aucun transport ni paiement réel. */
var PelyoKitchen = (function(){
  'use strict';
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function hhmm(ms){var d=new Date(ms);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
  function actif(c){return /^(confirmee|preparation|prete)$/.test(c.etat);}
  function euros(n){return (n/100).toFixed(2).replace('.',',')+' €';}
  function initialise(c,now,reference){
    c.version=c.version||1;c.ackVersion=c.ackVersion||c.version;c.historique=c.historique||[];
    c.lignes.forEach(function(l,i){if(!l.cuisineLineId)l.cuisineLineId=c.id+':initial:'+i;});
    if(c.promesseAt===undefined){
      var m=/^(\d{2}):(\d{2})$/.exec(c.prete||''),r=/^(\d{2}):(\d{2})$/.exec(reference||'');
      c.promesseAt=null;
      if(m&&r){var delta=(+m[1]*60+(+m[2]))-(+r[1]*60+(+r[2]));if(delta < -720)delta+=1440;if(delta>720)delta-=1440;c.promesseAt=now+delta*60000;c.prete=hhmm(c.promesseAt);}
    }
    return c;
  }
  function urgence(c,now){
    if(!actif(c)||!c.promesseAt)return null;
    var sec=Math.round((c.promesseAt-now)/1000);
    return {late:sec<0,minutes:Math.max(0,Math.ceil(Math.abs(sec)/60)),at:c.promesseAt};
  }
  function difference(a,b){
    var out=[];
    a.lignes.forEach(function(x){
      var y=b.lignes.filter(function(l){return l.cuisineLineId===x.cuisineLineId;})[0];
      if(!y){out.push('Retrait : '+x.q+' × '+x.nom);return;}
      [['nom','Produit'],['q','Quantité'],['opt','Options'],['sup','Suppléments'],['dem','Consignes'],['allergie','Allergie déclarée'],['prix','Total de ligne']].forEach(function(f){if(String(x[f[0]]||'')!==String(y[f[0]]||''))out.push(x.nom+' — '+f[1]+': '+(f[0]==='prix'?euros(x.prix):(x[f[0]]||'aucun'))+' → '+(f[0]==='prix'?euros(y.prix):(y[f[0]]||'aucun')));});
    });
    b.lignes.forEach(function(y){if(!a.lignes.some(function(x){return x.cuisineLineId===y.cuisineLineId;}))out.push('Ajout : '+y.q+' × '+y.nom+' · '+euros(y.prix)+(y.opt?' · '+y.opt:'')+(y.sup?' · '+y.sup:'')+(y.dem?' · Consigne : '+y.dem:'')+(y.allergie?' · Allergie déclarée : '+y.allergie:''));});
    if(a.total!==b.total)out.push('Total : '+euros(a.total)+' → '+euros(b.total));
    return out;
  }
  function modifier(c,lignes,confirme,now){
    if(!actif(c))throw Error('Cette commande ne peut plus être modifiée.');
    if(!confirme)throw Error('Confirmez que la modification a été validée avec le client.');
    if(!lignes.length)throw Error('Gardez au moins un produit, ou annulez la commande.');
    lignes.forEach(function(l){if(!l.nom||!NumberIsInteger(l.q)||l.q<1||l.q>99||!NumberIsInteger(l.prix)||l.prix<0||l.prix>1000000)throw Error('Vérifiez les quantités et les prix de ligne.');});
    c.lignes.forEach(function(l,i){if(!l.cuisineLineId)l.cuisineLineId=c.id+':initial:'+i;});
    var next=clone(c),used={};next.lignes=clone(lignes);
    next.lignes.forEach(function(l,i){
      var previous=c.lignes.filter(function(x){return !used[x.cuisineLineId]&&(l.cuisineLineId?x.cuisineLineId===l.cuisineLineId:x.nom===l.nom);})[0];
      l.cuisineLineId=previous?previous.cuisineLineId:c.id+':v'+(c.version+1)+':'+i;used[l.cuisineLineId]=true;
    });
    next.total=lignes.reduce(function(n,l){return n+l.prix;},c.mode==='livraison'?(c.frais||0):0);
    var changements=difference(c,next);if(!changements.length)throw Error('Aucun changement à enregistrer.');
    var avant={lignes:clone(c.lignes),total:c.total};c.lignes=next.lignes;c.total=next.total;c.version++;
    c.historique.push({type:'modification',version:c.version,at:now,details:changements,avant:avant,validation:'Confirmée avec le client, déclaration cuisine (démo)'});
    return c;
  }
  function corrigerLivraison(c,adresse,telephone,confirme,now){
    if(!actif(c)||c.mode!=='livraison')throw Error('Cette livraison ne peut plus être modifiée.');
    if(!confirme)throw Error('Confirmez que ces coordonnées ont été vérifiées avec le client.');
    var next={},champs=[['numero','Numéro'],['rue','Rue'],['codePostal','Code postal'],['ville','Ville'],['complement','Complément'],['acces','Accès']];
    champs.forEach(function(f){next[f[0]]=String(adresse&&adresse[f[0]]||'').trim();if(next[f[0]].length>120)throw Error('Une information de livraison est trop longue.');});
    if(!next.numero||!next.rue||!next.codePostal||!next.ville)throw Error('Renseignez le numéro, la rue, le code postal et la ville.');
    if(!/^\d{5}$/.test(next.codePostal))throw Error('Le code postal doit contenir 5 chiffres.');
    telephone=String(telephone||'').trim();
    if(telephone&&(!/^\+?[0-9 .()\-]{9,24}$/.test(telephone)||telephone.replace(/\D/g,'').length<9||telephone.replace(/\D/g,'').length>15))throw Error('Vérifiez le numéro de téléphone.');
    var before=c.adresseDetail||{},details=[];
    champs.forEach(function(f){if((before[f[0]]||'')!==next[f[0]])details.push(f[1]+' : '+(before[f[0]]||'non renseigné')+' → '+(next[f[0]]||'non renseigné'));});
    if((c.telephoneClient||'')!==telephone)details.push('Téléphone client : '+(c.telephoneClient||'non renseigné')+' → '+(telephone||'non renseigné'));
    if(!details.length)throw Error('Aucun changement à enregistrer.');
    var changedRoute=['numero','rue','codePostal','ville'].some(function(k){return (before[k]||'')!==next[k];});
    var old={adresseDetail:clone(before),adresse:c.adresse||'',telephoneClient:c.telephoneClient||'',km:c.km};
    c.adresseDetail=next;c.adresse=[next.numero,next.rue,next.codePostal,next.ville].join(' ');c.telephoneClient=telephone;
    if(changedRoute){c.km=null;c.distanceARevoir=true;details.push('Distance à revérifier ; frais de livraison et total inchangés.');}
    c.version++;
    c.historique.push({type:'coordonnées de livraison',version:c.version,at:now,details:details,avant:old,validation:'Coordonnées vérifiées avec le client, déclaration cuisine (démo)'});
    return c;
  }
  function NumberIsInteger(n){return typeof n==='number'&&isFinite(n)&&Math.floor(n)===n;}
  function annuler(c,motif,now){
    if(!actif(c))throw Error('Seule une commande active peut être annulée.');
    if(!motif||!motif.trim())throw Error('Indiquez un motif d’annulation.');
    c.version++;c.historique.push({type:'annulation',version:c.version,at:now,details:[motif.trim()].concat(c.probleme?['Problème clos par annulation : '+c.probleme.motif]:[]),ancienEtat:c.etat});c.probleme=null;c.etat='annulee';c.motif=motif.trim();return c;
  }
  function signaler(c,motif,note,route,now){
    if(!actif(c))throw Error('La commande n’est plus active.');
    if(!motif)throw Error('Choisissez le problème rencontré.');
    c.probleme={motif:motif,note:note||'',route:route,at:now};
    c.historique.push({type:'probleme',at:now,details:[motif,note||'',route+' · demande simulée']});
  }
  function resoudre(c,now){if(c.probleme){c.historique.push({type:'resolution',at:now,details:[c.probleme.motif]});c.probleme=null;}}
  function ajouterJob(jobs,c,type,repeat,now){
    var key=c.id+':'+c.version+':'+type;
    if(repeat)key+=':copie:'+now;
    if(jobs.some(function(j){return j.key===key;}))return false;
    jobs.push({key:key,commande:c.id,version:c.version,type:type,etat:'attente',at:now});return true;
  }
  return {clone:clone,hhmm:hhmm,actif:actif,initialise:initialise,urgence:urgence,modifier:modifier,corrigerLivraison:corrigerLivraison,annuler:annuler,signaler:signaler,resoudre:resoudre,ajouterJob:ajouterJob};
})();
