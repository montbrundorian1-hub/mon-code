// Cas 8–11, 21, 30 : micro accordé / refusé / absent, capture interrompue, transcription, nettoyage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyMicError, MicCapture, resampleLinear } from '../src/audio/micCapture';
import { SpeechSegmenter } from '../src/audio/segmenter';
import { DictationSession } from '../src/transcription/dictation';
import type { SegmentEngine } from '../src/transcription/engines';
import { registerCleanup, runCleanup } from '../src/security/sessionMemory';
import { domError, FakeStream, installAudioMocks, lastWorkletNode, speechPattern } from './helpers/audioMock';

class FakeEngine implements SegmentEngine {
  label = 'moteur simulé';
  calls: Array<{ len: number; final: boolean }> = [];
  constructor(private texts: string[] = ['Bonjour Docteur Martin,', 'le staff est jeudi à 14 h 30.']) {}
  isReady() {
    return true;
  }
  supportsPartial() {
    return false;
  }
  async transcribe(audio: Float32Array, final: boolean) {
    this.calls.push({ len: audio.length, final });
    return { text: this.texts[this.calls.length - 1] ?? '', ms: 5 };
  }
}

/** Pousse un signal dans la capture via le faux AudioWorkletNode. */
function feed(chunks: Float32Array[]) {
  for (const c of chunks) lastWorkletNode!.port.onmessage!({ data: c } as MessageEvent);
}

let stream: FakeStream;
beforeEach(() => {
  stream = new FakeStream();
});
afterEach(() => vi.restoreAllMocks());

describe('Permissions du micro', () => {
  it('cas 8 — permission accordée : capture démarrée puis micro libéré à l’arrêt', async () => {
    const { gum } = installAudioMocks(async () => stream);
    const chunks: Float32Array[] = [];
    const mic = new MicCapture({ onAudio: (c) => chunks.push(c) });
    await mic.start();
    expect(gum).toHaveBeenCalledOnce();
    expect(mic.active).toBe(true);
    feed(speechPattern([['speech', 300]]));
    expect(chunks.length).toBe(3);
    mic.stop();
    expect(stream.track.stopped).toBe(true);
    expect(mic.active).toBe(false);
  });

  it('cas 9 — permission refusée : message explicite, et indication cadre Outlook si la politique bloque', async () => {
    installAudioMocks(async () => {
      throw domError('NotAllowedError');
    });
    const session = new DictationSession({ engine: new FakeEngine() });
    expect(await session.start()).toBe(false);
    const snap = session.snapshot();
    expect(snap.status).toBe('error');
    expect(['denied', 'policy']).toContain(snap.error?.kind);
    expect(classifyMicError(domError('NotAllowedError'), { policyAllowsMic: false }).kind).toBe('policy');
    expect(classifyMicError(domError('NotAllowedError'), { policyAllowsMic: true }).kind).toBe('denied');
  });

  it('cas 10 — micro absent', async () => {
    installAudioMocks(async () => {
      throw domError('NotFoundError');
    });
    const session = new DictationSession({ engine: new FakeEngine() });
    await session.start();
    expect(session.snapshot().error?.kind).toBe('absent');
    expect(session.snapshot().error?.message).toMatch(/Aucun microphone/);
    expect(classifyMicError(domError('NotReadableError')).kind).toBe('busy');
  });

  it('API de capture absente (navigateur incompatible)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const session = new DictationSession({ engine: new FakeEngine() });
    await session.start();
    expect(session.snapshot().error?.kind).toBe('unsupported');
  });
});

