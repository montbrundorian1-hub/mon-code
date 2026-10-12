/**
 * Adaptation du style (formules d'appel et de politesse) au destinataire et au contexte.
 * Toutes les données utilisées restent en mémoire et ne quittent jamais le poste.
 */

export type Formality = 'auto' | 'formel' | 'courant' | 'familier';

export interface Recipient {
  displayName: string;
  /** Adresse : utilisée uniquement pour distinguer interne/externe, jamais affichée ni journalisée. */
  email?: string;
}

export interface StyleContext {
  recipients: Recipient[];
  formality: Formality;
  isReply?: boolean;
}

export interface ResolvedStyle {
  formality: Exclude<Formality, 'auto'>;
  greeting: string;
  closing: string;
  reason: string;
}

const TITLE_RE = /^(dr\.?|docteur|pr\.?|professeur|prof\.?|me\.?|maître)\s+/i;

function lastName(displayName: string): string {
  // « DUPONT Jean » (format annuaire fréquent) ou « Jean Dupont »
  const cleaned = displayName.replace(TITLE_RE, '').replace(/\(.*?\)/g, '').replace(/,/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const upper = parts.find((p) => p.length > 1 && p === p.toUpperCase() && /[A-Z]/.test(p));
  const name = upper ?? parts[parts.length - 1];
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function titleOf(displayName: string): 'Docteur' | 'Professeur' | null {
  const m = displayName.trim().match(TITLE_RE);
  if (!m) return null;
  return /^p/i.test(m[1]) ? 'Professeur' : /^d/i.test(m[1]) ? 'Docteur' : null;
}

export function detectTutoiement(text: string): boolean {
  return /\b(tu|toi|ton|ta|tes|t'as|t'es)\b/i.test(text) && !/\bvous\b/i.test(text);
}

export function resolveStyle(ctx: StyleContext, text = ''): ResolvedStyle {
  const recips = ctx.recipients.filter((r) => r.displayName || r.email);
  let formality: ResolvedStyle['formality'];
  let reason: string;
  if (ctx.formality !== 'auto') {
    formality = ctx.formality;
    reason = 'Ton choisi manuellement';
  } else if (detectTutoiement(text)) {
    formality = 'familier';
    reason = 'Tutoiement détecté dans la dictée';
  } else if (recips.some((r) => titleOf(r.displayName))) {
    formality = 'formel';
    reason = 'Destinataire avec titre (Dr / Pr)';
  } else if (recips.length === 0) {
    formality = 'courant';
    reason = 'Destinataire inconnu : ton professionnel courant';
  } else {
    formality = 'courant';
    reason = 'Ton professionnel courant';
  }

  let greeting: string;
  if (recips.length > 2) {
    greeting = formality === 'formel' ? 'Madame, Monsieur,' : 'Bonjour à tous,';
  } else if (recips.length >= 1) {
    const r = recips[0];
    const t = titleOf(r.displayName);
    const ln = lastName(r.displayName);
    if (recips.length === 2) greeting = 'Bonjour,';
    else if (t && ln) greeting = `Bonjour ${t} ${ln},`;
    else if (t) greeting = `Bonjour ${t},`;
    else if (formality === 'familier') {
      const first = r.displayName.replace(TITLE_RE, '').trim().split(/\s+/)[0] ?? '';
      greeting = first && first !== first.toUpperCase() ? `Bonjour ${first},` : 'Bonjour,';
    } else greeting = 'Bonjour,';
  } else {
    greeting = formality === 'formel' ? 'Madame, Monsieur,' : 'Bonjour,';
  }

  const closing =
    formality === 'formel' ? 'Bien cordialement,' : formality === 'familier' ? 'Bonne journée,' : 'Cordialement,';
  return { formality, greeting, closing, reason };
}
