/**
 * État partagé de l'application (en mémoire uniquement).
 */

import { Assistant, type DraftOutcome } from '../ai/assistant';
import { LocalLlmProvider } from '../ai/localLlmProvider';
import { ModelHandle, type WorkerFactory } from '../ai/modelLoader';
import type { Capabilities } from '../ai/models';
import type { Formality, Recipient } from '../ai/style';
import type { BootResult } from '../outlook/bootstrap';
import type { MailHost } from '../outlook/types';
import { WhisperEngine } from '../transcription/engines';
import { DictationSession } from '../transcription/dictation';

export type TabId = 'dicter' | 'rediger' | 'repondre' | 'rechercher' | 'modeles' | 'diagnostic' | 'aide';

export interface DraftState {
  /** Texte d'origine (dictée ou saisie). */
  source: string;
  outcome: DraftOutcome | null;
  /** Texte courant de la version rédigée (éditable). */
  current: string;
  /** Pile des versions précédentes (annuler). */
  versions: string[];
  formality: Formality;
  useAi: boolean;
}

export class AppContext {
  readonly asr: ModelHandle;
  readonly llm: ModelHandle;
  readonly whisper: WhisperEngine;
  readonly assistant: Assistant;
  readonly dictation: DictationSession;
  /** Session dédiée aux commandes vocales / conversation (même moteur, micro exclusif). */
  readonly voiceCommands: DictationSession;
  /** Session dédiée à la dictée des intentions de réponse (onglet Répondre). */
  readonly replyDictation: DictationSession;
  caps: (Capabilities & { gpuInfo: string | null }) | null = null;
  draft: DraftState = { source: '', outcome: null, current: '', versions: [], formality: 'auto', useAi: false };
  recipients: Recipient[] = [];
  private listeners = new Map<string, Set<() => void>>();
  navigate: (tab: TabId) => void = () => undefined;

  constructor(
    readonly boot: BootResult,
    workerFactory?: WorkerFactory,
  ) {
    this.asr = new ModelHandle('asr', workerFactory);
    this.llm = new ModelHandle('llm', workerFactory);
    this.whisper = new WhisperEngine(this.asr);
    this.assistant = new Assistant(new LocalLlmProvider(this.llm));
    this.dictation = new DictationSession({ engine: this.whisper });
    this.voiceCommands = new DictationSession({ engine: this.whisper });
    this.replyDictation = new DictationSession({ engine: this.whisper });
    this.asr.onChange(() => this.emit('models'));
    this.llm.onChange(() => this.emit('models'));
    // Exclusivité du micro : une seule session peut écouter à la fois.
    for (const session of this.sessions()) {
      session.onChange((s) => {
        if (s.status === 'listening') {
          for (const other of this.sessions()) {
            if (other !== session && other.snapshot().status === 'listening') void other.pause();
          }
        }
        this.emit('mic');
      });
    }
  }

  sessions(): DictationSession[] {
    return [this.dictation, this.voiceCommands, this.replyDictation];
  }

  get host(): MailHost {
    return this.boot.host;
  }

  micActive(): boolean {
    return this.sessions().some((s) => s.snapshot().status === 'listening');
  }

  /** Arrêt d'urgence de toute capture audio (le texte déjà transcrit est conservé). */
  stopAllMic(): void {
    for (const s of this.sessions()) if (s.snapshot().status === 'listening') void s.pause();
  }

  on(event: 'models' | 'mic' | 'draft' | 'host', fn: () => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit(event: 'models' | 'mic' | 'draft' | 'host'): void {
    this.listeners.get(event)?.forEach((l) => l());
  }

  setDraftText(text: string, pushVersion = true): void {
    if (pushVersion && this.draft.current && this.draft.current !== text) {
      this.draft.versions.push(this.draft.current);
      if (this.draft.versions.length > 20) this.draft.versions.shift();
    }
    this.draft.current = text;
    this.emit('draft');
  }

  undo(): boolean {
    const prev = this.draft.versions.pop();
    if (prev === undefined) return false;
    this.draft.current = prev;
    this.emit('draft');
    return true;
  }

  async refreshRecipients(): Promise<void> {
    try {
      const info = this.host.info();
      if (info.mode === 'read') {
        const s = await this.host.getSender();
        this.recipients = s ? [s] : [];
      } else {
        this.recipients = await this.host.getRecipients();
      }
    } catch {
      this.recipients = [];
    }
  }

  dispose(): void {
    for (const s of this.sessions()) s.dispose();
    this.asr.terminate();
    this.llm.terminate();
    this.draft = { source: '', outcome: null, current: '', versions: [], formality: 'auto', useAi: false };
  }
}
