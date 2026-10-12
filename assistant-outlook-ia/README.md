# Assistant Outlook IA

Complément Outlook (Outlook Web App, **Exchange on-premises**) pour **dicter**, **rédiger**, **répondre** et **rechercher**, avec des modèles d'IA **open source exécutés localement dans Edge**. Coût : 0 €. Aucun envoi automatique, aucune IA cloud, aucune conservation des dictées ou des mails.

> ⚠️ **Prototype — données fictives uniquement.** Une IA locale n'autorise pas, à elle seule, le traitement de données de patients. Toute utilisation sur des messages réels nécessite l'accord de l'établissement (DPO / RSSI). Voir [docs/SECURITY.md](docs/SECURITY.md).

## Ce qui fonctionne (vérifié)

| Fonction | État | Preuve |
|---|---|---|
| Manifest XML Outlook (MailApp, Mailbox 1.1/1.3, `ReadWriteItem`, lecture + rédaction) | ✅ | Validateur officiel Microsoft : « The manifest is valid » ; tests `manifest.test.ts`. |
| Panneau : Dicter / Rédiger / Répondre / Rechercher + Modèles / Diagnostic / Aide | ✅ | Test navigateur Chromium + tests d'interface. |
| Mode démonstration hors Outlook (mails fictifs) | ✅ | Test navigateur. |
| **Dictée locale Whisper** (WASM, sans GPU) | ✅ | Test navigateur avec micro simulé (audio synthétique fictif) : whisper-small, transcription exacte des doses et dates. |
| Transcription « en direct » | ⚠️ par segments | Le texte apparaît après chaque pause ; texte provisoire seulement si le poste est rapide (WebGPU). |
| **Rédaction classique (sans IA)** : nettoyage, ponctuation, formules adaptées au destinataire | ✅ | Tests unitaires + navigateur. |
| Rédaction par **IA locale** (Qwen) | ⚠️ expérimental | Fonctionne dans le navigateur (Qwen3-0.6B : ~60 s par mail sur processeur) ; propositions contrôlées et écartées si elles altèrent dates, doses, nombres, médicaments, noms, questions ou négations. |
| Comparaison original / rédigé, commandes (« plus court », « en liste »…), conversation vocale | ✅ | Tests. |
| Insertion dans le brouillon (au curseur / en tête), signature conservée, aucun envoi | ✅ simulé | Office.js simulé + brouillon de démonstration. **À confirmer dans le webmail** (docs/USER_TESTS.md §11). |
| Réponse (proposition / guidée / assistant) | ✅ | Tests sur messages fictifs. |
| Recherche | ⚠️ démonstration | Messages fictifs uniquement ; boîte réelle désactivée ([étude](docs/EXCHANGE_SEARCH_FEASIBILITY.md)). |
| Micro **dans le panneau OWA** | ❓ à tester | Dépend de la page hôte d'OWA ; repli : dictée en fenêtre séparée. |

## Démarrage rapide

```bash
cd assistant-outlook-ia
npm install
npm test            # 108 tests automatisés
npm run dev         # http://localhost:3000 dans Edge (mode démonstration)
```

1. Bandeau → **J'ai compris**.
2. Onglet **Dicter** : choisir le modèle recommandé, cocher le consentement (taille affichée), **Télécharger et charger**.
3. Cliquer sur le micro, dicter un texte **fictif**, **Arrêter**, **Générer le mail**.
4. Onglet **Rédiger** : relire l'encadré « À vérifier », comparer, modifier, **Insérer** (brouillon simulé en démo).

## Installer dans Outlook

1. Déployer le site (HTTPS gratuit) : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
2. `npm run manifest -- https://votre-adresse/` puis importer `manifest.xml` dans OWA (*Gérer les compléments → Ajouter un complément personnalisé → À partir d'un fichier*).
3. Suivre [docs/USER_TESTS.md](docs/USER_TESTS.md) avec des textes inventés.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, pipelines, choix techniques.
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — Exchange/Edge/micro/modèles, résultats de tests réels.
- [docs/SECURITY.md](docs/SECURITY.md) — confidentialité, CSP, domaines contactés, risques résiduels.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — hébergement HTTPS gratuit, manifest, mises à jour, retour arrière.
- [docs/USER_TESTS.md](docs/USER_TESTS.md) — procédure de test pas à pas (non-développeur).
- [docs/ROADMAP.md](docs/ROADMAP.md) — suite du projet.
- [docs/EXCHANGE_SEARCH_FEASIBILITY.md](docs/EXCHANGE_SEARCH_FEASIBILITY.md) — recherche dans toute la boîte : conditions et limites.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `npm run dev:https` | Serveur de développement (HTTP localhost / HTTPS avec certificats Office). |
| `npm run build` | Typage + site statique dans `dist/`. |
| `npm test` | Tests unitaires et d'intégration (Vitest + jsdom). |
| `npm run e2e -- --asr whisper-small [--llm qwen3-0.6b]` | Test de bout en bout dans Chromium (télécharge réellement les modèles). |
| `npm run manifest -- <url>` | Génère `manifest.xml` et `manifest.dev.xml`. |

## Limites importantes

- Transcription par segments (pas mot à mot) ; ~2× la durée de parole sur un processeur sans GPU avec whisper-small.
- Les petits modèles de rédaction se trompent : l'IA est optionnelle, contrôlée, et la version sans IA reste toujours disponible.
- Le micro peut être bloqué dans le cadre d'OWA (fenêtre séparée proposée).
- Postes du CHU : le téléchargement depuis huggingface.co peut être filtré (auto-hébergement possible).
- Recherche dans la boîte réelle : impossible avec `ReadWriteItem`, non activée.
