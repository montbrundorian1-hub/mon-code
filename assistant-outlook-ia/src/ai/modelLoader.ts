/**
 * Gestion du cycle de vie d'un modèle exécuté dans un Web Worker :
 * consentement → téléchargement (progression, annulation) → chargement → prêt / erreur → repli.
 *
 * Aucun téléchargement n'est lancé sans appel explicite à `load()` avec `consent: true`,
 * qui n'est fait que depuis un bouton de l'interface après affichage de la taille.
 */

import type { ModelFamily, ModelSpec, ModelVariant } from './models';
import { loadSettings } from '../security/settings';

export type LoadState =
  | { status: 'idle' }
  | { status: 'downloading'; loaded: number; total: number; spec: ModelSpec; variant: ModelVariant }
  | { status: 'loading'; spec: ModelSpec; variant: ModelVariant }
  | { status: 'ready'; spec: ModelSpec; variant: ModelVariant; warmupMs?: number }
  | { status: 'error'; spec: ModelSpec; variant: ModelVariant; message: string; kind: 'memory' | 'network' | 'other' }
  | { status: 'cancelled'; spec: ModelSpec };

export type WorkerFactory = (family: ModelFamily) => Worker;

export const defaultWorkerFactory: WorkerFactory = (family) =>
  family === 'asr'
    ? new Worker(new URL('../transcription/whisper.worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });

export function baseUrl(): string {
  return new URL('./', document.baseURI).href;
}

export class ModelHandle {
  private worker: Worker | null = null;
  private stateValue: LoadState = { status: 'idle' };
  private listeners = new Set<(s: LoadState) => void>();
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onToken?: (t: string) => void }>();
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

  onChange(fn: (s: LoadState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: LoadState): void {
    this.stateValue = s;
    this.listeners.forEach((l) => l(s));
  }

  /**
   * Télécharge et charge le modèle. `consent` doit provenir d'une action explicite de l'utilisateur.
   */
  load(spec: ModelSpec, variant: ModelVariant, consent: boolean): Promise<LoadState> {
    if (!consent) return Promise.reject(new Error('Consentement requis avant tout téléchargement de modèle.'));
    this.terminate();
    const settings = loadSettings();
    const w = this.factory(this.family);
    this.worker = w;
    this.set({ status: 'downloading', loaded: 0, total: variant.bytes, spec, variant });
    return new Promise((resolve) => {
      w.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === 'progress') {
          if (m.status === 'download' && m.total > 0) {
            this.set({ status: 'downloading', loaded: m.loaded, total: Math.max(m.total, 1), spec, variant });
          } else if (m.status === 'done' || m.status === 'ready') {
            if (this.stateValue.status === 'downloading' && this.stateValue.loaded >= this.stateValue.total * 0.98) {
              this.set({ status: 'loading', spec, variant });
            }
          }
        } else if (m.type === 'ready') {
          this.set({ status: 'ready', spec, variant, warmupMs: m.warmupMs });
          w.onmessage = (e2) => this.handleRuntime(e2);
          resolve(this.stateValue);
        } else if (m.type === 'error') {
          const message: string = m.message ?? 'Erreur inconnue';
          const kind = message.startsWith('MEMOIRE') ? 'memory' : message.startsWith('RESEAU') ? 'network' : 'other';
          this.set({ status: 'error', spec, variant, message: message.replace(/^(MEMOIRE|RESEAU): /, ''), kind });
          this.terminate(false);
          resolve(this.stateValue);
        }
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        this.set({ status: 'error', spec, variant, message: 'Le module d’inférence n’a pas pu démarrer.', kind: 'other' });
        this.terminate(false);
        resolve(this.stateValue);
      };
      w.postMessage({
        type: 'load',
        repo: spec.repo,
        dtype: variant.dtype,
        device: variant.device,
        env: { baseUrl: baseUrl(), cacheModels: settings.cacheModels, modelSource: settings.modelSource },
      });
    });
  }

  private handleRuntime(ev: MessageEvent): void {
    const m = ev.data;
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.type === 'token') {
      p.onToken?.(m.text);
      return;
    }
    this.pending.delete(m.id);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
  }

  /** Envoie une requête au worker (transcription ou génération). */
  request<T>(payload: Record<string, unknown>, transfer: Transferable[] = [], onToken?: (t: string) => void): Promise<T> {
    if (!this.worker || !this.isReady()) return Promise.reject(new Error('Modèle non chargé'));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onToken });
      this.worker!.postMessage({ ...payload, id }, transfer);
    });
  }

  /** Annule un téléchargement ou décharge le modèle (libère la mémoire). */
  cancel(): void {
    const s = this.stateValue;
    this.terminate();
    if (s.status === 'downloading' || s.status === 'loading') this.set({ status: 'cancelled', spec: s.spec });
    else this.set({ status: 'idle' });
  }

  terminate(rejectPending = true): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (rejectPending) {
      for (const p of this.pending.values()) p.reject(new Error('Modèle déchargé'));
    }
    this.pending.clear();
  }
}
