/**
 * Garde de faits : vérifie qu'une reformulation conserve les informations critiques
 * (nombres, doses, unités, dates, heures, médicaments) et n'en ajoute pas.
 *
 * Elle est appliquée à TOUTE sortie (mode classique comme IA). Les écarts sont affichés
 * à l'utilisateur ; aucune correction automatique n'est faite sur ces données.
 */

import { findDrugs, stripAccents } from './medicalLexicon';

export type FactKind = 'dose' | 'nombre' | 'date' | 'heure' | 'médicament' | 'durée' | 'nom';

export interface Fact {
  kind: FactKind;
  /** Forme canonique utilisée pour la comparaison. */
  key: string;
  /** Forme lisible. */
  label: string;
}

export interface FactReport {
  missing: Fact[];
  added: Fact[];
  ok: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18,
  'dix-neuf': 19, vingt: 20, 'vingt et un': 21, 'vingt-deux': 22, 'vingt-trois': 23, 'vingt-quatre': 24,
  'vingt-cinq': 25, trente: 30, 'trente et un': 31, quarante: 40, cinquante: 50, soixante: 60, cent: 100,
  mille: 1000,
};

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/^(mg|milligrammes?)$/, 'mg'],
  [/^(g|grammes?|gr)$/, 'g'],
  [/^(µg|ug|mcg|microgrammes?|gamma)$/, 'µg'],
  [/^(kg|kilos?|kilogrammes?)$/, 'kg'],
  [/^(ml|millilitres?|cc)$/, 'ml'],
  [/^(l|litres?)$/, 'l'],
  [/^(ui|unites? internationales?|unites?)$/, 'ui'],
  [/^(mmol|millimoles?)$/, 'mmol'],
  [/^(meq)$/, 'meq'],
  [/^(%|pour ?cent)$/, '%'],
  [/^(cp|comprimes?|gelules?|sachets?|ampoules?|bouffees?|gouttes?)$/, 'forme'],
  [/^(jours?|j)$/, 'jour'],
  [/^(semaines?|sem)$/, 'semaine'],
  [/^(mois)$/, 'mois'],
  [/^(heures?|h)$/, 'heure'],
  [/^(minutes?|min)$/, 'minute'],
];

const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre',
  'decembre',
];

function unitOf(token: string): string | null {
  const t = stripAccents(token.toLowerCase()).replace(/\.$/, '');
  for (const [re, u] of UNIT_ALIASES) if (re.test(t)) return u;
  return null;
}

/**
 * Convertit les nombres écrits en lettres en chiffres (« sept jours » → « 7 jours »),
 * pour comparer une dictée et sa reformulation indépendamment de la graphie.
 */
export function wordsToDigits(text: string): string {
  let s = stripAccents(text.toLowerCase());
  const keys = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`(^|[^a-z-])${k.replace(/-/g, '[- ]')}(?=$|[^a-z-])`, 'g');
    s = s.replace(re, (_m, p1) => `${p1}${NUMBER_WORDS[k]}`);
  }
  return s;
}

