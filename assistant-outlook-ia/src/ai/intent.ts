/**
 * Compréhension des CONSIGNES d'écriture, sans IA (règles déterministes).
 *
 * « écris un mail au secrétariat pour dire que je serai absent demain »
 *   → destinataire « secrétariat », corps « Je vous informe que je serai absent demain. »
 *
 * Constat du test réel (2026-10-13) : le mode classique recopiait la consigne dans le mail
 * (« Bonjour, Écrire un mail au secrétariat pour… »). Ce module reconnaît les demandes courantes
 * (dire, informer, prévenir, demander, confirmer, rappeler, remercier, s'excuser, proposer…) et
 * les reformule à la première personne. Il n'ajoute aucune information : seul le contenu de la
 * consigne est repris ; les phrases qu'il ne comprend pas sont laissées telles quelles.
 */

export interface WritingIntent {
  /** Destinataire tel qu'énoncé (« secrétariat », « Dr Martin »), ou null. */
  recipient: string | null;
  /** Le destinataire est un groupe (équipe, collègues…) : « Bonjour à tous ». */
  group: boolean;
  /** Corps reformulé à la première personne (sans formule d'appel ni de politesse). */
  body: string;
  /** Contenu factuel de la consigne (sert aux vérifications de dates, doses, nombres…). */
  content: string;
  /** Ce qui a été compris, en clair (affiché à l'utilisateur). */
  summary: string;
}

const POLITE_PREFIX =
  /^(?:(?:est-ce que\s+)?(?:tu peux|tu pourrais|vous pouvez|vous pourriez|peux-tu|pourrais-tu|pouvez-vous|pourriez-vous|je voudrais que tu|j'aimerais que tu|je veux que tu|il faudrait|il faut|merci de|aide-moi à|aidez-moi à)\s+(?:me\s+|m')?)/i;
