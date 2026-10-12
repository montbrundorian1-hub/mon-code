/**
 * Découpage de la parole en segments (détection d'activité vocale par énergie, seuil adaptatif).
 *
 * Whisper transcrit des segments audio complets : la transcription « en direct » est donc
 * réalisée par segments (après chaque pause) et, si le poste est assez rapide, par des
 * transcriptions provisoires du segment en cours. Ce n'est pas un flux mot à mot.
 */

import { rms } from './micCapture';

export interface SegmenterOptions {
  sampleRate: number;
  /** Silence (ms) qui clôt un segment. */
  silenceMs: number;
  /** Durée minimale de parole pour qu'un segment soit transcrit. */
  minSpeechMs: number;
  /** Durée maximale d'un segment (Whisper traite au plus 30 s). */
  maxSegmentMs: number;
  /** Conserve un peu d'audio avant le début détecté de la parole. */
  preRollMs: number;
  /** Intervalle des transcriptions provisoires (0 = désactivées). */
  partialEveryMs: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  sampleRate: 16000,
  silenceMs: 800,
  minSpeechMs: 350,
  maxSegmentMs: 20000,
  preRollMs: 300,
  partialEveryMs: 0,
};

export type SegmentEvent = { type: 'final'; audio: Float32Array; durationMs: number } | { type: 'partial'; audio: Float32Array };

export class SpeechSegmenter {
  private opts: SegmenterOptions;
  private chunks: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private inSpeech = false;
  private speechSamples = 0;
  private silenceSamples = 0;
  private totalSamples = 0;
  private sinceLastPartial = 0;
  private noiseFloor = 0.004;

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER, ...opts };
  }

  setPartialInterval(ms: number): void {
    this.opts.partialEveryMs = ms;
  }

  private ms(samples: number): number {
    return (samples / this.opts.sampleRate) * 1000;
  }

  threshold(): number {
    return Math.max(0.012, this.noiseFloor * 3);
  }

  push(chunk: Float32Array): SegmentEvent[] {
    const events: SegmentEvent[] = [];
    const level = rms(chunk);
    const voiced = level > this.threshold();
    if (!voiced) this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05;

    if (!this.inSpeech) {
      this.preRoll.push(chunk);
      let pre = this.preRoll.reduce((n, c) => n + c.length, 0);
      while (this.preRoll.length > 1 && this.ms(pre - this.preRoll[0].length) >= this.opts.preRollMs) {
        pre -= this.preRoll.shift()!.length;
      }
      if (voiced) {
        this.inSpeech = true;
        this.chunks = [...this.preRoll];
        this.preRoll = [];
        this.totalSamples = this.chunks.reduce((n, c) => n + c.length, 0);
        this.speechSamples = chunk.length;
        this.silenceSamples = 0;
        this.sinceLastPartial = 0;
      }
      return events;
    }

    this.chunks.push(chunk);
    this.totalSamples += chunk.length;
    this.sinceLastPartial += chunk.length;
    if (voiced) {
      this.speechSamples += chunk.length;
      this.silenceSamples = 0;
    } else {
      this.silenceSamples += chunk.length;
    }

    const endBySilence = this.ms(this.silenceSamples) >= this.opts.silenceMs;
    const endByLength = this.ms(this.totalSamples) >= this.opts.maxSegmentMs;
    if (endBySilence || endByLength) {
      const ev = this.close();
      if (ev) events.push(ev);
    } else if (this.opts.partialEveryMs > 0 && this.ms(this.sinceLastPartial) >= this.opts.partialEveryMs) {
      this.sinceLastPartial = 0;
      events.push({ type: 'partial', audio: concat(this.chunks) });
    }
    return events;
  }

  private close(): SegmentEvent | null {
    const enough = this.ms(this.speechSamples) >= this.opts.minSpeechMs;
    const audio = enough ? concat(this.chunks) : null;
    this.chunks = [];
    this.preRoll = [];
    this.inSpeech = false;
    this.speechSamples = 0;
    this.silenceSamples = 0;
    this.totalSamples = 0;
    return audio ? { type: 'final', audio, durationMs: Math.round(this.ms(audio.length)) } : null;
  }

  /** Clôt le segment en cours (arrêt ou pause de la dictée). */
  flush(): SegmentEvent | null {
    if (!this.inSpeech) {
      this.preRoll = [];
      return null;
    }
    return this.close();
  }

  reset(): void {
    this.chunks = [];
    this.preRoll = [];
    this.inSpeech = false;
    this.speechSamples = 0;
    this.silenceSamples = 0;
    this.totalSamples = 0;
  }

  get speaking(): boolean {
    return this.inSpeech;
  }
}

export function concat(chunks: Float32Array[]): Float32Array {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
