/**
 * Recherche en langage naturel.
 *
 * V1 : uniquement sur des messages FICTIFS (DemoSearchProvider), en mémoire.
 * La recherche sur la boîte réelle (ExchangeSearchProvider) est volontairement DÉSACTIVÉE :
 * elle exigerait des permissions étendues (ReadWriteMailbox / EWS) et l'autorisation du CHU.
 * Voir docs/ROADMAP.md et docs/COMPATIBILITY.md.
 */

import { stem } from '../ai/coverage';
import { stripAccents } from '../ai/medicalLexicon';
import type { DemoMessage } from '../mock/messages';

export interface SearchQuery {
  raw: string;
  terms: string[];
  from?: string;
  to?: string;
  folder?: 'reçus' | 'envoyés';
  after?: Date;
  before?: Date;
}

export interface SearchHit {
  id: string;
  folder: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  score: number;
}

export interface MailboxSearchProvider {
  readonly id: string;
  readonly label: string;
  /** Explique pourquoi le fournisseur est indisponible, ou null s'il est utilisable. */
  unavailableReason(): string | null;
  search(q: SearchQuery): Promise<SearchHit[]>;
}

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

const SYNONYMS: Record<string, string[]> = {
  rdv: ['rendez', 'vous', 'rendez-vous'],
  garde: ['garde', 'astreinte'],
  stage: ['stage', 'evaluation'],
  medicament: ['medicament', 'traitement', 'posologie'],
  bio: ['biologie'],
  staff: ['staff', 'reunion'],
  reunion: ['reunion', 'staff'],
};

const QUERY_STOP = new Set(
  'le la les un une des de du d l au aux et ou en dans par pour sur avec mes mon ma tous toutes tout les mails mail message messages courriel courriels email emails cherche chercher trouve trouver retrouve retrouver qui que quel quelle parle parlent parlant concernant sujet a propos montre affiche moi je j ai avais recu recus envoye envoyes'.split(
    ' ',
  ),
);

