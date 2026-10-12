/**
 * Conversion texte → HTML sûr pour l'insertion dans un brouillon Outlook.
 * Tout le texte est échappé : aucune balise fournie par l'utilisateur ou un modèle n'est interprétée.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Produit un HTML proche de celui d'Outlook Web App (une <div> par ligne, ligne vide = <div><br></div>),
 * avec les listes à puces converties en <ul>.
 */
export function textToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    out.push(line.trim() ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>');
  }
  if (inList) out.push('</ul>');
  // Ligne vide finale pour séparer le texte inséré du contenu existant (signature, message cité).
  out.push('<div><br></div>');
  return out.join('');
}

/** Extraction texte d'un HTML de courriel (pour l'analyse locale d'un message reçu). */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,head').forEach((n) => n.remove());
  doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
  doc.querySelectorAll('p,div,li,tr,h1,h2,h3').forEach((n) => n.append('\n'));
  return (doc.body.textContent ?? '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
