# Étude de faisabilité — recherche dans toute la boîte et synchronisation (Exchange on-premises)

> Statut : **étude seulement**. Aucune de ces fonctions n'est activée en V1.
>
> Ce que fait la V1 (depuis le test réel du 2026-10-13) : **dans Outlook**, l'onglet Rechercher traduit la question
> (« mails du secrétariat cette semaine ») en recherche à coller dans la barre de recherche du webmail
> (`from:secrétariat received:2026-10-06..2026-10-13`). C'est Outlook qui cherche : le panneau ne lit pas la boîte et
> aucune permission supplémentaire n'est demandée. **Hors Outlook**, la démonstration cherche dans des messages fictifs.

## 1. Ce qu'un complément « ReadWriteItem » peut faire aujourd'hui

- Lire et modifier **l'élément ouvert** uniquement (Mailbox 1.1–1.5 sur Exchange 2016/2019/SE).
- Il n'a **aucun** accès aux autres messages, dossiers ou à la recherche serveur.

Conclusion : la recherche dans toute la boîte est **impossible** avec les permissions actuelles, par conception.

## 2. Options techniques étudiées

### Option A — EWS via `Office.context.mailbox.makeEwsRequestAsync`

Source : Microsoft Learn, « Use Exchange Web Services (EWS) from an Outlook add-in in Exchange on-premises » (mis à jour le 2025-11-15), consulté le 2026-10-12.

- Permet d'exécuter des opérations EWS (ex. `FindItem`, `GetItem`) sur le serveur Exchange qui héberge la boîte, avec les identifiants de l'utilisateur courant gérés par Outlook.
- **Exige la permission `ReadWriteMailbox`** dans le manifest (la plus élevée ; accès en lecture/écriture à toute la boîte, y compris envoi par EWS).
- **Exige une action de l'administrateur Exchange** : `OAuthAuthentication` à `true` sur le répertoire virtuel EWS (`Set-WebServicesVirtualDirectory`).
- Selon les organisations, l'installation de compléments demandant `ReadWriteMailbox` peut être restreinte par l'administrateur (rôles « My Custom Apps » / stratégies OWA).
- Requêtes/réponses SOAP XML de taille limitée ; non disponible sur mobile.
- La recherche serveur EWS (`FindItem` avec `QueryString` / AQS) s'appuie sur l'index de recherche Exchange : pas besoin de copier les mails pour chercher.

Faisabilité technique : **probable** sur Exchange 2016/2019 si EWS et OAuth sont activés — **à vérifier** (diagnostic : `mailbox.makeEwsRequestAsync` « disponible » dans l'onglet Diagnostic n'indique que la présence de la méthode, pas l'autorisation).

### Option B — Jeton de rappel (`getCallbackTokenAsync`) + serveur intermédiaire

- Un serveur appellerait EWS/REST avec un jeton de l'utilisateur.
- **Écartée** : nécessite un backend (coût, hébergement de données), et le contenu des mails transiterait par ce serveur.

### Option C — Index local dans le navigateur

- Parcourir la boîte via EWS et construire un index (IndexedDB) pour une recherche sémantique locale.
- **Écartée en l'état** : copie massive de données de santé sur le poste, persistance contraire aux règles du projet, pas de synchronisation en arrière-plan (un complément ne s'exécute que panneau ouvert).

## 3. Architecture proposée pour une éventuelle V2 (sans copie de la boîte)

```
Requête en langage naturel ──► analyse locale (parseQuery : expéditeur, période, dossier, mots-clés)
                              ──► traduction en AQS / FindItem (EWS, côté serveur Exchange)
                              ──► N premiers résultats : en-têtes uniquement (objet, expéditeur, date)
                              ──► ouverture d'un résultat à la demande (GetItem), affichage, oubli
```

- Pas d'index persistant, pas de synchronisation, pas de copie.
- La recherche s'exécute **sur le serveur Exchange du CHU** (index existant) ; rien n'est envoyé ailleurs.
- L'IA locale peut reformuler la requête ou résumer un message ouvert à la demande.
- Le code est prêt à recevoir cette implémentation : interface `MailboxSearchProvider` (`src/search/search.ts`), `ExchangeSearchProvider` actuellement désactivé.

## 4. Autorisations nécessaires avant toute activation

1. Accord écrit de la DSI / RSSI / DPO du CHU pour un complément `ReadWriteMailbox` traitant des données de santé.
2. Vérification par l'administrateur Exchange : EWS activé, `OAuthAuthentication` activé, politique de compléments.
3. Analyse d'impact (AIPD) si des données de santé sont concernées.
4. Manifest distinct (« V2 ») pour que la V1 reste en `ReadWriteItem`.

## 5. Limites à connaître

- Synchronisation automatique en arrière-plan : **non réalisable** dans un complément web (aucune exécution panneau fermé).
- Résultats limités à ce que l'index Exchange sait retrouver (mots-clés, pas de recherche sémantique serveur).
- `ReadWriteMailbox` donne techniquement un accès étendu (y compris envoi via EWS) : le code devra se restreindre à `FindItem`/`GetItem` et être audité.
- Microsoft fait évoluer EWS (abandonné pour Exchange Online) ; sur on-premises, il reste documenté et pris en charge au 2026-10-12.

## 6. Test utilisateur nécessaire pour avancer

Uniquement après autorisation : demander à l'administrateur Exchange si `OAuthAuthentication` est activé sur EWS et si un complément `ReadWriteMailbox` est autorisé. Sans ces deux réponses, ne rien développer de plus.
