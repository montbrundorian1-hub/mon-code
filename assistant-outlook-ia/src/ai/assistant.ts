/**
 * Orchestrateur de rédaction : mode classique systématique, puis amélioration IA optionnelle,
 * puis validation (garde de faits, couverture, termes médicaux incertains).
 *
 * Interface « TextGenerationProvider » : permet de remplacer le moteur IA sans toucher à l'UI.
 */

import { classicRewrite, type Correction } from './classic';
import { applyClassicCommand, type ParsedCommand } from './commands';
import { coverage } from './coverage';
import { compareFacts, extractFacts, type Fact, type FactReport } from './factGuard';
import { findUncertainMedicalTerms, type UncertainTerm } from './medicalLexicon';
import { chatMessages, cleanLlmOutput, commandMessages, polishMessages, replyMessages, summaryMessages, type ChatMessage } from './prompts';
import { resolveStyle, type StyleContext } from './style';

/** Moteur de génération de texte interchangeable (LLM local, ou futur moteur autorisé). */
export interface TextGenerationProvider {
  readonly id: string;
  readonly label: string;
  isReady(): boolean;
  generate(messages: ChatMessage[], opts?: { maxNewTokens?: number; onToken?: (t: string) => void }): Promise<string>;
}

export interface Validation {
  facts: FactReport;
  coverage: number;
  uncertain: UncertainTerm[];
  corrections: Correction[];
  warnings: string[];
}

export interface DraftOutcome {
  /** Texte proposé à l'utilisateur. */
  text: string;
  engine: 'classique' | 'ia';
  engineLabel: string;
  /** Version sans IA (toujours disponible pour revenir en arrière). */
  classicText: string;
  /** Version IA écartée par la validation, consultable à la demande. */
  rejectedAiText?: string;
  rejectionReason?: string;
  notes: string[];
  validation: Validation;
  ms?: number;
}

function factLabel(f: Fact): string {
  return `${f.kind} « ${f.label} »`;
}

/**
 * Valide un résultat par rapport à la source.
 * `allowedAdditions` : textes dont les faits peuvent légitimement apparaître (consigne, destinataires).
 */
export function validate(source: string, result: string, corrections: Correction[], allowedAdditions: string[] = []): Validation {
  const raw = compareFacts(source, result);
  const allowedFacts = allowedAdditions.flatMap((t) => extractFacts(t));
  const correctedKeys = new Set(corrections.flatMap((c) => extractFacts(c.to).map((f) => f.key)));
  const added = raw.added.filter((f) => !correctedKeys.has(f.key) && !allowedFacts.some((a) => a.key === f.key));
  const facts: FactReport = { missing: raw.missing, added, ok: raw.missing.length === 0 && added.length === 0 };
  const cov = coverage(source, result).ratio;
  const uncertain = findUncertainMedicalTerms(result);
  const warnings: string[] = [];
  for (const f of facts.missing) warnings.push(`Information de la dictée absente du texte : ${factLabel(f)}.`);
  for (const f of facts.added) warnings.push(`Information absente de la dictée : ${factLabel(f)}. Vérifiez qu’elle est exacte.`);
  for (const c of corrections) warnings.push(`Correction automatique à vérifier : « ${c.from} » → « ${c.to} » (${c.note}).`);
  for (const u of uncertain) warnings.push(`Terme médical incertain : « ${u.word} » (vouliez-vous dire « ${u.suggestion} » ?).`);
  if (cov < 0.75) warnings.push(`Une partie du contenu dicté semble absente (couverture ${Math.round(cov * 100)} %).`);
  return { facts, coverage: cov, uncertain, corrections, warnings };
}

/** Décide si une proposition IA doit être écartée au profit de la version classique. */
export function aiRejection(reference: string, aiText: string, minCoverage: number, allowed: string[] = []): string | null {
  if (!aiText.trim()) return 'Réponse vide du modèle.';
  const r = compareFacts(reference, aiText);
  const allowedFacts = allowed.flatMap((t) => extractFacts(t));
  const added = r.added.filter((f) => !allowedFacts.some((a) => a.key === f.key));
  if (r.missing.length) return `Le modèle a omis ou modifié : ${r.missing.map(factLabel).join(', ')}.`;
  if (added.length) return `Le modèle a ajouté : ${added.map(factLabel).join(', ')}.`;
  const cov = coverage(reference, aiText).ratio;
  if (cov < minCoverage) return `Le modèle a supprimé une partie du contenu (couverture ${Math.round(cov * 100)} %).`;
  return null;
}

export interface DraftOptions {
  dictatedPunctuation?: boolean;
  useAi?: boolean;
  onToken?: (t: string) => void;
}

const TONE_HINT: Record<string, string> = {
  formel: 'formel et respectueux',
  courant: 'professionnel courant',
  familier: 'cordial entre collègues',
};

export class Assistant {
  constructor(private provider: TextGenerationProvider | null = null) {}

  setProvider(p: TextGenerationProvider | null): void {
    this.provider = p;
  }

  aiAvailable(): boolean {
    return !!this.provider?.isReady();
  }

  aiLabel(): string {
    return this.provider?.label ?? '';
  }

