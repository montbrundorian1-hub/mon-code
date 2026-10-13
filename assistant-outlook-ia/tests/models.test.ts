// Cas 12–17 : téléchargement impossible, modèle trop lourd, WebGPU/WASM, repli léger puis classique.
import { beforeEach, describe, expect, it } from 'vitest';
import { Assistant, type TextGenerationProvider } from '../src/ai/assistant';
import { ModelHandle } from '../src/ai/modelLoader';
import { ASR_MODELS, hardwareTier, lighterThan, LLM_MODELS, pickVariant, recommend, type Capabilities } from '../src/ai/models';
import { _resetSettingsForTests } from '../src/security/settings';

const CPU: Capabilities = { webgpu: false, shaderF16: false, wasm: true, wasmSimd: true, memoryGB: 8, cores: 8 };
const GPU: Capabilities = { ...CPU, webgpu: true, shaderF16: true };
const OLD: Capabilities = { webgpu: false, shaderF16: false, wasm: true, wasmSimd: true, memoryGB: 2, cores: 2 };
const NONE: Capabilities = { webgpu: false, shaderF16: false, wasm: false, wasmSimd: false, memoryGB: null, cores: null };

/** Faux worker : répond selon un scénario. */
class ScriptedWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor(private script: (msg: Record<string, unknown>, reply: (m: unknown) => void) => void) {}
  postMessage(msg: Record<string, unknown>) {
    this.posted.push(msg);
    queueMicrotask(() => this.script(msg, (m) => this.onmessage?.({ data: m } as MessageEvent)));
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  _resetSettingsForTests();
  localStorage.clear();
});

describe('Sélection selon le matériel', () => {
  it('cas 14 — WebGPU indisponible : variante WASM choisie', () => {
    const v = pickVariant(ASR_MODELS.find((m) => m.id === 'whisper-small')!, CPU);
    expect(v?.device).toBe('wasm');
    expect(pickVariant(ASR_MODELS.find((m) => m.id === 'whisper-small')!, GPU)?.device).toBe('webgpu');
    // large-v3-turbo exige WebGPU + f16 : absent sur processeur seul
    expect(recommend('asr', CPU).map((r) => r.spec.id)).not.toContain('whisper-large-v3-turbo');
  });

  it('cas 15 — WASM disponible / indisponible', () => {
    expect(recommend('asr', CPU).length).toBeGreaterThan(0);
    expect(recommend('asr', NONE)).toEqual([]);
    expect(recommend('llm', NONE)).toEqual([]);
    expect(hardwareTier(NONE)).toBe('insuffisant');
  });

  it('adapte la recommandation à la puissance du poste', () => {
    expect(recommend('asr', CPU)[0].spec.id).toBe('whisper-small');
    expect(recommend('asr', OLD)[0].spec.id).toBe('whisper-base');
    expect(recommend('llm', GPU)[0].spec.id).toBe('qwen2.5-1.5b');
    // poste modeste : pas de modèle de rédaction de plus d'1,5 Go proposé en premier
    expect(recommend('llm', OLD)[0].variant.bytes).toBeLessThan(1024 ** 3);
  });

  it('cas 16 — repli vers un modèle plus léger', () => {
    expect(lighterThan('whisper-small', 'asr', CPU)?.spec.id).toBe('whisper-base');
    expect(lighterThan('whisper-base', 'asr', CPU)?.spec.id).toBe('whisper-tiny');
    expect(lighterThan('whisper-tiny', 'asr', CPU)).toBeNull();
    expect(lighterThan('qwen2.5-1.5b', 'llm', GPU)?.spec.id).toBe('qwen3-0.6b');
  });

  it('tous les modèles de transcription sont multilingues (aucun modèle « .en »)', () => {
    for (const m of ASR_MODELS) expect(m.repo).not.toMatch(/\.en\b/);
    for (const m of [...ASR_MODELS, ...LLM_MODELS]) expect(m.license).toBeTruthy();
  });
});