const TRAILING_POLITE = /(?:[\s,]*(?:s'il (?:te|vous) pla[iî]t|stp|svp)|\s*,\s*merci(?: beaucoup)?)\s*[.!]*\s*$/i;

const WRITE_VERB =
  "(?:écris|écrire|écrivez|écrit|rédige|rédiger|rédigez|fais|faire|faites|prépare|préparer|préparez|envoie|envoyer|envoyez|compose|composer|composez|propose|proposer|proposez|fait)(?:-(?:moi|nous|lui|leur))?";
const MAIL_NOUN = '(?:mail|e-mail|email|mél|mel|courriel|message|mot|réponse)';
const WRITE_RE = new RegExp(`^${WRITE_VERB}\\s+(?:moi\\s+|nous\\s+)?(?:un|une|le|la|ce|mon|ma)?\\s*(?:petit|petite|court|courte|bref|brève|nouveau|nouvelle)?\\s*${MAIL_NOUN}s?\\b\\s*(.*)$`, 'isu');

/** Impératifs de la consigne directe (« dis au secrétariat que… ») → infinitif. */
const IMPERATIVES: Record<string, string> = {
  dis: 'dire', dites: 'dire', préviens: 'prévenir', prévenez: 'prévenir', informe: 'informer', informez: 'informer',
  demande: 'demander', demandez: 'demander', remercie: 'remercier', remerciez: 'remercier', confirme: 'confirmer',
  confirmez: 'confirmer', rappelle: 'rappeler', rappelez: 'rappeler', signale: 'signaler', signalez: 'signaler',
  annonce: 'annoncer', annoncez: 'annoncer', réponds: 'répondre', répondez: 'répondre', souhaite: 'souhaiter',
  souhaitez: 'souhaiter', propose: 'proposer', proposez: 'proposer', invite: 'inviter', invitez: 'inviter',
  précise: 'préciser', précisez: 'préciser', félicite: 'féliciter', félicitez: 'féliciter',
};
/** Verbes dont le destinataire est complément d'objet direct (« préviens le secrétariat que… »). */
const DIRECT_OBJECT_VERBS = new Set(['prévenir', 'informer', 'remercier', 'rappeler', 'inviter', 'féliciter']);

/** Verbes de consigne reconnus (infinitif), avec leur libellé pour le résumé. */
const PURPOSE_VERBS = [
  'dire', 'informer', 'prévenir', 'demander', 'confirmer', 'rappeler', 'remercier', 'signaler', 'annoncer', 'préciser',
  'expliquer', 'proposer', 'inviter', 'souhaiter', 'féliciter', 'répondre', "m'excuser", "s'excuser", 'excuser', 'savoir',
];
const PURPOSE_RE = new RegExp(`^(?:(?:lui|leur|les|le|la|l')\\s*)?(${PURPOSE_VERBS.join('|')})\\b\\s*(.*)$`, 'isu');
const AND_PURPOSE = new RegExp(`\\s*(?:,\\s*)?\\bet\\s+(?:(?:lui|leur)\\s+)?(?=(?:${PURPOSE_VERBS.join('|')})\\b)`, 'giu');

/** Noms courants terminés comme un infinitif (« dossier », « hier »…) : ne sont pas des verbes. */
const NOT_INFINITIVE = new Set(['hier', 'dossier', 'dossiers', 'courrier', 'papier', 'papiers', 'fichier', 'premier', 'dernier', 'janvier', 'février', 'soir', 'lettre', 'chambre', 'centre', 'ordre', 'membre', 'nombre', 'numéro', 'métier', 'cahier', 'quartier', 'devoir', 'pouvoir', 'avenir', 'plaisir', 'loisir', 'couloir', 'entier', 'bloc']);
const CLITICS = "(?:(?:me|m'|te|t'|se|s'|nous|vous|lui|leur|le|la|les|l'|y|en)\\s*)*";
const INFINITIVE_RE = new RegExp(`^${CLITICS}(\\p{L}+(?:er|ir|re|oir))\\b`, 'iu');

// Pas de \b : en JavaScript, \b ignore les lettres accentuées (« équipe » ne correspondait pas).
const GROUP_RE = /(?<!\p{L})(équipe|equipe|collègues|collegues|tous|toutes|tout le monde|infirmi(?:ers|ères|eres)|internes|externes|membres|étudiants|etudiants|médecins|medecins)(?!\p{L})/iu;

function startsWithInfinitive(s: string): boolean {
  const m = s.match(INFINITIVE_RE);
  return !!m && !NOT_INFINITIVE.has(m[1].toLowerCase());
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s,:;-]+|[\s,;:-]+$/g, '').trim();
}

/** « de » → « d' » devant une voyelle ou un h muet probable. */
function de(word: string): string {
  return /^[aeiouyéèêàâîïôûh]/i.test(word) ? `d'${word}` : `de ${word}`;
}

/** Possessifs qui désignent le destinataire (« pour leur aide » → « pour votre aide »). */
function recipientPossessives(s: string): string {
  return s.replace(/\b(son|sa|leur)\b(?=\s)/gi, 'votre').replace(/\b(ses|leurs)\b(?=\s)/gi, 'vos');
}

const label: Record<string, string> = {
  dire: 'informer', informer: 'informer', prévenir: 'prévenir', demander: 'demander', confirmer: 'confirmer',
  rappeler: 'rappeler', remercier: 'remercier', signaler: 'signaler', annoncer: 'annoncer', préciser: 'préciser',
  expliquer: 'expliquer', proposer: 'proposer', inviter: 'inviter', souhaiter: 'souhaiter', féliciter: 'féliciter',
  répondre: 'répondre', excuser: "s'excuser", "m'excuser": "s'excuser", "s'excuser": "s'excuser", savoir: 'demander',
};

