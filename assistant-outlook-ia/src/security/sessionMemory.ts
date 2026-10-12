/**
 * Historique temporaire de session, exclusivement en mémoire vive.
 *
 * - Jamais écrit dans localStorage, sessionStorage, IndexedDB, Cache API, URL ou journaux.
 * - Limité en taille.
 * - Effacé à la fermeture du panneau (pagehide), à la demande, ou après inactivité.
 */

export interface HistoryEntry {
  id: number;
  at: number;
  kind: 'dictation' | 'draft' | 'reply' | 'command';
  label: string;
  original: string;
  result: string;
}

const MAX_ENTRIES = 30;
const INACTIVITY_MS = 30 * 60 * 1000;

let entries: HistoryEntry[] = [];
let seq = 0;
let lastActivity = Date.now();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function addHistory(e: Omit<HistoryEntry, 'id' | 'at'>): HistoryEntry {
  expireIfIdle();
  const entry: HistoryEntry = { ...e, id: ++seq, at: Date.now() };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  lastActivity = Date.now();
  notify();
  return entry;
}

export function getHistory(): ReadonlyArray<HistoryEntry> {
  expireIfIdle();
  return entries;
}

export function clearHistory(): void {
  entries = [];
  notify();
}

export function expireIfIdle(now = Date.now()): void {
  if (now - lastActivity > INACTIVITY_MS && entries.length) {
    entries = [];
    notify();
  }
}

export function onHistoryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Enregistre les nettoyeurs à exécuter à la fermeture du panneau. */
const cleanupFns = new Set<() => void>();
export function registerCleanup(fn: () => void): () => void {
  cleanupFns.add(fn);
  return () => cleanupFns.delete(fn);
}

export function runCleanup(): void {
  for (const fn of cleanupFns) {
    try {
      fn();
    } catch {
      /* on poursuit le nettoyage */
    }
  }
  clearHistory();
}

export function installSessionCleanup(win: Window = window): void {
  win.addEventListener('pagehide', runCleanup);
  win.addEventListener('beforeunload', runCleanup);
}

/** Réservé aux tests. */
export function _setLastActivityForTests(t: number): void {
  lastActivity = t;
}
