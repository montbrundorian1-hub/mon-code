/**
 * Session de dictée : micro → segmentation → transcription locale → texte affiché.
 *
 * Distingue clairement :
 *  - les segments VALIDÉS (transcription définitive d'un segment terminé par une pause) ;
 *  - le texte PROVISOIRE (transcription intermédiaire du segment en cours, si le poste le permet) ;
 *  - les segments EN ATTENTE (audio capturé, transcription en cours de calcul).
 */

import { classifyMicError, MicCapture, policyAllowsMicrophone, type MicError } from '../audio/micCapture';
import { SpeechSegmenter, type SegmentEvent } from '../audio/segmenter';
import type { SegmentEngine } from './engines';

export type DictationStatus = 'idle' | 'listening' | 'paused' | 'finishing' | 'error';

export interface Segment {
  id: number;
  status: 'pending' | 'final' | 'error';
  text: string;
  durationMs: number;
}

export interface DictationSnapshot {
  status: DictationStatus;
  segments: Segment[];
  partial: string;
  elapsedMs: number;
  level: number;
  speaking: boolean;
  error: MicError | null;
  /** Message d'information non bloquant (ex. interruption du micro). */
  notice: string | null;
}

export interface DictationDeps {
  engine: SegmentEngine;
  micFactory?: (cb: ConstructorParameters<typeof MicCapture>[0]) => Pick<MicCapture, 'start' | 'stop' | 'active'>;
  now?: () => number;
}

export class DictationSession {
  private mic: Pick<MicCapture, 'start' | 'stop' | 'active'> | null = null;
  private segmenter = new SpeechSegmenter();
  private segments: Segment[] = [];
  private partial = '';
  private status: DictationStatus = 'idle';
  private error: MicError | null = null;
  private notice: string | null = null;
  private level = 0;
  private seq = 0;
  private startedAt = 0;
  private accumulated = 0;
  private queue: Promise<void> = Promise.resolve();
  private partialBusy = false;
  private listeners = new Set<(s: DictationSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: DictationDeps) {
    this.now = deps.now ?? (() => performance.now());
  }

  onChange(fn: (s: DictationSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): DictationSnapshot {
    return {
      status: this.status,
      segments: this.segments.map((s) => ({ ...s })),
      partial: this.partial,
      elapsedMs: this.accumulated + (this.status === 'listening' ? this.now() - this.startedAt : 0),
      level: this.level,
      speaking: this.segmenter.speaking,
      error: this.error,
      notice: this.notice,
    };
  }

  private emit(): void {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  /** Texte validé (segments définitifs), dans l'ordre. */
  finalText(): string {
    return this.segments
      .filter((s) => s.status === 'final' && s.text)
      .map((s) => s.text.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  hasPending(): boolean {
    return this.segments.some((s) => s.status === 'pending');
  }

  async start(): Promise<boolean> {
    if (this.status === 'listening') return true;
    if (!this.deps.engine.isReady()) {
      this.error = { kind: 'unknown', message: 'Chargez d’abord un modèle de transcription (onglet Modèles).' };
      this.status = 'error';
      this.emit();
      return false;
    }
    this.error = null;
    this.notice = null;
    const factory = this.deps.micFactory ?? ((cb) => new MicCapture(cb));
    this.mic = factory({
      onAudio: (chunk) => this.onAudio(chunk),
      onLevel: (l) => {
        this.level = l;
      },
      onInterrupted: (reason) => {
        this.notice = `${reason} La transcription de ce qui a déjà été dicté est conservée.`;
        void this.pause();
      },
    });
    try {
      await this.mic.start();
    } catch (e) {
      this.mic = null;
      this.error = classifyMicError(e, { policyAllowsMic: typeof document !== 'undefined' ? policyAllowsMicrophone() : null });
      this.status = 'error';
      this.emit();
      return false;
    }
    this.segmenter.setPartialInterval(this.deps.engine.supportsPartial() ? 1200 : 0);
    this.status = 'listening';
    this.startedAt = this.now();
    this.timer = setInterval(() => this.emit(), 250);
    this.emit();
    return true;
  }

  private onAudio(chunk: Float32Array): void {
    if (this.status !== 'listening') return;
    for (const ev of this.segmenter.push(chunk)) this.handle(ev);
  }

  private handle(ev: SegmentEvent): void {
    if (ev.type === 'final') {
      const seg: Segment = { id: ++this.seq, status: 'pending', text: '', durationMs: ev.durationMs };
      this.segments.push(seg);
      this.partial = '';
      this.emit();
      let audio: Float32Array | null = ev.audio;
      this.queue = this.queue.then(async () => {
        try {
          const r = await this.deps.engine.transcribe(audio!, true);
          seg.text = r.text;
          seg.status = 'final';
        } catch {
          seg.status = 'error';
          seg.text = '';
        } finally {
          audio = null; // l'audio brut n'est pas conservé au-delà de sa transcription
          this.segmenter.setPartialInterval(this.deps.engine.supportsPartial() ? 1200 : 0);
          this.emit();
        }
      });
    } else if (ev.type === 'partial' && !this.partialBusy && !this.hasPending()) {
      this.partialBusy = true;
      this.deps.engine
        .transcribe(ev.audio, false)
        .then((r) => {
          if (this.segmenter.speaking) this.partial = r.text;
        })
        .catch(() => undefined)
        .finally(() => {
          this.partialBusy = false;
          this.emit();
        });
    }
  }

  private releaseMic(): void {
    this.mic?.stop();
    this.mic = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.level = 0;
  }

  /** Pause : clôt le segment en cours et LIBÈRE le micro. */
  async pause(): Promise<void> {
    if (this.status !== 'listening') return;
    this.accumulated += this.now() - this.startedAt;
    const ev = this.segmenter.flush();
    this.releaseMic();
    this.status = 'paused';
    if (ev) this.handle(ev);
    this.emit();
  }

  async resume(): Promise<boolean> {
    if (this.status !== 'paused') return false;
    this.status = 'idle';
    return this.start();
  }

  /** Arrêt : libère le micro puis attend la fin des transcriptions en cours. */
  async stop(): Promise<string> {
    if (this.status === 'listening') {
      this.accumulated += this.now() - this.startedAt;
      const ev = this.segmenter.flush();
      this.releaseMic();
      if (ev) this.handle(ev);
    } else {
      this.releaseMic();
    }
    this.status = 'finishing';
    this.emit();
    await this.queue;
    this.partial = '';
    this.status = 'idle';
    this.emit();
    return this.finalText();
  }

  /** Efface tout (texte et audio en mémoire). */
  reset(): void {
    this.releaseMic();
    this.segmenter.reset();
    this.segments = [];
    this.partial = '';
    this.accumulated = 0;
    this.status = 'idle';
    this.error = null;
    this.notice = null;
    this.emit();
  }

  /** Remplace le texte d'un segment (édition manuelle). */
  editSegment(id: number, text: string): void {
    const s = this.segments.find((x) => x.id === id);
    if (s) {
      s.text = text;
      this.emit();
    }
  }

  dispose(): void {
    this.reset();
    this.listeners.clear();
  }
}
