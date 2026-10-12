/// <reference lib="webworker" />
/**
 * Worker de transcription Whisper (Transformers.js), exécuté entièrement dans le navigateur.
 * L'audio reçu est traité puis immédiatement libéré ; rien n'est stocké.
 */

import { errorMessage, loadTransformers, pinRevision, progressForwarder } from '../ai/workerEnv';
import type { TranscribeRequest, TypedWorkerScope, WorkerRequest } from '../ai/workerProtocol';
import { cleanTranscript } from './clean';

const scope = self as unknown as TypedWorkerScope;

type AsrOutput = { text: string } | Array<{ text: string }>;
type AsrPipeline = ((audio: Float32Array, opts: Record<string, unknown>) => Promise<AsrOutput>) & { dispose?: () => Promise<void> };

let asr: AsrPipeline | null = null;

async function transcribe(msg: TranscribeRequest): Promise<void> {
  if (!asr) throw new Error('Modèle non chargé');
  const audio = msg.audio;
  const long = audio.length > 16000 * 30;
  const t0 = performance.now();
  const out = await asr(audio, {
    language: 'french',
    task: 'transcribe',
    return_timestamps: false,
    chunk_length_s: long ? 30 : undefined,
    stride_length_s: long ? 5 : undefined,
  });
  const text = cleanTranscript(Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text);
  scope.postMessage({ type: 'result', id: msg.id, final: msg.final, text, ms: Math.round(performance.now() - t0) });
}

scope.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  void (async () => {
    try {
      if (msg.type === 'load') {
        const T = await loadTransformers(msg.env);
        pinRevision(T.env, msg.revision);
        const p = await T.pipeline('automatic-speech-recognition', msg.repo, {
          revision: msg.revision,
          dtype: msg.dtype as never,
          device: msg.device,
          progress_callback: progressForwarder((m) => scope.postMessage(m)),
        });
        asr = p;
        // Préchauffage sur 1 s de silence : compile les shaders / alloue la mémoire.
        const t0 = performance.now();
        await asr(new Float32Array(16000), { language: 'french', task: 'transcribe' });
        scope.postMessage({ type: 'ready', device: msg.device, warmupMs: Math.round(performance.now() - t0) });
      } else if (msg.type === 'transcribe') {
        await transcribe(msg);
      } else if (msg.type === 'dispose') {
        await asr?.dispose?.();
        asr = null;
        scope.postMessage({ type: 'disposed' });
      }
    } catch (e) {
      scope.postMessage({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: errorMessage(e) });
    }
  })();
};