describe('Dictée', () => {
  it('cas 11 — capture interrompue : micro libéré, texte conservé, message affiché', async () => {
    installAudioMocks(async () => stream);
    const engine = new FakeEngine(['Premier segment fictif.']);
    const session = new DictationSession({ engine });
    await session.start();
    feed(speechPattern([['silence', 300], ['speech', 1000], ['silence', 1000]]));
    stream.track.endExternally();
    await new Promise((r) => setTimeout(r, 10));
    const snap = session.snapshot();
    expect(snap.status).toBe('paused');
    expect(snap.notice).toMatch(/déconnecté/);
    expect(stream.track.stopped).toBe(true);
    expect(await session.stop()).toBe('Premier segment fictif.');
  });

  it('cas 21 — segments validés affichés dans l’ordre ; texte final assemblé', async () => {
    installAudioMocks(async () => stream);
    const engine = new FakeEngine();
    const session = new DictationSession({ engine });
    await session.start();
    feed(speechPattern([['silence', 500], ['speech', 1200], ['silence', 1000], ['speech', 1500]]));
    const text = await session.stop();
    expect(engine.calls.every((c) => c.final)).toBe(true);
    expect(engine.calls.length).toBe(2);
    expect(text).toBe('Bonjour Docteur Martin, le staff est jeudi à 14 h 30.');
    expect(session.snapshot().segments.map((s) => s.status)).toEqual(['final', 'final']);
  });

  it('pause : le micro est réellement libéré ; reprise : nouvelle autorisation', async () => {
    const { gum } = installAudioMocks(async () => new FakeStream());
    const session = new DictationSession({ engine: new FakeEngine() });
    await session.start();
    session.pause();
    expect(session.snapshot().status).toBe('paused');
    expect(gum).toHaveBeenCalledTimes(1);
    await session.resume();
    expect(gum).toHaveBeenCalledTimes(2);
    expect(session.snapshot().status).toBe('listening');
    await session.stop();
  });

  it('refuse de démarrer sans modèle de transcription chargé', async () => {
    installAudioMocks(async () => stream);
    const engine = new FakeEngine();
    engine.isReady = () => false;
    const session = new DictationSession({ engine });
    expect(await session.start()).toBe(false);
    expect(session.snapshot().error?.message).toMatch(/modèle de transcription/);
  });
});

describe('Segmentation (détection d’activité vocale)', () => {
  it('ignore le silence et découpe après une pause', () => {
    const seg = new SpeechSegmenter();
    const events = speechPattern([['silence', 1000], ['speech', 800], ['silence', 900], ['silence', 1000]]).flatMap((c) => seg.push(c));
    expect(events.filter((e) => e.type === 'final')).toHaveLength(1);
  });

  it('ne transcrit pas un bruit trop bref', () => {
    const seg = new SpeechSegmenter();
    const events = speechPattern([['speech', 200], ['silence', 1200]]).flatMap((c) => seg.push(c));
    expect(events).toHaveLength(0);
  });

  it('coupe les segments trop longs (≤ 20 s)', () => {
    const seg = new SpeechSegmenter();
    const events = speechPattern([['speech', 25000]]).flatMap((c) => seg.push(c));
    const finals = events.filter((e) => e.type === 'final');
    expect(finals.length).toBe(1);
    expect(finals[0].type === 'final' && finals[0].durationMs).toBeLessThanOrEqual(20100);
  });

  it('émet des transcriptions provisoires seulement si activées', () => {
    const seg = new SpeechSegmenter({ partialEveryMs: 1000 });
    const events = speechPattern([['speech', 3000]]).flatMap((c) => seg.push(c));
    expect(events.filter((e) => e.type === 'partial').length).toBeGreaterThanOrEqual(2);
  });

  it('rééchantillonnage 48 kHz → 16 kHz', () => {
    expect(resampleLinear(new Float32Array(4800), 48000, 16000).length).toBe(1600);
  });
});

describe('Nettoyage à la fermeture (cas 30)', () => {
  it('libère micro, workers et historique à la fermeture du panneau', async () => {
    installAudioMocks(async () => stream);
    const session = new DictationSession({ engine: new FakeEngine() });
    await session.start();
    const terminate = vi.fn();
    registerCleanup(() => session.dispose());
    registerCleanup(terminate);
    runCleanup();
    expect(stream.track.stopped).toBe(true);
    expect(terminate).toHaveBeenCalledOnce();
    expect(session.snapshot().segments).toHaveLength(0);
  });
});
