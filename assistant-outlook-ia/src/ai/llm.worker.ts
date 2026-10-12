/// <reference lib="webworker" />
/**
 * Worker de génération de texte (LLM open source local, Transformers.js).
 * Les textes reçus ne sont conservés que le temps de la génération.
 */

import { errorMessage, loadTransformers, progressForwarder, type WorkerEnvOptions } from './workerEnv';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type Generator = ((
  messages: ChatMessage[],
  opts: Record<string, unknown>,
) => Promise<Array<{ generated_text: ChatMessage[] }>>) & { tokenizer: unknown; dispose?: () => Promise<void> };

let gen: Generator | null = null;
let T: Awaited<ReturnType<typeof loadTransformers>> | null = null;

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') {
      T = await loadTransformers(msg.env as WorkerEnvOptions);
      gen = (await T.pipeline('text-generation', msg.repo, {
        dtype: msg.dtype,
        device: msg.device,
        progress_callback: progressForwarder((m) => self.postMessage(m)),
      })) as unknown as Generator;
      self.postMessage({ type: 'ready', device: msg.device });
    } else if (msg.type === 'generate') {
      if (!gen || !T) throw new Error('Modèle non chargé');
      const t0 = performance.now();
      const streamer = new T.TextStreamer(gen.tokenizer as never, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => self.postMessage({ type: 'token', id: msg.id, text }),
      });
      const out = await gen(msg.messages as ChatMessage[], {
        max_new_tokens: msg.maxNewTokens ?? 400,
        do_sample: false,
        repetition_penalty: 1.05,
        streamer,
        tokenizer_encode_kwargs: { enable_thinking: false },
      });
      const text = out[0].generated_text.at(-1)?.content ?? '';
      self.postMessage({ type: 'done', id: msg.id, text, ms: Math.round(performance.now() - t0) });
    } else if (msg.type === 'dispose') {
      await gen?.dispose?.();
      gen = null;
      self.postMessage({ type: 'disposed' });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: msg.id, message: errorMessage(e) });
  }
};
