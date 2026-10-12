/**
 * Commandes de modification (écrites ou vocales) : « plus court », « plus formel »,
 * « transforme en liste », « ajoute cette précision : … », « remplace X par Y »…
 *
 * Ce module :
 *  1. reconnaît l'intention d'une commande en langage naturel (parseCommand) ;
 *  2. applique la version CLASSIQUE (règles déterministes) quand c'est possible.
 * Le fournisseur IA, s'il est chargé, reçoit la même commande sous forme de consigne.
 */

import { normalizeTypography, splitMail } from './classic';

export type CommandKind =
  | 'shorter'
  | 'more-formal'
  | 'less-formal'
  | 'to-list'
  | 'add'
  | 'replace'
  | 'remove-last-sentence'
  | 'undo'
  | 'insert'
  | 'stop-listening'
  | 'free';

export interface ParsedCommand {
  kind: CommandKind;
  /** Texte additionnel (précision à ajouter, termes à remplacer…). */
  arg?: string;
  arg2?: string;
  /** Consigne normalisée transmise au modèle IA. */
  instruction: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.!?]+$/, '')
    .trim();

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const n = norm(raw);
  let m: RegExpMatchArray | null;

  if (/^(annule|annuler|retour en arriere|reviens? (a|en) arriere|version precedente)/.test(n)) {
    return { kind: 'undo', instruction: 'Revenir à la version précédente' };
  }
  if (/^(arrete|stop|arreter|fin)( l'?ecoute| la conversation| d'ecouter| le micro)?$/.test(n)) {
    return { kind: 'stop-listening', instruction: 'Arrêter l’écoute' };
  }
  if (/^(insere|inserer|insertion|mets? (le|ca) dans (le|mon) (mail|brouillon|message))/.test(n)) {
    return { kind: 'insert', instruction: 'Insérer dans Outlook' };
  }
  if (/(plus court|raccourci|plus concis|resume|abrege|moins long)/.test(n)) {
    return { kind: 'shorter', instruction: 'Rends ce courriel plus court et plus concis, sans perdre aucune information.' };
  }
  if (/(moins formel|plus decontracte|plus amical|plus chaleureux|moins solennel)/.test(n)) {
    return { kind: 'less-formal', instruction: 'Rends le ton un peu moins formel, tout en restant professionnel.' };
  }
  if (/(plus formel|plus soutenu|plus poli|plus professionnel|plus protocolaire)/.test(n)) {
    return { kind: 'more-formal', instruction: 'Rends le ton plus formel et plus professionnel.' };
  }
  if (/(en liste|liste a puces|sous forme de liste|en points|enumeration)/.test(n)) {
    return { kind: 'to-list', instruction: 'Transforme le corps du courriel en liste à puces.' };
  }
  if (/^(supprime|enleve|retire|efface) la derniere phrase/.test(n)) {
    return { kind: 'remove-last-sentence', instruction: 'Supprime la dernière phrase du corps du courriel.' };
  }
  if ((m = raw.match(/^(?:remplace|remplacer|change|changer)\s+[«"“]?(.+?)[»"”]?\s+par\s+[«"“]?(.+?)[»"”]?\s*\.?$/i))) {
    return {
      kind: 'replace',
      arg: m[1].trim(),
      arg2: m[2].trim(),
      instruction: `Remplace « ${m[1].trim()} » par « ${m[2].trim()} ».`,
    };
  }
  if (
    (m = raw.match(
      /^(?:ajoute|ajouter|rajoute|precise|précise|indique)\s*(?:aussi\s*)?(?:cette précision|cette precision|la précision|la precision|une phrase|que)?\s*[:,]?\s*(.+)$/i,
    ))
  ) {
    const arg = m[1].trim();
    return { kind: 'add', arg, instruction: `Ajoute cette précision, sans rien inventer d’autre : « ${arg} ».` };
  }
  return { kind: 'free', arg: raw, instruction: raw };
}

const VERBOSE_PHRASES: Array<[RegExp, string]> = [
  [/\bje (?:voulais|voudrais|souhaitais|souhaiterais) (?:vous )?(?:dire|informer|signaler|préciser) que\s+/gi, ''],
  [/\bje (?:vous )?(?:écris|écrivais) (?:pour vous dire|pour vous informer) que\s+/gi, ''],
  [/,?\s*comme vous le savez(?: peut-être)?(?: déjà)?,?\s*/gi, ' '],
  [/,?\s*en fait,?\s*/gi, ' '],
  [/,?\s*du coup,?\s*/gi, ' '],
  [/,?\s*voilà,?\s*/gi, ' '],
  [/\bde bien vouloir\s+/gi, 'de '],
  [/\bdès que possible\b/gi, 'rapidement'],
  [/\bil faudrait que vous\s+/gi, 'merci de '],
];

const FORMAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^(salut|coucou|hello)\b/i, 'Bonjour'],
  [/\b(bises|biz|bisous|à\+|a\+|à plus|@\+)\s*[.!]?$/i, 'Bien cordialement,'],
  [/^cordialement,?$/i, 'Bien cordialement,'],
  [/\bmerci\s*!/gi, 'Je vous remercie.'],
  [/\bok\b/gi, 'd’accord'],
  [/\bsuper\b/gi, 'très bien'],
  [/\bun truc\b/gi, 'un élément'],
];

const INFORMAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^madame,? monsieur,?$/i, 'Bonjour,'],
  [/^bien cordialement,?$/i, 'Bonne journée,'],
  [/^cordialement,?$/i, 'Bonne journée,'],
  [/\bje vous prie d'agréer[^.]*\./gi, ''],
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function rebuild(greeting: string | null, body: string, closing: string | null): string {
  return [greeting, body.trim(), closing]
    .filter((b): b is string => !!b && b.trim().length > 0)
    .join('\n\n');
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface CommandResult {
  text: string;
  applied: boolean;
  message: string;
}

/** Application déterministe (mode classique). */
export function applyClassicCommand(text: string, cmd: ParsedCommand): CommandResult {
  const { greeting, body, closing } = splitMail(text);
  switch (cmd.kind) {
    case 'shorter': {
      let b = body;
      for (const [re, rep] of VERBOSE_PHRASES) b = b.replace(re, rep);
      b = b
        .split('\n')
        .map((l) => normalizeTypography(capitalizeFirst(l.replace(/\s{2,}/g, ' ').trim())))
        .join('\n');
      const changed = b !== body;
      return {
        text: rebuild(greeting, b, closing),
        applied: changed,
        message: changed
          ? 'Formules superflues retirées (mode classique : raccourcissement limité).'
          : 'Aucune formule superflue détectée. Le mode classique ne résume pas le contenu.',
      };
    }
    case 'more-formal':
    case 'less-formal': {
      const table = cmd.kind === 'more-formal' ? FORMAL_REPLACEMENTS : INFORMAL_REPLACEMENTS;
      const apply = (s: string | null) => {
        if (!s) return s;
        let out = s;
        for (const [re, rep] of table) out = out.replace(re, rep);
        return out;
      };
      const out = rebuild(apply(greeting), apply(body) ?? '', apply(closing));
      const tutoiement = /\b(tu|toi|ton|ta|tes)\b/i.test(body) && cmd.kind === 'more-formal';
      return {
        text: out,
        applied: out !== text,
        message:
          (out !== text ? 'Formules ajustées.' : 'Aucune formule à ajuster.') +
          (tutoiement ? ' Tutoiement détecté : la conversion au vouvoiement n’est pas automatique en mode classique.' : ''),
      };
    }
    case 'to-list': {
      const items = sentences(body.replace(/\n+/g, ' '));
      const bullets: string[] = [];
      for (const s of items) {
        // Une énumération « a, b et c » dans une phrase devient plusieurs puces.
        const m = s.match(/^(.*?:)\s*(.+)$/) ?? s.match(/^(.*?\b(?:il faut|prévoir|nous avons besoin de|merci de prévoir))\s+(.+)$/i);
        if (m && /,| et /.test(m[2])) {
          bullets.push(m[1].trim().replace(/[:,]?$/, ' :'));
          for (const part of m[2].replace(/[.!]$/, '').split(/,\s*|\s+et\s+/)) {
            if (part.trim()) bullets.push(`- ${capitalizeFirst(part.trim())}`);
          }
        } else {
          bullets.push(`- ${s}`);
        }
      }
      return { text: rebuild(greeting, bullets.join('\n'), closing), applied: true, message: 'Corps transformé en liste.' };
    }
    case 'add': {
      const extra = normalizeTypography(capitalizeFirst((cmd.arg ?? '').trim()));
      if (!extra) return { text, applied: false, message: 'Aucune précision fournie.' };
      const withDot = /[.!?…]$/.test(extra) ? extra : `${extra}.`;
      return { text: rebuild(greeting, `${body.trim()}\n\n${withDot}`, closing), applied: true, message: 'Précision ajoutée en fin de message.' };
    }
    case 'replace': {
      if (!cmd.arg || !cmd.arg2) return { text, applied: false, message: 'Commande incomplète.' };
      const esc = cmd.arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, 'gi');
      if (!re.test(text)) return { text, applied: false, message: `« ${cmd.arg} » introuvable dans le texte.` };
      return { text: text.replace(re, cmd.arg2), applied: true, message: 'Remplacement effectué.' };
    }
    case 'remove-last-sentence': {
      const s = sentences(body);
      if (!s.length) return { text, applied: false, message: 'Aucune phrase à supprimer.' };
      s.pop();
      return { text: rebuild(greeting, s.join(' '), closing), applied: true, message: 'Dernière phrase supprimée.' };
    }
    default:
      return {
        text,
        applied: false,
        message:
          'Cette consigne nécessite un modèle IA local. En mode classique, utilisez : « plus court », « plus formel », « moins formel », « transforme en liste », « ajoute : … », « remplace X par Y », « supprime la dernière phrase », « annule ».',
      };
  }
}
