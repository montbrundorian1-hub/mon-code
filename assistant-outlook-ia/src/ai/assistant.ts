/**
 * Orchestrateur de rédaction : mode classique systématique, puis amélioration IA optionnelle,
 * puis validation (garde de faits, couverture, termes médicaux incertains).
 *
 * Interface « TextGenerationProvider » : permet de remplacer le moteur IA sans toucher à l'UI.
 */

import { applyDictatedPunctuation, classicRewrite, removeHesitations, type Correction } from './classic';
import { applyClassicCommand, type ParsedCommand } from './commands';
import { coverage } from './coverage';
import { compareFacts, extractFacts, type Fact, type FactReport } from './factGuard';
import { findUncertainMedicalTerms, type UncertainTerm } from './medicalLexicon';
import { chatMessages, cleanLlmOutput, commandMessages, polishMessages, replyMessages, summaryMessages, type ChatMessage } from './prompts';
import { greetingFor, parseWritingIntent, type WritingIntent } from './intent';
import { resolveStyle, type StyleContext } from './style';

export interface GenerationResult {
  text: string;
  /** Vrai si l'utilisateur a arrêté la génération avant la fin. */
  interrupted: boolean;
}

/** Moteur de génération de texte interchangeable (LLM local, ou futur moteur autorisé). */
export interface TextGenerationProvider {
  readonly id: string;
  readonly label: string;
  isReady(): boolean;
  generate(messages: ChatMessage[], opts?: { maxNewTokens?: number; onToken?: (t: string) => void }): Promise<GenerationResult>;
  /** Arrête la génération en cours (facultatif). */
  interrupt?(): void;
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
  /** Vrai si la génération IA a été arrêtée par l'utilisateur (version classique conservée). */
  stopped?: boolean;
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
  // Structure du sens : une question ne doit pas devenir une affirmation, ni une négation disparaître.
  if (countQuestions(aiText) < countQuestions(reference)) return 'Le modèle a transformé une question en affirmation.';
  if (countNegations(aiText) !== countNegations(reference)) return 'Le modèle a ajouté ou supprimé une négation (risque d’inversion du sens).';
  return null;
}

export function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

/**
 * Nombre de marqueurs de négation : particules « ne / n' » (une par négation verbale), « sans », « non ».
 * Une différence entre source et proposition signale un risque d'inversion du sens.
 */
