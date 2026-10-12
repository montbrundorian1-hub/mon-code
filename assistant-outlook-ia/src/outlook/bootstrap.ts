/**
 * Démarrage Office.js : détecte si l'application s'exécute dans Outlook ou en démonstration.
 *
 * Office.js est chargé par une balise <script> dans index.html (CDN officiel Microsoft,
 * obligatoire pour un complément). Hors d'Outlook, la version actuelle d'Office.js ne
 * « répond » jamais (Office.onReady reste en attente) : on ne l'attend donc que si la page
 * est probablement ouverte par Outlook (panneau dans un cadre, ou adresse portant « _host_Info »).
 * Sinon, l'application passe immédiatement en mode démonstration.
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
  /** Vrai si la page semblait ouverte par Outlook (panneau ou fenêtre de dialogue). */
  officeContext: boolean;
}

const READY_TIMEOUT_MS = 10000;

/**
 * Indices fiables qu'Outlook a ouvert la page : le panneau est un cadre (iframe) dans le webmail,
 * et les adresses ouvertes par Office portent le paramètre « _host_Info ».
 */
export function isLikelyOfficeContext(win: Window): boolean {
  let framed: boolean;
  try {
    framed = win.self !== win.top;
  } catch {
    framed = true; // accès refusé à « top » : on est dans un cadre d'une autre origine
  }
  return framed || /[?&#]_host_info=/i.test(win.location.href);
}

export async function bootstrapHost(
  win: Window & { Office?: typeof Office } = window,
  opts: { officeContext?: boolean; timeoutMs?: number } = {},
): Promise<BootResult> {
  const off = win.Office;
  const officeContext = opts.officeContext ?? isLikelyOfficeContext(win);
  const demo = (extra: Partial<BootResult> = {}): BootResult => ({
    host: new DemoMailHost(),
    officeScriptLoaded: !!off,
    officeHost: null,
    readyMs: null,
    error: null,
    officeContext,
    ...extra,
  });
  if (!off || typeof off.onReady !== 'function') return demo({ officeScriptLoaded: false });
  if (!officeContext) return demo(); // ouverture directe dans le navigateur : démonstration immédiate
  const t0 = performance.now();
  try {
    const info = await Promise.race([
      off.onReady(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Office.onReady : délai dépassé')), opts.timeoutMs ?? READY_TIMEOUT_MS)),
    ]);
    const readyMs = Math.round(performance.now() - t0);
    if (info?.host === off.HostType?.Outlook && off.context?.mailbox) {
      return { host: new OfficeMailHost(), officeScriptLoaded: true, officeHost: 'Outlook', readyMs, error: null, officeContext };
    }
    return demo({ officeHost: info?.host ? String(info.host) : null, readyMs });
  } catch (e) {
    return demo({ error: e instanceof Error ? e.message : String(e) });
  }
}
