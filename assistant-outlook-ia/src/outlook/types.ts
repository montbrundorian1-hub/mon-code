/**
 * Abstraction de l'hôte de messagerie. Le reste de l'application ne parle jamais
 * directement à Office.js : il passe par cette interface (implémentations réelle et fictive).
 *
 * IMPORTANT : aucune méthode d'envoi n'existe dans cette interface, par conception.
 */

import type { Recipient } from '../ai/style';

export type ItemMode = 'compose' | 'read' | 'none';

export interface HostInfo {
  /** « office » : vrai Outlook ; « demo » : simulation locale avec données fictives. */
  kind: 'office' | 'demo';
  officeLoaded: boolean;
  hostName: string | null;
  platform: string | null;
  /** Version du client Outlook si exposée (diagnostics.hostVersion). */
  hostVersion: string | null;
  mode: ItemMode;
  itemType: string | null;
  /** Jeux d'API Mailbox pris en charge (1.1 → 1.15) détectés par isSetSupported. */
  mailboxSets: Record<string, boolean>;
  dialogApi: boolean;
  /** Méthodes réellement présentes sur l'élément courant. */
  methods: Record<string, boolean>;
}

export type InsertMethod = 'setSelectedDataAsync' | 'prependAsync' | 'displayReplyForm' | 'demo';

export interface InsertResult {
  ok: boolean;
  method?: InsertMethod;
  /** Vrai si le curseur était indisponible : le texte a été inséré en tête du message. */
  atStartInsteadOfCursor?: boolean;
  /** Message compréhensible et expurgé. */
  error?: string;
}

export interface MailHost {
  info(): HostInfo;
  /** Destinataires (composition) — utilisés localement pour adapter le ton. */
  getRecipients(): Promise<Recipient[]>;
  /** Expéditeur du message lu (lecture). */
  getSender(): Promise<Recipient | null>;
  getSubject(): Promise<string>;
  /** Corps du message courant en texte. Uniquement sur action explicite de l'utilisateur. */
  readBody(): Promise<string>;
  /** Insère du texte sans remplacer le contenu existant ni la signature. */
  insertText(text: string, position: 'cursor' | 'start'): Promise<InsertResult>;
  /** En lecture : ouvre un formulaire de réponse prérempli (n'envoie rien). */
  openReplyForm(text: string): Promise<InsertResult>;
  /** Notifié quand l'utilisateur change de message (panneau épinglé, Mailbox 1.5). */
  onItemChanged(cb: () => void): void;
}