/** Analyse une requête en français : expéditeur, dossier, période, mots-clés. */
export function parseQuery(raw: string, now: Date = new Date()): SearchQuery {
  let s = ` ${stripAccents(raw.toLowerCase())} `;
  const q: SearchQuery = { raw, terms: [] };

  if (/\b(envoyes?|que j'ai envoye|mes envois)\b/.test(s)) q.folder = 'envoyés';
  else if (/\b(recus?|qu'on m'a envoye)\b/.test(s)) q.folder = 'reçus';

  let m = s.match(/\b(?:de la part de|de la part du|venant de|envoyes? par|de|du)\s+(?:dr\.?|docteur|pr\.?|professeur|la|le)?\s*([a-z][a-z-]{2,})/);
  if (m && !QUERY_STOP.has(m[1]) && !MONTHS.includes(m[1])) {
    q.from = m[1];
    s = s.replace(m[0], ' ');
  }
  m = s.match(/\b(?:a|pour|destines? a)\s+(?:dr\.?|docteur|pr\.?|professeur|la|le)?\s*([a-z][a-z-]{2,})/);
  if (m && !QUERY_STOP.has(m[1]) && !MONTHS.includes(m[1]) && !['propos'].includes(m[1])) {
    q.to = m[1];
    s = s.replace(m[0], ' ');
  }

  const day = 24 * 3600 * 1000;
  if (/\bcette semaine\b/.test(s)) q.after = new Date(now.getTime() - 7 * day);
  else if (/\bla semaine (derniere|passee)\b/.test(s)) {
    q.after = new Date(now.getTime() - 14 * day);
    q.before = new Date(now.getTime() - 7 * day);
  } else if (/\b(ce mois|ce mois-ci)\b/.test(s)) q.after = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (/\b(aujourd'hui)\b/.test(s)) q.after = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (/\bhier\b/.test(s)) {
    q.after = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    q.before = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const month = MONTHS.findIndex((mo) => new RegExp(`\\ben ${mo}\\b`).test(s));
  if (month >= 0) {
    const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    q.after = new Date(year, month, 1);
    q.before = new Date(year, month + 1, 1);
    s = s.replace(new RegExp(`\\ben ${MONTHS[month]}\\b`), ' ');
  }
  s = s.replace(/\b(cette semaine|la semaine (derniere|passee)|ce mois-ci|ce mois|aujourd'hui|hier)\b/g, ' ');

  const words = (s.match(/[a-z0-9-]+/g) ?? []).filter((w) => w.length > 1 && !QUERY_STOP.has(w));
  const terms = new Set<string>();
  for (const w of words) {
    for (const syn of SYNONYMS[w] ?? [w]) terms.add(stem(syn));
  }
  q.terms = [...terms];
  return q;
}

function tokens(s: string): string[] {
  return (stripAccents(s.toLowerCase()).match(/[a-z0-9]+/g) ?? []).map(stem);
}

function snippet(body: string, terms: string[]): string {
  const flat = body.replace(/\s+/g, ' ');
  const norm = stripAccents(flat.toLowerCase());
  let pos = -1;
  for (const t of terms) {
    const i = norm.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  const start = Math.max(0, pos - 50);
  return (start > 0 ? '…' : '') + flat.slice(start, start + 160) + (flat.length > start + 160 ? '…' : '');
}

/** Recherche (score de type BM25 simplifié) sur un jeu de messages en mémoire. */
export function searchMessages(messages: DemoMessage[], q: SearchQuery): SearchHit[] {
  const docs = messages.map((m) => ({ m, toks: tokens(`${m.subject} ${m.subject} ${m.body}`) }));
  const avg = docs.reduce((a, d) => a + d.toks.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const t of q.terms) df.set(t, docs.filter((d) => d.toks.includes(t)).length);
  const hits: SearchHit[] = [];
  for (const { m, toks } of docs) {
    const date = new Date(m.date);
    if (q.folder && m.folder !== q.folder) continue;
    if (q.after && date < q.after) continue;
    if (q.before && date >= q.before) continue;
    const fromNorm = stripAccents(`${m.from.displayName} ${m.from.email}`.toLowerCase());
    const toNorm = stripAccents(m.to.map((t) => `${t.displayName} ${t.email}`).join(' ').toLowerCase());
    if (q.from && !fromNorm.includes(q.from)) continue;
    if (q.to && !toNorm.includes(q.to)) continue;
    let score = 0;
    for (const t of q.terms) {
      const tf = toks.filter((x) => x === t || (t.length >= 5 && x.startsWith(t))).length;
      if (!tf) continue;
      const idf = Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (toks.length / avg)));
    }
    if (q.terms.length && score === 0) continue;
    hits.push({
      id: m.id,
      folder: m.folder,
      from: m.from.displayName,
      to: m.to.map((t) => t.displayName).join(', '),
      subject: m.subject,
      date: m.date,
      snippet: snippet(m.body, q.terms),
      score: q.terms.length ? score : 1,
    });
  }
  return hits.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

export class DemoSearchProvider implements MailboxSearchProvider {
  readonly id = 'demo';
  readonly label = 'Démonstration (messages fictifs)';
  constructor(private readonly messages: DemoMessage[]) {}
  unavailableReason(): string | null {
    return null;
  }
  async search(q: SearchQuery): Promise<SearchHit[]> {
    return searchMessages(this.messages, q);
  }
}

/**
 * Emplacement réservé à une recherche réelle sur Exchange. Volontairement non implémentée en V1.
 */
export class ExchangeSearchProvider implements MailboxSearchProvider {
  readonly id = 'exchange';
  readonly label = 'Boîte Exchange réelle';
  unavailableReason(): string {
    return 'Désactivée en V1 : nécessiterait la permission ReadWriteMailbox (EWS), une configuration serveur et une autorisation explicite du CHU.';
  }
  async search(): Promise<SearchHit[]> {
    throw new Error(this.unavailableReason());
  }
}
