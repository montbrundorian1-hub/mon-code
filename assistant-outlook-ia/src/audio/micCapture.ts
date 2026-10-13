/**
 * Capture du microphone, en mémoire uniquement, au format PCM mono 16 kHz (attendu par Whisper).
 *
 * - Le micro n'est ouvert que sur action explicite (bouton, raccourci dans le panneau).
 * - « Pause » libère réellement le micro (l'indicateur du navigateur s'éteint).
 * - Aucun enregistrement n'est conservé : les échantillons sont transmis au segmenteur puis libérés.
 */

export const TARGET_SAMPLE_RATE = 16000;

export type MicErrorKind = 'denied' | 'policy' | 'absent' | 'busy' | 'insecure' | 'unsupported' | 'unknown';

export interface MicError {
  kind: MicErrorKind;
  message: string;
}

export function classifyMicError(e: unknown, ctx: { policyAllowsMic: boolean | null } = { policyAllowsMic: null }): MicError {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    if (ctx.policyAllowsMic === false) {
      return {
        kind: 'policy',
        message:
          'Le panneau Outlook n’est pas autorisé à utiliser le micro (politique de la page hôte). Utilisez « Ouvrir la dictée dans une fenêtre séparée ».',
      };
    }
    return {
      kind: 'denied',
      message:
        'Accès au micro refusé. Autorisez le micro pour ce site (icône à gauche de la barre d’adresse d’Edge), ou utilisez la fenêtre séparée.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return { kind: 'absent', message: 'Aucun microphone détecté. Branchez un micro puis réessayez.' };
  }
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return { kind: 'busy', message: 'Le micro est déjà utilisé par une autre application ou est inaccessible.' };
  }
  if (name === 'InsecureContext') {
    return { kind: 'insecure', message: 'Le micro exige une page chargée en HTTPS.' };
  }
  if (name === 'Unsupported') {
    return { kind: 'unsupported', message: 'Ce navigateur ne permet pas la capture audio.' };
  }
  return { kind: 'unknown', message: 'Impossible d’accéder au micro (erreur inattendue).' };
}

/** Indique si la politique de permissions de la page autorise le micro (Chromium/Edge). null = inconnu. */
export function policyAllowsMicrophone(doc: Document = document): boolean | null {
  const d = doc as Document & {
    permissionsPolicy?: { allowsFeature(f: string): boolean };
    featurePolicy?: { allowsFeature(f: string): boolean };
  };
  try {
    const p = d.permissionsPolicy ?? d.featurePolicy;
    return p ? p.allowsFeature('microphone') : null;
  } catch {
    return null;
  }
}

/** Rééchantillonnage linéaire (repli si l'AudioContext ne peut pas être créé à 16 kHz). */
export function resampleLinear(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = pos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

export function rms(chunk: Float32Array): number {
  let s = 0;
  for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i];
  return Math.sqrt(s / Math.max(1, chunk.length));
}

export interface MicCallbacks {
  onAudio(chunk: Float32Array): void;
  onLevel?(level: number): void;
  /** Le micro a été coupé de l'extérieur (débranché, permission retirée, autre appli). */
  onInterrupted?(reason: string): void;
}

export class MicCapture {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stopping = false;

  constructor(
    private readonly cb: MicCallbacks,
    private readonly nav: Navigator = navigator,
  ) {}

  get active(): boolean {
    return !!this.stream;
  }

  async start(): Promise<void> {
    if (this.stream) return;
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
    }
    if (!this.nav.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('unsupported'), { name: 'Unsupported' });
    }
    this.stopping = false;
    const stream = await this.nav.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    this.stream = stream;
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (!this.stopping) {
          this.stop();
          this.cb.onInterrupted?.('Le micro a été déconnecté ou la permission a été retirée.');
        }
      });
    }
    try {
      await this.setupAudioGraph(stream);
    } catch (e) {
      this.stop();
      throw e;
    }
  }

  private async setupAudioGraph(stream: MediaStream): Promise<void> {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    } catch {
      ctx = new AudioContext();
    }
    this.ctx = ctx;
    const rate = ctx.sampleRate;
    this.source = ctx.createMediaStreamSource(stream);
    const deliver = (chunk: Float32Array) => {
      const pcm = resampleLinear(chunk, rate, TARGET_SAMPLE_RATE);
      this.cb.onLevel?.(rms(pcm));
      this.cb.onAudio(pcm);
    };
    if (ctx.audioWorklet) {
      await ctx.audioWorklet.addModule(new URL('audio-capture-worklet.js', document.baseURI).href);
      const node = new AudioWorkletNode(ctx, 'capture-processor');
      node.port.onmessage = (ev: MessageEvent<Float32Array>) => deliver(ev.data);
      this.source.connect(node);
      this.node = node;
    } else {
      // Repli pour navigateurs anciens (API dépréciée mais largement disponible).
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (ev) => deliver(new Float32Array(ev.inputBuffer.getChannelData(0)));
      this.source.connect(node);
      node.connect(ctx.destination);
      this.node = node;
    }
    if (ctx.state === 'suspended') await ctx.resume();
  }

  /** Libère immédiatement le micro et toutes les ressources audio. */
  stop(): void {
    this.stopping = true;
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      if (this.node && 'port' in this.node) this.node.port.onmessage = null;
    } catch {
      /* déjà déconnecté */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.source = null;
  }
}
