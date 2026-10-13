/**
 * Gestion du cycle de vie d'un modèle exécuté dans un Web Worker :
 * consentement → téléchargement (progression, annulation) → chargement → prêt / erreur → repli.
 *
 * Robustesse :
 *  - un plantage du worker (mémoire épuisée pendant un calcul…) rejette toutes les requêtes en
 *    attente : l'interface n'attend jamais indéfiniment ;
 *  - chaque requête peut avoir un délai maximal ;
 *  - une génération peut être interrompue sans décharger le modèle.
 *
 * Aucun téléchargement n'est lancé sans appel explicite à `load()` avec `consent: true`,
 * qui n'est fait que depuis un bouton de l'interface après affichage de la taille.
 */

import type { ModelFamily, ModelSpec, ModelVariant } from './models';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';
import { loadSettings } from '../security/settings';

export type LoadState =
  | { status: 'idle' }
  | { status: 'downloading'; loaded: number; total: number; spec: ModelSpec; variant: ModelVariant }
  | { status: 'loading'; spec: ModelSpec; variant: ModelVariant }
  | { status: 'ready'; spec: ModelSpec; variant: ModelVariant; warmupMs?: number }
  | { status: 'error'; spec: ModelSpec; variant: ModelVariant; message: string; kind: 'memory' | 'network' | 'crash' | 'other' }
  | { status: 'cancelled'; spec: ModelSpec };

export type WorkerFactory = (family: ModelFamily) => Worker;

