# Sécurité et confidentialité

> **Avertissement essentiel.** Une IA exécutée localement n'est **pas**, à elle seule, une autorisation de traiter des données de patients. L'usage de ce complément sur des messages réels contenant des données personnelles ou de santé doit être validé par l'établissement (DPO, RSSI, direction des systèmes d'information). Tant que ce n'est pas le cas : **données fictives uniquement**.

## 1. Principes mis en œuvre

| Exigence | Mise en œuvre | Vérification |
|---|---|---|
| Aucun envoi automatique | Aucune méthode d'envoi dans `MailHost` ; seules `setSelectedDataAsync`, `prependAsync` (insertion) et `displayReplyForm` (ouvre un formulaire) sont utilisées. | `tests/outlook.test.ts` (cas 25) : absence de méthode `send*`, `sendAsync` jamais appelé, recherche de `sendAsync`/`CreateItem` dans tout `src/`. |
| Aucune modification non sollicitée | Insertion au curseur ou en tête uniquement, sur clic. Jamais `body.setAsync` (remplacement intégral). | cas 24. |
| Permissions minimales | `ReadWriteItem` (élément ouvert uniquement). Pas de `ReadWriteMailbox`, pas d'EWS. | `tests/manifest.test.ts`. |
| Aucune transmission de contenu | Garde réseau (`src/security/networkGuard.ts`) sur `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, dans la page **et** dans les workers ; CSP restrictive. Vers l'extérieur : GET sans corps, vers une liste blanche, paramètres d'URL bornés. | cas 27 + test navigateur (journal de toutes les requêtes). |
| Aucune IA cloud, aucun repli cloud | Moteurs exclusivement locaux (Whisper/LLM en WebAssembly ou WebGPU). La reconnaissance vocale « cloud » d'Edge (Web Speech API par défaut) n'est **jamais** utilisée ; la variante native n'est envisagée que si le navigateur déclare le français disponible **en local** (`processLocally`). | Revue de code ; `transcription/engines.ts`. |
| Aucune persistance de contenu | Historique en mémoire vive (30 entrées max), effacé à la fermeture (`pagehide`), sur demande ou après 30 min d'inactivité. `localStorage` : une seule clé de préférences validées (booléens, identifiants du catalogue). | cas 26 + test navigateur (inspection `localStorage`, `sessionStorage`, IndexedDB, Cache API). |
| Audio brut non conservé | Segments en mémoire, transférés au worker puis libérés ; aucun `MediaRecorder`, aucun fichier. | Revue de code `audio/`, `transcription/`. |
| Micro visible et arrêtable | Bandeau rouge « Micro actif » + bouton Arrêter permanent ; touche Échap ; pause = micro réellement libéré. | cas 8, 11 ; test navigateur. |
| Pas de mot de passe | Aucun champ d'identifiant ; Office.js gère la session OWA. | Revue de code. |
| Pas de télémétrie | Aucune bibliothèque d'analytics. La télémétrie d'Office.js (`telemetryservice.firstpartyapps.oaspapps.com`) est **bloquée par la CSP** (constaté lors du test navigateur). | Journal CSP du test navigateur. |
| Erreurs sans contenu | Messages d'erreur expurgés (`redact.ts`) ; journaux limités au nom d'hôte ; rapport de diagnostic technique uniquement. | `tests/security.test.ts`. |

## 2. Domaines contactés

| Domaine | Pourquoi | Données envoyées |
|---|---|---|
| Site d'hébergement (ex. `*.github.io`) | Code de l'application | Requête GET standard (adresse IP, user-agent, comme toute page web). |
| `appsforoffice.microsoft.com` | Office.js (obligatoire pour un complément) | GET de scripts. |
| `huggingface.co`, `*.huggingface.co`, `*.hf.co` | Poids des modèles (après consentement) | GET de fichiers publics. Option : auto-hébergement dans `models/` pour supprimer ce domaine. |

Aucun autre domaine n'est autorisé (CSP + garde réseau). Le test navigateur du 2026-10-12 a constaté : `appsforoffice.microsoft.com`, `huggingface.co`, `us.aws.cdn.hf.co`, toutes en GET sans corps.

**Hébergement tiers** : l'hébergeur (GitHub) voit les requêtes de chargement du site (IP, date). Il ne voit **aucun** contenu de mail ou de dictée, qui ne quitte pas le navigateur. Si l'établissement l'exige, le site statique peut être hébergé sur un serveur interne (voir DEPLOYMENT.md).

## 3. Content Security Policy

Déclarée dans `index.html` (balise meta, faute d'en-têtes sur un hébergement statique gratuit) :

```
default-src 'self'; script-src 'self' https://appsforoffice.microsoft.com 'wasm-unsafe-eval';
connect-src 'self' https://appsforoffice.microsoft.com https://huggingface.co https://*.huggingface.co https://*.hf.co;
worker-src 'self' blob:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self';
media-src 'self' blob:; frame-src 'self' https://appsforoffice.microsoft.com; object-src 'none';
base-uri 'self'; form-action 'none'
```

- `'wasm-unsafe-eval'` : requis par ONNX Runtime Web (compilation WebAssembly), n'autorise pas `eval` JavaScript.
- `style-src 'unsafe-inline'` : styles dynamiques (barres de progression). Aucun script inline.
- Limite : une CSP en balise meta ne peut pas définir `frame-ancestors` ; les workers sont régis par les en-têtes de leur propre réponse (d'où le garde réseau installé aussi dans les workers, **avant** l'import de Transformers.js qui capture `fetch` au chargement).

## 4. Cache des modèles

- Désactivé par défaut (`Conserver les modèles dans le cache du navigateur` décoché) : le modèle est retéléchargé à chaque session.
- Activable dans l'onglet Modèles ; bouton « Vider le cache des modèles ».
- Le cache (`transformers-cache`, Cache API) ne contient **que** des poids publics, jamais de données utilisateur.
- Sur un poste partagé, le cache du navigateur n'est pas un stockage privé garanti : à éviter.

## 5. Dépendances et licences

| Composant | Version | Licence | Rôle |
|---|---|---|---|
| @huggingface/transformers | 4.3.1 | Apache-2.0 | Inférence locale |
| onnxruntime-web | 1.31.0-dev (épinglée) | MIT | Moteur WASM/WebGPU |
| Office.js (CDN Microsoft) | 1 | Licence Microsoft | API Outlook |
| Whisper (onnx-community) | tiny/base/small/large-v3-turbo | Apache-2.0 / MIT | Transcription |
| Qwen2.5-1.5B-Instruct, Qwen3-0.6B, Granite 4.0 350M | — | Apache-2.0 | Rédaction (expérimental) |
| Outils de dev : Vite, Vitest, TypeScript, jsdom, fast-xml-parser, playwright-core | — | MIT / Apache-2.0 | Build et tests |

`npm audit` : 0 vulnérabilité au 2026-10-12. Versions épinglées dans `package-lock.json`.

Note : `onnxruntime-node` (dépendance de Transformers.js pour Node) télécharge par défaut des binaires CUDA depuis NuGet à l'installation ; `.npmrc` désactive ce téléchargement inutile.

## 6. Risques résiduels (non masqués)

1. **Qualité de transcription** : erreurs possibles sur les noms propres, médicaments et nombres, surtout avec les petits modèles. Relecture obligatoire ; la garde de faits ne voit que ce qui a été transcrit.
2. **IA de rédaction** : la garde de faits ne détecte pas tous les changements de sens (ex. « décalée » → « prévue ») ; la comparaison mot à mot et la relecture restent indispensables.
3. **Poste et navigateur** : extensions de navigateur, logiciels du poste ou politiques réseau peuvent observer la page ; hors du périmètre de l'application.
4. **Office.js** : bibliothèque Microsoft chargée depuis le CDN ; son comportement interne n'est pas contrôlé par l'application (sa télémétrie est bloquée par la CSP).
5. **Fenêtre séparée de dictée** : son stockage est partitionné différemment ; le modèle peut y être retéléchargé.

## 7. Procédure en cas d'incident

Fermer le panneau (l'historique s'efface), désinstaller le complément (USER_TESTS.md §14), signaler au référent sécurité de l'établissement **sans** joindre de contenu réel : utiliser uniquement le « rapport technique » de l'onglet Diagnostic.
