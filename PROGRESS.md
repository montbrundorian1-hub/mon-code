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
- LLM (test réel Node/CPU, dictées fictives) :
  - Rédaction « libre » : Qwen2.5-0.5B invente un texte sans rapport ; Qwen3-0.6B retire « docteur » ; Apertus-0.5B omet la date et change « décalée » en « prévue » ; Qwen2.5-1.5B invente « comprimés » ; Granite-350M supprime la moitié d'un message.
  - Stratégie retenue : pipeline CLASSIQUE déterministe par défaut, puis « polissage » IA optionnel d'un texte déjà structuré, contrôlé par une garde de faits (dates, doses, nombres, médicaments, noms) et une mesure de couverture ; toute proposition IA fautive est écartée.
  - Avec ce prompt de polissage : Qwen2.5-1.5B correct (seul défaut : « une gramme ») ; Qwen3-0.6B change encore le sens ; Granite-350M produit du charabia sur les consignes.
- Manifests : validés par le validateur officiel Microsoft (`office-addin-manifest validate`) : « The manifest is valid ».

## Étapes
- [x] Étape 1 — Diagnostic des contraintes, choix d'architecture.
- [x] Étape 2 — Initialisation du dépôt (package.json, tsconfig, .gitignore, modules sécurité).
- [x] Étape 3 — Première version exécutable : panneau 4 onglets + Modèles/Diagnostic/Aide, mode démo, adaptateur Office.js, manifests. `npm run build` OK, `tsc` OK.
- [~] Étape 4 — Transcription vocale locale : code écrit (worker Whisper, micro, segmentation, session de dictée) ; test navigateur réel à faire.
- [~] Étape 5 — Reformulation : mode classique + IA locale + garde de faits écrits ; tests unitaires à écrire.
- [ ] Étape 6 — Tests automatisés + test navigateur réel (Chromium headless, micro simulé).
- [ ] Étape 7 — Documentation et livraison.

## Reprise
```bash
cd assistant-outlook-ia
npm install          # .npmrc désactive le téléchargement CUDA d'onnxruntime-node
npm test
npm run dev          # http://localhost:3000 (mode démonstration hors Outlook)
npm run manifest -- https://votre-site/chemin/   # régénère manifest.xml et manifest.dev.xml
```

## Prochaines actions
1. Tests unitaires (30 cas exigés) — `tests/`.
2. Test navigateur réel (Chromium + micro simulé à partir d'un WAV fictif) — `scripts/e2e-browser.mjs`.
3. Documentation (`docs/`), README, workflow GitHub Pages.
