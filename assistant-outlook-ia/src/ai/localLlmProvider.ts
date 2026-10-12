/**
 * Fournisseur de génération de texte s'appuyant sur un modèle open source exécuté
 * localement dans un Web Worker (Transformers.js). Aucun appel réseau avec du contenu.
 */

import type { TextGenerationProvider } from './assistant';
import type { ModelHandle } from './modelLoader';
import type { ChatMessage } from './prompts';

export class LocalLlmProvider implements TextGenerationProvider {
  constructor(private readonly handle: ModelHandle) {}

  get id(): string {
    const s = this.handle.state;
    return s.status === 'ready' ? s.spec.id : 'llm';
  }

  get label(): string {
    const s = this.handle.state;
    return s.status === 'ready' ? `${s.spec.label} (${s.variant.device === 'webgpu' ? 'WebGPU' : 'WASM'})` : 'Modèle local';
  }

  isReady(): boolean {
    return this.handle.isReady();
  }

  async generate(messages: ChatMessage[], opts: { maxNewTokens?: number; onToken?: (t: string) => void } = {}): Promise<string> {
    const r = await this.handle.request<{ text: string }>(
      { type: 'generate', messages, maxNewTokens: opts.maxNewTokens ?? 400 },
      [],
      opts.onToken,
    );
    return r.text;
  }
}
