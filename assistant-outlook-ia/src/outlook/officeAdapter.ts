/**
 * Adaptateur Office.js réel (Outlook Web App / Exchange on-premises).
 *
 * Principes :
 *  - chaque API est testée (isSetSupported + présence de la méthode) avant usage ;
 *  - l'insertion se fait au curseur (setSelectedDataAsync, Mailbox 1.1) ou en tête du message
 *    (prependAsync, Mailbox 1.1) : jamais de remplacement intégral du corps par défaut,
 *    ce qui préserve la signature et le message cité ;
 *  - aucune fonction d'envoi n'est implémentée.
 */

import type { Recipient } from '../ai/style';
import { describeOfficeError } from '../security/redact';
import { htmlToText, textToHtml } from './html';
import type { HostInfo, InsertResult, ItemMode, MailHost } from './types';

/** Résultat asynchrone Office.js, réduit aux champs utilisés. */
interface AsyncResultLike<T> {
  status: string;
  value: T;
  error?: { code?: number | string; name?: string; message?: string };
}
type Callback<T> = (r: AsyncResultLike<T>) => void;

interface OfficeRecipientLike {
  displayName?: string;
  emailAddress?: string;
}

interface OfficeBodyLike {
  getTypeAsync?(cb: Callback<string>): void;
  getAsync?(coercionType: string, cb: Callback<string>): void;
  setSelectedDataAsync?(data: string, opts: { coercionType: string }, cb: Callback<void>): void;
  prependAsync?(data: string, opts: { coercionType: string }, cb: Callback<void>): void;
  setAsync?(data: string, opts: { coercionType: string }, cb: Callback<void>): void;
}

/** Élément Outlook (message lu ou en rédaction), réduit aux membres utilisés. */
interface OfficeItemLike {
  itemType?: string;
  body?: OfficeBodyLike;
  subject?: string | { getAsync?(cb: Callback<string>): void };
  to?: OfficeRecipientLike[] | { getAsync?(cb: Callback<OfficeRecipientLike[]>): void };
  from?: OfficeRecipientLike;
  sender?: OfficeRecipientLike;
  displayReplyForm?(html: string): void;
}

const MAILBOX_VERSIONS = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11', '1.12', '1.13', '1.14', '1.15'];
const CALL_TIMEOUT_MS = 15000;

class OfficeCallError extends Error {
  constructor(
    message: string,
    public readonly code?: number | string,
  ) {
    super(message);
    this.name = 'OfficeCallError';
  }
}

function call<T>(fn: (cb: Callback<T>) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OfficeCallError('Outlook ne répond pas (délai dépassé).')), CALL_TIMEOUT_MS);
    try {
      fn((r) => {
        clearTimeout(timer);
        if (r.status === 'succeeded') resolve(r.value);
        else reject(new OfficeCallError(r.error?.message ?? 'Échec Office.js', r.error?.code ?? r.error?.name));
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new OfficeCallError(String(e)));
    }
  });
}

function toRecipient(d: OfficeRecipientLike | undefined | null): Recipient | null {
  if (!d) return null;
  return { displayName: d.displayName ?? '', email: d.emailAddress };
}

function officeErrorText(e: unknown): string {
  return describeOfficeError(e instanceof OfficeCallError ? { code: e.code, message: e.message } : e);
}

export class OfficeMailHost implements MailHost {
  private cachedInfo: HostInfo | null = null;

  private get item(): OfficeItemLike | null {
    return (Office.context?.mailbox?.item as unknown as OfficeItemLike | undefined) ?? null;
  }

