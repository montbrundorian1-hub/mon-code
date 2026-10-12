/**
 * Analyse LOCALE et déterministe d'un message reçu : questions posées, demandes d'action,
 * dates et heures mentionnées. Aucune interprétation clinique.
 */

import { extractFacts } from './factGuard';

export interface MailAnalysis {
  questions: string[];
  requests: string[];
  dates: string[];
  signatureName: string | null;
}

const REQUEST_RE = /\b(merci de|pourriez-vous|pouvez-vous|pourrais-tu|peux-tu|veuillez|je vous prie de|il faudrait|n'oubliez pas|à faire|avant le|d'ici)\b/i;

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' \n ')
    .split(/(?<=[.!?])\s+|\s*\n\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

export function analyzeMail(body: string): MailAnalysis {
  const sents = sentences(body);
  const questions = sents.filter((s) => s.endsWith('?'));
  const requests = sents.filter((s) => !s.endsWith('?') && REQUEST_RE.test(s));
  const dates = extractFacts(body)
    .filter((f) => f.kind === 'date' || f.kind === 'heure')
    .map((f) => f.label);
  const lines = body.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? '';
  const signatureName = last.length < 40 && !/[.?!:]$/.test(last) && /\p{Lu}/u.test(last) ? last : null;
  return { questions, requests, dates: [...new Set(dates)], signatureName };
}

/**
 * Proposition automatique SANS IA : accusé de réception + un emplacement « [à compléter] »
 * par question ou demande détectée. Aucune réponse n'est inventée.
 */
export function autoReplySkeleton(a: MailAnalysis): string {
  const parts: string[] = ['Merci pour votre message.'];
  const items = [...a.questions, ...a.requests].slice(0, 5);
  for (const q of items) {
    const short = q.length > 90 ? `${q.slice(0, 87)}…` : q;
    parts.push(`Concernant « ${short} » : [à compléter].`);
  }
  if (!items.length) parts.push('[à compléter]');
  return parts.join('\n\n');
}
