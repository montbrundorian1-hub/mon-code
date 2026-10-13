# Architecture technique

## Vue d'ensemble

```
Outlook Web App (Exchange on-premises)                         Navigateur Edge du poste
┌──────────────────────────────┐   iframe HTTPS   ┌───────────────────────────────────────────┐
│ Message ouvert / brouillon   │ ◄──────────────► │ Panneau « Assistant Outlook IA » (site     │
│ Bouton « Assistant IA »      │   Office.js      │ statique : HTML/CSS/TypeScript compilé)    │
└──────────────────────────────┘ (postMessage)    │                                           │
                                                  │  UI ── Assistant ── Mode classique (règles)│
                                                  │   │         └──── LLM local (Web Worker)   │
                                                  │   └── Dictée ── Micro → segmentation       │
                                                  │                  └── Whisper (Web Worker)  │
                                                  └───────────────┬───────────────────────────┘
                                                                  │ GET uniquement, après accord :
                                                                  ▼ poids de modèles (Hugging Face
                                                                    ou dossier models/ auto-hébergé)
```

- **Aucun serveur applicatif** : site statique HTTPS (GitHub Pages ou équivalent).
- **Aucune donnée utilisateur ne quitte le poste** : seuls des fichiers (code, poids de modèles) sont téléchargés.
- **Office.js** est la seule interface avec Outlook, isolée dans `src/outlook/`.

## Modules

