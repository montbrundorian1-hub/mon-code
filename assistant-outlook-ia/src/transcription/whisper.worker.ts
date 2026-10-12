/// <reference lib="webworker" />
/**
 * Worker de transcription Whisper (Transformers.js), exécuté entièrement dans le navigateur.
 * L'audio reçu est traité puis immédiatement libéré ; rien n'est stocké.
 */

import { errorMessage, loadTransformers, progressForwarder, type WorkerEnvOptions } from '../ai/workerEnv';

type Pipe = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;

let asr: (Pipe & { dispose?: () => Promise<void> }) | null = null;
let device: 'webgpu' | 'wasm' = 'wasm';

/** Phrases « hallucinées » par Whisper sur du silence ou du bruit (corpus de sous-titres). */
const HALLUCINATIONS = [
  /sous-titr(es|age)\s+(réalisés?|fait|par).*$/i,
  /amara\.org/i,
  /merci d'avoir regardé/i,
  /abonnez-vous/i,
  /^\W*merci\.?\W*$/i,
  /société radio-canada/i,
  /^\W*(\.|…)+\W*$/,
];

function cleanText(t: string): string {
  let s = t.trim();
  for (const re of HALLUCINATIONS) if (re.test(s)) s = s.replace(re, '').trim();
  return s;
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') {
      const T = await loadTransformers(msg.env as WorkerEnvOptions);
      device = msg.device;
      const p = await T.pipeline('automatic-speech-recognition', msg.repo, {
        dtype: msg.dtype,
        device: msg.device,
        progress_callback: progressForwarder((m) => self.postMessage(m)),
      });
      asr = p as unknown as typeof asr;
      // Préchauffage sur 1 s de silence : compile les shaders / alloue la mémoire.
      const t0 = performance.now();
      await asr!(new Float32Array(16000), { language: 'french', task: 'transcribe' });
      self.postMessage({ type: 'ready', device, warmupMs: Math.round(performance.now() - t0) });
    } else if (msg.type === 'transcribe') {
      if (!asr) throw new Error('Modèle non chargé');
      let audio: Float32Array | null = msg.audio as Float32Array;
      const t0 = performance.now();
      const out = await asr(audio, {
        language: 'french',
        task: 'transcribe',
        return_timestamps: false,
        chunk_length_s: audio.length > 16000 * 30 ? 30 : undefined,
        stride_length_s: audio.length > 16000 * 30 ? 5 : undefined,
      });
      audio = null; // libération explicite
      const text = cleanText(Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text);
      self.postMessage({ type: 'result', id: msg.id, final: msg.final, text, ms: Math.round(performance.now() - t0) });
    } else if (msg.type === 'dispose') {
      await asr?.dispose?.();
      asr = null;
      self.postMessage({ type: 'disposed' });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: msg.id, message: errorMessage(e) });
  }
};