  info(): HostInfo {
    if (this.cachedInfo) return this.cachedInfo;
    const req = Office.context?.requirements;
    const mailboxSets: Record<string, boolean> = {};
    for (const v of MAILBOX_VERSIONS) {
      try {
        mailboxSets[v] = !!req?.isSetSupported('Mailbox', v);
      } catch {
        mailboxSets[v] = false;
      }
    }
    let dialogApi: boolean;
    try {
      dialogApi = !!req?.isSetSupported('DialogApi', '1.1') || (mailboxSets['1.4'] && typeof Office.context?.ui?.displayDialogAsync === 'function');
    } catch {
      dialogApi = false;
    }
    const item = this.item;
    const body = item?.body;
    // displayReplyForm n'existe qu'en lecture ; en composition, subject/to exposent getAsync.
    const subjectIsAsync = typeof item?.subject === 'object' && typeof item.subject.getAsync === 'function';
    const mode: ItemMode = !item
      ? 'none'
      : typeof item.displayReplyForm === 'function'
        ? 'read'
        : subjectIsAsync || typeof body?.setSelectedDataAsync === 'function' || typeof body?.prependAsync === 'function'
          ? 'compose'
          : 'read';
    const diag = Office.context?.diagnostics as unknown as { hostName?: string; hostVersion?: string; platform?: string } | undefined;
    const platform = (Office.context as unknown as { platform?: string } | undefined)?.platform ?? diag?.platform ?? null;
    const mailbox = Office.context?.mailbox as unknown as { addHandlerAsync?: unknown; makeEwsRequestAsync?: unknown } | undefined;
    this.cachedInfo = {
      kind: 'office',
      officeLoaded: true,
      hostName: diag?.hostName ?? null,
      platform,
      hostVersion: diag?.hostVersion ?? null,
      mode,
      itemType: item?.itemType ?? null,
      mailboxSets,
      dialogApi,
      methods: {
        'body.getAsync': typeof body?.getAsync === 'function',
        'body.getTypeAsync': typeof body?.getTypeAsync === 'function',
        'body.setSelectedDataAsync': typeof body?.setSelectedDataAsync === 'function',
        'body.prependAsync': typeof body?.prependAsync === 'function',
        'body.setAsync': typeof body?.setAsync === 'function',
        'item.displayReplyForm': typeof item?.displayReplyForm === 'function',
        'mailbox.addHandlerAsync': typeof mailbox?.addHandlerAsync === 'function',
        'mailbox.makeEwsRequestAsync': typeof mailbox?.makeEwsRequestAsync === 'function',
      },
    };
    return this.cachedInfo;
  }

  invalidate(): void {
    this.cachedInfo = null;
  }

  async getRecipients(): Promise<Recipient[]> {
    const item = this.item;
    if (!item) return [];
    try {
      const to = item.to;
      if (this.info().mode === 'compose' && to && !Array.isArray(to) && typeof to.getAsync === 'function') {
        const getAsync = to.getAsync.bind(to);
        const list = await call<OfficeRecipientLike[]>((cb) => getAsync(cb));
        return list.map((r) => toRecipient(r)).filter((r): r is Recipient => !!r);
      }
      if (Array.isArray(to)) return to.map((r) => toRecipient(r)).filter((r): r is Recipient => !!r);
    } catch {
      /* ton par défaut si indisponible */
    }
    return [];
  }

  getSender(): Promise<Recipient | null> {
    const item = this.item;
    if (!item || this.info().mode !== 'read') return Promise.resolve(null);
    return Promise.resolve(toRecipient(item.from) ?? toRecipient(item.sender));
  }

  async getSubject(): Promise<string> {
    const item = this.item;
    if (!item) return '';
    const subject = item.subject;
    if (typeof subject === 'string') return subject;
    if (subject && typeof subject.getAsync === 'function') {
      const getAsync = subject.getAsync.bind(subject);
      try {
        return await call<string>((cb) => getAsync(cb));
      } catch {
        return '';
      }
    }
    return '';
  }

