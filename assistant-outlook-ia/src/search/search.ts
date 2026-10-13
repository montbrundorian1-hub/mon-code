/**
 * Recherche en langage naturel.
 *
 * - Démonstration : recherche sur des messages FICTIFS (DemoSearchProvider), en mémoire.
 * - Dans Outlook : la question est traduite en recherche à coller dans la barre de recherche du webmail
 *   (outlookSearchQuery) ; c'est Outlook qui cherche, le panneau ne lit pas la boîte.
 * La recherche DANS le panneau sur la boîte réelle (ExchangeSearchProvider) est volontairement
 * DÉSACTIVÉE : elle exigerait des permissions étendues (ReadWriteMailbox / EWS) et l'autorisation du CHU.
 * Voir docs/ROADMAP.md et docs/COMPATIBILITY.md.
 */

import { stem } from '../ai/coverage';
import { stripAccents } from '../ai/medicalLexicon';
import type { DemoMessage } from '../mock/messages';

export interface SearchQuery {
  raw: string;
  /** Mots-clés racinisés (comparaison). */
  terms: string[];
  /** Mots-clés tels que saisis (affichage, recherche Outlook). */
  words?: string[];
  from?: string;
  to?: string;
  /** Personne présente comme expéditeur OU destinataire (« avec … »). */
  participant?: string;
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
  /** Mots-clés effectivement retrouvés (pour la mise en évidence). */
  matched: string[];
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
  'le la les un une des de du d l au aux et ou en dans par pour sur avec mes mon ma tous toutes tout les mails mail message messages courriel courriels email emails cherche chercher trouve trouver retrouve retrouver qui que quel quelle parle parlent parlant concernant sujet a propos montre affiche moi je j ai avais recu recus envoye envoyes reponse reponses repondu'.split(
    ' ',
  ),
);

/**
 * Titres et articles devant un nom, éventuellement enchaînés (« du Dr Martin », « avec le Pr Dupont »,
 * « de la pharmacie »). « pr » doit être un mot entier : « à propos » n'est pas « à Pr opos ».
 */
const TITLES = "(?:(?:(?:dr|docteur|pr|professeur|mme|madame|mlle|mademoiselle|m|monsieur|la|le)\\b\\.?|l')\\s*)+";
const TITLED = /\b(dr|docteur|pr|professeur|mme|madame|mlle|mademoiselle|monsieur|m)\b/;

/** Mots de titre : jamais des mots-clés de recherche. */
const TITLE_WORDS = new Set(['dr', 'docteur', 'pr', 'professeur', 'mme', 'madame', 'mlle', 'mademoiselle', 'monsieur']);

/**
 * Expéditeurs « génériques » reconnus même en minuscules (« mails du secrétariat ») quand la liste des
 * personnes n'est pas connue (dans Outlook, le panneau ne lit pas la boîte).
 */
export const SERVICE_SENDERS: ReadonlySet<string> = new Set(['secretariat', 'pharmacie', 'laboratoire', 'labo', 'direction', 'scolarite', 'drh', 'dsi', 'admissions', 'standard', 'accueil', 'faculte', 'decanat', 'doyen', 'doyenne']);

/** Jetons de noms de personnes/services connus (expéditeurs et destinataires), normalisés. */
export function peopleTokens(messages: DemoMessage[]): Set<string> {
  const set = new Set<string>();
  for (const m of messages) {
    for (const p of [m.from, ...m.to]) {
      for (const w of stripAccents(`${p.displayName} ${p.email.split('@')[0]}`.toLowerCase()).split(/[^a-z0-9]+/)) {
        if (w.length >= 3 && !QUERY_STOP.has(w) && w !== 'demo') set.add(w);
      }
    }
  }
  return set;
}

/**
 * Analyse une requête en français : expéditeur, destinataire, participant, dossier, période, mots-clés.
 * « de X » / « du X » ne désigne un expéditeur que si X est un nom connu, écrit avec une majuscule,
 * ou précédé d'un titre (« du Dr Fictif ») : « documents de stage » reste une recherche par mots-clés.
 */