| Dossier | Rôle |
|---|---|
| `src/outlook/` | `MailHost` (interface), `OfficeMailHost` (Office.js réel, typé), `bootstrap.ts` (détection de l'ouverture par Outlook : cadre ou `_host_Info` ; `Office.onReady` borné à 10 s → réel, sinon démonstration immédiate), `html.ts` (texte → HTML échappé). |
| `src/mock/` | `DemoMailHost` (Outlook simulé) et messages **fictifs** (`exemple.test`). |
| `src/audio/` | `MicCapture` (getUserMedia → AudioWorklet → PCM 16 kHz), `SpeechSegmenter` (détection d'activité vocale à seuil adaptatif). |
| `src/transcription/` | `whisper.worker.ts` (Transformers.js), `WhisperEngine`, `DictationSession` (segments validés / provisoires / en attente, pause qui libère le micro). |
| `src/ai/` | `classic.ts` (règles), `intent.ts` (consignes de rédaction : « écris un mail à X pour dire que… » → corps du mail, destinataire, formule d'appel), `commands.ts` (consignes de modification), `factGuard.ts` (garde de faits), `coverage.ts`, `assistant.ts` (orchestrateur + interface `TextGenerationProvider`, arrêt de génération), `llm.worker.ts`, `models.ts` (catalogue, révisions figées, recommandation), `modelLoader.ts` (`ModelHandle` : consentement, progression, annulation, délais, plantage du worker → requêtes rejetées), `workerProtocol.ts` (messages typés page ↔ workers), `workerEnv.ts`, `prompts.ts`. |
| `src/search/` | `parseQuery` (question en français → critères), `outlookSearchQuery` (critères → recherche à coller dans Outlook : `from:`, `to:`, `received:`), `MailboxSearchProvider`, `DemoSearchProvider` (fictif), `ExchangeSearchProvider` (désactivé). |
| `src/security/` | `networkGuard.ts`, `settings.ts` (préférences non sensibles uniquement), `sessionMemory.ts` (historique en mémoire), `redact.ts`. |
| `src/diagnostics/` | Diagnostic non intrusif (Office, micro, WASM/WebGPU, sécurité). |
| `src/ui/` | Coquille (`app.ts` : en-tête, navigation, raccourcis), état partagé (`context.ts`), utilitaires DOM sans `innerHTML` (`dom.ts` : boutons, interrupteurs, notifications, annonces pour lecteurs d'écran), icônes (`icons.ts`, Lucide ISC), accueil (`greeting.ts`). |
| `src/components/` | Vues (Dicter, Rédiger, Répondre, Rechercher, Modèles, Diagnostic, Aide) et briques : `composer.ts` (zone de saisie façon messagerie), `segmented.ts`, `modelPanel.ts`, `insertBar.ts`, `validationPanel.ts`, `avatar.ts`, `dictationWindow.ts`. Système de design : `src/styles.css` ([DESIGN.md](DESIGN.md)). ~160 Ko de JS, 40 Ko de CSS (57 + 9 Ko compressés). |

## Pipeline de dictée

1. Clic sur l’orbe micro (ou raccourci quand le panneau a le focus ; Échap coupe le micro) → `getUserMedia` → `AudioContext` à 16 kHz → `AudioWorklet` (blocs de 100 ms).
2. `SpeechSegmenter` : seuil d'énergie adaptatif ; un segment se clôt après 0,8 s de silence ou 20 s de parole.
3. Chaque segment est **transféré** au worker Whisper (`language: french`, `task: transcribe`), puis libéré.
4. Si le facteur temps réel mesuré est < 0,35 (poste rapide / WebGPU), des transcriptions **provisoires** du segment en cours sont affichées (en italique, marquées « provisoire »).
5. Filtrage des « hallucinations » connues de Whisper sur le silence (« Sous-titres réalisés par… »).

Ce n'est **pas** une transcription mot à mot en temps réel : c'est une transcription par segments, affichée après chaque pause (voir COMPATIBILITY.md).

## Pipeline de rédaction

```
dictée brute ──► mode classique (toujours) ──► [IA locale optionnelle : « polissage »] ──► validation ──► affichage
                  - ponctuation dictée                  - consigne de correction légère          - garde de faits
                  - hésitations, répétitions            - exemple sans nom propre                - couverture
                  - corrections ASR signalées           - sortie nettoyée                        - termes incertains
                  - typographie, questions                                                       - proposition IA écartée
                  - formules d'appel/politesse                                                     si écart critique
```

**Pourquoi ce choix** : lors des tests réels (docs/COMPATIBILITY.md), tous les modèles ≤ 1,5 milliard de paramètres ont, en rédaction libre, inventé ou supprimé des informations. Le mode classique ne crée aucun contenu ; l'IA ne fait que polir un texte déjà structuré, et toute proposition qui perd/ajoute une date, une dose, un nombre, un médicament ou un nom propre est **écartée automatiquement** (consultable, utilisable sur décision explicite).

`TextGenerationProvider` est l'interface à implémenter pour remplacer le moteur (autre modèle local, ou futur moteur institutionnel autorisé) sans toucher à l'interface.

## Modèles et matériel

`models.ts` classe le poste (`gpu`, `cpu-confort`, `cpu-modeste`, `insuffisant`) à partir de WebGPU (+ `shader-f16`), WebAssembly SIMD, `navigator.deviceMemory` et `hardwareConcurrency`, puis ordonne les modèles compatibles. En cas d'échec (mémoire, réseau), le modèle plus léger suivant est proposé ; à défaut : mode classique (rédaction) ou saisie clavier (transcription).

Les fichiers ONNX Runtime Web (`.wasm`, `.mjs`) sont servis **par le site lui-même** (noms versionnés par empreinte), et non par le CDN jsDelivr utilisé par défaut par Transformers.js.

Multithread WASM : impossible sans isolation cross-origin (COOP/COEP), indisponible dans un panneau Outlook → calcul sur un seul cœur en WASM.

## Micro dans le panneau Outlook

Le panneau est un `iframe` d'OWA. Si la page hôte n'accorde pas `allow="microphone"`, `getUserMedia` échoue sans invite. L'application le détecte (`document.featurePolicy.allowsFeature('microphone')`) et propose **la dictée dans une fenêtre séparée** :
1. Dialog API (`Office.context.ui.displayDialogAsync`, Mailbox 1.4+) + `messageParent` ;
2. sinon `window.open` + `postMessage` (origine vérifiée).

La fenêtre est une page de premier niveau soumise à sa propre autorisation micro : aucune politique n'est contournée. Le texte transite uniquement entre deux fenêtres locales.

## Mises à jour

Le manifest pointe vers `index.html` ; le code est servi avec des noms de fichiers à empreinte (`index-<hash>.js`). Une mise à jour du site est donc prise en compte au rechargement du panneau, **sans réimporter le manifest**, tant que l'URL et les permissions ne changent pas.