  async readBody(): Promise<string> {
    const item = this.item;
    if (!item) throw new Error('Aucun message ouvert.');
    const body = item.body;
    if (!this.info().mailboxSets['1.3'] || !body || typeof body.getAsync !== 'function') {
      throw new Error('La lecture du corps du message nécessite Mailbox 1.3, non disponible ici.');
    }
    const getAsync = body.getAsync.bind(body);
    try {
      // HTML recommandé par Microsoft pour une mise en forme fiable dans OWA, converti localement en texte.
      const html = await call<string>((cb) => getAsync(Office.CoercionType.Html, cb));
      return htmlToText(html);
    } catch (e) {
      throw new Error(officeErrorText(e), { cause: e });
    }
  }

  async insertText(text: string, position: 'cursor' | 'start'): Promise<InsertResult> {
    const item = this.item;
    const info = this.info();
    const body = item?.body;
    if (!item || !body || info.mode !== 'compose') {
      return { ok: false, error: 'L’insertion n’est possible que dans un message en cours de rédaction.' };
    }
    const html = Office.CoercionType.Html as unknown as string;
    const plain = Office.CoercionType.Text as unknown as string;
    let isHtml = true;
    try {
      if (typeof body.getTypeAsync === 'function') {
        const getTypeAsync = body.getTypeAsync.bind(body);
        isHtml = (await call<string>((cb) => getTypeAsync(cb))) === html;
      }
    } catch {
      isHtml = true; // OWA compose en HTML par défaut
    }
    const data = isHtml ? textToHtml(text) : `${text}\n\n`;
    const coercionType = isHtml ? html : plain;
    let cursorFailed = false;
    if (position === 'cursor' && typeof body.setSelectedDataAsync === 'function') {
      const setSelected = body.setSelectedDataAsync.bind(body);
      try {
        await call<void>((cb) => setSelected(data, { coercionType }, cb));
        return { ok: true, method: 'setSelectedDataAsync' };
      } catch (e) {
        if (typeof body.prependAsync !== 'function') return { ok: false, error: officeErrorText(e) };
        cursorFailed = true; // Repli : insertion en tête de message.
      }
    }
    if (typeof body.prependAsync === 'function') {
      const prepend = body.prependAsync.bind(body);
      try {
        await call<void>((cb) => prepend(data, { coercionType }, cb));
        return { ok: true, method: 'prependAsync', atStartInsteadOfCursor: position === 'cursor' && (cursorFailed || typeof body.setSelectedDataAsync !== 'function') };
      } catch (e) {
        return { ok: false, error: officeErrorText(e) };
      }
    }
    return { ok: false, error: 'Aucune méthode d’insertion n’est disponible dans cette version d’Outlook.' };
  }

  openReplyForm(text: string): Promise<InsertResult> {
    const item = this.item;
    if (!item || typeof item.displayReplyForm !== 'function') {
      return Promise.resolve({ ok: false, error: 'L’ouverture d’une réponse préremplie n’est pas disponible ici.' });
    }
    try {
      // Ouvre le formulaire de réponse ; l'envoi reste une action manuelle de l'utilisateur.
      item.displayReplyForm(textToHtml(text));
      return Promise.resolve({ ok: true, method: 'displayReplyForm' });
    } catch (e) {
      return Promise.resolve({ ok: false, error: officeErrorText(e) });
    }
  }

  userDisplayName(): string | null {
    try {
      // userProfile : Mailbox 1.1 (lecture et rédaction). Utilisé uniquement pour saluer l'utilisateur.
      const profile = (Office.context?.mailbox as unknown as { userProfile?: { displayName?: string } } | undefined)?.userProfile;
      return typeof profile?.displayName === 'string' && profile.displayName.trim() ? profile.displayName.trim() : null;
    } catch {
      return null;
    }
  }

  onItemChanged(cb: () => void): void {
    const mb = Office.context?.mailbox;
    if (!mb || typeof mb.addHandlerAsync !== 'function' || !this.info().mailboxSets['1.5']) return;
    try {
      mb.addHandlerAsync(Office.EventType.ItemChanged, () => {
        this.invalidate();
        cb();
      });
    } catch {
      /* non pris en charge : le panneau se ferme au changement de message */
    }
  }
}
