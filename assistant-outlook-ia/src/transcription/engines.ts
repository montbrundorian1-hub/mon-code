/**
 * Moteurs de transcription. Tous sont LOCAUX : aucun service distant n'est utilisé.
 *
 * - WhisperEngine : Whisper multilingue via Transformers.js (WASM ou WebGPU), par segments.
 * - Reconnaissance native « processLocally » (Web Speech API) : utilisable seulement si le
 *   navigateur déclare le français disponible EN LOCAL. Vérifié le 12/10/2026
 *   (docs/PISTE_RECONNAISSANCE_NATIVE.md) : Edge 155 et 157 répondent « unavailable » pour fr-FR,
 *   même avec l'option expérimentale activée ; Chrome 155 installe un moteur local (SODA) mais
 *   n'est pas le navigateur du CHU. Whisper reste donc le moteur utilisé. La reconnaissance
 *   vocale « cloud » des navigateurs n'est jamais utilisée.
 */

import type { ModelHandle } from '../ai/modelLoader';
import type { ResultMessage } from '../ai/workerProtocol';

export interface SegmentEngine {
  readonly label: string;
  isReady(): boolean;
  /** Vrai si le poste est assez rapide pour des transcriptions provisoires du segment en cours. */
  supportsPartial(): boolean;
  transcribe(audio: Float32Array, final: boolean): Promise<{ text: string; ms: number }>;
}

export class WhisperEngine implements SegmentEngine {
  /** Facteur temps réel mesuré (durée de calcul / durée audio). */
  private rtf: number | null = null;

  constructor(private readonly handle: ModelHandle) {}

  get label(): string {
    const s = this.handle.state;
    return s.status === 'ready' ? `${s.spec.label} — ${s.variant.device === 'webgpu' ? 'WebGPU' : 'WASM (processeur)'}` : 'Whisper';
  }

  isReady(): boolean {
    return this.handle.isReady();
  }

  supportsPartial(): boolean {
    return this.rtf !== null && this.rtf < 0.35;
  }

  measuredRtf(): number | null {
    return this.rtf;
  }

  async transcribe(audio: Float32Array, final: boolean): Promise<{ text: string; ms: number }> {
    const durMs = (audio.length / 16000) * 1000;
    // Délai maximal généreux (poste lent, segment de 20 s) : évite toute attente infinie.
    const r = await this.handle.request<ResultMessage>(
      { type: 'transcribe', audio, final },
      { transfer: [audio.buffer], timeoutMs: Math.max(60000, durMs * 12) },
    );
    if (final && durMs > 1500) {
      const rtf = r.ms / durMs;
      this.rtf = this.rtf === null ? rtf : this.rtf * 0.6 + rtf * 0.4;
    }
    return { text: r.text, ms: r.ms };
  }
}

type SR = {
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  new (): unknown;
};

/** Statut de la reconnaissance vocale native locale d'Edge pour le français. */
export async function nativeLocalSpeechStatus(win: Window = window): Promise<
  'available' | 'downloadable' | 'unavailable-fr' | 'api-absent'
> {
  const SRC = (win as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR }).SpeechRecognition;
  if (!SRC || typeof SRC.available !== 'function') return 'api-absent';
  try {
    const r = await SRC.available({ langs: ['fr-FR'], processLocally: true });
    if (r === 'available') return 'available';
    if (r === 'downloadable' || r === 'downloading') return 'downloadable';
    return 'unavailable-fr';
  } catch {
    return 'unavailable-fr';
  }
}
