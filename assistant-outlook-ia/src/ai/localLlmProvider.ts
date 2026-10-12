/**
 * Fournisseur de génération de texte s'appuyant sur un modèle open source exécuté
 * localement dans un Web Worker (Transformers.js). Aucun appel réseau avec du contenu.
 */

import type { GenerationResult, TextGenerationProvider } from './assistant';
import type { ModelHandle } from './modelLoader';
import type { ChatMessage } from './prompts';
import type { DoneMessage } from './workerProtocol';

export class LocalLlmProvider implements TextGenerationProvider {
  constructor(private readonly handle: ModelHandle) {}

  get id(): string {
    const s = this.handle.state;
    return s.status === 'ready' ? s.spec.id : 'llm';
  }

  get label(): string {
    const s = this.handle.state;
    return s.status === 'ready' ? `${s.spec.label} (${s.variant.device === 'webgpu' ? 'carte graphique' : 'processeur'})` : 'Modèle local';
  }

  isReady(): boolean {
    return this.handle.isReady();
  }

  async generate(messages: ChatMessage[], opts: { maxNewTokens?: number; onToken?: (t: string) => void } = {}): Promise<GenerationResult> {
    const r = await this.handle.request<DoneMessage>(
      { type: 'generate', messages, maxNewTokens: opts.maxNewTokens ?? 400 },
      { onToken: opts.onToken },
    );
    return { text: r.text, interrupted: r.interrupted };
  }

  interrupt(): void {
    this.handle.interrupt();
  }
}
