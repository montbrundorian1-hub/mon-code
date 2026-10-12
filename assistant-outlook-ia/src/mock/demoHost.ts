/**
 * Hôte de DÉMONSTRATION : simule Outlook avec des données fictives, pour utiliser et tester
 * l'application hors du webmail (aucun accès à une vraie boîte).
 */

import type { Recipient } from '../ai/style';
import type { HostInfo, InsertResult, ItemMode, MailHost } from '../outlook/types';
import { DEMO_DRAFT, DEMO_MESSAGES, type DemoMessage } from './messages';

export class DemoMailHost implements MailHost {
  mode: ItemMode = 'compose';
  /** Contenu simulé du brouillon : [texte inséré + existant] + signature. */
  draftBody = DEMO_DRAFT.existingBody;
  readonly signature = DEMO_DRAFT.signature;
  selected: DemoMessage = DEMO_MESSAGES[0];
  /** Pour les tests : force un échec d'insertion. */
  failNextInsert: string | null = null;
  private listeners = new Set<() => void>();
  readonly openedReplies: string[] = [];

  setMode(mode: ItemMode): void {
    this.mode = mode;
    this.listeners.forEach((l) => l());
  }

  select(id: string): void {
    const m = DEMO_MESSAGES.find((x) => x.id === id);
    if (m) {
      this.selected = m;
      this.listeners.forEach((l) => l());
    }
  }

  info(): HostInfo {
    return {
      kind: 'demo',
      officeLoaded: false,
      hostName: 'Démonstration (Outlook simulé)',
      platform: null,
      hostVersion: null,
      mode: this.mode,
      itemType: this.mode === 'none' ? null : 'message',
      mailboxSets: {},
      dialogApi: false,
      methods: {},
    };
  }

  getRecipients(): Promise<Recipient[]> {
    const list = this.mode === 'compose' ? DEMO_DRAFT.to : this.selected.to;
    return Promise.resolve(list.map((r) => ({ displayName: r.displayName, email: r.email })));
  }

  getSender(): Promise<Recipient | null> {
    if (this.mode !== 'read') return Promise.resolve(null);
    return Promise.resolve({ displayName: this.selected.from.displayName, email: this.selected.from.email });
  }

  getSubject(): Promise<string> {
    return Promise.resolve(this.mode === 'compose' ? DEMO_DRAFT.subject : this.selected.subject);
  }

  readBody(): Promise<string> {
    if (this.mode === 'none') return Promise.reject(new Error('Aucun message ouvert.'));
    return Promise.resolve(this.mode === 'read' ? this.selected.body : this.fullDraft());
  }

  fullDraft(): string {
    return [this.draftBody.trim(), this.signature].filter(Boolean).join('\n\n');
  }

  insertText(text: string, _position: 'cursor' | 'start'): Promise<InsertResult> {
    if (this.mode !== 'compose') {
      return Promise.resolve({ ok: false, error: 'L’insertion n’est possible que dans un message en cours de rédaction.' });
    }
    if (this.failNextInsert) {
      const error = this.failNextInsert;
      this.failNextInsert = null;
      return Promise.resolve({ ok: false, error });
    }
    // Le curseur simulé est en tête du message : le texte existant et la signature sont conservés.
    this.draftBody = [text.trim(), this.draftBody.trim()].filter(Boolean).join('\n\n');
    this.listeners.forEach((l) => l());
    return Promise.resolve({ ok: true, method: 'demo' });
  }

  openReplyForm(text: string): Promise<InsertResult> {
    if (this.mode !== 'read') return Promise.resolve({ ok: false, error: 'Ouvrez d’abord un message reçu.' });
    this.openedReplies.push(text);
    this.listeners.forEach((l) => l());
    return Promise.resolve({ ok: true, method: 'demo' });
  }

  onItemChanged(cb: () => void): void {
    this.listeners.add(cb);
  }
}