/** Transforme une proposition « verbe + complément » en phrase du mail, à la première personne. */
export function clauseToSentence(verbRaw: string, compRaw: string, opts: { reply?: boolean } = {}): { sentence: string; content: string; verb: string } {
  const verb = verbRaw.toLowerCase();
  const comp = clean(compRaw).replace(/\s*[.!?…]+$/, '');
  const lower = comp.toLowerCase();
  const startsQue = /^(?:que|qu')\s*/i.test(comp);
  const afterQue = comp.replace(/^(?:que|qu')\s*/i, (m) => (m.toLowerCase().startsWith("qu'") ? "qu'" : 'que '));
  const content = comp.replace(/^(?:que|qu'|de|d'|du|des|si|s'|pour|à)\s*/i, '').trim();
  const q = (s: string) => ({ sentence: `${s} ?`, content, verb });
  const st = (s: string) => ({ sentence: `${s}.`, content, verb });
  switch (verb) {
    case 'dire':
      if (/^(?:de|d')\s*/i.test(comp) && startsWithInfinitive(comp.replace(/^(?:de|d')\s*/i, ''))) return q(`Pourriez-vous ${comp.replace(/^(?:de|d')\s*/i, '')}`);
      if (startsQue) return opts.reply ? st(comp.replace(/^(?:que|qu')\s*/i, '')) : st(`Je vous informe ${afterQue}`);
      return st(comp ? `Je tenais à vous dire ${comp}` : 'Je tenais à vous écrire');
    case 'informer':
    case 'signaler':
    case 'annoncer':
    case 'préciser':
    case 'expliquer':
    case 'rappeler':
    case 'confirmer': {
      const v = { informer: 'informe', signaler: 'signale', annoncer: 'annonce', préciser: 'précise', expliquer: 'explique', rappeler: 'rappelle', confirmer: 'confirme' }[verb];
      if (verb === 'informer' && comp && !startsQue && !/^(?:de|d'|du|des)\b/i.test(comp)) return st(`Je vous informe que ${comp}`);
      return st(`Je vous ${v} ${startsQue ? afterQue : comp}`.trim());
    }
    case 'prévenir':
      if (startsQue || /^(?:de|d'|du|des)\b/i.test(comp)) return st(`Je tenais à vous prévenir ${startsQue ? afterQue : comp}`);
      return st(`Je tenais à vous prévenir que ${comp}`);
    case 'remercier': {
      const c = recipientPossessives(comp);
      if (!c) return st('Je vous remercie');
      return st(/^(?:pour|de|d'|du|des)\b/i.test(c) ? `Je vous remercie ${c}` : `Je vous remercie pour ${c}`);
    }
    case 'féliciter': {
      const c = recipientPossessives(comp);
      return st(/^(?:pour|de|d'|du|des)\b/i.test(c) ? `Je vous félicite ${c}` : `Je vous félicite pour ${c}`);
    }
    case 'excuser':
    case "m'excuser":
    case "s'excuser":
      if (!comp) return st('Je vous prie de bien vouloir m’excuser');
      return st(/^(?:pour|de|d'|du|des)\b/i.test(comp) ? `Je vous prie de bien vouloir m’excuser ${comp}` : `Je vous prie de bien vouloir m’excuser pour ${comp}`);
    case 'proposer':
      return st(`Je vous propose ${comp}`);
    case 'inviter':
      return st(`Je vous invite ${/^(?:à|au|aux)\b/i.test(comp) ? comp : `à ${comp}`}`);
    case 'souhaiter':
      return st(`Je vous souhaite ${comp}`);
    case 'répondre':
      if (startsQue) return st(opts.reply ? comp.replace(/^(?:que|qu')\s*/i, '') : `En réponse à votre message, ${comp.replace(/^(?:que|qu')\s*/i, '')}`);
      return st(comp);
    case 'savoir':
      return st(`Je souhaiterais savoir ${comp}`);
    case 'demander': {
      let m = lower.match(/^(?:s'il|si elle|s'ils|si elles|si vous)\s+(?:peut|peuvent|pourrait|pourraient|pouvez|pourriez)\s+(.+)$/);
      if (m) return q(`Pourriez-vous ${comp.slice(comp.length - m[1].length)}`);
      m = lower.match(/^(?:s'il|si elle|s'ils|si elles|si vous)\s+(?:est|sont|êtes|serait|seraient|seriez)\s+(disponibles?|libres?)(.*)$/);
      if (m) return q(`Seriez-vous ${m[1].replace(/s$/, '')}${comp.slice(comp.length - m[2].length)}`);
      if (/^(?:si|s')\b/i.test(comp) || /^s'/i.test(comp)) return q(`Pourriez-vous me dire ${comp}`);
      if (/^(?:comment|quand|où|pourquoi|combien|quel|quelle|quels|quelles|qui)\b/i.test(comp)) return q(`Pourriez-vous me dire ${comp}`);
      if (/^(?:de|d')\s*/i.test(comp) && startsWithInfinitive(comp.replace(/^(?:de|d')\s*/i, ''))) return q(`Pourriez-vous ${comp.replace(/^(?:de|d')\s*/i, '')}`);
      if (startsQue) return q(`Serait-il possible ${afterQue}`);
      if (/^(?:à|a)\s+/i.test(comp) && startsWithInfinitive(comp.replace(/^(?:à|a)\s+/i, ''))) return q(`Serait-il possible ${de(comp.replace(/^(?:à|a)\s+/i, ''))}`);
      if (/^(?:un|une|des|de|d')\b/i.test(comp)) return q(`Serait-il possible d'avoir ${comp.replace(/^(?:de|d')\s*/i, 'des ')}`.replace(/d'avoir des (?=(?:nouvelles?|autres?)\b)/i, "d'avoir de "));
      return q(`Pourriez-vous me communiquer ${comp}`);
    }
    default:
      // Autre infinitif : « pour annuler le rendez-vous » → « Je souhaite annuler le rendez-vous. »
      return st(`Je souhaite ${verb} ${comp}`.trim());
  }
}

/** Découpe « …pour dire que X et demander si Y » en propositions successives. */
function purposeClauses(text: string, reply: boolean): Array<{ sentence: string; content: string; verb: string }> {
  const parts = text.split(AND_PURPOSE).map(clean).filter(Boolean);
  const out: Array<{ sentence: string; content: string; verb: string }> = [];
  for (const part of parts) {
    const m = part.match(PURPOSE_RE);
    if (m) out.push(clauseToSentence(m[1], m[2], { reply }));
    else if (startsWithInfinitive(part)) {
      const verb = part.match(INFINITIVE_RE)![1];
      out.push(clauseToSentence(verb, part.slice(part.toLowerCase().indexOf(verb.toLowerCase()) + verb.length), { reply }));
    } else out.push({ sentence: /[.!?]$/.test(part) ? part : `${part}.`, content: part, verb: '' });
  }
  return out;
}

/**
 * Sépare « <destinataire> <connecteur> <reste> » : choisit le premier connecteur suivi d'un
 * complément plausible (« service de cardiologie de m'envoyer » → destinataire « service de cardiologie »).
 */
function splitRecipient(text: string, verb: string | null): { recipient: string; rest: string } | null {
  const re = /\s+(?=(?:que|qu'|si|s'|de|d'|pour|afin|quand|comment|où|pourquoi|combien|en lui|en leur|lui|leur)\b|[,:])/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const recipient = clean(text.slice(0, match.index));
    const rest = clean(text.slice(match.index));
    if (!recipient || recipient.split(/\s+/).length > 6) continue;
    if (/^(?:de|d')\s*/i.test(rest)) {
      const after = rest.replace(/^(?:de|d')\s*/i, '');
      // « de » n'introduit la consigne que devant un infinitif (« de m'envoyer ») ou pour remercier/s'excuser.
      if (!startsWithInfinitive(after) && !(verb && ['remercier', 'féliciter', 'prévenir', 'informer'].includes(verb))) continue;
    }
    return { recipient, rest };
  }
  return null;
}

function finalize(recipient: string | null, clauses: Array<{ sentence: string; content: string; verb: string }>): WritingIntent | null {
  if (!clauses.length) return null;
  const body = clauses.map((c) => c.sentence.charAt(0).toUpperCase() + c.sentence.slice(1)).join(' ');
  const verbs = [...new Set(clauses.map((c) => label[c.verb] ?? (c.verb ? c.verb : 'écrire')))];
  const rec = recipient ? recipient.replace(/^(?:à|au|aux|la|le|les|l')\s*/i, '').trim() : null;
  return {
    recipient: rec || null,
    group: !!rec && GROUP_RE.test(rec),
    body,
    content: clauses.map((c) => c.content).join(' '),
    summary: `${verbs.join(' + ')}${rec ? ` — destinataire : ${rec}` : ''}`,
  };
}

const SERVICE_RE = /^(?:secr[ée]tariat|secr[ée]taire|cadre|service|accueil|pharmacie|direction|bureau|standard|laboratoire|labo|unité|pôle|pole|planning|équipe|equipe|admissions?|consultations?)\b/i;

function capitalizeName(name: string): string {
  return name
    .split(/(\s+|-)/)
    .map((w) => (/^[\p{L}]/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join('');
}

/**
 * Formule d'appel adaptée au destinataire énoncé dans la consigne, et ton conseillé.
 * « Dr Martin » → « Bonjour Docteur Martin, » (formel) ; « secrétariat » → « Bonjour, » ;
 * « l'équipe » → « Bonjour à tous, » ; « Julie » → « Bonjour Julie, ».
 */
export function greetingFor(recipient: string | null): { greeting: string; formal: boolean } | null {
  if (!recipient) return null;
  const r = recipient.replace(/^(?:à|au|aux|la|le|les|l')\s*/i, '').trim();
  let m = r.match(/^(?:dr\.?|docteur)\s+(.+)$/i);
  if (m) return { greeting: `Bonjour Docteur ${capitalizeName(m[1])},`, formal: true };
  m = r.match(/^(?:pr\.?|professeur|prof\.?)\s+(.+)$/i);
  if (m) return { greeting: `Bonjour Professeur ${capitalizeName(m[1])},`, formal: true };
  m = r.match(/^(?:mme|madame)\s+(.+)$/i);
  if (m) return { greeting: `Bonjour Madame ${capitalizeName(m[1])},`, formal: true };
  m = r.match(/^(?:m\.|mr\.?|monsieur)\s+(.+)$/i);
  if (m) return { greeting: `Bonjour Monsieur ${capitalizeName(m[1])},`, formal: true };
  if (/^(?:docteur|dr|professeur|pr)$/i.test(r)) return { greeting: `Bonjour ${/^p/i.test(r) ? 'Professeur' : 'Docteur'},`, formal: true };
  if (GROUP_RE.test(r)) return { greeting: 'Bonjour à tous,', formal: false };
  if (SERVICE_RE.test(r)) return { greeting: 'Bonjour,', formal: false };
  // Prénom seul (« Julie ») : un mot, sans article.
  if (/^[\p{L}'-]+$/u.test(r) && r.length >= 2) return { greeting: `Bonjour ${capitalizeName(r)},`, formal: false };
  return { greeting: 'Bonjour,', formal: false };
}

/**
 * Reconnaît une consigne d'écriture. Renvoie null si le texte est déjà le contenu du mail
 * (dans ce cas, le mode classique se contente de le mettre en forme).
 */
export function parseWritingIntent(raw: string, opts: { reply?: boolean } = {}): WritingIntent | null {
  const reply = !!opts.reply;
  let s = raw.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  s = s.replace(POLITE_PREFIX, '').replace(TRAILING_POLITE, '').trim();
  if (!s) return null;

  // 1. « écris un mail [à X] [pour …] »
  const w = s.match(WRITE_RE);
  if (w) {
    let rest = clean(w[1]);
    if (!rest) return null;
    let recipient: string | null = null;
    const rm = rest.match(/^(?:(?:à|a)\s+(?:la\s+|l'\s*)?|au\s+|aux\s+|destinée?\s+(?:à|au|aux)\s+|pour\s+(?=(?:le|la|les|l')\s*\S+\s+(?:pour|afin|en|lui|leur)\b|(?:le|la|les|l')\s*\S+\s*[,:]))/i);
    if (rm) {
      const split = splitRecipient(rest.slice(rm[0].length), null);
      if (split) {
        recipient = split.recipient;
        rest = split.rest;
      } else {
        recipient = clean(rest.slice(rm[0].length));
        rest = '';
      }
    }
    if (!rest) {
      // « écris un mail au Dr Martin » sans objet : rien à rédiger de plus que les formules.
      return recipient ? { recipient: finalize(recipient, [{ sentence: '', content: '', verb: '' }])!.recipient, group: GROUP_RE.test(recipient), body: '', content: '', summary: `mail — destinataire : ${recipient}` } : null;
    }
    rest = rest.replace(/^[,:]\s*/, '');
    let m = rest.match(/^(?:pour|afin de|afin d')\s*(?:(?:lui|leur)\s+)?(.+)$/i);
    if (m && /^(?:que|qu')\b/i.test(m[1])) return finalize(recipient, [{ sentence: `Je vous écris afin ${m[1]}.`, content: m[1].replace(/^(?:que|qu')\s*/i, ''), verb: 'écrire' }]);
    if (m && (PURPOSE_RE.test(m[1]) || startsWithInfinitive(m[1]))) return finalize(recipient, purposeClauses(m[1], reply));
    if (m) return finalize(recipient, [{ sentence: `Je vous écris au sujet ${de(m[1]).replace(/^de le /i, 'du ').replace(/^de les /i, 'des ')}.`, content: m[1], verb: 'écrire' }]);
    m = rest.match(/^(?:en\s+(?:lui|leur)\s+disant|(?:lui|leur)\s+disant|disant|qui dit|où je dis)\s+(.+)$/i);
    if (m) return finalize(recipient, purposeClauses(`dire ${m[1]}`, reply));
    m = rest.match(/^(?:concernant|au sujet de|au sujet du|au sujet des|à propos de|à propos du|à propos des|sur)\s+(.+)$/i);
    if (m) return finalize(recipient, [{ sentence: `Je vous écris au sujet ${de(m[1]).replace(/^de le /i, 'du ').replace(/^de les /i, 'des ')}.`, content: m[1], verb: 'écrire' }]);
    if (PURPOSE_RE.test(rest)) return finalize(recipient, purposeClauses(rest, reply));
    return finalize(recipient, [{ sentence: /[.!?]$/.test(rest) ? rest : `${rest}.`, content: rest, verb: '' }]);
  }

  // 2. Consigne directe : « dis au secrétariat que… », « préviens le Dr Martin que… », « réponds-lui que… »
  const d = s.match(/^(\p{L}+)(?:-(lui|leur|moi|nous))?\s+(.+)$/iu);
  if (d) {
    const verb = IMPERATIVES[d[1].toLowerCase()];
    if (!verb) return null;
    const rest = d[3];
    if (d[2] && /^(?:lui|leur)$/i.test(d[2])) {
      // « dis-lui que… » : destinataire implicite (réponse au message ouvert)
      return /^(?:que|qu'|de|d'|si|s'|pour)\b/i.test(rest) ? finalize(null, [clauseToSentence(verb, rest, { reply })]) : null;
    }
    if (d[2]) return null; // « dis-moi », « dites-nous » : c'est déjà le contenu du mail
    let target: string | null = null;
    if (/^(?:à|a|au|aux)\s+/i.test(rest)) target = rest.replace(/^(?:à\s+(?:la\s+|l'\s*)?|a\s+|au\s+|aux\s+)/i, '');
    else if (DIRECT_OBJECT_VERBS.has(verb) && /^(?:le|la|les|l')\s*|^(?:dr|docteur|pr|professeur|madame|monsieur|mme|m\.)\b/i.test(rest)) target = rest.replace(/^(?:le|la|les|l')\s*/i, '');
    if (!target) return null;
    const split = splitRecipient(target, verb);
    if (!split) return null;
    const comp = split.rest.replace(/^,\s*/, '');
    const clauses = AND_PURPOSE.test(comp) ? purposeClauses(`${verb} ${comp}`, reply) : [clauseToSentence(verb, comp, { reply })];
    AND_PURPOSE.lastIndex = 0;
    return finalize(split.recipient, clauses);
  }
  return null;
}
