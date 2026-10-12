# PROGRESS — Assistant Outlook IA

> Fichier de reprise : état réel du développement, pour reprendre après une interruption.
> Mis à jour et commité à chaque étape importante.

## Emplacement
- Code : `assistant-outlook-ia/` (Vite 8 + TypeScript 5.9, sans framework UI ; Transformers.js 4.3.1).
- Branche de travail : `ccr-bb6f57ba-unvym3` (poussée sur `origin`).
- CI / déploiement : `.github/workflows/assistant-outlook-ia.yml` (tests + build ; Pages sur `main` si activé).

## Étapes
- [x] 1 — Diagnostic des contraintes, architecture (docs/ARCHITECTURE.md).
- [x] 2 — Initialisation du dépôt.
- [x] 3 — Version exécutable : panneau (Dicter, Rédiger, Répondre, Rechercher, Modèles, Diagnostic, Aide), mode démo, adaptateur Office.js, manifests validés par Microsoft.
- [x] 4 — Transcription locale Whisper (worker, micro AudioWorklet, segmentation, pause/reprise, fenêtre séparée). **Testée dans Chromium** avec micro simulé.
- [x] 5 — Rédaction : mode classique + IA locale optionnelle avec garde de faits/sens. Testée dans Chromium (Qwen3-0.6B).
- [x] 6 — Tests : 113 tests Vitest OK ; test navigateur de bout en bout (`npm run e2e`).
- [x] 7 — Documentation : README, ARCHITECTURE, COMPATIBILITY, SECURITY, DEPLOYMENT, USER_TESTS, ROADMAP, EXCHANGE_SEARCH_FEASIBILITY.
- [x] 8 — Audit technique/esthétique/pratique (docs/AUDIT.md, `scripts/audit-ui.mjs`) : axe 31 → 0 violation, débordements 8 → 0, focus clavier stable pendant la dictée, rédaction de dictées non ponctuées améliorée. 113 tests.

## Faits vérifiés
- Exchange on-prem 2016/2019/SE : Mailbox 1.1–1.5 (doc Microsoft, 2026-10-12).
- Body.setSelectedDataAsync / prependAsync / getTypeAsync : Mailbox 1.1 ; getAsync/setAsync : 1.3 ; displayReplyForm : 1.1.
- makeEwsRequestAsync : exige ReadWriteMailbox + OAuthAuthentication sur le répertoire EWS (admin).
- Reconnaissance vocale locale Edge : pas de français (Canary/Dev ≥ 150) → Whisper retenu.
- `office-addin-manifest validate` : manifest.xml et manifest.dev.xml valides.
- Chromium (WASM, 1 thread) : whisper-small chargé en ~45 s, transcription exacte de la dictée fictive (~2,5× la durée de parole). Qwen3-0.6B : chargé en ~40 s, ~60 s par mail ; a transformé une question en affirmation → garde de sens ajoutée (questions, négations).
- Requêtes externes observées : appsforoffice.microsoft.com, huggingface.co, us.aws.cdn.hf.co — GET uniquement. Télémétrie Office.js bloquée par la CSP.
- Le dépôt GitHub est **privé** → GitHub Pages gratuit impossible tant qu'il n'est pas public (alternatives : dépôt public dédié, Netlify Drop, serveur interne ; Cloudflare Pages exclu : fichier WASM > 25 Mio).

## Reste à faire (nécessite l'utilisateur)
1. Choisir l'hébergement (DEPLOYMENT.md §2), déployer, régénérer le manifest avec l'URL finale.
2. Tests dans le webmail réel avec données fictives (USER_TESTS.md §5–§11) : surfaces lecture/rédaction, jeux d'API, **micro dans le panneau**, accès huggingface.co depuis le CHU, insertion.
3. Selon résultats : ajuster (fenêtre séparée, auto-hébergement des modèles, seuils de segmentation).

## Reprise
```bash
cd assistant-outlook-ia
npm install          # .npmrc désactive le téléchargement CUDA d'onnxruntime-node
npm test             # 113 tests
node scripts/audit-ui.mjs   # audit d'interface (après npm run build)
npm run build
npm run e2e -- --asr whisper-small          # test navigateur réel (télécharge ~250 Mo)
npm run dev          # http://localhost:3000 (mode démonstration)
npm run manifest -- https://votre-site/chemin/
```
