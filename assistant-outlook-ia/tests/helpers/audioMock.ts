/**
 * Simulation du micro (getUserMedia) et de Web Audio pour jsdom.
 */
import { vi } from 'vitest';

export class FakeTrack extends EventTarget {
  stopped = false;
  kind = 'audio';
  stop() {
    this.stopped = true;
  }
  /** Simule une coupure externe (micro débranché, permission retirée). */
  endExternally() {
    this.dispatchEvent(new Event('ended'));
  }
}

export class FakeStream {
  track = new FakeTrack();
  getAudioTracks() {
    return [this.track];
  }
  getTracks() {
    return [this.track];
  }
}

export let lastWorkletNode: { port: { onmessage: ((ev: MessageEvent) => void) | null } } | null = null;

export function installAudioMocks(getUserMedia: () => Promise<unknown>) {
  const streams: FakeStream[] = [];
  const gum = vi.fn(async () => {
    const s = (await getUserMedia()) as FakeStream;
    streams.push(s);
    return s;
  });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gum, enumerateDevices: async () => [] } });
  class FakeAudioContext {
    sampleRate = 16000;
    state = 'running';
    closed = false;
    audioWorklet = { addModule: vi.fn(async () => undefined) };
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }
    async resume() {}
    async close() {
      this.closed = true;
    }
  }
  class FakeWorkletNode {
    port = { onmessage: null as ((ev: MessageEvent) => void) | null };
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- le test doit retrouver le nœud créé par le code testé
      lastWorkletNode = this;
    }
    connect() {}
    disconnect() {}
  }
  (globalThis as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
  (globalThis as unknown as Record<string, unknown>).AudioWorkletNode = FakeWorkletNode;
  return { gum, streams };
}

export function domError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

/** Signal synthétique : alternance parole (sinusoïde) / silence, en blocs de 100 ms à 16 kHz. */
export function speechPattern(pattern: Array<['speech' | 'silence', number]>): Float32Array[] {
  const chunks: Float32Array[] = [];
  for (const [kind, ms] of pattern) {
    for (let t = 0; t < ms; t += 100) {
      const c = new Float32Array(1600);
      if (kind === 'speech') for (let i = 0; i < c.length; i++) c[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / 16000);
      chunks.push(c);
    }
  }
  return chunks;
}
