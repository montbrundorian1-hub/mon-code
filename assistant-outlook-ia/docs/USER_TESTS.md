# Tests manuels — procédure pas à pas (non-développeur)

> **Règle absolue : uniquement des textes et messages INVENTÉS.** Aucun nom de patient, aucune donnée réelle, à aucune étape. Exemples fictifs fournis ci-dessous.

Pour chaque étape, notez le résultat dans le tableau de la fin (✅ / ❌ + message affiché). En cas de problème, n'envoyez que le **rapport technique** de l'onglet Diagnostic (§13).

---

## 1. Lancer la version de démonstration sur votre ordinateur

Prérequis : [Node.js 22](https://nodejs.org) (installation sur votre PC personnel, pas sur un poste du CHU).

```bash
cd assistant-outlook-ia
npm install
npm run dev
```

Ouvrez http://localhost:3000 dans **Edge**. Attendu : l'application s'affiche avec le badge orange **« Démo · rédaction »**.

Sans rien installer : ouvrez directement l'adresse du site déployé (§2) dans Edge.

## 2. Déployer gratuitement le site HTTPS de test

Suivez `docs/DEPLOYMENT.md` §2 (GitHub Pages si le dépôt est public, sinon Netlify Drop). Attendu : l'adresse `https://…/` affiche l'application en mode démonstration.

## 3. Compléter les URL du manifest

```bash
npm run manifest -- https://VOTRE-ADRESSE/
```

Ouvrez `manifest.xml` dans un éditeur de texte : toutes les adresses commencent par votre URL en `https://`.

## 4. Importer le XML dans le webmail du CHU (si autorisé)

Comme pour « Hello world » : OWA → *Paramètres → Gérer les compléments → Mes compléments → Ajouter un complément personnalisé → À partir d'un fichier* → `manifest.xml`.
Attendu : « Assistant Outlook IA » apparaît dans la liste.

## 5. Ouvrir le panneau

1. Cliquez sur **Nouveau message** (brouillon vide, destinataire fictif ou aucun).
2. Cherchez le bouton **« Assistant IA »** dans la barre du message (ou menu « … »).
3. Attendu : le panneau s'ouvre ; le badge indique **« Outlook · rédaction »** (et non « Démo »).
4. Ouvrez ensuite un mail reçu **sans données sensibles** (ex. une newsletter) : le bouton doit aussi apparaître ; badge **« Outlook · lecture »**.
   - S'il n'apparaît pas en lecture : noter (la surface de lecture n'est peut-être pas prise en charge par cette version d'OWA).

## 6. Identifier la version et les capacités Outlook

Onglet **Diagnostic** (icône « pouls ») :
- *Outlook / Jeux d'API Mailbox* : attendu « 1.1 → 1.5 » pour Exchange 2016/2019.
- *Version du client*, *Plateforme* : recopier les valeurs.
- *Méthodes* : `body.setSelectedDataAsync`, `body.prependAsync`, `item.displayReplyForm`…
- *Micro autorisé par la page hôte* : **point clé** — « oui » ou « non (bloqué par le cadre Outlook) ».
- *WebGPU*, *WebAssembly SIMD*, *Mémoire*, *Cœurs* : recopier.

Bouton **« Copier le rapport technique »** : colle un texte sans aucune donnée personnelle (vérifiez-le).

## 7. Tester le microphone avec une phrase fictive

Diagnostic → **« Tester le micro (3 s) »** → autoriser le micro si Edge le demande → dire : *« Ceci est un test fictif du micro. »*
- Attendu : « Micro fonctionnel (niveau maximal …) ».
- Si « refusé » ou « bloqué par le cadre Outlook » : passer au §7b.

### 7b. Si le micro est bloqué dans le panneau

Onglet **Dicter** → bouton **« Ouvrir la dictée dans une fenêtre séparée »**. Une fenêtre s'ouvre (autorisez les fenêtres contextuelles si Edge les bloque) ; autorisez le micro dans cette fenêtre. Notez si cela fonctionne.

## 8. Sélectionner et charger un modèle local

Onglet **Dicter** (ou **Modèles**, icône à curseurs en haut à droite) :
1. Carte *Dictée vocale* : le modèle **recommandé** est présélectionné, avec sa **taille** (les autres sont sous « Autres modèles »).
2. Cocher la case de consentement (le bouton reste grisé sans elle), puis **« Télécharger et activer »**.
3. Attendu : barre de progression (« … Mo sur … Mo »), bouton **Annuler** ; puis l'orbe de dictée devient colorée.
4. Dans **Modèles → Détails techniques du poste** : profil (carte graphique / processeur), mémoire, cœurs.
   - Durées mesurées en test (PC 4 cœurs, sans GPU) : whisper-base 38 s, whisper-small 45 s (téléchargement inclus, connexion rapide).
5. Sur un poste du CHU : si le téléchargement échoue (« le réseau bloque peut-être huggingface.co »), notez-le ; essayez le modèle plus léger proposé.
6. Facultatif : *Rédaction par IA locale (expérimental)* — **seulement sur votre PC personnel** et si la taille annoncée vous convient (500 Mo à 1,8 Go).

## 9. Dicter un mail fictif

Onglet **Dicter** → toucher l'**orbe** colorée (gros bouton rond) → lire à voix haute, en marquant de courtes pauses :

> « Bonjour docteur Martin, je vous écris au sujet de madame Exemple, vue en consultation le douze mars. *(pause)* Nous avons débuté le paracétamol à un gramme toutes les six heures pendant cinq jours. Pouvez-vous la revoir dans deux semaines ? Merci d'avance. »

Vérifier :
- bandeau rouge **« Micro actif »** en haut (avec chronomètre et bouton « Arrêter le micro »), orbe animée, « Je vous écoute… » ;
- le texte apparaît **après chaque pause** (transcription par segments) ; mention « transcription… » pendant le calcul ;
- **Pause** : le bandeau rouge disparaît (micro libéré) ; **Reprendre** ; **Terminer** ;
- **Échap** arrête immédiatement le micro ;
- raccourci **Ctrl+Maj+Espace** (panneau actif) démarre/arrête la dictée.

## 10. Comparer la transcription et la rédaction

Après **Terminer** : corriger éventuellement le texte (« Votre dictée »), puis **« Rédiger le mail »**. L'onglet **Rédiger**
présente une conversation : votre texte à droite, la proposition de l'assistant en dessous.
- *Version rédigée* : formule d'appel, paragraphes, formule de politesse ;
- *Original* : votre dictée intacte ;
- *Différences* : ajouts en vert, suppressions en rouge barré ;
- encadré vert (« Dates, doses… retrouvés ») ou orange (**« N points à vérifier »**) : chaque date/dose/nombre/médicament perdu ou ajouté, chaque correction automatique. Il est **recalculé** après chaque modification.
- Essayer : **Plus court**, **Plus formel**, **En liste**, l'icône **Annuler** (flèche retour), puis écrire dans la zone de saisie en bas « ajoute : merci de me rappeler » et appuyer sur **Entrée**.
- Avec l'IA locale chargée (bouton **IA** de la zone de saisie) : pendant la génération, le bouton rond devient **Arrêter** ; l'arrêt conserve la version sans IA.

Test de la garde de faits : depuis un texte contenant « 1 g », activez **IA** puis l'icône **Régénérer** : une proposition IA qui change la dose doit être **écartée** (encadré « Proposition de l'IA écartée par sécurité »).

