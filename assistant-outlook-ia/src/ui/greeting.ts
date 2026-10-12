/**
 * Petites aides d'accueil : salutation selon l'heure, prénom, initiales et teinte d'avatar.
 * Tout reste local : le nom n'est ni stocké ni transmis.
 */

const TITLES = /^(dr|pr|docteur|professeur|m|mme|mlle|mr|me)\.?$/i;

/** « Bonjour » de 5 h à 18 h, « Bonsoir » ensuite. */
export function timeGreeting(date = new Date()): string {
  const hour = date.getHours();
  return hour >= 5 && hour < 18 ? 'Bonjour' : 'Bonsoir';
}

/**
 * Prénom probable à partir d'un nom d'affichage Exchange (« NOM Prénom », « Prénom Nom », « Dr Prénom NOM »).
 * Renvoie null si le prénom n'est pas identifiable sans ambiguïté (mieux vaut « Bonjour » qu'un nom de famille).
 */
export function firstNameFrom(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const cleaned = displayName.replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[,;]/g, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !TITLES.test(t));
  if (!tokens.length) return null;
  const isUpper = (t: string) => t === t.toLocaleUpperCase('fr-FR') && /\p{L}/u.test(t);
  const isCapitalized = (t: string) => /^\p{Lu}[\p{Ll}'’-]+/u.test(t);
  const mixed = tokens.filter((t) => !isUpper(t) && isCapitalized(t));
  if (mixed.length === 0) return null;
  // « NOM Prénom » : un seul mot en casse mixte → c'est le prénom.
  if (tokens.some(isUpper)) return mixed[0];
  // « Prénom Nom » : le premier mot est le prénom (usage courant d'Exchange).
  return tokens.length >= 2 && isCapitalized(tokens[0]) ? tokens[0] : null;
}

/** Initiales pour un avatar (2 lettres max), sans les titres (Dr, Pr…). */
export function initials(name: string): string {
  const tokens = name
    .replace(/\(.*?\)/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t && !TITLES.test(t) && /\p{L}/u.test(t));
  if (!tokens.length) return '?';
  const first = tokens[0][0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1][0] : '';
  return (first + last).toLocaleUpperCase('fr-FR');
}

/** Teinte stable (0–359) dérivée du nom, pour colorer l'avatar de façon reconnaissable. */
export function avatarHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}