export function parseQuery(raw: string, now: Date = new Date(), known: ReadonlySet<string> = new Set()): SearchQuery {
  // Apostrophe typographique (claviers de tablette) ; « recherche les mails… » : verbe de commande.
  const text = raw.replace(/[’‘]/g, "'");
  let s = ` ${stripAccents(text.toLowerCase())} `.replace(
    /^\s*(?:je\s+)?(?:re)?cherch(?:e|er|ez)\s+(?=(?:les?|la|l'|des|un|une|mes|mon|ma|tous|toutes|mails?|messages?|courriels?|e-?mails?)\b)/,
    ' ',
  );
  const rawTokens = stripAccents(text).match(/[A-Za-z0-9-]+/g) ?? [];
  const q: SearchQuery = { raw, terms: [] };

  // « envoyés à Martin » : mes envois ; « envoyés par Martin » : messages reçus.
  if (/\b(envoyes?(?! par\b)|que j'ai envoye|mes envois)\b/.test(s)) q.folder = 'envoyés';
  else if (/\b(recus?|qu'on m'a envoye)\b/.test(s)) q.folder = 'reçus';

  const isPerson = (word: string, titled: boolean): boolean => {
    if (titled || known.has(word)) return true;
    // Majuscule dans la saisie d'origine (« mails de Martin », « de Dupont-Moreau »).
    return rawTokens.some((t) => /^[A-Z]/.test(t) && t.toLowerCase() === word);
  };
  // Toutes les occurrences sont examinées : « documents de stage du Dr Martin » → « Martin ».
  const take = (re: RegExp, explicit: boolean): string | undefined => {
    for (const m of s.matchAll(new RegExp(re.source, 'g'))) {
      const word = m[2];
      if (!word || QUERY_STOP.has(word) || TITLE_WORDS.has(word) || MONTHS.includes(word) || word === 'propos') continue;
      if (!explicit && !isPerson(word, TITLED.test(m[1] ?? ''))) continue;
      s = s.replace(m[0], ' ');
      return word;
    }
    return undefined;
  };

  q.from =
    take(new RegExp(`\\b(?:de la part (?:de|du)|venant (?:de|du)|envoyes? par|recus? (?:de|du))\\s+(${TITLES})?([a-z][a-z-]{2,})`), true) ??
    take(new RegExp(`\\b(?:(?:de|du|des)\\s+|d')(${TITLES})?([a-z][a-z-]{2,})`), false);
  q.to = take(new RegExp(`\\b(?:a|pour|destines? a|envoyes? a)\\s+(${TITLES})?([a-z][a-z-]{2,})`), false);
  q.participant = take(new RegExp(`\\b(?:avec|echanges? avec)\\s+(${TITLES})?([a-z][a-z-]{2,})`), false);
  if (!q.from) delete q.from;
  if (!q.to) delete q.to;
  if (!q.participant) delete q.participant;

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
  // « en mars », « de mars », « au mois d'avril », « en mars 2025 » (sans année : le dernier mois écoulé de ce nom).
  const monthRe = (mo: string) => new RegExp(`\\b(?:en|au mois d'|au mois de|du mois d'|du mois de|de|d')\\s*${mo}\\b(?:\\s+(20\\d\\d)\\b)?`);
  const month = MONTHS.findIndex((mo) => monthRe(mo).test(s));
  if (month >= 0) {
    const m = s.match(monthRe(MONTHS[month]));
    const year = m?.[1] ? Number(m[1]) : month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    q.after = new Date(year, month, 1);
    q.before = new Date(year, month + 1, 1);
    s = s.replace(monthRe(MONTHS[month]), ' ');
  }
  s = s.replace(/\b(cette semaine|la semaine (derniere|passee)|ce mois-ci|ce mois|aujourd'hui|hier)\b/g, ' ');

  const words = (s.match(/[a-z0-9-]+/g) ?? []).filter((w) => w.length > 1 && !QUERY_STOP.has(w) && !TITLE_WORDS.has(w));
  const terms = new Set<string>();
  for (const w of words) {
    for (const syn of SYNONYMS[w] ?? [w]) terms.add(stem(syn));
  }
  q.terms = [...terms];
  // Mots d'origine (avec accents) pour l'affichage et la recherche dans Outlook.
  const kept = new Set(words);
  q.words = [...new Set((text.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? []).filter((t) => kept.has(stripAccents(t))))];
  return q;
}

/** Mot d'origine (accents compris) correspondant à un nom normalisé (« secretariat » → « secrétariat »). */
export function originalWord(raw: string, normalized: string): string {
  const hit = (raw.match(/[\p{L}\p{N}-]+/gu) ?? []).find((t) => stripAccents(t.toLowerCase()) === normalized);
  return hit ?? normalized;
}

const pad = (n: number) => String(n).padStart(2, '0');
const frDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
/** Date AAAA-MM-JJ : comprise quelle que soit la langue d'Outlook (pas d'ambiguïté jour/mois). */
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface OutlookSearch {
  /** Recherche avec filtres (syntaxe de recherche avancée d'Outlook : from:, to:, received:). */
  precise: string;
  /** Recherche simple (mots seulement), toujours comprise par Outlook. */
  simple: string;
  /** Conseils d'utilisation (dossier à ouvrir, dates…). */
  tips: string[];
}

/**
 * Traduit une question en recherche à coller dans la barre de recherche d'Outlook (webmail).
 * Aucune permission n'est nécessaire : le panneau ne lit pas la boîte, Outlook fait la recherche.
 */
export function outlookSearchQuery(q: SearchQuery): OutlookSearch {
  const quote = (v: string) => (/\s/.test(v) ? `"${v}"` : v);
  const words = q.words ?? q.terms;
  const from = q.from ? originalWord(q.raw, q.from) : null;
  const to = q.to ? originalWord(q.raw, q.to) : null;
  const participant = q.participant ? originalWord(q.raw, q.participant) : null;
  const precise: string[] = [];
  if (from) precise.push(`from:${quote(from)}`);
  if (to) precise.push(`to:${quote(to)}`);
  if (participant) precise.push(participant);
  precise.push(...words);
  const tips: string[] = [];
  if (q.after || q.before) {
    // « before » est exclusif : le dernier jour inclus est la veille.
    const end = q.before ? new Date(q.before.getFullYear(), q.before.getMonth(), q.before.getDate() - 1) : new Date();
    const start = q.after ?? end;
    const same = isoDate(start) === isoDate(end);
    precise.push(same ? `received:${isoDate(start)}` : `received:${isoDate(start)}..${isoDate(end)}`);
    tips.push(same ? `Période comprise : le ${frDate(start)}.` : `Période comprise : du ${frDate(start)} au ${frDate(end)}.`);
  }
  if (q.folder === 'envoyés') tips.push('Messages envoyés : dans Outlook, ouvrez « Éléments envoyés » (ou choisissez « Tous les dossiers ») avant de lancer la recherche.');
  const simple = [from, to, participant, ...words].filter(Boolean).join(' ');
  return { precise: precise.join(' ').trim(), simple: simple.trim(), tips };
}

/** Vrai si la requête contient un filtre autre que les mots-clés. */
export function hasFilters(q: SearchQuery): boolean {
  return !!(q.from || q.to || q.participant || q.folder || q.after || q.before);
}

function tokens(s: string): string[] {
  return (stripAccents(s.toLowerCase()).match(/[a-z0-9]+/g) ?? []).map(stem);
}

/** Segment d'affichage : texte simple ou mot à mettre en évidence. */
export interface HighlightPart {
  text: string;
  mark: boolean;
}

/**
 * Découpe un texte pour mettre en évidence les mots retrouvés (même règle que la recherche :
 * mot identique après racinisation, ou début de mot pour les termes d'au moins 5 lettres).
 */
export function highlightParts(text: string, matched: string[]): HighlightPart[] {
  if (!matched.length) return [{ text, mark: false }];
  const parts: HighlightPart[] = [];
  for (const piece of text.split(/([\p{L}\p{N}]+)/u)) {
    if (!piece) continue;
    const words = stripAccents(piece.toLowerCase()).match(/[a-z0-9]+/g);
    const hit = !!words && words.length === 1 && matched.some((t) => stem(words[0]) === t || (t.length >= 5 && stem(words[0]).startsWith(t)));
    const last = parts[parts.length - 1];
    if (last && last.mark === hit && !hit) last.text += piece;
    else parts.push({ text: piece, mark: hit });
  }
  return parts;
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
    if (q.participant && !fromNorm.includes(q.participant) && !toNorm.includes(q.participant)) continue;
    let score = 0;
    for (const t of q.terms) {
      const tf = toks.filter((x) => x === t || (t.length >= 5 && x.startsWith(t))).length;
      if (!tf) continue;
      const idf = Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (toks.length / avg)));
    }
    // Avec un filtre (expéditeur, dossier, période…), les mots-clés servent au classement seulement.
    if (q.terms.length && score === 0 && !hasFilters(q)) continue;
    hits.push({
      id: m.id,
      folder: m.folder,
      from: m.from.displayName,
      to: m.to.map((t) => t.displayName).join(', '),
      subject: m.subject,
      date: m.date,
      snippet: snippet(m.body, q.terms),
      score: q.terms.length ? score : 1,
      matched: q.terms.filter((t) => toks.some((x) => x === t || (t.length >= 5 && x.startsWith(t)))),
    });
  }
  return hits.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

export class DemoSearchProvider implements MailboxSearchProvider {
  readonly id = 'demo';
  readonly label = 'Démonstration (messages fictifs)';
  readonly people: Set<string>;
  constructor(private readonly messages: DemoMessage[]) {
    this.people = peopleTokens(messages);
  }
  unavailableReason(): string | null {
    return null;
  }
  search(q: SearchQuery): Promise<SearchHit[]> {
    return Promise.resolve(searchMessages(this.messages, q));
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
  search(): Promise<SearchHit[]> {
    return Promise.reject(new Error(this.unavailableReason()));
  }
}
