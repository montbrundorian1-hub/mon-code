# Feuille de route

## V1 (cette version) — livrée

- [x] Manifest XML classique (MailApp, Mailbox 1.1 / 1.3, ReadWriteItem), surfaces lecture + rédaction ; validé par le validateur Microsoft.
- [x] Panneau : Dicter, Rédiger, Répondre, Rechercher (+ Modèles, Diagnostic, Aide), mode démonstration fictif.
- [x] Dictée locale Whisper (WASM/WebGPU), transcription par segments, provisoire si poste rapide, pause/reprise/arrêt, micro visible.
- [x] Rédaction classique (règles) + IA locale optionnelle vérifiée (garde de faits, couverture), comparaison, commandes écrites et vocales, conversation vocale.
- [x] Insertion au curseur / en tête, réponse préremplie, copie de secours ; aucun envoi.
- [x] Recherche démonstration (fictive) en langage naturel.
- [x] Diagnostic de compatibilité, rapport technique expurgé.
- [x] 113 tests automatisés + test navigateur de bout en bout.

## Prochaines étapes immédiates (dépendent de vos tests dans le webmail)

1. **Résultats de USER_TESTS.md §5–§7** : surfaces disponibles, jeux d'API réels, micro dans le panneau.
   - Si le micro est bloqué dans le panneau : améliorer la fenêtre séparée (chargement du modèle partagé, aller-retour plus fluide).
2. **Postes du CHU** : vérifier si `huggingface.co` est joignable ; sinon auto-héberger whisper-small (≈ 250 Mo) avec le site.
3. Ajuster les seuils de segmentation selon le bruit ambiant réel (bureaux, couloirs).

## V2 — réponses et vocal avancés

- Lecture autorisée du message courant (déjà codée, à valider réglementairement) et réponses automatiques plus riches.
- Commandes vocales avancées : « insère », « lis-moi la réponse » (synthèse vocale locale), navigation entre onglets.
- Lexique médical étendu et personnalisable (liste locale de termes du service, sans données patients).
- Gestion des modèles : préchargement facultatif, choix automatique selon la latence mesurée, modèle de rédaction plus fiable dès qu'un modèle ouvert multilingue < 2 Go le permettra (réévaluer régulièrement : la garde de faits permet de mesurer objectivement).
- Panneau épinglable (`SupportsPinning`, VersionOverrides 1.1, Mailbox 1.5) pour suivre le message sélectionné.
- Transcription WebGPU avec whisper-large-v3-turbo sur postes équipés (non testé, pas de GPU dans l'environnement de développement).

## V2+ — recherche dans la boîte réelle

Voir `EXCHANGE_SEARCH_FEASIBILITY.md`. Conditions préalables : autorisation écrite de l'établissement, EWS + OAuth activés, manifest `ReadWriteMailbox` séparé. Pas d'index persistant, pas de synchronisation de fond.

## Hors périmètre (volontairement)

- Envoi automatique de mails.
- Toute IA ou reconnaissance vocale dans le cloud.
- Transfert vers une boîte personnelle, archivage, suppression automatique.
