/**
 * Configuration centrale de l'application.
 * Aucune donnée secrète ni identifiant ne doit figurer ici : ce fichier est publié.
 */

export const APP_NAME = 'Assistant Outlook IA';
export const APP_VERSION = '0.1.0';

/**
 * Hôtes externes que l'application est autorisée à contacter, et pour quel usage.
 * Toute requête vers un autre hôte est bloquée par le garde réseau (src/security/networkGuard.ts).
 * Aucun de ces hôtes ne reçoit de contenu utilisateur : seules des requêtes GET sans corps
 * (téléchargement de bibliothèques ou de poids de modèles) sont permises vers l'extérieur.
 */
export const ALLOWED_EXTERNAL_HOSTS: ReadonlyArray<{ host: string; purpose: string }> = [
  { host: 'officeapis.public.onecdn.static.microsoft', purpose: 'Bibliothèque Office.js — CDN officiel actuel de Microsoft (obligatoire pour un complément Outlook)' },
  { host: 'appsforoffice.microsoft.com', purpose: 'Ancien CDN officiel d’Office.js (ressources éventuellement chargées par Office.js)' },
  { host: 'huggingface.co', purpose: 'Téléchargement des poids de modèles open source (GET uniquement)' },
  { host: '*.huggingface.co', purpose: 'CDN des poids de modèles Hugging Face (GET uniquement)' },
  { host: '*.hf.co', purpose: 'CDN (Xet) des poids de modèles Hugging Face (GET uniquement)' },
];

/**
 * Office.js : adresse officielle actuelle (documentation Microsoft « Referencing the Office JavaScript API library »).
 * C'est aussi celle du complément « Hello world » qui fonctionne dans le webmail du CHU.
 * Doit être chargée dans <head>, de façon synchrone (exigence Microsoft) : voir index.html.
 */
export const OFFICE_JS_URL = 'https://officeapis.public.onecdn.static.microsoft/1/office.js';

/** Nom du cache utilisé par Transformers.js pour les poids de modèles (pas de données utilisateur). */
export const MODEL_CACHE_NAME = 'transformers-cache';

/** Taille au-delà de laquelle un modèle est considéré comme « lourd » sur un poste partagé. */
export const HEAVY_MODEL_BYTES = 600 * 1024 * 1024;
