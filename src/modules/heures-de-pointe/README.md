# Anti-rush

Quand la cuisine déborde, l’IA propose une heure plus calme.

- **Identifiant** : `heures-de-pointe` · version 1.0.0 · famille : modules · disponible
- **Qui l'active** : le gérant, depuis Gestion › Connexions
- **Recommandé avec** : `ia_telephone`
- **Prix** : 12 € par mois, 14 jours d'essai · Aucun SMS (provisoire)
- **Branché sur** : `cuisine.rythme`, `cuisine.clic`, `cuisine.phraseIA`, `cuisine.arrivee`, `cuisine.promesse`, `cuisine.etiquette`
- **Écoute** : `charge.changee`, `commande.confirmee`
- **Permissions** : `cuisine:lire`, `commandes:modifier`

## Fichiers

- Interface : `index.js` (dans ce dossier)
- Savoir commercial : fiche `extensions` (`docs/assistant-commercial/savoir.md`)

Le contrat complet (manifeste) : `manifest.json`. Ce dossier est la source ; `catalogue.js` et le SQL du catalogue sont générés (`python3 outils/modules.py`). Voir `docs/ARCHITECTURE-MODULES.md`.
