/**
 * Simulation minimale d'Office.js (Outlook) pour les tests : aucune connexion réelle.
 */
import { vi } from 'vitest';

export interface OfficeMockOptions {
  mode: 'compose' | 'read';
  /** Version Mailbox maximale prise en charge (ex. '1.5' pour Exchange 2016/2019). */
  maxMailbox: string;
  bodyType?: 'html' | 'text';
  failSetSelected?: { code: number | string; message: string } | null;
  withSetSelected?: boolean;
  withPrepend?: boolean;
  body?: string;
  /** Nom d'affichage de l'utilisateur (userProfile, Mailbox 1.1). */
  userName?: string;
}

const ORDER = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11', '1.12', '1.13', '1.14', '1.15'];

export function installOfficeMock(o: OfficeMockOptions) {
  const ok = <T>(value: T) => ({ status: 'succeeded', value });
  const fail = (error: unknown) => ({ status: 'failed', error });
  const calls = {
    setSelectedDataAsync: vi.fn(),
    prependAsync: vi.fn(),
    setAsync: vi.fn(),
    sendAsync: vi.fn(),
    displayReplyForm: vi.fn(),
    getAsync: vi.fn(),
  };
  const maxIdx = ORDER.indexOf(o.maxMailbox);
  const body: Record<string, unknown> = {
    getTypeAsync: (cb: (r: unknown) => void) => cb(ok(o.bodyType ?? 'html')),
    getAsync: (type: string, cb: (r: unknown) => void) => {
      calls.getAsync(type);
      cb(ok(o.body ?? '<div>Bonjour,</div><div>Message fictif de test.</div>'));
    },
    setAsync: (...a: unknown[]) => {
      calls.setAsync(...a);
    },
  };
  if (o.mode === 'compose') {
    if (o.withSetSelected !== false) {
      body.setSelectedDataAsync = (data: string, opts: unknown, cb: (r: unknown) => void) => {
        calls.setSelectedDataAsync(data, opts);
        cb(o.failSetSelected ? fail(o.failSetSelected) : ok(undefined));
      };
    }
    if (o.withPrepend !== false) {
      body.prependAsync = (data: string, opts: unknown, cb: (r: unknown) => void) => {
        calls.prependAsync(data, opts);
        cb(ok(undefined));
      };
    }
  }
  if (maxIdx < 2) delete body.getAsync; // getAsync : Mailbox 1.3
  const item: Record<string, unknown> =
    o.mode === 'compose'
      ? {
          itemType: 'message',
          body,
          to: { getAsync: (cb: (r: unknown) => void) => cb(ok([{ displayName: 'Dr FICTIF Alice', emailAddress: 'a.fictif@exemple.test' }])) },
          subject: { getAsync: (cb: (r: unknown) => void) => cb(ok('Sujet fictif')) },
          sendAsync: calls.sendAsync,
        }
      : {
          itemType: 'message',
          body,
          subject: 'Sujet fictif reçu',
          from: { displayName: 'Pr EXEMPLE Bruno', emailAddress: 'b.exemple@exemple.test' },
          to: [{ displayName: 'Étudiant Démo', emailAddress: 'demo@exemple.test' }],
          displayReplyForm: calls.displayReplyForm,
        };
  const Office = {
    HostType: { Outlook: 'Outlook' },
    AsyncResultStatus: { Succeeded: 'succeeded', Failed: 'failed' },
    CoercionType: { Html: 'html', Text: 'text' },
    EventType: { ItemChanged: 'olkItemSelectedChanged', DialogMessageReceived: 'dialogMessageReceived' },
    onReady: () => Promise.resolve({ host: 'Outlook', platform: 'OfficeOnline' }),
    context: {
      platform: 'OfficeOnline',
      diagnostics: { hostName: 'OutlookWebApp', hostVersion: '15.20.0.0', platform: 'OfficeOnline' },
      requirements: {
        isSetSupported: (name: string, v: string) => name === 'Mailbox' && ORDER.indexOf(v) >= 0 && ORDER.indexOf(v) <= maxIdx,
      },
      mailbox: { item, addHandlerAsync: vi.fn(), userProfile: o.userName ? { displayName: o.userName } : undefined },
      ui: {},
    },
  };
  (globalThis as unknown as { Office: unknown }).Office = Office;
  (window as unknown as { Office: unknown }).Office = Office;
  return { Office, calls, item };
}

export function removeOfficeMock() {
  delete (globalThis as unknown as { Office?: unknown }).Office;
  delete (window as unknown as { Office?: unknown }).Office;
}
