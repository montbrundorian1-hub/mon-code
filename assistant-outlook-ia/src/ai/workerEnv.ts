/**
 * Configuration commune des workers d'inférence (transcription et rédaction).
 *
 * Ordre IMPORTANT : le garde réseau est installé AVANT l'import de Transformers.js, qui
 * capture `fetch` au chargement du module. On fixe en plus `env.fetch` explicitement.
 */

import { ALLOWED_EXTERNAL_HOSTS, MODEL_CACHE_NAME } from '../config';
import { installNetworkGuard } from '../security/networkGuard';
// Fichiers ONNX Runtime servis par l'application elle-même (noms versionnés par empreinte),
// et non par le CDN tiers que Transformers.js utilise par défaut.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';

export interface WorkerEnvOptions {
  /** URL de base de l'application (pour retrouver /ort/ et /models/). */
  baseUrl: string;
  cacheModels: boolean;
  modelSource: 'huggingface' | 'self-hosted';
}

type TransformersModule = typeof import('@huggingface/transformers');
let mod: TransformersModule | null = null;

export async function loadTransformers(opts: WorkerEnvOptions): Promise<TransformersModule> {
  installNetworkGuard({
    selfOrigin: new URL(opts.baseUrl).origin,
    allowedHosts: ALLOWED_EXTERNAL_HOSTS.map((h) => h.host),
  });
  if (!mod) mod = await import('@huggingface/transformers');
  const { env } = mod;
  env.fetch = globalThis.fetch.bind(globalThis);
  env.cacheKey = MODEL_CACHE_NAME;
  env.useBrowserCache = opts.cacheModels && typeof caches !== 'undefined';
  env.useWasmCache = false; // évite l'import d'un module depuis une URL blob: (CSP plus stricte)
  if (opts.modelSource === 'self-hosted') {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = new URL('models/', opts.baseUrl).href;
  } else {
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
  }
  const onnx = env.backends.onnx as { wasm?: Record<string, unknown> };
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = {
      mjs: new URL(ortMjsUrl, self.location.href).href,
      wasm: new URL(ortWasmUrl, self.location.href).href,
    };
    // Le multithread WASM exige l'isolation cross-origin (en-têtes COOP/COEP), indisponible
    // dans un panneau Outlook et sur la plupart des hébergements statiques gratuits.
    const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
    onnx.wasm.numThreads = isolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  }
  return mod;
}

export interface ProgressMessage {
  type: 'progress';
  loaded: number;
  total: number;
  file?: string;
  status: string;
}

/** Normalise les callbacks de progression de Transformers.js (aucun contenu utilisateur). */
export function progressForwarder(post: (m: ProgressMessage) => void) {
  return (info: { status: string; loaded?: number; total?: number; file?: string }) => {
    if (info.status === 'progress_total') {
      post({ type: 'progress', status: 'download', loaded: info.loaded ?? 0, total: info.total ?? 0 });
    } else if (info.status === 'initiate' || info.status === 'done' || info.status === 'ready') {
      post({ type: 'progress', status: info.status, loaded: 0, total: 0, file: info.file });
    }
  };
}

/** Message d'erreur technique sans contenu (les erreurs ORT ne contiennent pas de texte utilisateur). */
export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/out of memory|OOM|Aborted|memory access out of bounds|Array buffer allocation failed|RangeError/i.test(msg)) {
    return 'MEMOIRE: mémoire insuffisante pour ce modèle';
  }
  if (/fetch|network|Failed to fetch|NetworkError|404|403|bloquée/i.test(msg)) {
    return `RESEAU: téléchargement impossible (${msg.slice(0, 160)})`;
  }
  return msg.slice(0, 240);
}
