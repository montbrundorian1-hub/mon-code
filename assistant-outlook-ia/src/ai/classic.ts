/**
 * Mode de rédaction CLASSIQUE (sans IA générative).
 *
 * Il s'agit de règles déterministes et de modèles de courriels : nettoyage des hésitations,
 * ponctuation dictée, typographie française, structuration en formule d'appel / corps /
 * formule de politesse. Il n'invente aucun contenu et fonctionne sur tous les postes.
 * Il ne doit jamais être présenté comme une IA.
 */

import { ASR_CORRECTIONS } from './medicalLexicon';
import { resolveStyle, type StyleContext } from './style';

export interface Correction {
  from: string;
  to: string;
  note: string;
}

export interface ClassicResult {
  text: string;
  corrections: Correction[];
  notes: string[];
}

const HESITATIONS = /(^|[\s,.;:!?])(euh+|heu+|hum+|hmm+|bah|ben euh|beh|hein|mmh+)(?=$|[\s,.;:!?])/gi;
const FILLERS_END = /[,\s]*\bvoil[àa]\s*[.!]?\s*$/i;
const FILLER_VOILA = /[,\s]*\bvoil[àa](?=[\s,.]|$)\s*(?=,|\.|merci\b)/gi;
/** « Euh bonjour » est souvent transcrit « Un bon jour » par Whisper. */
const LEADING_GARBLED_GREETING = /^\s*(?:un|eh|euh|heu)\s+bon\s?jour\b/i;
const SAFE_DOUBLES = new Set(['nous', 'vous', 'que', 'on', 'si']);

