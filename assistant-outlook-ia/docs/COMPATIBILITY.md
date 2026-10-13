# Compatibilité — Exchange on-premises, Outlook Web App, Edge, micro, IA locale

Légende : ✅ confirmé (source officielle ou test réel) · 🧪 testé en simulation uniquement · ❓ hypothèse à vérifier dans le webmail du CHU · ❌ impossible / non pris en charge.

## 1. Exchange / Outlook Web App

| Point | Statut | Détail |
|---|---|---|
| Jeux d'API Mailbox sur Exchange 2016 / 2019 / Subscription Edition | ✅ 1.1 → 1.5 | Microsoft Learn, « Outlook JavaScript API requirement sets », consulté le 2026-10-12. |
| Version exacte d'Exchange du CHU | ❓ | Inconnue. L'onglet **Diagnostic** affiche les jeux réellement pris en charge et la version du client. |
| Manifest XML classique (MailApp) accepté | ✅ | Validateur Microsoft : valide. **Test réel du 2026-10-13** : importé dans OWA par l'utilisateur, panneau ouvert. |
| Panneau en **rédaction** (`MessageComposeCommandSurface`) | ✅ démontré par « Hello world » | |
| Panneau en **lecture** (`MessageReadCommandSurface`) | ✅ | Test réel du 2026-10-13 (tablette Android, Brave, OWA en affichage ordinateur) : badge « Outlook · lecture ». |
| `body.setSelectedDataAsync` / `prependAsync` / `getTypeAsync` (insertion) | ✅ Mailbox 1.1 | Doc Microsoft (API set 1.1, mode Compose). 🧪 testé avec Office.js simulé. |
| `body.getAsync` (lecture du corps) | ✅ Mailbox 1.3 | Refusé proprement si 1.3 absent. |
| `displayReplyForm` (réponse préremplie, sans envoi) | ✅ Mailbox 1.1 | Mode lecture. |
| Dialog API (`displayDialogAsync`, fenêtre séparée) | ✅ Mailbox 1.4 attendu | ❓ à vérifier ; repli `window.open`. |
| Événement `ItemChanged` (panneau épinglé) | Mailbox 1.5 | Non utilisé par défaut (pas d'épinglage dans le manifest V1). |
| Signature, réponses, brouillons HTML préservés | 🧪 | Insertion au curseur/en tête uniquement, HTML échappé ; jamais `setAsync`. ❓ à confirmer dans OWA (USER_TESTS §11). |
| EWS / recherche dans toute la boîte | ❌ en V1 | Nécessite `ReadWriteMailbox` + `OAuthAuthentication` côté serveur ([étude](EXCHANGE_SEARCH_FEASIBILITY.md)). À la place : recherche **préparée** par le panneau et **collée** dans la barre de recherche d'OWA (aucune permission). |
| Syntaxe de recherche avancée d'OWA (`from:`, `to:`, `received:AAAA-MM-JJ..AAAA-MM-JJ`) | ❓ | Syntaxe documentée pour Outlook sur le web ; non vérifiée sur l'OWA du CHU. Dates au format AAAA-MM-JJ (sans ambiguïté jour/mois). Repli proposé : version simple (mots seuls) + bouton « Filtre » d'Outlook. USER_TESTS §11c. |
| Synchronisation en arrière-plan | ❌ | Un complément web ne s'exécute que panneau ouvert. |
| Office.js + CSP de l'application | ✅ hors Outlook / ❓ dans OWA | Office.js est chargé depuis le **CDN officiel actuel** (`officeapis.public.onecdn.static.microsoft/1/office.js`), le même que le « Hello world » validé au CHU. Hors Outlook, cette version lève « hostInfo validation failed » et `Office.onReady` ne répond jamais : l'application détecte donc l'ouverture par Outlook (panneau dans un cadre, ou paramètre `_host_Info`) et passe **immédiatement** en démonstration sinon ; dans Outlook, l'attente est bornée à 10 s. Sa télémétrie (`telemetryservice.firstpartyapps.oaspapps.com`) est **bloquée** par la CSP. Si, dans OWA, le badge reste « Démo », consulter Diagnostic → « Ouverture par Outlook » et « Ressources bloquées par la CSP ». |

## 2. Microphone

| Point | Statut | Détail |
|---|---|---|
| Capture `getUserMedia` → AudioWorklet → 16 kHz | ✅ | Test Chromium 141 avec micro simulé. |
| Micro dans le **panneau OWA** (iframe) | ❓ **point critique** | Un iframe n'a accès au micro que si la page hôte l'autorise (`allow="microphone"`). OWA on-premises ne le fait probablement pas. Le Diagnostic l'indique (« Micro autorisé par la page hôte »). |
| Repli : dictée en **fenêtre séparée** | 🧪 | Dialog API (Mailbox 1.4) ou `window.open` ; page de premier niveau avec sa propre autorisation. ❓ bloqueur de fenêtres / politique Edge du CHU. |
| Permission refusée, micro absent, micro occupé, coupure | 🧪 | Messages explicites (tests automatisés). |
| Indicateur « Micro actif », arrêt immédiat (bouton, Échap), pause = micro libéré | ✅ | Test navigateur. |

## 3. Transcription vocale locale

| Moteur | Français | Local | Statut |
|---|---|---|---|
| **Whisper multilingue** (Transformers.js 4.3.1 + ONNX Runtime Web) | ✅ | ✅ | **Retenu.** |
| Whisper « .en » | ❌ anglais seul | | Exclu (test automatisé : aucun modèle `.en` au catalogue). |
| Web Speech API d'Edge (par défaut) | ✅ | ❌ **cloud Microsoft** | Exclu (données médicales). |
| Web Speech API `processLocally` (Edge) | ❌ **vérifié** : Edge 155 et 157 répondent « unavailable » pour fr-FR, même avec l'option expérimentale activée | ✅ | Vérification réelle du 2026-10-12 ([PISTE_RECONNAISSANCE_NATIVE.md](PISTE_RECONNAISSANCE_NATIVE.md)). Chrome 155 dispose d'un moteur local (SODA) mais n'est pas le navigateur du CHU. Affiché à titre informatif dans le Diagnostic ; jamais de repli vers le cloud. |

### Mesures réelles (dictée fictive synthétique de 19 s, voix Piper fr_FR, 2 phrases séparées par une pause)

| Modèle | Environnement | Téléchargement + chargement | Transcription | Qualité observée |
|---|---|---|---|---|
| whisper-tiny q8 (43 Mo) | Node, CPU 4 cœurs | 2,5 s (en cache) | 2,9 s pour 15 s | ❌ « Moxie-Celine », « cette jour » |
| whisper-base q8 (79 Mo) | Node, CPU | 2,2 s | 3,9 s pour 15 s | ⚠️ « pendant cette jour » (durée perdue) |
| whisper-base q8 | **Chromium, WASM 1 thread** | 38 s | 24 s au total après début de dictée | ⚠️ « un grame » (corrigé et signalé), « Vous pouvez vous » |
| whisper-small q8 (252 Mo) | Node, CPU | 13 s | 7,1 s pour 15 s | ✅ doses exactes |
| **whisper-small q8** | **Chromium, WASM 1 thread** | 43–45 s | ~45–48 s pour 19 s d'audio (segments traités pendant la dictée) | ✅ **transcription exacte** : « amoxicilline à un gramme 3 fois par jour pendant 7 jours », « 12 mars », ponctuation |
| whisper-large-v3-turbo q4f16 | WebGPU + f16 | — | — | ❓ non testé (pas de GPU dans l'environnement de développement) |

Interprétation :
- Sur processeur seul, la transcription est **~2,5 × plus lente que la parole** avec whisper-small : le texte arrive par segments, avec un délai qui s'accumule sur une longue dictée. whisper-base est ~2 × plus rapide mais fait des erreurs sur les nombres.
- Avec WebGPU, le délai devrait être fortement réduit (et active l'affichage provisoire) — à mesurer sur vos postes.
- Les voix réelles, l'accent, le bruit et le vocabulaire médical spécialisé dégraderont la qualité par rapport à cette voix de synthèse.

## 4. Rédaction par IA locale

Évaluation réelle sur dictées fictives (Node, CPU), 2026-10-12 :

| Modèle (licence) | Taille | Rédaction libre | Polissage d'un texte structuré |
|---|---|---|---|
| Qwen2.5-0.5B-Instruct (Apache-2.0) | 512 Mo | ❌ texte sans rapport | — (retiré du catalogue) |
| Qwen3-0.6B (Apache-2.0) | 623 Mo q8 | ⚠️ retire « docteur » | ⚠️ change le sens d'une phrase ; dans le navigateur : question transformée en affirmation → **désormais écartée** par la garde de sens |
| Apertus-v1.1-0.5B (Apache-2.0) | 811 Mo | ❌ omet la date, « décalée » → « prévue » | — (non retenu) |
| Granite 4.0 350M (Apache-2.0) | 580 Mo | ❌ supprime la moitié du message | ❌ charabia sur les consignes |
| **Qwen2.5-1.5B-Instruct** (Apache-2.0) | 1,2 Go (WebGPU f16) / 1,8 Go (WASM) | ❌ invente « comprimés » | ✅ correct (seule faute : « une gramme ») |

Dans le navigateur (Chromium, WASM, 1 thread) : Qwen3-0.6B chargé en 25–41 s, 61–69 s pour polir un mail court. Lors des tests, ses propositions ont été **écartées automatiquement** (une question transformée en affirmation ; puis, avec l'interface refondue, la durée « 2 semaines » omise ou modifiée) et la version classique conservée (`docs/e2e/resultats.json` : 22/22 vérifications réussies, toutes les requêtes de modèle sur des révisions figées). Qwen2.5-1.5B en WASM est nettement plus lent : à réserver aux postes avec WebGPU.

**Conclusion** : aucun modèle exécutable dans un navigateur sans GPU n'est assez fiable pour rédiger seul. Le **mode classique** est donc le cœur du produit ; l'IA est un polissage optionnel dont chaque proposition est vérifiée (dates, doses, nombres, médicaments, noms propres, questions, négations, couverture du contenu) et **écartée** en cas d'écart.

## 5. Navigateur et matériel

| Capacité | Statut | Effet |
|---|---|---|
| WebAssembly + SIMD | ✅ Edge récent | Obligatoire pour l'IA locale sans GPU. |
| Multithread WASM | ❌ dans un panneau Outlook | Pas d'isolation cross-origin possible → 1 seul cœur. |
| WebGPU | ❓ selon carte graphique et politique Edge du CHU | Accélère fortement Whisper et le LLM. |
| `navigator.deviceMemory` | plafonné à 8 Go par le navigateur | Estimation grossière seulement. |
| Stockage (préférences) | ✅ / ❓ bloqué sur certains postes | Sans stockage : préférences non mémorisées, fonctionnement inchangé. |

## 5b. Tablette Android (premier test réel, 2026-10-13)

Appareil de l'utilisateur : Samsung Galaxy Tab S10 Ultra, navigateur **Brave**, OWA en affichage « ordinateur ».

| Constat de l'utilisateur | Cause la plus probable (non vérifiable ici) | Correction |
|---|---|---|
| « Hyper lent, toute la tablette lag » | Variante **carte graphique** des modèles (jusqu'à 590 Mo pour Whisper small) : sur une tablette, la carte graphique est partagée avec l'affichage ; plus des effets visuels continus (flous recalculés au défilement, animations permanentes). | Sur tablette/téléphone : **processeur uniquement**, modèles légers en premier (**Whisper base, 79 Mo**) ; flous et animations permanentes retirés pour tous. |
| « Le modèle n'a pas pu être chargé » | Idem (mémoire graphique), ou blocage par le navigateur. **Cause exacte inconnue.** | Détail technique **visible et copiable** ; « Réessayer sur le processeur » proposé après un échec sur carte graphique. |
| « La recherche ne marche pas » | La recherche intégrée ne porte que sur des messages fictifs (choix de sécurité de la V1). | Dans Outlook : recherche préparée à coller dans OWA (§1). |
| « Il réécrit ma commande » | Le mode classique traitait la consigne comme le texte du mail. | Consignes comprises sans IA (`src/ai/intent.ts`). |

Détection de la tablette (`isMobileDevice`) : système mobile annoncé par le navigateur, iPad, **« mode ordinateur »
d'Android** (le navigateur se présente comme un PC Linux : écran tactile comme pointeur principal, ou processeur ARM
avec écran tactile, ou carte graphique mobile). Visible dans Diagnostic → « Type d'appareil ».

Vérification en **émulation tablette** (Chromium 141, « mode ordinateur » + écran tactile, `npm run e2e -- --tablet`,
2026-10-13) — ce n'est **pas** la tablette réelle :

| Vérification | Résultat |
|---|---|
| Tablette reconnue, modèle recommandé | ✅ Whisper base, 79 Mo, processeur |
| Chargement Whisper base (WASM, 1 thread) | ✅ 38–39 s (téléchargement compris) |
| Dictée fictive de 19 s | ✅ transcrite en 23–24 s ; fil principal libre (0 tâche > 50 ms) |
| Doses et durées exactes | ❌ « pendant sept jours » → « pendant cette jour » : **limite connue de Whisper base** (Whisper small, plus lent, les transcrit exactement) |
| Consigne « écris un mail au secrétariat pour dire que… » | ✅ « Bonjour, ⏎ Je vous informe que je serai absent demain matin. Serait-il possible qu'on décale mes consultations ? ⏎ Cordialement, » |
| Diagnostic « Type d'appareil » | ✅ tablette ou téléphone |
| Réseau | ✅ GET uniquement vers la liste blanche ; aucune donnée utilisateur stockée |

Mode « Outlook » vérifié dans Chromium avec Office.js simulé (`node scripts/check-outlook-mode.mjs`) : badge
« Outlook · lecture », recherche préparée `from:secrétariat received:2026-10-06..2026-10-13`, copie dans le
presse-papiers, 0 violation axe (clair et sombre), aucun défilement horizontal (surveillé à chaque image).

Restent à confirmer **sur la tablette** : fluidité réelle, chargement de Whisper base dans Brave, vitesse de
transcription (processeur de la tablette ≠ processeur de test). Le micro du **clavier** de la tablette (Gboard,
Samsung) peut envoyer la voix à un service en ligne : à ne pas utiliser pour des informations médicales.

## 6. Réseau

| Domaine | Nécessaire pour | ❓ Accessible depuis le CHU |
|---|---|---|
| Site d'hébergement (`*.github.io`, `*.netlify.app` ou serveur interne) | Charger le panneau | À tester |
| `officeapis.public.onecdn.static.microsoft` | Office.js (CDN actuel) | ✅ indirectement : le « Hello world » importé au CHU l'utilise |
| `appsforoffice.microsoft.com` | Ancien CDN d'Office.js (autorisé par précaution) | Non nécessaire lors des tests |
| `huggingface.co`, `*.hf.co` | Télécharger les modèles | À tester ; sinon auto-hébergement |

## 7. Tests nécessitant votre intervention (webmail réel, données fictives)

Voir [USER_TESTS.md](USER_TESTS.md). Priorités :
1. §5 — le panneau s'ouvre-t-il en **lecture** et en **rédaction** ? Badge « Outlook · … » ?
2. §6 — valeurs du Diagnostic (jeux d'API, micro autorisé par la page hôte, WebGPU).
3. §7 / §7b — micro dans le panneau, sinon fenêtre séparée.
4. §8 — téléchargement d'un modèle depuis un poste du CHU.
5. §11 — insertion dans un brouillon et une réponse de test, signature intacte.