export function countNegations(text: string): number {
  const t = ` ${text.toLowerCase().replace(/’/g, "'")} `;
  const particles = (t.match(/[\s(«"]n(?:e\s|')/g) ?? []).length;
  // À l'oral, le « ne » est souvent omis (« c'est pas ») : on compte aussi les mots de négation.
  const words = (t.match(/[\s(«"'](?:pas|jamais|rien|aucun|aucune|guère|nullement)(?=[\s,.;:!?)»"-])/g) ?? []).length;
  const others = (t.match(/[\s(«"](?:sans|non)(?=[\s,.;:!?)»"-])/g) ?? []).length;
  return Math.max(particles, words) + others;
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

  /** Dictée brute (ou consigne : « écris un mail au secrétariat pour dire que… ») → courriel. */
  async draftFromDictation(raw: string, rawStyle: StyleContext, opts: DraftOptions = {}): Promise<DraftOutcome> {
    const t0 = performance.now();
    const intent = understandInstruction(raw, opts.dictatedPunctuation);
    const style = intent ? styleForIntent(rawStyle, intent) : rawStyle;
    const source = intent ? intent.body : raw;
    // Vérifications : sur la consigne reformulée (les mots « écris un mail… » ne sont pas du contenu) ;
    // le destinataire nommé et la formule d'appel qui en découle sont des ajouts légitimes.
    const reference = intent ? intent.body : raw;
    const classic = classicRewrite(source, style, { dictatedPunctuation: opts.dictatedPunctuation });
    const allowed = [...style.recipients.map((r) => r.displayName), ...(intent?.recipient ? [intent.recipient] : []), ...(style.greeting ? [style.greeting] : [])];
    const notes = intent
      ? [`Consigne comprise : ${intent.summary}.`, ...(intent.body ? [] : ['Précisez le contenu du message : la consigne n’indiquait que le destinataire.']), ...classic.notes]
      : classic.notes;
    const base: DraftOutcome = {
      text: classic.text,
      engine: 'classique',
      engineLabel: 'Mode classique (règles, sans IA)',
      classicText: classic.text,
      notes,
      validation: validate(reference, classic.text, classic.corrections, allowed),
    };
    if (!opts.useAi || !this.aiAvailable()) return { ...base, ms: Math.round(performance.now() - t0) };

    const tone = TONE_HINT[resolveStyle(style, raw).formality];
    const gen = await this.provider!.generate(polishMessages(classic.text, tone), { onToken: opts.onToken, maxNewTokens: 500 });
    if (gen.interrupted) return { ...base, stopped: true, notes: [...base.notes, 'Amélioration IA arrêtée : version sans IA conservée.'], ms: Math.round(performance.now() - t0) };
    const out = cleanLlmOutput(gen.text);
    const reason = aiRejection(classic.text, out, 0.75, allowed);
    if (reason) {
      return { ...base, rejectedAiText: out, rejectionReason: reason, ms: Math.round(performance.now() - t0) };
    }
    return {
      ...base,
      text: out,
      engine: 'ia',
      engineLabel: `IA locale : ${this.provider!.label}`,
      validation: validate(reference, out, classic.corrections, allowed),
      ms: Math.round(performance.now() - t0),
    };
  }

  /** Applique une commande de modification (écrite ou vocale). */
  async applyCommand(
    text: string,
    cmd: ParsedCommand,
    opts: { useAi?: boolean; onToken?: (t: string) => void } = {},
  ): Promise<{ text: string; applied: boolean; message: string; engine: 'classique' | 'ia'; rejectedAiText?: string; stopped?: boolean }> {
    const classic = applyClassicCommand(text, cmd);
    const deterministic = ['replace', 'add', 'remove-last-sentence', 'to-list'].includes(cmd.kind);
    if (!opts.useAi || !this.aiAvailable() || (deterministic && classic.applied)) {
      return { ...classic, engine: 'classique' };
    }
    const gen = await this.provider!.generate(commandMessages(text, cmd.instruction), { onToken: opts.onToken, maxNewTokens: 600 });
    if (gen.interrupted) return { text, applied: false, message: 'Modification arrêtée : texte inchangé.', engine: 'classique', stopped: true };
    const out = cleanLlmOutput(gen.text);
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
    opts: { useAi?: boolean; onToken?: (t: string) => void; dictatedPunctuation?: boolean } = {},
  ): Promise<DraftOutcome> {
    const resolved = resolveStyle({ ...style, isReply: true }, intentions);
    const allowed = style.recipients.map((r) => r.displayName);
    // « dis-lui que je suis d'accord » → « Je suis d'accord. » (consigne reformulée, destinataire = expéditeur)
    const intent = understandInstruction(intentions, opts.dictatedPunctuation, true);
    const trimmed = (intent?.body || intentions).trim();
    const classicBody = trimmed
      ? classicRewrite(trimmed, style, { addGreeting: false, addClosing: false, dictatedPunctuation: opts.dictatedPunctuation })
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
    const gen = await this.provider!.generate(replyMessages(received, trimmed, resolved.greeting, resolved.closing), {
      onToken: opts.onToken,
      maxNewTokens: 500,
    });
    if (gen.interrupted) return { ...base, stopped: true, notes: ['Génération IA arrêtée : version sans IA conservée.'] };
    const out = cleanLlmOutput(gen.text);
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
    const gen = await this.provider!.generate(summaryMessages(received), { onToken, maxNewTokens: 200 });
    return gen.interrupted ? null : cleanLlmOutput(gen.text);
  }

  async chat(history: ChatMessage[], context: string, onToken?: (t: string) => void): Promise<string | null> {
    if (!this.aiAvailable()) return null;
    const gen = await this.provider!.generate(chatMessages(history, context), { onToken, maxNewTokens: 400 });
    return cleanLlmOutput(gen.text) || (gen.interrupted ? null : '');
  }

  /** Arrête la génération IA en cours, s'il y en a une. */
  stop(): void {
    this.provider?.interrupt?.();
  }
}

/** Reconnaît une consigne d'écriture dans une dictée (après ponctuation dictée et hésitations). */
function understandInstruction(raw: string, dictatedPunctuation: boolean | undefined, reply = false): WritingIntent | null {
  const prepared = removeHesitations(dictatedPunctuation === false ? raw : applyDictatedPunctuation(raw));
  return parseWritingIntent(prepared, { reply });
}

/** Le destinataire nommé dans la consigne (« au Dr Martin ») fixe la formule d'appel et le ton. */
function styleForIntent(style: StyleContext, intent: WritingIntent): StyleContext {
  const g = greetingFor(intent.recipient);
  if (!g) return style;
  return { ...style, greeting: g.greeting, formalHint: g.formal || undefined };
}
