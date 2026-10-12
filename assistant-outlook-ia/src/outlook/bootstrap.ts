/**
 * Démarrage Office.js : détecte si l'application s'exécute dans Outlook ou en démonstration.
 *
 * Office.js est chargé par une balise <script> dans index.html (CDN officiel Microsoft,
 * obligatoire pour un complément). Si le script n'a pas pu être chargé (hors ligne, poste
 * filtré) ou si la page est ouverte hors d'Outlook, l'application passe en mode démonstration.
 */

import { DemoMailHost } from '../mock/demoHost';
import { OfficeMailHost } from './officeAdapter';
import type { MailHost } from './types';

export interface BootResult {
  host: MailHost;
  officeScriptLoaded: boolean;
  officeHost: string | null;
  /** Durée de l'initialisation Office.onReady (ms), ou null. */
  readyMs: number | null;
  error: string | null;
}

const READY_TIMEOUT_MS = 8000;

export async function bootstrapHost(win: Window & { Office?: typeof Office } = window): Promise<BootResult> {
  const off = win.Office;
  if (!off || typeof off.onReady !== 'function') {
    return { host: new DemoMailHost(), officeScriptLoaded: false, officeHost: null, readyMs: null, error: null };
  }
  const t0 = performance.now();
  try {
    const info = await Promise.race([
      off.onReady(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Office.onReady : délai dépassé')), READY_TIMEOUT_MS)),
    ]);
    const readyMs = Math.round(performance.now() - t0);
    if (info?.host === off.HostType?.Outlook && off.context?.mailbox) {
      return { host: new OfficeMailHost(), officeScriptLoaded: true, officeHost: 'Outlook', readyMs, error: null };
    }
    return {
      host: new DemoMailHost(),
      officeScriptLoaded: true,
      officeHost: info?.host ? String(info.host) : null,
      readyMs,
      error: null,
    };
  } catch (e) {
    return {
      host: new DemoMailHost(),
      officeScriptLoaded: true,
      officeHost: null,
      readyMs: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