function normNumber(n: string): string {
  const v = Number(n.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? String(v) : n;
}

/** Extrait les faits critiques d'un texte. Fonction pure. */
export function extractFacts(text: string): Fact[] {
  const facts = new Map<string, Fact>();
  const add = (f: Fact) => facts.set(`${f.kind}:${f.key}`, f);
  const s = wordsToDigits(text)
    .replace(/(\d)\s+(\d{3})(?!\d)/g, '$1$2') // « 1 000 » → « 1000 »
    .replace(/\bun(e)?\s+(?=(mg|g|ml|gramme|comprime|jour|semaine|mois|fois))/g, '1 '); // « un gramme »

  // Dates : 12/03, 12/03/2026, 12 mars, 1er avril
  for (const m of s.matchAll(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/g)) {
    add({ kind: 'date', key: `${+m[1]}/${+m[2]}${m[3] ? `/${m[3]}` : ''}`, label: m[0] });
  }
  for (const m of s.matchAll(new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?`, 'g'))) {
    const month = MONTHS.indexOf(m[2]) + 1;
    add({ kind: 'date', key: `${+m[1]}/${month}${m[3] ? `/${m[3]}` : ''}`, label: m[0] });
  }

  // Heures : 14 h 30, 14h, 14:30
  for (const m of s.matchAll(/\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?\b/g)) {
    const h = +m[1];
    if (h > 24) continue;
    add({ kind: 'heure', key: `${h}h${m[2] ?? '00'}`, label: m[0].trim() });
  }

  // Nombre + unité (doses, durées, fréquences)
  for (const m of s.matchAll(/\b(\d+(?:[.,]\d+)?)\s*([a-zµ%][a-zµ%.]*(?:\s+internationales?)?)/g)) {
    const unit = unitOf(m[2]);
    if (!unit) continue;
    const kind: FactKind = ['jour', 'semaine', 'mois', 'minute'].includes(unit) ? 'durée' : unit === 'heure' ? 'heure' : 'dose';
    if (kind === 'heure') continue; // déjà traité
    add({ kind, key: `${normNumber(m[1])} ${unit}`, label: m[0].trim() });
  }
  // « 3 fois par jour »
  for (const m of s.matchAll(/\b(\d+)\s*fois\s+par\s+(jour|semaine|mois|24\s?h)/g)) {
    add({ kind: 'dose', key: `${m[1]}x/${m[2].replace(/\s/g, '')}`, label: m[0] });
  }

  // Nombres isolés restants (hors ceux déjà couverts par une date/heure/dose)
  const covered = new Set<string>();
  for (const f of facts.values()) for (const n of f.key.match(/\d+(?:\.\d+)?/g) ?? []) covered.add(n);
  for (const m of s.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)(?![\d.,])/g)) {
    const n = normNumber(m[1]);
    if (!covered.has(n)) add({ kind: 'nombre', key: n, label: m[1] });
  }

  for (const d of findDrugs(text)) add({ kind: 'médicament', key: d, label: d });
  for (const n of properNouns(text)) add({ kind: 'nom', key: n.toLowerCase(), label: n });
  return [...facts.values()];
}

const COMMON_CAPITALIZED = new Set(
  `Bonjour Bonsoir Madame Monsieur Mesdames Messieurs Docteur Professeur Cher Chère Chers Chères Merci Cordialement Bien
  Bonne Je Nous Vous Il Elle Ils Elles On Le La Les Un Une Des Ce Cette Ces Pour Pouvez Pourriez Est Si Dans En Au Aux Et
  Mais Donc Car Comme Avec Sans Sur Par De Du Que Qui Quand Comment Pourquoi Où Votre Vos Notre Nos Mon Ma Mes Tout Tous
  Toute Toutes Salle Service Lundi Mardi Mercredi Jeudi Vendredi Samedi Dimanche Janvier Février Mars Avril Mai Juin
  Juillet Août Septembre Octobre Novembre Décembre Mme Mlle Dr Pr Bonne Excellente Belle Merci À Objet Cordialement
  Salutations Amicalement Bises Ok Oui Non Il Y Voici Voilà Ensuite Puis Enfin Concernant Suite Afin Également Aussi`.split(/\s+/),
);

/**
 * Noms propres probables : mots capitalisés hors début de phrase, ou en MAJUSCULES.
 * Sert à détecter un nom de patient, de médecin ou de lieu ajouté par un modèle.
 */
export function properNouns(text: string): string[] {
  const out = new Set<string>();
  const re = /(^|[^\p{L}'-])(\p{Lu}[\p{L}'-]{1,})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const word = m[2];
    const before = text.slice(0, m.index + m[1].length);
    const sentenceStart = /(^|[.!?…:]\s*|\n\s*|[«"]\s*)$/.test(before);
    if (COMMON_CAPITALIZED.has(word)) continue;
    if (sentenceStart && word !== word.toUpperCase()) continue;
    if (word.length < 3 || /^(CRP|INR|NFS|ECG|IRM|TP|TCA|AVC|BPCO|HTA|CHU|SAMU|UI|OK)$/.test(word)) continue;
    out.add(word.charAt(0) + word.slice(1).toLowerCase());
  }
  return [...out];
}

/**
 * Compare les faits de la source et du résultat.
 * - missing : présents dans la source, absents du résultat (information perdue ou modifiée).
 * - added   : présents dans le résultat, absents de la source (information potentiellement inventée).
 */
export function compareFacts(source: string, result: string): FactReport {
  const a = extractFacts(source);
  const b = extractFacts(result);
  const has = (list: Fact[], f: Fact) =>
    list.some((x) => x.kind === f.kind && x.key === f.key) ||
    // une dose « 1 g » peut légitimement devenir le nombre « 1 » + « g » isolé : tolérance par clé
    list.some((x) => x.key === f.key);
  const missing = a.filter((f) => !has(b, f));
  const added = b.filter((f) => !has(a, f));
  return { missing, added, ok: missing.length === 0 && added.length === 0 };
}
