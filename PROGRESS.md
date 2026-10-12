# PROGRESS — Assistant Outlook IA

> Fichier de reprise : il décrit l'état réel du développement pour pouvoir reprendre après une
> interruption. Mettre à jour à chaque étape importante (et committer).

## Emplacement
- Code : `assistant-outlook-ia/` (Vite + TypeScript, sans framework UI).
- Branche de travail : `ccr-bb6f57ba-unvym3`.

## Faits vérifiés (sources officielles / tests réels)
- Exchange on-premises 2016 / 2019 / SE : requirement sets Mailbox **1.1 à 1.5** (doc Microsoft « Outlook API requirement sets », consultée le 2026-10-12).
- Reconnaissance vocale locale d'Edge (`processLocally`) : Canary/Dev ≥ 150 uniquement, **français non pris en charge** (doc Microsoft Edge consultée le 2026-10-12). → moteur principal = Whisper multilingue via Transformers.js.
- Test réel Node/CPU (audio synthétique fictif Piper fr_FR, 15 s) :
  - whisper-tiny q8 : 2,9 s, erreurs graves (« Moxie-Celine », « cette jour »).
  - whisper-base q8 : 3,9 s, « pendant cette jour » au lieu de « sept jours » (durée de traitement perdue).
  - whisper-small q8 : 7,1 s, transcription correcte des doses (« 1 g 3 fois par jour pendant 7 jours »).
- LLM (en cours d'évaluation, voir section Étapes).

## Étapes
- [x] Étape 1 — Diagnostic des contraintes, choix d'architecture.
- [~] Étape 2 — Initialisation du dépôt (package.json, tsconfig, .gitignore, modules sécurité).
- [ ] Étape 3 — Première version exécutable (panneau, éditeur, mocks, diagnostic).
- [ ] Étape 4 — Transcription vocale locale (Whisper / Transformers.js, worker).
- [ ] Étape 5 — Reformulation (LLM local + mode classique déterministe).
- [ ] Étape 6 — Tests automatisés + test navigateur réel (Chromium headless, micro simulé).
- [ ] Étape 7 — Documentation et livraison.

## Reprise
```bash
cd assistant-outlook-ia
npm install          # .npmrc désactive le téléchargement CUDA d'onnxruntime-node
npm test
npm run dev
```
