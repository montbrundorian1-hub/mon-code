/**
 * Préférences utilisateur NON sensibles.
 *
 * Seules des clés énumérées, avec des valeurs validées (booléens, identifiants de modèles
 * du catalogue, raccourcis prédéfinis), peuvent être persistées dans localStorage.
 * Aucun texte libre ne peut y être écrit : ni dictée, ni contenu de mail, ni nom de destinataire.
 */

export type ShortcutId = 'ctrl-shift-space' | 'f8' | 'alt-shift-d' | 'none';
export type ModelSource = 'huggingface' | 'self-hosted';

export interface Settings {
  /** Conserver les poids des modèles dans le cache du navigateur (Cache API). */
  cacheModels: boolean;
  /** Source des poids de modèles. */
  modelSource: ModelSource;
  /** Identifiant du modèle de transcription préféré (catalogue). */
  asrModel: string;
  /** Identifiant du modèle de rédaction préféré (catalogue), ou « classic ». */
  llmModel: string;
  /** Raccourci clavier pour activer/désactiver le micro (panneau uniquement). */
  shortcut: ShortcutId;
  /** L'utilisateur a lu l'avertissement de confidentialité (n'autorise rien en soi). */
  privacyNoticeRead: boolean;
  /** Interpréter les mots « virgule », « à la ligne », etc. comme de la ponctuation. */
  dictatedPunctuation: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cacheModels: false,
  modelSource: 'huggingface',
  asrModel: '',
  llmModel: '',
  shortcut: 'ctrl-shift-space',
  privacyNoticeRead: false,
  dictatedPunctuation: true,
};

const STORAGE_KEY = 'aoia.settings.v1';
const ID_PATTERN = /^[A-Za-z0-9._\-/]{0,120}$/;
const SHORTCUTS: ShortcutId[] = ['ctrl-shift-space', 'f8', 'alt-shift-d', 'none'];

/** Valide une valeur candidate ; renvoie la valeur par défaut si invalide. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.cacheModels === 'boolean') out.cacheModels = r.cacheModels;
  if (r.modelSource === 'huggingface' || r.modelSource === 'self-hosted') out.modelSource = r.modelSource;
  if (typeof r.asrModel === 'string' && ID_PATTERN.test(r.asrModel)) out.asrModel = r.asrModel;
  if (typeof r.llmModel === 'string' && ID_PATTERN.test(r.llmModel)) out.llmModel = r.llmModel;
  if (typeof r.shortcut === 'string' && (SHORTCUTS as string[]).includes(r.shortcut)) {
    out.shortcut = r.shortcut as ShortcutId;
  }
  if (typeof r.privacyNoticeRead === 'boolean') out.privacyNoticeRead = r.privacyNoticeRead;
  if (typeof r.dictatedPunctuation === 'boolean') out.dictatedPunctuation = r.dictatedPunctuation;
  return out;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // stockage bloqué (navigation privée, politique du poste)
  }
}

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function loadSettings(): Settings {
  if (current) return current;
  let parsed: unknown;
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  current = sanitizeSettings(parsed);
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = sanitizeSettings({ ...loadSettings(), ...patch });
  current = next;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible : les préférences restent en mémoire pour la session.
  }
  listeners.forEach((l) => l(next));
  return next;
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function settingsStorageKey(): string {
  return STORAGE_KEY;
}

/** Réservé aux tests. */
export function _resetSettingsForTests(): void {
  current = null;
  listeners.clear();
}