  /** Dictée brute → courriel. */
  async draftFromDictation(raw: string, style: StyleContext, opts: DraftOptions = {}): Promise<DraftOutcome> {
    const t0 = performance.now();
    const classic = classicRewrite(raw, style, { dictatedPunctuation: opts.dictatedPunctuation });
    const allowed = style.recipients.map((r) => r.displayName);
    const base: DraftOutcome = {
      text: classic.text,
      engine: 'classique',
      engineLabel: 'Mode classique (règles, sans IA)',
      classicText: classic.text,
      notes: classic.notes,
      validation: validate(raw, classic.text, classic.corrections, allowed),
    };
    if (!opts.useAi || !this.aiAvailable()) return { ...base, ms: Math.round(performance.now() - t0) };

    const tone = TONE_HINT[resolveStyle(style, raw).formality];
    const out = cleanLlmOutput(await this.provider!.generate(polishMessages(classic.text, tone), { onToken: opts.onToken, maxNewTokens: 500 }));
    const reason = aiRejection(classic.text, out, 0.75, allowed);
    if (reason) {
      return { ...base, rejectedAiText: out, rejectionReason: reason, ms: Math.round(performance.now() - t0) };
    }
    return {
      ...base,
      text: out,
      engine: 'ia',
      engineLabel: `IA locale : ${this.provider!.label}`,
      validation: validate(raw, out, classic.corrections, allowed),
      ms: Math.round(performance.now() - t0),
    };
  }

  /** Applique une commande de modification (écrite ou vocale). */
  async applyCommand(
    text: string,
    cmd: ParsedCommand,
    opts: { useAi?: boolean; onToken?: (t: string) => void } = {},
  ): Promise<{ text: string; applied: boolean; message: string; engine: 'classique' | 'ia'; rejectedAiText?: string }> {
    const classic = applyClassicCommand(text, cmd);
    const deterministic = ['replace', 'add', 'remove-last-sentence', 'to-list'].includes(cmd.kind);
    if (!opts.useAi || !this.aiAvailable() || (deterministic && classic.applied)) {
      return { ...classic, engine: 'classique' };
    }
    const out = cleanLlmOutput(
      await this.provider!.generate(commandMessages(text, cmd.instruction), { onToken: opts.onToken, maxNewTokens: 600 }),
    );
    const minCov = cmd.kind === 'shorter' ? 0.5 : 0.7;
    const reason = aiRejection(text, out, minCov, [cmd.instruction]);
    if (reason) {
      return {
        ...classic,
        engine: 'classique',
        rejectedAiText: out,
        message: `Proposition IA écartée : ${reason} ${classic.applied ? 'Version classique appliquée.' : classic.message}`,
      };
    }
    return { text: out, applied: true, message: 'Modification appliquée par l’IA locale. Relisez le résultat.', engine: 'ia' };
  }

  /** Réponse à un message reçu, à partir des intentions dictées ou saisies. */
  async reply(
    received: string,
    intentions: string,
    style: StyleContext,
    opts: { useAi?: boolean; onToken?: (t: string) => void } = {},
  ): Promise<DraftOutcome> {
    const resolved = resolveStyle({ ...style, isReply: true }, intentions);
    const allowed = style.recipients.map((r) => r.displayName);
    const trimmed = intentions.trim();
    const classicBody = trimmed
      ? classicRewrite(trimmed, style, { addGreeting: false, addClosing: false })
      : { text: 'Merci pour votre message. [à compléter]', corrections: [], notes: [] };
    const hasGreeting = /^(bonjour|bonsoir|madame|monsieur|cher|chère)/i.test(classicBody.text);
    const classicText = [hasGreeting ? null : resolved.greeting, classicBody.text, resolved.closing].filter(Boolean).join('\n\n');
    const base: DraftOutcome = {
      text: classicText,
      engine: 'classique',
      engineLabel: 'Mode classique (modèle de réponse, sans IA)',
      classicText,
      notes: trimmed ? [] : ['Aucune intention fournie : modèle de réponse à compléter.'],
      validation: validate(trimmed || classicText, classicText, classicBody.corrections, allowed),
    };
    if (!opts.useAi || !this.aiAvailable() || !trimmed) return base;
    const out = cleanLlmOutput(
      await this.provider!.generate(replyMessages(received, trimmed, resolved.greeting, resolved.closing), {
        onToken: opts.onToken,
        maxNewTokens: 500,
      }),
    );
    // Les faits de la réponse doivent provenir des intentions (ou être cités du message reçu).
    const reason = aiRejection(trimmed, out, 0.6, [received, resolved.greeting, ...allowed]);
    if (reason) return { ...base, rejectedAiText: out, rejectionReason: reason };
    return {
      ...base,
      text: out,
      engine: 'ia',
      engineLabel: `IA locale : ${this.provider!.label}`,
      validation: validate(trimmed, out, [], [received, ...allowed]),
    };
  }

  async summarize(received: string, onToken?: (t: string) => void): Promise<string | null> {
    if (!this.aiAvailable()) return null;
    return cleanLlmOutput(await this.provider!.generate(summaryMessages(received), { onToken, maxNewTokens: 200 }));
  }

  async chat(history: ChatMessage[], context: string, onToken?: (t: string) => void): Promise<string | null> {
    if (!this.aiAvailable()) return null;
    return cleanLlmOutput(await this.provider!.generate(chatMessages(history, context), { onToken, maxNewTokens: 400 }));
  }
}
