/// <reference lib="webworker" />
/**
 * Worker de génération de texte (LLM open source local, Transformers.js).
 * Les textes reçus ne sont conservés que le temps de la génération.
 * Une génération peut être interrompue (bouton « Arrêter ») sans décharger le modèle.
 */

import { errorMessage, loadTransformers, pinRevision, progressForwarder } from './workerEnv';
import type { ChatTurn, GenerateRequest, TypedWorkerScope, WorkerRequest } from './workerProtocol';

const scope = self as unknown as TypedWorkerScope;

type GenerationOutput = Array<{ generated_text: ChatTurn[] }>;
type Generator = ((messages: ChatTurn[], opts: Record<string, unknown>) => Promise<GenerationOutput>) & {
  tokenizer: unknown;
  dispose?: () => Promise<void>;
};
type Transformers = Awaited<ReturnType<typeof loadTransformers>>;

let gen: Generator | null = null;
let T: Transformers | null = null;
let stopper: InstanceType<Transformers['InterruptableStoppingCriteria']> | null = null;

async function generate(msg: GenerateRequest): Promise<void> {
  if (!gen || !T || !stopper) throw new Error('Modèle non chargé');
  stopper.reset();
  const t0 = performance.now();
  const streamer = new T.TextStreamer(gen.tokenizer as never, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => scope.postMessage({ type: 'token', id: msg.id, text }),
  });
  const out = await gen(msg.messages, {
    max_new_tokens: msg.maxNewTokens,
    do_sample: false,
    repetition_penalty: 1.05,
    streamer,
    stopping_criteria: stopper,
    tokenizer_encode_kwargs: { enable_thinking: false },
  });
  const text = out[0]?.generated_text.at(-1)?.content ?? '';
  scope.postMessage({ type: 'done', id: msg.id, text, ms: Math.round(performance.now() - t0), interrupted: stopper.interrupted });
}

scope.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'interrupt') {
    // Traité immédiatement, entre deux jetons de la génération en cours.
    stopper?.interrupt();
    return;
  }
  void (async () => {
    try {
      if (msg.type === 'load') {
        T = await loadTransformers(msg.env);
        pinRevision(T.env, msg.revision);
        stopper = new T.InterruptableStoppingCriteria();
        gen = (await T.pipeline('text-generation', msg.repo, {
          revision: msg.revision,
          dtype: msg.dtype as never,
          device: msg.device,
          progress_callback: progressForwarder((m) => scope.postMessage(m)),
        })) as unknown as Generator;
        scope.postMessage({ type: 'ready', device: msg.device });
      } else if (msg.type === 'generate') {
        await generate(msg);
      } else if (msg.type === 'dispose') {
        await gen?.dispose?.();
        gen = null;
        scope.postMessage({ type: 'disposed' });
      }
    } catch (e) {
      scope.postMessage({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: errorMessage(e) });
    }
  })();
};
