// Audit n°2 — robustesse : plantage du moteur, délais, interruption, démarrages concurrents du micro.
import { beforeEach, describe, expect, it } from 'vitest';
import { ModelError, ModelHandle } from '../src/ai/modelLoader';
import { ASR_MODELS, LLM_MODELS } from '../src/ai/models';
import { _resetSettingsForTests } from '../src/security/settings';
import { DictationSession } from '../src/transcription/dictation';
import type { SegmentEngine } from '../src/transcription/engines';
import { cleanTranscript } from '../src/transcription/clean';
import { FakeStream, installAudioMocks } from './helpers/audioMock';

/** Faux worker piloté par le test. */
class ControlledWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: Array<Record<string, unknown>> = [];
  postMessage(msg: Record<string, unknown>) {
    this.posted.push(msg);
    if (msg.type === 'load') queueMicrotask(() => this.emit({ type: 'ready', device: 'wasm' }));
  }
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  crash() {
    this.onerror?.({ preventDefault() {} } as unknown as ErrorEvent);
  }
  terminate() {
    this.terminated = true;
  }
}

const asr = ASR_MODELS[0];
const llm = LLM_MODELS[0];
let worker: ControlledWorker;
const factory = () => (worker = new ControlledWorker()) as unknown as Worker;

beforeEach(() => {
  _resetSettingsForTests();
  localStorage.clear();
});

describe('ModelHandle', () => {
  it('transmet la révision figée du modèle au worker', async () => {
    const h = new ModelHandle('asr', factory);
    await h.load(asr, asr.variants[0], true);
    expect(worker.posted[0]).toMatchObject({ type: 'load', repo: asr.repo, revision: asr.revision });
    expect(asr.revision).toMatch(/^[0-9a-f]{40}$/);
  });

  it('plantage du worker après chargement : requêtes en cours rejetées, état « crash » (pas d’attente infinie)', async () => {
    const h = new ModelHandle('asr', factory);
    await h.load(asr, asr.variants[0], true);
    const p = h.request({ type: 'transcribe', audio: new Float32Array(10), final: true });
    worker.crash();
    await expect(p).rejects.toBeInstanceOf(ModelError);
    expect(h.state.status).toBe('error');
    expect(h.state.status === 'error' && h.state.kind).toBe('crash');
    expect(worker.terminated).toBe(true);
  });

  it('délai dépassé : la requête est rejetée', async () => {
    const h = new ModelHandle('asr', factory);
    await h.load(asr, asr.variants[0], true);
    await expect(h.request({ type: 'transcribe', audio: new Float32Array(10), final: true }, { timeoutMs: 20 })).rejects.toThrow(/Délai/);
  });

  it('interruption de génération : message transmis, résultat partiel signalé', async () => {
    const h = new ModelHandle('llm', factory);
    await h.load(llm, llm.variants[0], true);
    const p = h.request<{ type: 'done'; id: number; text: string; ms: number; interrupted: boolean }>({ type: 'generate', messages: [], maxNewTokens: 10 });
    h.interrupt();
    expect(worker.posted.at(-1)).toEqual({ type: 'interrupt' });
    const id = (worker.posted.find((m) => m.type === 'generate') as { id: number }).id;
    worker.emit({ type: 'done', id, text: 'Bonjour', ms: 5, interrupted: true });
    expect((await p).interrupted).toBe(true);
  });

  it('nouveau chargement pendant un chargement : le premier se termine en « annulé »', async () => {
    const slow = () => {
      const w = new ControlledWorker();
      w.postMessage = (m: Record<string, unknown>) => void w.posted.push(m); // ne répond jamais
      worker = w;
      return w as unknown as Worker;
    };
    const h = new ModelHandle('asr', slow);
    const first = h.load(asr, asr.variants[0], true);
    void h.load(asr, asr.variants[0], true);
    expect((await first).status).toBe('cancelled');
  });

  it('erreur hors requête après chargement : moteur déclaré en erreur et requêtes rejetées', async () => {
    const h = new ModelHandle('asr', factory);
    await h.load(asr, asr.variants[0], true);
    const p = h.request({ type: 'transcribe', audio: new Float32Array(10), final: true });
    worker.emit({ type: 'error', message: 'MEMOIRE: mémoire insuffisante pour ce modèle' });
    await expect(p).rejects.toThrow();
    expect(h.state.status === 'error' && h.state.kind).toBe('memory');
  });
});

class Engine implements SegmentEngine {
  label = 'moteur simulé';
  isReady() {
    return true;
  }
  supportsPartial() {
    return false;
  }
  transcribe() {
    return Promise.resolve({ text: 'texte', ms: 1 });
  }
}

describe('DictationSession — démarrages concurrents (audit n°2)', () => {
  it('double clic : un seul micro ouvert', async () => {
    const { gum } = installAudioMocks(async () => new FakeStream());
    const s = new DictationSession({ engine: new Engine() });
    await Promise.all([s.start(), s.start()]);
    expect(gum).toHaveBeenCalledTimes(1);
    s.pause();
  });

  it('arrêt pendant la demande d’autorisation : le micro est libéré dès qu’il arrive', async () => {
    let release!: (v: FakeStream) => void;
    const stream = new FakeStream();
    installAudioMocks(() => new Promise((r) => (release = r)));
    const s = new DictationSession({ engine: new Engine() });
    const started = s.start();
    expect(s.snapshot().status).toBe('starting');
    s.pause(); // Échap / bouton Arrêter avant la réponse du navigateur
    release(stream);
    expect(await started).toBe(false);
    expect(stream.track.stopped).toBe(true);
    expect(s.snapshot().status).toBe('idle');
  });
});

describe('Nettoyage des transcriptions Whisper', () => {
  it('supprime les phrases parasites connues produites sur du silence', () => {
    expect(cleanTranscript(' Sous-titres réalisés par la communauté d’Amara.org ')).toBe('');
    expect(cleanTranscript('Merci.')).toBe('');
    expect(cleanTranscript('Le staff est jeudi. Merci d’avance.')).toBe('Le staff est jeudi. Merci d’avance.');
  });
});

describe('Révision figée pour toutes les requêtes de modèle (audit n°2)', () => {
  it('le gabarit d’URL contient l’empreinte de commit, y compris pour la liste et la taille des fichiers', async () => {
    const { pinRevision } = await import('../src/ai/workerEnv');
    const env = { remotePathTemplate: '{model}/resolve/{revision}/' };
    pinRevision(env, '36050c46d777d46dc4b5f43f6d90574fc38f8732');
    expect(env.remotePathTemplate).toBe('{model}/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732/');
    pinRevision(env, 'main');
    expect(env.remotePathTemplate).toBe('{model}/resolve/{revision}/');
  });

  it('erreurs réseau explicites : limitation de débit (429) et serveur indisponible', async () => {
    const { errorMessage } = await import('../src/ai/workerEnv');
    expect(errorMessage(new Error('Error (429) occurred while trying to load file: "https://huggingface.co/x/config.json".'))).toMatch(/^RESEAU: trop de demandes/);
    expect(errorMessage(new Error('Error (503) occurred while trying to load file'))).toMatch(/^RESEAU: serveur de modèles momentanément indisponible/);
    expect(errorMessage(new Error('Failed to fetch'))).toMatch(/^RESEAU: téléchargement impossible/);
    expect(errorMessage(new RangeError('Array buffer allocation failed'))).toMatch(/^MEMOIRE/);
  });
});
