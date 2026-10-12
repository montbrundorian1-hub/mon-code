# Déploiement HTTPS gratuit et installation dans Outlook

Le complément est un **site web statique** (dossier `dist/` après compilation) + un **fichier manifest XML** qui indique à Outlook l'adresse de ce site. Aucun serveur applicatif, aucune base de données, aucun secret.

> Un hébergement gratuit en ligne n'est **pas** une autorisation de traiter des données hospitalières. Il héberge uniquement le code ; les mails et dictées ne quittent pas le navigateur (voir SECURITY.md). L'usage sur des données réelles reste soumis à l'accord de l'établissement.

## 1. Compiler

```bash
cd assistant-outlook-ia
npm install
npm test          # 104 tests
npm run build     # produit dist/ (~27 Mo, dont 26,9 Mo de moteur WebAssembly)
```

## 2. Choisir un hébergement HTTPS gratuit

| Option | Coût | Dépôt privé ? | Remarques |
|---|---|---|---|
| **GitHub Pages** (recommandé) | 0 € | ❌ dépôt **public** requis sur l'offre gratuite | Déploiement automatique par le workflow `.github/workflows/assistant-outlook-ia.yml`. Fichiers ≤ 100 Mo : OK. |
| GitHub Pages depuis un **second dépôt public** dédié | 0 € | le dépôt de travail reste privé | Copier `dist/` dans le dépôt public (branche `gh-pages`). |
| Netlify (« Netlify Drop ») | 0 € (offre gratuite, quotas mensuels) | oui (dépôt par glisser-déposer) | Glisser le dossier `dist/` sur https://app.netlify.com/drop. Vérifier les conditions de l'offre gratuite au moment du déploiement. |
| Cloudflare Pages | 0 € | oui | ⚠️ Limite de 25 Mio par fichier : le moteur `ort-…asyncify.wasm` (26,9 Mo) **dépasse** cette limite. Non recommandé en l'état. |
| Serveur web interne du CHU (IIS, Apache, nginx) | 0 € de licence | — | Option la plus maîtrisée si la DSI l'accepte : copier `dist/` ; servir `.wasm` en `application/wasm`. |

Le code ne contient aucun secret : le rendre public ne divulgue rien de sensible. Ne jamais y ajouter de données réelles.

### 2a. GitHub Pages (dépôt public)

1. Sur GitHub : *Settings → General → Danger zone → Change visibility → Public* (ou créer un dépôt public dédié).
2. *Settings → Pages → Build and deployment → Source : GitHub Actions*.
3. Fusionner le travail dans `main` : le workflow teste, compile et publie. L'adresse sera `https://<compte>.github.io/<dépôt>/` (ici, par défaut : `https://montbrundorian1-hub.github.io/mon-code/`).
4. Vérifier en ouvrant cette adresse dans Edge : l'application s'affiche en **mode démonstration**.

### 2b. Netlify Drop (sans rendre le dépôt public)

1. `npm run build`.
2. Ouvrir https://app.netlify.com/drop, créer un compte gratuit, glisser le dossier `dist/`.
3. Noter l'adresse `https://<nom>.netlify.app/`.

## 3. Générer le manifest avec la bonne adresse

```bash
npm run manifest -- https://montbrundorian1-hub.github.io/mon-code/
```

Cela régénère `manifest.xml` (production) et `manifest.dev.xml` (`https://localhost:3000/`). L'adresse doit être en **HTTPS** et se terminer par `/`.

Validation (facultative, utilise le service de validation en ligne de Microsoft ; le manifest ne contient aucune donnée personnelle) :

```bash
npx office-addin-manifest validate manifest.xml
```

Résultat obtenu le 2026-10-12 : « The manifest is valid. »

## 4. Importer le manifest dans le webmail (si l'établissement l'autorise)

Même procédure que pour le complément « Hello world » déjà testé :

1. Ouvrir https://webmail.chu-grenoble.fr/owa/.
2. Ouvrir la gestion des compléments : selon la version d'OWA, *Paramètres (roue dentée) → Gérer les compléments* (ou *Compléments*), puis **« Mes compléments » → « Ajouter un complément personnalisé » → « Ajouter à partir d'un fichier… »**.
3. Choisir `manifest.xml`, confirmer l'avertissement.
4. Ouvrir un message ou en rédiger un : le bouton **« Assistant IA »** apparaît dans la barre du message (ou dans le menu « … » / « Compléments »).

## 5. Mettre à jour

- **Modification du code** : recompiler et redéployer `dist/`. Recharger le panneau suffit (fichiers versionnés par empreinte ; GitHub Pages met en cache `index.html` jusqu'à 10 minutes). **Pas besoin de réimporter le manifest.**
- **Modification du manifest** (adresse, permissions, boutons) : incrémenter `MANIFEST_VERSION` dans `scripts/build-manifest.mjs`, régénérer, supprimer l'ancien complément dans OWA puis importer le nouveau.

## 6. Revenir à une version précédente

- GitHub Pages : *Actions → workflow → exécution précédente réussie → Re-run*, ou `git revert` du commit fautif sur `main`.
- Netlify : *Deploys → choisir un déploiement antérieur → Publish deploy*.
- En urgence : désinstaller le complément dans OWA (USER_TESTS.md §14) ; aucune donnée n'est perdue (rien n'est stocké).

## 7. Auto-héberger les modèles (supprimer l'accès à huggingface.co)

1. Télécharger les fichiers du modèle (ex. `onnx-community/whisper-small` : `config.json`, `generation_config.json`, `preprocessor_config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/encoder_model_quantized.onnx`, `onnx/decoder_model_merged_quantized.onnx`).
2. Les placer dans `public/models/onnx-community/whisper-small/…` avant `npm run build` (ou directement dans `dist/models/…`).
3. Onglet **Modèles → Source : Auto-hébergés**.

Limites : GitHub Pages refuse les fichiers > 100 Mo et recommande un dépôt < 1 Go ; les gros modèles de rédaction (> 500 Mo) ne s'y prêtent pas. Un serveur interne n'a pas ces limites.

## 8. Développement local

```bash
npm run dev        # http://localhost:3000 — mode démonstration, micro autorisé (localhost = contexte sécurisé)
```

Pour charger la version de développement dans Outlook (`manifest.dev.xml`), le serveur local doit être en HTTPS avec un certificat de confiance :

```bash
npx office-addin-dev-certs install   # installe un certificat localhost de confiance (Windows/macOS)
npm run dev:https
```

En pratique, pour tester dans le webmail du CHU, il est plus simple d'utiliser le site déployé (étapes 2–4).
