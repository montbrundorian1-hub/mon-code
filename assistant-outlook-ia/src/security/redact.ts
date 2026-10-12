/**
 * Expurgation des messages d'erreur et des diagnostics.
 *
 * Objectif : pouvoir afficher ou copier une information technique sans y faire figurer
 * de contenu de mail, d'adresse, de nom ou de donnée chiffrée potentiellement clinique.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?|blob|file):\/\/[^\s'"<>)]+/g;
const LONG_NUMBER = /\b\d[\d\s.\-/]{5,}\d\b/g; // n° de téléphone, NIR, IPP, dates longues
const QUOTED = /(["«“])([^"»”]{12,})(["»”])/g; // contenu cité potentiellement issu d'un mail

export function redactText(input: unknown, maxLen = 300): string {
  let s = typeof input === 'string' ? input : input instanceof Error ? `${input.name}: ${input.message}` : String(input);
  s = s.replace(URL_RE, (u) => {
    try {
      return `<url:${new URL(u).host}>`;
    } catch {
      return '<url>';
    }
  });
  s = s.replace(EMAIL, '<adresse>');
  s = s.replace(LONG_NUMBER, '<nombre>');
  s = s.replace(QUOTED, '$1<texte>$3');
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

/**
 * Transforme une erreur Office.js en message compréhensible, sans contenu sensible.
 */
export function describeOfficeError(err: unknown): string {
  const e = err as { code?: number | string; name?: string; message?: string } | undefined;
  const code = e?.code ?? e?.name;
  const known: Record<string, string> = {
    '9041': 'Le complément ne dispose pas des droits nécessaires pour cette opération.',
    '9040': 'Le texte est trop long pour être inséré en une fois.',
    '9002': 'Erreur interne d’Outlook. Réessayez, ou copiez le texte manuellement.',
    '5001': 'Erreur interne d’Office. Réessayez.',
    '2': 'Le contenu à insérer est mal formé.',
    'InvalidSelection': 'La position du curseur n’est pas valide : cliquez dans le corps du message puis réessayez.',
    'ItemNotFound': 'Le message n’est plus disponible (fermé ou supprimé).',
    'PermissionDenied': 'Permission refusée par Outlook.',
    'GenericResponseError': 'Outlook a renvoyé une erreur générique.',
  };
  if (code != null && known[String(code)]) return known[String(code)];
  return `Erreur Outlook : ${redactText(e?.message ?? code ?? 'inconnue', 140)}`;
}
