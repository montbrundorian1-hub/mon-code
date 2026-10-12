# Audits — technique, esthétique et pratique

- **Audit n°2 (2026-10-12)** : audit complet et détaillé, corrections, vérification de la piste de reconnaissance
  vocale native, **refonte visuelle** (voir [DESIGN.md](DESIGN.md)).
- Audit n°1 (2026-10-12) : conservé en fin de document.

## Audit n°2 — méthode

| Volet | Outil / méthode | Couverture |
|---|---|---|
| Analyse statique | ESLint 10 + typescript-eslint 8 (règles **typées** `recommendedTypeChecked`) | Tout le code, scripts et tests |
| Robustesse | Revue du cycle de vie des moteurs (workers) et du micro ; tests avec moteurs simulés (plantage, délai, chargements concurrents, double clic, pause pendant l'autorisation) | `src/ai`, `src/transcription` |
| Fonctionnel | Rejeu de **tous** les exemples affichés dans l'interface, de chaque réglage et des consignes, sur données fictives | Toutes les vues |
| Performance, bonnes pratiques | Lighthouse 13.5 (mobile, réseau simulé, build de production servi localement) | Page d'accueil |
| Accessibilité | axe-core 4.10.3 (WCAG 2.0/2.1 A et AA + bonnes pratiques) ; contraste élevé (`forced-colors`) et mouvements réduits émulés ; parcours clavier | 7 vues × clair/sombre ; 320 et 450 px |
| Parcours réel | Chromium 141, micro simulé avec une dictée **synthétique fictive**, vrais modèles Whisper small (et Qwen3 0.6B pour l'IA) | Dicter → Rédiger → consigne → annuler → insérer → rechercher → répondre → diagnostic |
| Piste « reconnaissance native » | Sondes dans Edge 155 / 157, Chrome 155, Chromium 141 | [PISTE_RECONNAISSANCE_NATIVE.md](PISTE_RECONNAISSANCE_NATIVE.md) |
| Chaîne d'approvisionnement | `npm audit` ; provenance et version des modèles | Dépendances, catalogue de modèles |

## Audit n°2 — résultats avant / après

| Mesure | Avant | Après |
|---|---|---|
| Lighthouse — performance | 88 | **96** |
| Premier affichage (FCP) / interactivité (TTI) | 2,9 s / 3,0 s | **1,9 s / 1,9 s** |
| Temps de blocage total (TBT) | 40 ms | **0 ms** |
| Lighthouse — accessibilité | 100 | **100** |
| Lighthouse — bonnes pratiques | 92 | **96** (seul écart : message d'Office.js hors Outlook, attendu) |
| Lighthouse — référencement | 82 | 63 — **volontaire** : complément privé non indexable (`noindex`) ; méta description et `robots.txt` désormais valides |
| Problèmes ESLint (règles typées) | **169** | **0** (`npm run lint`) |
| Tests automatisés | 113 | **162** |
| Couverture (lignes / branches) | 70,4 % / 54,0 % | **80,8 % / 64,5 %** |
| Violations axe (7 vues × 2 thèmes) | 0 | **0** |
| Débordements horizontaux (320 et 450 px) | 0 | **0** |
| Test navigateur réel, sans IA | — | **20/20** (Whisper small chargé en 26 s, transcription exacte) |
| `npm audit` | 0 vulnérabilité | 0 vulnérabilité |

## Audit n°2 — constats et corrections

| # | Gravité | Domaine | Constat (avant) | Correction | Preuve |
|---|---|---|---|---|---|
| 1 | **Élevée** | Robustesse | Si le moteur de calcul plantait (mémoire saturée…) pendant une transcription ou une rédaction, les requêtes restaient en attente pour toujours : interface bloquée sur « transcription… ». | Toute requête en cours est rejetée, l'échec est affiché (« le moteur s'est arrêté ») avec repli vers un modèle plus léger. | `tests/robustness.test.ts` |
| 2 | **Élevée** | Robustesse | Aucune durée maximale pour un calcul. | Délai maximal par requête (transcription : 60 s ou 12 × la durée audio). | idem |
| 3 | **Élevée** | Démarrage | Microsoft a déplacé le CDN officiel d'Office.js (`officeapis.public.onecdn.static.microsoft`, celui du « Hello world » du CHU). Avec cette version, hors Outlook, `Office.onReady` ne répond jamais : la démonstration aurait attendu indéfiniment. | Nouveau CDN ; détection de l'ouverture par Outlook (cadre ou `_host_Info`) : démonstration immédiate sinon, attente bornée à 10 s dans Outlook ; CSP et liste blanche mises à jour. | `tests/outlook.test.ts` ; test réel : seuls les domaines autorisés contactés |
| 4 | **Élevée** | Micro | Double clic sur le micro : deux demandes d'accès, un flux pouvait rester ouvert. | État « ouverture du micro » et jeton d'annulation : une seule capture. | `tests/robustness.test.ts` |
| 5 | **Élevée** | Micro | Échap ou Pause pendant la fenêtre d'autorisation du navigateur : ignorés, le micro s'ouvrait ensuite. | L'ouverture est annulée ; si l'autorisation arrive après, le flux est aussitôt fermé. | idem |
| 6 | Moyenne | IA | Impossible d'arrêter une génération IA (jusqu'à une minute). | Bouton d'envoi transformé en **Arrêter** ; arrêt réel du modèle ; version sans IA conservée. | `tests/experience.test.ts` |
| 7 | Moyenne | Fonctionnel | Le réglage « ponctuation dictée » n'avait **aucun effet** (jamais transmis à la rédaction). | Transmis à la rédaction et aux réponses. | idem |
| 8 | Moyenne | Fonctionnel | « remplace 12 par 13 » modifiait aussi « 112 ». | Remplacement par mot entier ; nombre de remplacements annoncé. | `tests/redaction.test.ts` |
| 9 | Moyenne | Fonctionnel | L'exemple affiché « documents de stage envoyés » ne trouvait rien (« de stage » compris comme un expéditeur) ; « réponse du secrétariat », « échanges avec le Dr Fictif » non plus. | Personnes connues reconnues (même en minuscules), « avec » = expéditeur ou destinataire, mots-clés facultatifs quand un filtre est présent. | `tests/search.test.ts` (tous les exemples affichés donnent un résultat) |
| 10 | Moyenne | Fiabilité | Les vérifications (dates, doses…) restaient celles de la première version après une consigne ou une retouche : affichage **périmé**. | Recalcul par rapport à la dictée d'origine après chaque modification (consignes autorisées). | `tests/experience.test.ts` |
| 11 | Moyenne | Chaîne d'approvisionnement | Modèles téléchargés « à la dernière version » : un dépôt modifié après évaluation aurait changé les fichiers. | Révision figée (empreinte de commit) pour chaque modèle. | `src/ai/models.ts`, `tests/robustness.test.ts` |
| 12 | Moyenne | Insertion | Si le curseur était indisponible, le texte était inséré en tête du message sans prévenir. | Message explicite (« Curseur indisponible : texte inséré en tête du message »). | `tests/outlook.test.ts`, `tests/experience.test.ts` |
| 13 | Faible | Rédaction | Formule finale sans ponctuation (« Merci »). | Ponctuation adaptée (« Merci. », « Cordialement, », « Merci ! » conservé). | `tests/redaction.test.ts` |
| 14 | Faible | Qualité du code | 169 problèmes ESLint : valeurs non typées entre les workers, promesses non gérées, assertions inutiles, espaces insécables invisibles dans des expressions régulières. | Protocole typé des workers (`workerProtocol.ts`), corrections, **0 problème**. | `npm run lint` |
| 15 | Faible | Vie privée | Pas de `robots.txt` (le serveur renvoyait la page), pas de méta description. | `robots.txt` (`Disallow: /`), `noindex`, description. | Lighthouse |
| 16 | Faible | Ergonomie | En lecture d'un message, le panneau s'ouvrait sur « Dicter ». | Ouverture sur « Répondre ». | `tests/experience.test.ts` |
| 17 | Faible | Ergonomie | Bandeau « Micro actif » et en-tête collés tous deux en haut : le bandeau recouvrait l'en-tête au défilement. | Bandeau intégré à l'en-tête collant, chronomètre et arrêt immédiat. | Captures |
| 18 | Faible | Ergonomie | Jargon visible d'emblée (WASM, f16…) ; diagnostic en longue liste plate ; résultats de recherche sans mise en évidence. | Langage clair, détails techniques repliés ; synthèse en tête du diagnostic ; mots retrouvés surlignés ; critères compris affichés. | Captures, `tests/ui.test.ts` |
| 19 | Faible | Accessibilité | Pas d'annonce des changements d'état pour les lecteurs d'écran ; pas de prise en charge dédiée du contraste élevé de Windows. | Annonces (section, micro, mail rédigé, résultats, diagnostic) ; règles `forced-colors` ; mouvements réduits. | `tests/ui.test.ts`, captures contraste élevé |
| 20a | Moyenne | Chaîne d'approvisionnement | Constaté pendant les tests réels : Transformers.js 4.3.1 interrogeait encore la branche `main` pour la **liste et la taille** des fichiers (avant le téléchargement des poids, lui bien figé). | Gabarit d'URL contenant directement l'empreinte de commit : toutes les requêtes visent la version évaluée. | `tests/robustness.test.ts` ; journal des requêtes du test réel |
| 20b | Faible | Réseau | Après plusieurs téléchargements rapprochés, huggingface.co répond « 429 » (limitation de débit) : message « le modèle n'a pas pu être chargé » peu utile. | Message explicite (« trop de demandes, réessayez dans quelques minutes ») ; erreurs serveur 5xx distinguées. | `tests/robustness.test.ts` |
| 20 | — | Esthétique | Interface fonctionnelle mais austère, peu accueillante. | **Refonte complète** : salutation, suggestions, conversation, orbe de dictée, thèmes clair/sombre soignés. | [DESIGN.md](DESIGN.md) |
| 21 | — | Piste | « Reconnaissance vocale native locale en français » signalée possible par l'audit n°1. | **Vérifiée** : indisponible dans Edge pour le français (même option activée). Whisper conservé ; information affichée dans le Diagnostic. | [PISTE_RECONNAISSANCE_NATIVE.md](PISTE_RECONNAISSANCE_NATIVE.md) |

## Audit n°2 — ce qui n'a pas pu être vérifié ici

- **Webmail réel du CHU** : ouverture du panneau avec le nouveau CDN d'Office.js (le « Hello world » l'utilise
  déjà avec succès, mais ce complément n'y a pas encore été ouvert), panneau en lecture, micro dans le panneau,
  accès à huggingface.co, insertion réelle. → [USER_TESTS.md](USER_TESTS.md).
- **Edge** : tests réalisés dans Chromium 141 (même moteur de rendu) ; pas de carte graphique (WebGPU non mesuré).
- **Voix réelles** : dictée de test en voix de synthèse ; accent, bruit et vocabulaire spécialisé dégraderont la qualité.
- **Lecteurs d'écran** (Narrateur, NVDA) : annonces vérifiées par tests automatisés, pas avec un lecteur réel.

## Audit n°2 — points conservés volontairement

- **Office.js chargé de façon bloquante** dans `<head>` (exigence Microsoft) : environ 0,7 s de rendu différé
  selon Lighthouse.
- **Message « hostInfo validation failed »** dans la console hors Outlook : émis par Office.js lui-même, attendu.
- **Référencement faible** : le complément ne doit pas être indexé.
- **`style-src 'unsafe-inline'`** : nécessaire aux largeurs de barres de progression et au niveau sonore de l'orbe ;
  aucun script en ligne n'est autorisé.

## Audit n°1 (historique, 2026-10-12)

### Méthode

| Volet | Outil / méthode | Couverture |
|---|---|---|
| Accessibilité | axe-core 4.10 (WCAG 2.0/2.1 A et AA + bonnes pratiques) injecté dans Chromium 141 | 7 vues × thèmes clair/sombre × 450 px |
| Mise en page | Mesure du débordement horizontal, des cibles cliquables < 24 px, des textes < 12 px | 7 vues × 320 px et 450 px × clair/sombre (28 captures) |
| Clavier | Parcours de tabulation automatisé, revue des rendus dynamiques | Vue Dicter + en-tête |
| Ergonomie et esthétique | Revue visuelle des captures, parcours réels (dicter → rédiger → insérer, répondre, rechercher) | Toutes les vues |
| Rédaction | Dictées sans ponctuation, comme celles produites par la reconnaissance vocale | Mode classique + garde de faits |
| Sécurité du code | Recherche de `innerHTML`, `eval`, `new Function`, `document.write`, stockages ; revue des échanges entre fenêtres | Tout `src/` |
| Non-régression | 113 tests Vitest + test navigateur de bout en bout (vrai modèle Whisper, micro simulé) | — |

Script reproductible : `npm run build && node scripts/audit-ui.mjs [dossier]`.

### Résultats avant / après

| Mesure | Avant | Après |
|---|---|---|
| Violations axe (toutes vues) | **31** (contraste insuffisant, absence de titre principal, contenu hors repères) | **0** |
| Débordements horizontaux | **8** cas (jusqu'à +277 px à 320 px de large) | **0** |
| Cibles cliquables < 24 px | puces de recherche 19 px, sommaire 17 px, sélecteur démo 22 px, cases 13 px | cases et boutons radio 18 px, inclus dans un libellé cliquable plus grand |
| Textes < 12 px | badges, puces, pied de page (11 px) | aucun |
| Tests automatisés | 108 | **113** |

### Constats et corrections

| # | Gravité | Domaine | Constat | Correction |
|---|---|---|---|---|
| 1 | **Élevée** | Accessibilité clavier | Pendant la dictée, les boutons Pause/Arrêter et le bandeau « Micro actif » étaient reconstruits toutes les 250 ms : le focus clavier était perdu et un lecteur d'écran réannonçait sans cesse. | Seuls le chronomètre et le niveau sont mis à jour en continu ; la structure n'est reconstruite qu'au changement d'état ; la zone de transcription n'est réannoncée que si le texte change. |
| 2 | **Élevée** | Fiabilité | Sans modèle chargé, le panneau de téléchargement était recréé à chaque événement : la case de consentement pouvait se décocher, et des écouteurs s'accumulaient. | Panneau créé une seule fois et conservé. |
| 3 | **Élevée** | Rédaction | Dictée sans ponctuation : « bonjour docteur martin je vous… » donnait « Bonjour Docteur, Martin je vous… ». | Nom en minuscules reconnu après un titre (sauf mot grammatical), puis mis en majuscule. |
| 4 | Moyenne | Rédaction | Une question en milieu de phrase (« … chambre 12 pouvez-vous apporter… ») restait collée à la phrase précédente. | Les formules de politesse interrogatives (« pouvez-vous », « pourriez-vous »…) ouvrent une nouvelle phrase terminée par « ? », sauf après un mot interrogatif. |
| 5 | Moyenne | Garde de faits | Faux positif : « nombre 12 absent » lorsque le nombre était suivi d'un point final. | Détection corrigée ; test ajouté. |
| 6 | Moyenne | Mise en page | À 320 px, les onglets Modèles, Diagnostic et Aide étaient hors écran, sans indication ; une liste déroulante élargissait la page de 277 px. | 4 onglets principaux en grille (icône au-dessus du libellé en panneau étroit), outils secondaires en icônes dans l'en-tête ; listes déroulantes limitées à la largeur du panneau. |
| 7 | Moyenne | Contraste | Thème sombre : texte blanc sur bleu clair (boutons principaux) et sur rose (bandeau micro, bouton Arrêter) sous le seuil AA. | Couleurs pleines dédiées (`--primary-strong`, `--danger-strong`), au moins 4,5:1. |
| 8 | Moyenne | Typographie | « 14 h 30 » ou « 1 g » pouvaient être coupés en fin de ligne. | Espaces insécables entre un nombre et son unité. |
| 9 | Faible | Accessibilité | Pas de titre principal, contenu hors repères, ordre des titres h1 → h3. | Titre h1, avertissement et bandeau micro en régions nommées, titres de cartes en h2, micro avec un libellé accessible qui change selon l'état. |
| 10 | Faible | Pratique | Case « IA » grisée sans explication quand aucun modèle n'est chargé. | Message clair + bouton « Charger un modèle IA » ; dans Dicter, raccourci « Saisir le texte au clavier ». |
| 11 | Faible | Esthétique | Grandes zones de texte vides, bouton « J'ai compris » mal aligné, cartes du diagnostic collées, étiquette « reçus » déformée. | Hauteur des zones adaptée au contenu, bouton aligné à droite, espacement des cartes, étiquettes sur une ligne. |
| 12 | Faible | Sécurité | Le message de la fenêtre de dictée était accepté sans origine, quelle que soit la provenance. | Origine exigée identique lorsqu'elle est fournie. Aucun `innerHTML`, `eval` ou script en ligne dans le code ; la CSP a d'ailleurs bloqué l'injection de l'outil d'audit (contournée uniquement pour l'audit). |

### Points conservés volontairement

- **Office.js chargé de façon bloquante** dans `<head>` : c'est la recommandation de Microsoft pour un complément. Coût : un aller-retour réseau au démarrage.
- **Cases à cocher de 18 px** : sous la cible de 24 px, mais tout le libellé associé est cliquable, ce qui offre une cible équivalente plus grande (exception prévue par le critère WCAG 2.5.8).
- **Onglets sans navigation par flèches** : ce sont des boutons ordinaires (`aria-current`), accessibles à la tabulation.
- **Erreur console « Failed to create WebGPU Context Provider »** : propre au navigateur de test sans carte graphique ; sans effet.

### Limites qui demeurent (non résolubles par l'interface)

- La transcription sur processeur seul reste plus lente que la parole (≈ 2,5× avec whisper-small).
- Les petits modèles de rédaction restent peu fiables : l'IA reste optionnelle et contrôlée.
- Le micro dans le panneau du webmail et l'accès à huggingface.co depuis le CHU restent à vérifier sur place (USER_TESTS.md).

### Piste découverte pendant l'audit

Le diagnostic indique, dans Chromium 141, que la **reconnaissance vocale native locale** (`processLocally`) est « téléchargeable » pour le **français**. La documentation Edge consultée ne l'annonçait pas pour le français. Si l'onglet Diagnostic affiche la même chose dans votre Edge, cela ouvrirait une transcription réellement en direct et plus légère que Whisper, sans cloud. C'est à évaluer après vos tests, en vérifiant que le traitement reste bien local.

> **Mise à jour (audit n°2)** : piste vérifiée dans de vrais navigateurs — Edge 155 et 157 répondent « unavailable » pour le français en local, même avec l'option expérimentale ; Whisper est conservé. Voir [PISTE_RECONNAISSANCE_NATIVE.md](PISTE_RECONNAISSANCE_NATIVE.md).
