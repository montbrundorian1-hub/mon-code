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

type AnyItem = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MAILBOX_VERSIONS = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11', '1.12', '1.13', '1.14', '1.15'];
const CALL_TIMEOUT_MS = 15000;

function call<T>(fn: (cb: (r: Office.AsyncResult<T>) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Outlook ne répond pas (délai dépassé).')), CALL_TIMEOUT_MS);
    try {
      fn((r) => {
        clearTimeout(timer);
        if (r.status === Office.AsyncResultStatus.Succeeded) resolve(r.value);
        else reject(r.error ?? new Error('Échec Office.js'));
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

function toRecipient(d: { displayName?: string; emailAddress?: string } | undefined | null): Recipient | null {
  if (!d) return null;
  return { displayName: d.displayName ?? '', email: d.emailAddress };
}

export class OfficeMailHost implements MailHost {
  private cachedInfo: HostInfo | null = null;

  private get item(): AnyItem | null {
    return (Office.context?.mailbox?.item as AnyItem | undefined) ?? null;
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
    let dialogApi = false;
    try {
      dialogApi = !!req?.isSetSupported('DialogApi', '1.1') || (mailboxSets['1.4'] && !!Office.context?.ui?.displayDialogAsync);
    } catch {
      dialogApi = false;
    }
    const item = this.item;
    const body = item?.body as AnyItem | undefined;
    const mode: ItemMode = !item ? 'none' : typeof body?.setSelectedDataAsync === 'function' ? 'compose' : 'read';
    const diag = Office.context?.diagnostics as unknown as { hostName?: string; hostVersion?: string; platform?: string } | undefined;
    this.cachedInfo = {
      kind: 'office',
      officeLoaded: true,
      hostName: diag?.hostName ?? null,
      platform: ((Office.context as unknown as { platform?: string } | undefined)?.platform ?? diag?.platform ?? null) as string | null,
      hostVersion: diag?.hostVersion ?? null,
      mode,
      itemType: (item?.itemType as string | undefined) ?? null,
      mailboxSets,
      dialogApi,
      methods: {
        'body.getAsync': typeof body?.getAsync === 'function',
        'body.getTypeAsync': typeof body?.getTypeAsync === 'function',
        'body.setSelectedDataAsync': typeof body?.setSelectedDataAsync === 'function',
        'body.prependAsync': typeof body?.prependAsync === 'function',
        'body.setAsync': typeof body?.setAsync === 'function',
        'item.displayReplyForm': typeof item?.displayReplyForm === 'function',
        'mailbox.addHandlerAsync': typeof Office.context?.mailbox?.addHandlerAsync === 'function',
        'mailbox.makeEwsRequestAsync': typeof (Office.context?.mailbox as AnyItem | undefined)?.makeEwsRequestAsync === 'function',
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
      if (this.info().mode === 'compose' && typeof item.to?.getAsync === 'function') {
        const list = await call<Array<{ displayName: string; emailAddress: string }>>((cb) => item.to.getAsync(cb));
        return list.map((r) => toRecipient(r)!).filter(Boolean);
      }
      if (Array.isArray(item.to)) return item.to.map((r: AnyItem) => toRecipient(r)!).filter(Boolean);
    } catch {
      /* ton par défaut si indisponible */
    }
    return [];
  }

  async getSender(): Promise<Recipient | null> {
    const item = this.item;
    if (!item || this.info().mode !== 'read') return null;
    return toRecipient(item.from) ?? toRecipient(item.sender);
  }

  async getSubject(): Promise<string> {
    const item = this.item;
    if (!item) return '';
    if (typeof item.subject === 'string') return item.subject;
    if (typeof item.subject?.getAsync === 'function') {
      try {
        return await call<string>((cb) => item.subject.getAsync(cb));
      } catch {
        return '';
      }
    }
    return '';
  }

  async readBody(): Promise<string> {
    const item = this.item;
    if (!item) throw new Error('Aucun message ouvert.');
    if (!this.info().mailboxSets['1.3'] || typeof item.body?.getAsync !== 'function') {
      throw new Error('La lecture du corps du message nécessite Mailbox 1.3, non disponible ici.');
    }
    try {
      // HTML recommandé par Microsoft pour une mise en forme fiable dans OWA, converti localement en texte.
      const html = await call<string>((cb) => item.body.getAsync(Office.CoercionType.Html, cb));
      return htmlToText(html);
    } catch (e) {
      throw new Error(describeOfficeError(e));
    }
  }

  async insertText(text: string, position: 'cursor' | 'start'): Promise<InsertResult> {
    const item = this.item;
    const info = this.info();
    if (!item || info.mode !== 'compose') {
      return { ok: false, error: 'L’insertion n’est possible que dans un message en cours de rédaction.' };
    }
    let isHtml = true;
    try {
      if (typeof item.body.getTypeAsync === 'function') {
        isHtml = (await call<string>((cb) => item.body.getTypeAsync(cb))) === Office.CoercionType.Html;
      }
    } catch {
      isHtml = true; // OWA compose en HTML par défaut
    }
    const data = isHtml ? textToHtml(text) : `${text}\n\n`;
    const coercionType = isHtml ? Office.CoercionType.Html : Office.CoercionType.Text;
    const tryCursor = position === 'cursor' && typeof item.body.setSelectedDataAsync === 'function';
    if (tryCursor) {
      try {
        await call<void>((cb) => item.body.setSelectedDataAsync(data, { coercionType }, cb));
        return { ok: true, method: 'setSelectedDataAsync' };
      } catch (e) {
        if (typeof item.body.prependAsync !== 'function') return { ok: false, error: describeOfficeError(e) };
        // Repli : insertion en tête de message.
      }
    }
    if (typeof item.body.prependAsync === 'function') {
      try {
        await call<void>((cb) => item.body.prependAsync(data, { coercionType }, cb));
        return { ok: true, method: 'prependAsync' };
      } catch (e) {
        return { ok: false, error: describeOfficeError(e) };
      }
    }
    return { ok: false, error: 'Aucune méthode d’insertion n’est disponible dans cette version d’Outlook.' };
  }

  async openReplyForm(text: string): Promise<InsertResult> {
    const item = this.item;
    if (!item || typeof item.displayReplyForm !== 'function') {
      return { ok: false, error: 'L’ouverture d’une réponse préremplie n’est pas disponible ici.' };
    }
    try {
      // Ouvre le formulaire de réponse ; l'envoi reste une action manuelle de l'utilisateur.
      item.displayReplyForm(textToHtml(text));
      return { ok: true, method: 'displayReplyForm' };
    } catch (e) {
      return { ok: false, error: describeOfficeError(e) };
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
