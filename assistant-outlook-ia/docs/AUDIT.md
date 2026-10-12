# Audit complet — technique, esthétique et pratique (2026-10-12)

## Méthode

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

## Résultats avant / après

| Mesure | Avant | Après |
|---|---|---|
| Violations axe (toutes vues) | **31** (contraste insuffisant, absence de titre principal, contenu hors repères) | **0** |
| Débordements horizontaux | **8** cas (jusqu'à +277 px à 320 px de large) | **0** |
| Cibles cliquables < 24 px | puces de recherche 19 px, sommaire 17 px, sélecteur démo 22 px, cases 13 px | cases et boutons radio 18 px, inclus dans un libellé cliquable plus grand |
| Textes < 12 px | badges, puces, pied de page (11 px) | aucun |
| Tests automatisés | 108 | **113** |

## Constats et corrections

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

## Points conservés volontairement

- **Office.js chargé de façon bloquante** dans `<head>` : c'est la recommandation de Microsoft pour un complément. Coût : un aller-retour réseau au démarrage.
- **Cases à cocher de 18 px** : sous la cible de 24 px, mais tout le libellé associé est cliquable, ce qui offre une cible équivalente plus grande (exception prévue par le critère WCAG 2.5.8).
- **Onglets sans navigation par flèches** : ce sont des boutons ordinaires (`aria-current`), accessibles à la tabulation.
- **Erreur console « Failed to create WebGPU Context Provider »** : propre au navigateur de test sans carte graphique ; sans effet.

## Limites qui demeurent (non résolubles par l'interface)

- La transcription sur processeur seul reste plus lente que la parole (≈ 2,5× avec whisper-small).
- Les petits modèles de rédaction restent peu fiables : l'IA reste optionnelle et contrôlée.
- Le micro dans le panneau du webmail et l'accès à huggingface.co depuis le CHU restent à vérifier sur place (USER_TESTS.md).

## Piste découverte pendant l'audit

Le diagnostic indique, dans Chromium 141, que la **reconnaissance vocale native locale** (`processLocally`) est « téléchargeable » pour le **français**. La documentation Edge consultée ne l'annonçait pas pour le français. Si l'onglet Diagnostic affiche la même chose dans votre Edge, cela ouvrirait une transcription réellement en direct et plus légère que Whisper, sans cloud. C'est à évaluer après vos tests, en vérifiant que le traitement reste bien local.
