/**
 * Garde réseau : défense en profondeur contre toute transmission accidentelle de contenu.
 *
 * Règles :
 *  - Même origine : autorisé (fichiers de l'application, ressources ONNX Runtime auto-hébergées).
 *  - blob: / data: : autorisé (ressources locales en mémoire).
 *  - Hôtes externes de la liste blanche : GET/HEAD uniquement, sans corps de requête.
 *  - Tout le reste est bloqué et compté (seul le nom d'hôte est retenu, jamais l'URL complète).
 *
 * Ce garde complète la Content-Security-Policy déclarée dans index.html. Il ne remplace pas
 * une politique réseau institutionnelle.
 */

export interface GuardEvent {
  host: string;
  method: string;
  allowed: boolean;
  reason: string;
}

export interface GuardPolicy {
  /** Origine de l'application (ex. https://exemple.github.io). */
  selfOrigin: string;
  /** Hôtes externes autorisés, avec joker « *. » pour les sous-domaines. */
  allowedHosts: string[];
}

const MAX_EVENTS = 200;
const events: GuardEvent[] = [];
let installed = false;
let policy: GuardPolicy | null = null;

export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".exemple.com"
    return h.endsWith(suffix) && h.length > suffix.length;
  }
  return h === p;
}

/**
 * Décide si une requête est autorisée. Fonction pure, testée unitairement.
 */
export function evaluateRequest(
  rawUrl: string,
  method: string,
  hasBody: boolean,
  pol: GuardPolicy,
): GuardEvent {
  const m = (method || 'GET').toUpperCase();
  let url: URL;
  try {
    url = new URL(rawUrl, pol.selfOrigin);
  } catch {
    return { host: '(invalide)', method: m, allowed: false, reason: 'URL invalide' };
  }
  if (url.protocol === 'blob:' || url.protocol === 'data:') {
    return { host: url.protocol, method: m, allowed: true, reason: 'Ressource locale en mémoire' };
  }
  if (url.origin === pol.selfOrigin) {
    return { host: url.host, method: m, allowed: true, reason: 'Même origine' };
  }
  if (url.protocol !== 'https:') {
    return { host: url.host, method: m, allowed: false, reason: 'Protocole non chiffré refusé' };
  }
  const listed = pol.allowedHosts.some((p) => hostMatches(url.host, p));
  if (!listed) {
    return { host: url.host, method: m, allowed: false, reason: 'Hôte hors liste blanche' };
  }
  if ((m !== 'GET' && m !== 'HEAD') || hasBody) {
    return {
      host: url.host,
      method: m,
      allowed: false,
      reason: 'Envoi de données vers un hôte externe interdit',
    };
  }
  // Interdit les paramètres de requête trop longs : un canal de fuite classique.
  if (url.search.length > 512) {
    return { host: url.host, method: m, allowed: false, reason: 'Paramètres d’URL anormalement longs' };
  }
  return { host: url.host, method: m, allowed: true, reason: 'Hôte externe autorisé (GET)' };
}

function record(ev: GuardEvent): void {
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
  if (!ev.allowed) {
    // Seuls l'hôte et la raison sont journalisés : jamais l'URL, jamais de contenu.
    console.warn(`[garde réseau] requête bloquée vers ${ev.host} : ${ev.reason}`);
  }
}

export class BlockedRequestError extends Error {
  constructor(public readonly event: GuardEvent) {
    super(`Requête bloquée par la politique de sécurité (${event.host} : ${event.reason})`);
    this.name = 'BlockedRequestError';
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Installe le garde sur l'environnement global (fenêtre ou worker).
 * Idempotent.
 */
export function installNetworkGuard(pol: GuardPolicy, scope: typeof globalThis = globalThis): void {
  policy = pol;
  if (installed) return;
  installed = true;

  const g = scope as typeof globalThis & {
    XMLHttpRequest?: typeof XMLHttpRequest;
    WebSocket?: typeof WebSocket;
    EventSource?: typeof EventSource;
    navigator?: Navigator;
  };

  if (typeof g.fetch === 'function') {
    const originalFetch = g.fetch.bind(g);
    g.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
      const hasBody = init?.body != null;
      const ev = evaluateRequest(urlOf(input), method, hasBody, policy!);
      record(ev);
      if (!ev.allowed) throw new BlockedRequestError(ev);
      return originalFetch(input, init);
    };
  }

  if (g.XMLHttpRequest) {
    const proto = g.XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const meta = new WeakMap<XMLHttpRequest, { url: string; method: string }>();
    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      meta.set(this, { url: String(url), method });
      // @ts-expect-error signature variadique d'origine
      return originalOpen.call(this, method, url, ...rest);
    } as typeof proto.open;
    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const m = meta.get(this) ?? { url: '', method: 'GET' };
      const ev = evaluateRequest(m.url, m.method, body != null, policy!);
      record(ev);
      if (!ev.allowed) throw new BlockedRequestError(ev);
      return originalSend.call(this, body);
    };
  }

  if (g.navigator && typeof g.navigator.sendBeacon === 'function') {
    // Les « beacons » servent typiquement à la télémétrie : tous refusés hors même origine.
    const originalBeacon = g.navigator.sendBeacon.bind(g.navigator);
    g.navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
      const ev = evaluateRequest(String(url), 'POST', data != null, policy!);
      record(ev);
      if (!ev.allowed) return false;
      return originalBeacon(url, data);
    };
  }

  if (g.WebSocket) {
    const OriginalWS = g.WebSocket;
    const Guarded = function (this: unknown, url: string | URL, protocols?: string | string[]) {
      const ev = evaluateRequest(String(url).replace(/^ws/, 'http'), 'CONNECT', true, policy!);
      record({ ...ev, allowed: false, reason: 'WebSocket non utilisé par l’application' });
      throw new BlockedRequestError({ ...ev, allowed: false, reason: 'WebSocket interdit' });
      // eslint-disable-next-line no-unreachable
      return new OriginalWS(url, protocols);
    } as unknown as typeof WebSocket;
    g.WebSocket = Guarded;
  }
}

export function getGuardEvents(): ReadonlyArray<GuardEvent> {
  return events.slice();
}

export function getBlockedCount(): number {
  return events.filter((e) => !e.allowed).length;
}

/** Résumé non sensible (hôtes uniquement) pour le diagnostic. */
export function summarizeGuard(): { host: string; allowed: number; blocked: number }[] {
  const map = new Map<string, { allowed: number; blocked: number }>();
  for (const e of events) {
    const s = map.get(e.host) ?? { allowed: 0, blocked: 0 };
    if (e.allowed) s.allowed++;
    else s.blocked++;
    map.set(e.host, s);
  }
  return [...map.entries()].map(([host, s]) => ({ host, ...s }));
}

/** Réservé aux tests. */
export function _resetGuardForTests(): void {
  events.length = 0;
  installed = false;
  policy = null;
}