/** Applique les commandes de ponctuation dictées (« virgule », « à la ligne »…). */
export function applyDictatedPunctuation(text: string): string {
  const rules: Array<[RegExp, string]> = [
    [/\s*\b(nouveau paragraphe|nouvel alinéa)\b[\s.,]*/gi, '\n\n'],
    [/\s*\bpoint à la ligne\b[\s.,]*/gi, '.\n'],
    [/\s*\b(à|a) la ligne\b[\s.,]*/gi, '\n'],
    [/\s*\bpoint d'interrogation\b/gi, ' ?'],
    [/\s*\bpoint d'exclamation\b/gi, ' !'],
    [/\s*\bpoints de suspension\b/gi, '…'],
    [/\s*\bpoint[- ]virgule\b/gi, ' ;'],
    [/\s*\bdeux[- ]points\b/gi, ' :'],
    [/\s*\bvirgule\b/gi, ','],
    [/\s*\bpoint final\b/gi, '.'],
    [/\s*\bouvrez? la parenthèse\b\s*/gi, ' ('],
    [/\s*\bfermez? la parenthèse\b/gi, ')'],
    [/\s*\bouvrez? les guillemets\b\s*/gi, ' « '],
    [/\s*\bfermez? les guillemets\b/gi, ' »'],
  ];
  let s = text;
  for (const [re, rep] of rules) s = s.replace(re, rep);
  return s;
}

export function removeHesitations(text: string): string {
  let s = text;
  s = s.replace(LEADING_GARBLED_GREETING, 'Bonjour');
  for (let i = 0; i < 3; i++) s = s.replace(HESITATIONS, '$1');
  s = s.replace(FILLER_VOILA, '.');
  s = s.replace(FILLERS_END, '.');
  return s;
}

/** Supprime les répétitions immédiates (« est est », « je je »), sauf tournures valides. */
export function removeRepetitions(text: string): string {
  return text.replace(/(?<![\p{L}'])([\p{L}']+)(?:[\s,]+\1(?![\p{L}']))+/giu, (m, w: string) =>
    SAFE_DOUBLES.has(w.toLowerCase()) ? m : w,
  );
}

export function applyAsrCorrections(text: string): { text: string; corrections: Correction[] } {
  const corrections: Correction[] = [];
  let s = text;
  for (const c of ASR_CORRECTIONS) {
    s = s.replace(c.wrong, (m, ...groups) => {
      const right = c.right.replace(/\$(\d)/g, (_x, n: string) => (typeof groups[+n - 1] === 'string' ? (groups[+n - 1] as string) : ''));
      if (m === right) return m;
      corrections.push({ from: m, to: right, note: c.note });
      return right;
    });
  }
  return { text: s, corrections };
}

const INVERSION_VERBS =
  'pouvez|pourriez|voulez|voudriez|avez|auriez|êtes|seriez|savez|sauriez|devez|devriez|pensez|connaissez|souhaitez|peux|pourrais|veux|voudrais|as|aurais|es|serais|sais|saurais|dois|penses';
// Pas de trait d'union si le sujet précède déjà le verbe (« vous pouvez vous … » : forme pronominale).
const INVERSION_RE = new RegExp(`(?<!\\b(?:vous|tu|je|il|elle|on)\\s)\\b(${INVERSION_VERBS})\\s+(vous|tu)\\b`, 'gi');
const QUESTION_START = new RegExp(
  `^(?:(?:${INVERSION_VERBS})-(?:vous|tu)|est-ce que|est-ce qu'|qu'est-ce|quand|comment|pourquoi|combien|où|quel|quelle|quels|quelles)\\b`,
  'i',
);

/** « pouvez vous » → « pouvez-vous » ; phrase interrogative terminée par « . » → « ? ». */
const POLITE_QUESTION = /(?<![.!?\n,;:])(?<!\b(?:comment|quand|où|pourquoi|combien|que|qu'|quoi|si|et|ou|^))(\s)((?:pouvez|pourriez|auriez|voulez|voudriez|sauriez|avez|peux|pourrais|aurais)-(?:vous|tu)\b)/giu;

export function fixQuestions(text: string): string {
  let s = text.replace(INVERSION_RE, '$1-$2');
  // Dictée sans ponctuation : « … chambre 12 pouvez-vous apporter … » → nouvelle phrase interrogative.
  s = s.replace(POLITE_QUESTION, (_m, sp: string, q: string) => `.${sp}${q.charAt(0).toUpperCase()}${q.slice(1)}`);
  s = s.replace(/(?<=^|[.!?]\s+|\n)([^.!?\n]+)\.(?=\s|$)/g, (m, sentence: string) =>
    QUESTION_START.test(sentence.trim()) ? `${sentence} ?` : m,
  );
  return s;
}

/** Typographie française : espaces, majuscules, ponctuation finale. */
export function normalizeTypography(text: string): string {
  let s = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\s+([,.…)])/g, '$1')
    .replace(/([,.;:!?])(?=[^\s\d»)\n])/g, '$1 ')
    .replace(/(\d)\. (\d)/g, '$1.$2')
    .replace(/(\d), (\d)/g, '$1,$2')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s*([;:!?])/g, ' $1')
    .replace(/«\s*/g, '« ')
    .replace(/\s*»/g, ' »')
    .replace(/(\d)\u00A0:(\d)/g, '$1:$2') // heures « 14:30 »
    // Espace insécable entre un nombre et son unité, et dans « 14 h 30 » (pas de coupure en fin de ligne).
    .replace(/(\d) (?=(?:h|mg|g|µg|ml|kg|l|ui|UI|mmol|%|€|cp|jours?|semaines?|mois|heures?|min)(?![\p{L}]))/gu, '$1\u00A0')
    .replace(/(\d\u00A0h) (?=\d)/g, '$1\u00A0')
    .replace(/(https?)\u00A0:/g, '$1:')
    .trim();
  // Majuscule en début de phrase et de ligne
  s = s.replace(/(^|[.!?…]\s+|\n\s*)(\p{Ll})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
  return s;
}

const TITLE_WORD = '(?:[Dd]octeur|[Dd]r\\.?|[Pp]rofesseur|[Pp]r\\.?|[Mm]adame|[Mm]onsieur|[Mm]me|[Mm]\\.|[Cc]her|[Cc]hère)';
const NAME_WORD = '[A-ZÀ-ÖØ-Þ][\\p{L}\'-]+';
/**
 * Nom dicté en minuscules après un titre (« bonjour docteur martin je… ») : un seul mot,
 * qui ne doit pas être un mot grammatical (pronom, article, préposition…).
 */
const LOWER_NAME_AFTER_TITLE =
  "(?:\\s+(?!(?:je|j'|nous|vous|tu|il|elle|on|ils|elles|le|la|les|l'|un|une|des|du|de|d'|pour|par|au|aux|et|ou|mais|merci|ce|cet|cette|ces|ça|c'|est|suite|concernant|comme|si|voici|voilà|en|à|qui|que|qu')(?![\\p{L}']))\\p{Ll}[\\p{L}'-]+)";
/**
 * Formule d'appel en tête de texte : « Bonjour », « Bonjour à tous », « Bonjour Docteur Martin »,
 * « Madame, Monsieur », « Chers collègues »… éventuellement sans ponctuation (dictée brute).
 */
const GREETING_RE = new RegExp(
  `^(?:(?:[Bb]onjour|[Bb]onsoir|[Ss]alut|[Cc]oucou)(?:\\s*,?\\s*(?:à tous et à toutes|à toutes et à tous|à tous|à toutes|à vous|tout le monde|${TITLE_WORD}(?:(?:\\s+${NAME_WORD}){1,2}|${LOWER_NAME_AFTER_TITLE})?|${NAME_WORD}(?=\\s*[,.!:\\n])))?|(?:[Mm]adame,?\\s*[Mm]onsieur|[Mm]esdames,?\\s*[Mm]essieurs|[Cc]hers collègues|[Cc]hères collègues|[Cc]hers tous|${TITLE_WORD}(?:\\s+${NAME_WORD}){0,2}(?=\\s*,)))\\s*[,.!:]?`,
  'u',
);
const CLOSING_ITEM =
  "(?:je vous remercie(?: par avance| d['’]avance| de votre [^.!?\\n]{1,40}| pour [^.!?\\n]{1,40})?|merci(?: beaucoup| d['’]avance| par avance| à (?:vous|tous)| pour [^.!?\\n]{1,40})?|cordialement|bien cordialement|bien à vous|bonne (?:journée|soirée|fin de journée|semaine|continuation)|à bientôt|salutations distinguées|bien amicalement|amicalement|bises)";
const CLOSING_RE = new RegExp(`(?:^|(?<=[.!?\\n,]\\s*))((?:${CLOSING_ITEM}\\s*[.!?,]?\\s*)+)$`, 'i');

export interface MailParts {
  greeting: string | null;
  body: string;
  closing: string | null;
}

export function splitMail(text: string): MailParts {
  let rest = text.trim();
  let greeting: string | null = null;
  let closing: string | null = null;
  const g = rest.match(GREETING_RE);
  if (g && g[0].trim().length > 0 && g[0].length < 80) {
    greeting = g[0]
      .trim()
      .replace(/[.!:,]$/, '')
      .replace(/\b[Dd]r\.?(?=\s)|\bdocteur\b/, 'Docteur')
      .replace(/\b[Pp]r\.?(?=\s)|\bprofesseur\b/, 'Professeur')
      .replace(/\b(madame|monsieur)\b/g, (t) => t.charAt(0).toUpperCase() + t.slice(1))
      .replace(/(Docteur|Professeur|Madame|Monsieur|Cher|Chère)\s+(\p{Ll})/u, (_m, t: string, c: string) => `${t} ${c.toUpperCase()}`)
      .replace(/^(bonjour|bonsoir)\s*,\s*/i, '$1 ');
    greeting = `${greeting.charAt(0).toUpperCase()}${greeting.slice(1)},`;
    rest = rest.slice(g[0].length).trim();
    rest = rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  const c = rest.match(CLOSING_RE);
  if (c && c[1].length < 160 && c.index !== undefined && c.index > 0) {
    closing = c[1].trim();
    rest = rest.slice(0, rest.length - c[1].length).trim();
  }
  return { greeting, body: rest, closing };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«(\d])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function paragraphize(body: string): string {
  const explicit = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit.join('\n\n');
  const sentences = splitSentences(body);
  if (sentences.length <= 3) return sentences.join(' ');
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(' '));
  return paras.join('\n\n');
}

/** Formules qui, seules sur leur ligne, se terminent par une virgule (« Cordialement, »). */
const COMMA_CLOSINGS =
  /^(cordialement|bien cordialement|très cordialement|bien à vous|salutations distinguées|amicalement|bien amicalement|bonne (?:journée|soirée|semaine|fin de journée|continuation)|à bientôt|bises)$/i;

/** Met en forme la formule de politesse : une formule par ligne, ponctuation finale correcte. */
export function formatClosing(closing: string): string {
  return normalizeTypography(closing)
    .split(/(?<=[.!?,])\s+|\n+/)
    .map((l) => l.trim().replace(/,$/, ''))
    .filter(Boolean)
    .map((l) => {
      if (/[!?]$/.test(l)) return l; // ponctuation expressive dictée : conservée
      const bare = l.replace(/[.…]$/, '').trim();
      if (COMMA_CLOSINGS.test(bare)) return `${bare},`;
      return /[.!?…]$/.test(l) ? l : `${l}.`;
    })
    .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
    .join('\n');
}

function ensureFinalPunctuation(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…:»)]$/.test(t) ? t : `${t}.`;
}

/**
 * Pipeline complet du mode classique : dictée brute → courriel structuré.
 */
export function classicRewrite(
  raw: string,
  style: StyleContext,
  opts: { dictatedPunctuation?: boolean; addGreeting?: boolean; addClosing?: boolean } = {},
): ClassicResult {
  const notes: string[] = [];
  let s = raw;
  if (opts.dictatedPunctuation !== false) s = applyDictatedPunctuation(s);
  s = removeHesitations(s);
  s = removeRepetitions(s);
  const corr = applyAsrCorrections(s);
  s = corr.text;
  s = normalizeTypography(fixQuestions(normalizeTypography(s)));

  const parts = splitMail(s);
  const resolved = resolveStyle(style, raw);
  const greeting = parts.greeting ?? (opts.addGreeting === false ? null : resolved.greeting);
  if (!parts.greeting && greeting) notes.push(`Formule d’appel ajoutée (${resolved.reason.toLowerCase()}).`);
  let closing = parts.closing;
  if (closing) closing = formatClosing(closing);
  if (!closing && opts.addClosing !== false) {
    closing = resolved.closing;
    notes.push('Formule de politesse ajoutée.');
  }

  const body = paragraphize(normalizeTypography(fixQuestions(ensureFinalPunctuation(parts.body))));
  const blocks = [greeting, body, closing].filter((b): b is string => !!b && b.trim().length > 0);
  const text = blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => normalizeTypography(l))
    .join('\n');
  return { text, corrections: corr.corrections, notes };
}