describe('Chargement des modèles', () => {
  const spec = ASR_MODELS.find((m) => m.id === 'whisper-small')!;
  const variant = spec.variants.find((v) => v.device === 'wasm')!;

  it('refuse tout téléchargement sans consentement explicite', async () => {
    const h = new ModelHandle('asr', () => new ScriptedWorker(() => undefined) as unknown as Worker);
    await expect(h.load(spec, variant, false)).rejects.toThrow(/Consentement/);
    expect(h.state.status).toBe('idle');
  });

  it('cas 12 — modèle impossible à télécharger : erreur réseau explicite', async () => {
    let w!: ScriptedWorker;
    const h = new ModelHandle('asr', () => (w = new ScriptedWorker((_m, reply) => reply({ type: 'error', message: 'RESEAU: téléchargement impossible (403)' }))) as unknown as Worker);
    const s = await h.load(spec, variant, true);
    expect(s.status).toBe('error');
    expect(s.status === 'error' && s.kind).toBe('network');
    expect(w.terminated).toBe(true);
  });

  it('cas 13 — modèle trop volumineux (mémoire) : erreur mémoire et modèle plus léger proposé', async () => {
    const h = new ModelHandle('asr', () => new ScriptedWorker((_m, reply) => reply({ type: 'error', message: 'MEMOIRE: mémoire insuffisante pour ce modèle' })) as unknown as Worker);
    const s = await h.load(spec, variant, true);
    expect(s.status === 'error' && s.kind).toBe('memory');
    expect(lighterThan(spec.id, 'asr', CPU)?.spec.id).toBe('whisper-base');
  });

  it('progression, chargement puis prêt ; annulation possible', async () => {
    const states: string[] = [];
    const h = new ModelHandle(
      'asr',
      () =>
        new ScriptedWorker((m, reply) => {
          if (m.type === 'load') {
            reply({ type: 'progress', status: 'download', loaded: 50, total: 100 });
            reply({ type: 'progress', status: 'download', loaded: 100, total: 100 });
            reply({ type: 'progress', status: 'done' });
            reply({ type: 'ready', warmupMs: 10 });
          }
        }) as unknown as Worker,
    );
    h.onChange((s) => states.push(s.status));
    await h.load(spec, variant, true);
    expect(states).toEqual(['downloading', 'downloading', 'downloading', 'loading', 'ready']);
    h.cancel();
    expect(h.state.status).toBe('idle');
  });

  it('annulation pendant le téléchargement : worker arrêté', async () => {
    let w!: ScriptedWorker;
    const h = new ModelHandle('asr', () => (w = new ScriptedWorker(() => undefined)) as unknown as Worker);
    void h.load(spec, variant, true);
    expect(h.state.status).toBe('downloading');
    h.cancel();
    expect(w.terminated).toBe(true);
    expect(h.state.status).toBe('cancelled');
  });
});

describe('cas 17 — bascule vers la rédaction classique', () => {
  it('sans modèle IA : rédaction classique', async () => {
    const a = new Assistant(null);
    const r = await a.draftFromDictation('bonjour je confirme le staff de jeudi à 14 h', { recipients: [], formality: 'auto' }, { useAi: true });
    expect(r.engine).toBe('classique');
    expect(r.text).toMatch(/^Bonjour,/);
  });

  it('modèle IA défaillant : erreur remontée, la version classique reste disponible', async () => {
    const failing: TextGenerationProvider = { id: 'x', label: 'x', isReady: () => true, generate: async () => Promise.reject(new Error('mémoire')) };
    const a = new Assistant(failing);
    await expect(a.draftFromDictation('bonjour test', { recipients: [], formality: 'auto' }, { useAi: true })).rejects.toThrow();
    const r = await a.draftFromDictation('bonjour test', { recipients: [], formality: 'auto' }, { useAi: false });
    expect(r.engine).toBe('classique');
  });
});

describe('Tablette et téléphone (test réel du 2026-10-13)', () => {
  const TABLET: Capabilities = { ...GPU, mobile: true };

  it('pas de variante carte graphique sur mobile, modèles légers en premier', () => {
    expect(hardwareTier(TABLET)).toBe('cpu-confort');
    const asr = recommend('asr', TABLET);
    expect(asr.map((x) => x.spec.id)).toEqual(['whisper-base', 'whisper-small', 'whisper-tiny']);
    expect(asr.every((x) => x.variant.device === 'wasm')).toBe(true);
    expect(asr[0].variant.bytes).toBeLessThan(100 * 1024 * 1024);
    expect(recommend('llm', TABLET).every((x) => x.variant.device === 'wasm')).toBe(true);
  });

  it('sur ordinateur avec carte graphique, rien ne change', () => {
    expect(hardwareTier(GPU)).toBe('gpu');
    expect(recommend('asr', GPU)[0].variant.device).toBe('webgpu');
  });

  it('détection : système mobile, iPad, mode ordinateur d’une tablette Android (processeur graphique ARM)', async () => {
    const { isMobileDevice } = await import('../src/diagnostics/diagnostics');
    const nav = (ua: string, extra: Record<string, unknown> = {}) => ({ userAgent: ua, maxTouchPoints: 0, ...extra }) as unknown as Navigator;
    expect(isMobileDevice(nav('Mozilla/5.0 (Linux; Android 14; SM-X920) AppleWebKit/537.36 Chrome/141 Safari/537.36'), undefined)).toBe(true);
    expect(isMobileDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', { maxTouchPoints: 5 }), undefined)).toBe(true);
    expect(isMobileDevice(nav('Mozilla/5.0 (X11; Linux x86_64) Chrome/141 Safari/537.36'), undefined, 'arm')).toBe(true);
    expect(isMobileDevice(nav('Mozilla/5.0 (X11; Linux x86_64)', { userAgentData: { mobile: true } }), undefined)).toBe(true);
    expect(isMobileDevice(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141 Edg/141'), undefined, 'nvidia')).toBe(false);
    const touchOnly = { matchMedia: (q: string) => ({ matches: /coarse|hover: none/.test(q) }) } as unknown as Window;
    expect(isMobileDevice(nav('Mozilla/5.0 (X11; Linux x86_64)'), touchOnly)).toBe(true);
  });
});