## 11. Tester l'insertion dans un brouillon de test

Dans un **nouveau brouillon de test** (aucun destinataire réel, ou vous-même) contenant votre signature :
1. Cliquer dans le corps du message à l'endroit voulu.
2. Panneau → **« Insérer dans Outlook »** (au curseur).
3. Attendu : le texte apparaît au curseur ; **la signature et le texte existant sont intacts** ; **rien n'est envoyé**.
4. Recommencer avec « en tête du message ».
5. Dans une **réponse** à un mail de test : vérifier que le message cité reste intact.
6. **Supprimer le brouillon de test** ensuite.

## 12. Identifier une erreur

| Message | Signification | Action |
|---|---|---|
| « Accès au micro refusé » | Permission Edge refusée | Icône cadenas de la barre d'adresse → Micro → Autoriser, ou fenêtre séparée |
| « bloqué par le cadre Outlook » | OWA n'autorise pas le micro dans le panneau | Fenêtre séparée (§7b) |
| « Aucun microphone détecté » | Pas de périphérique | Brancher un micro |
| « Mémoire insuffisante » / « le moteur de calcul s'est arrêté » | Modèle trop lourd | Bouton « Essayer plus léger : … » |
| « Téléchargement impossible » | Réseau / proxy | Autre réseau, ou modèles auto-hébergés |
| « Insertion impossible » | Outlook a refusé | Bouton « Copier le texte » puis Ctrl+V |
| « Proposition de l'IA écartée » | La garde de faits a détecté un écart | Normal : relire, garder la version classique |

## 13. Collecter uniquement des diagnostics expurgés

Onglet Diagnostic → **« Copier le rapport technique »**. Il contient uniquement : versions, jeux d'API, présence de méthodes, capacités du navigateur, nombre de requêtes bloquées par hôte. **Ne jamais** joindre de capture d'écran contenant un vrai mail.

## 14. Désinstaller le complément

OWA → *Paramètres → Gérer les compléments → Mes compléments* → « Assistant Outlook IA » → **Supprimer**.
Puis, si vous avez activé le cache des modèles : avant de désinstaller, onglet Modèles → Préférences → **« Vider le cache »** (ou Edge → Paramètres → Cookies et données de site → supprimer les données du site).

## 15. Annuler / revenir à la version précédente

- Problème après une mise à jour du site : voir DEPLOYMENT.md §6 (redéployer la version précédente).
- Problème grave : désinstaller (§14). Aucune donnée n'est conservée par l'application, rien n'est à restaurer.

---

## Tableau de résultats (à remplir)

| § | Test | Poste (PC perso / CHU) | Résultat | Message / valeur |
|---|---|---|---|---|
| 5 | Panneau en rédaction | | | |
| 5 | Panneau en lecture | | | |
| 6 | Jeux d'API Mailbox | | | |
| 6 | Micro autorisé par la page hôte | | | |
| 7 | Test micro dans le panneau | | | |
| 7b | Dictée en fenêtre séparée | | | |
| 8 | Téléchargement modèle (taille, durée) | | | |
| 9 | Dictée fictive : qualité, délai | | | |
| 10 | Rédaction et comparaison | | | |
| 11 | Insertion au curseur, signature intacte | | | |
| 11 | Insertion dans une réponse | | | |
