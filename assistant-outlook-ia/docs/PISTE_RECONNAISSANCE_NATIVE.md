# Vérification de la piste « reconnaissance vocale native locale » (2026-10-12)

## Question

Le Diagnostic affichait, dans Chromium 141, « Reconnaissance vocale native locale (fr-FR) : téléchargeable ».
Peut-on remplacer ou compléter Whisper par la reconnaissance vocale **intégrée au navigateur**, en mode strictement local
(`SpeechRecognition.processLocally = true`), pour obtenir une vraie transcription en direct, plus légère ?

## Méthode

Navigateurs **réellement installés et exécutés** dans l'environnement de développement (Linux, sans carte son ni GPU) :

| Navigateur | Version | Origine |
|---|---|---|
| Microsoft Edge (stable) | 155.0.4283.45 | packages.microsoft.com |
| Microsoft Edge (Dev) | 157.0.4322.0 | packages.microsoft.com |
| Google Chrome (stable) | 155.0.8059.39 | dl.google.com |
| Chromium (Playwright) | 141.0.7390.37 | préinstallé |

Pour chacun : `SpeechRecognition.available({ langs: [...], processLocally: true })`, puis `install()`, puis une reconnaissance réelle sur
la dictée **fictive** de test (voix de synthèse), injectée via `recognition.start(MediaStreamTrack)`. Les journaux internes du navigateur
ont été analysés. Pour Edge, l'option `edge://flags/#edge-on-device-speech-recognition` (« Speech Recognition with on-device model ») a été
**activée et contrôlée visuellement**.

## Résultats

| Navigateur | API locale exposée | fr-FR local | Autres langues locales | Installation | Texte obtenu |
|---|---|---|---|---|---|
| **Edge 155 stable** | oui | **indisponible** | indisponibles (en-US, de-DE, it-IT, es-ES) | — | — |
| **Edge 157 Dev + option activée** | oui | **indisponible** | indisponibles | — | — |
| Chrome 155 stable | oui | téléchargeable | téléchargeables | ✅ moteur SODA 116 Mo + pack fr-FR 205 Mo (serveurs Google), 27 s | ❌ aucun texte dans cet environnement |
| Chromium 141 | oui | téléchargeable | téléchargeables | ✅ en apparence | ❌ erreurs « network » / « audio-capture » |

Détails :

- **Edge** : quel que soit le réglage, le moteur local répond « indisponible ». La documentation Microsoft (consultée le 2026-10-12) le
  réserve à Edge Canary/Dev ≥ 150 et aux langues **en-US, de-DE, it-IT, pt-PT, es-ES, ko-KR — pas le français**. Le binaire d'Edge montre
  que ce moteur dépend du composant « Edge On-Device Speech Model » et du « Edge LLM runtime » (téléchargés par Microsoft, conditions
  matérielles probables).
  En revanche, Edge déclare le français « disponible » **en mode cloud** (service Microsoft) : ce mode n'est **jamais** utilisé par
  l'application.
- **Chrome** : le traitement local est réel. Les journaux montrent `Enabling On Device ASR`, `Server ASR Disabled` et
  `locale: fr-fr … ONDEVICE_LARGE_CONTINUOUS`, et les 19 s d'audio ont été analysées. Mais :
  1. dans un profil normal, Chrome échoue (`Unable to find SODA files on the device`) tant que la langue des **Sous-titres instantanés**
     du profil n'est pas le français ; la langue demandée par la page ne suffit pas ;
  2. même ce réglage corrigé, **aucun texte n'est revenu**, y compris pour un témoin en anglais. Cela montre une limite de
     l'environnement de test (conteneur sans périphérique audio), pas un défaut du français, mais la qualité n'a **pas pu être vérifiée**.
  3. Le téléchargement du moteur passe par les serveurs de Google (`clients2.google.com`, `edgedl.me.gvt1.com`), hors de la liste
     blanche de l'application et souvent filtrés en milieu hospitalier.

## Conclusion

- **Pour votre environnement (Microsoft Edge) : la piste n'est pas exploitable aujourd'hui.** Le français n'existe pas en local dans
  Edge, et le mode disponible pour le français est le cloud Microsoft, exclu pour des raisons de confidentialité.
- Dans Chrome, la piste est techniquement réelle (traitement local confirmé), mais elle n'a pas pu être validée jusqu'au texte. Elle
  dépend d'un réglage du profil et d'un téléchargement depuis Google. Elle ne concerne pas les postes du CHU équipés d'Edge.
- **Whisper reste le moteur retenu.**
- L'onglet Diagnostic détecte désormais précisément l'état de ce moteur (disponible / téléchargeable / indisponible) selon le
  navigateur. Si Microsoft ajoute un jour le français en local, cela apparaîtra immédiatement, sans activation automatique : le
  passage à ce moteur exigera une validation explicite (qualité, conformité).

## Reproduire

Scripts de sonde utilisés : `scripts/probe-native-speech.mjs` (disponibilité dans n'importe quel navigateur Chromium installé).