export const defaultWorkerFactory: WorkerFactory = (family) =>
  family === 'asr'
    ? new Worker(new URL('../transcription/whisper.worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });

export function baseUrl(): string {
  return new URL('./', document.baseURI).href;
}

interface Pending {
  resolve: (v: WorkerResponse) => void;
  reject: (e: Error) => void;
  onToken?: (t: string) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    public readonly kind: 'crash' | 'timeout' | 'unloaded' | 'worker',
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

function classify(message: string): { kind: 'memory' | 'network' | 'other'; text: string } {
  if (message.startsWith('MEMOIRE')) return { kind: 'memory', text: message.replace(/^MEMOIRE: /, '') };
  if (message.startsWith('RESEAU')) return { kind: 'network', text: message.replace(/^RESEAU: /, '') };
  return { kind: 'other', text: message };
}

export class ModelHandle {
  private worker: Worker | null = null;
  private stateValue: LoadState = { status: 'idle' };
  private listeners = new Set<(s: LoadState) => void>();
  private pending = new Map<number, Pending>();
  private pendingLoad: ((s: LoadState) => void) | null = null;
  private seq = 0;

  constructor(
    public readonly family: ModelFamily,
    private readonly factory: WorkerFactory = defaultWorkerFactory,
  ) {}

  get state(): LoadState {
    return this.stateValue;
  }

  isReady(): boolean {
    return this.stateValue.status === 'ready';
  }

  isBusy(): boolean {
    return this.pending.size > 0;
  }

  onChange(fn: (s: LoadState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: LoadState): void {
    this.stateValue = s;
    this.listeners.forEach((l) => l(s));
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  /**
   * Télécharge et charge le modèle. `consent` doit provenir d'une action explicite de l'utilisateur.
   */
  load(spec: ModelSpec, variant: ModelVariant, consent: boolean): Promise<LoadState> {
    if (!consent) return Promise.reject(new Error('Consentement requis avant tout téléchargement de modèle.'));
    this.terminate(); // annule proprement un chargement précédent éventuel
    const settings = loadSettings();
    const w = this.factory(this.family);
    this.worker = w;
    this.set({ status: 'downloading', loaded: 0, total: variant.bytes, spec, variant });
    return new Promise<LoadState>((resolve) => {
      this.pendingLoad = resolve;
      const finishLoad = () => {
        const r = this.pendingLoad;
        this.pendingLoad = null;
        r?.(this.stateValue);
      };
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const m = ev.data;
        if (this.stateValue.status === 'ready') {
          this.handleRuntime(m, spec, variant);
          return;
        }
        if (m.type === 'progress') {
          if (m.status === 'download' && m.total > 0) {
            this.set({ status: 'downloading', loaded: m.loaded, total: Math.max(m.total, 1), spec, variant });
          } else if ((m.status === 'done' || m.status === 'ready') && this.stateValue.status === 'downloading') {
            if (this.stateValue.loaded >= this.stateValue.total * 0.98) this.set({ status: 'loading', spec, variant });
          }
        } else if (m.type === 'ready') {
          this.set({ status: 'ready', spec, variant, warmupMs: m.warmupMs });
          finishLoad();
        } else if (m.type === 'error') {
          const c = classify(m.message);
          this.set({ status: 'error', spec, variant, message: c.text, kind: c.kind });
          this.terminate(false);
          finishLoad();
        }
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        const wasReady = this.stateValue.status === 'ready';
        this.set({
          status: 'error',
          spec,
          variant,
          message: wasReady
            ? 'Le moteur s’est arrêté pendant un calcul (mémoire insuffisante probable). Rechargez-le ou choisissez un modèle plus léger.'
            : 'Le module d’inférence n’a pas pu démarrer.',
          kind: wasReady ? 'crash' : 'other',
        });
        this.rejectAll(new ModelError('Le moteur s’est arrêté.', 'crash'));
        this.terminate(false);
        finishLoad();
      };
      this.post({
        type: 'load',
        repo: spec.repo,
        revision: spec.revision,
        dtype: variant.dtype,
        device: variant.device,
        env: { baseUrl: baseUrl(), cacheModels: settings.cacheModels, modelSource: settings.modelSource },
      });
    });
  }

  private handleRuntime(m: WorkerResponse, spec: ModelSpec, variant: ModelVariant): void {
    if (m.type === 'error' && m.id === undefined) {
      // Erreur hors requête : le worker n'est plus fiable.
      const c = classify(m.message);
      this.set({ status: 'error', spec, variant, message: c.text, kind: c.kind });
      this.rejectAll(new ModelError(c.text, 'worker'));
      this.terminate(false);
      return;
    }
    if (!('id' in m) || m.id === undefined) return;
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.type === 'token') {
      p.onToken?.(m.text);
      return;
    }
    this.pending.delete(m.id);
    if (p.timer) clearTimeout(p.timer);
    if (m.type === 'error') p.reject(new Error(classify(m.message).text));
    else p.resolve(m);
  }

  /**
   * Envoie une requête au worker (transcription ou génération).
   * `timeoutMs` : délai maximal (0 = aucun). Le délai dépassé rejette la promesse.
   */
  request<T extends WorkerResponse>(
    payload: { type: 'transcribe'; audio: Float32Array; final: boolean } | { type: 'generate'; messages: import('./workerProtocol').ChatTurn[]; maxNewTokens: number },
    opts: { transfer?: Transferable[]; onToken?: (t: string) => void; timeoutMs?: number } = {},
  ): Promise<T> {
    if (!this.worker || !this.isReady()) return Promise.reject(new ModelError('Modèle non chargé', 'unloaded'));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const pending: Pending = { resolve: resolve as (v: WorkerResponse) => void, reject, onToken: opts.onToken };
      if (opts.timeoutMs) {
        pending.timer = setTimeout(() => {
          if (this.pending.delete(id)) reject(new ModelError('Délai de calcul dépassé.', 'timeout'));
        }, opts.timeoutMs);
      }
      this.pending.set(id, pending);
      this.post({ ...payload, id }, opts.transfer ?? []);
    });
  }

  /** Demande l'arrêt de la génération en cours (le résultat partiel est renvoyé). */
  interrupt(): void {
    if (this.worker && this.isReady()) this.post({ type: 'interrupt' });
  }

  /** Annule un téléchargement ou décharge le modèle (libère la mémoire). */
  cancel(): void {
    const s = this.stateValue;
    this.terminate();
    if (s.status === 'downloading' || s.status === 'loading') this.set({ status: 'cancelled', spec: s.spec });
    else this.set({ status: 'idle' });
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  terminate(rejectPending = true): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    if (rejectPending) this.rejectAll(new ModelError('Modèle déchargé', 'unloaded'));
    if (this.pendingLoad) {
      const r = this.pendingLoad;
      this.pendingLoad = null;
      const s = this.stateValue;
      r(s.status === 'downloading' || s.status === 'loading' ? { status: 'cancelled', spec: s.spec } : s);
    }
  }
}
