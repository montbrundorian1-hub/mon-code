/**
 * Barre d'insertion dans Outlook, avec repli « Copier le texte » en cas d'échec.
 * L'envoi du message reste toujours une action manuelle dans Outlook.
 */

import { addHistory } from '../security/sessionMemory';
import type { AppContext } from '../ui/context';
import { button, copyText, h, replace, toast } from '../ui/dom';

export function insertBar(ctx: AppContext, getText: () => string, kind: 'draft' | 'reply' = 'draft'): HTMLElement {
  const root = h('div', { class: 'insert-bar' });
  const feedback = h('div', { 'aria-live': 'polite' });
  const position = h('select', { 'aria-label': 'Position d’insertion' }, h('option', { value: 'cursor' }, 'au curseur'), h('option', { value: 'start' }, 'en tête du message')) as HTMLSelectElement;

  const doCopy = async () => {
    const ok = await copyText(getText());
    toast(ok ? 'Texte copié. Collez-le dans Outlook (Ctrl+V).' : 'Copie impossible : sélectionnez le texte et copiez-le manuellement.', ok ? 'ok' : 'error');
  };

  const render = () => {
    const info = ctx.host.info();
    const canInsert = info.mode === 'compose';
    const canReplyForm = info.mode === 'read';
    replace(
      root,
      h(
        'div',
        { class: 'row' },
        canInsert ? button('Insérer dans Outlook', () => void doInsert(), { kind: 'primary', icon: 'insert', id: `btn-insert-${kind}` }) : null,
        canInsert ? position : null,
        canReplyForm ? button('Ouvrir une réponse préremplie', () => void doReplyForm(), { kind: 'primary', icon: 'external' }) : null,
        button('Copier', () => void doCopy(), { icon: 'copy' }),
      ),
      !canInsert && !canReplyForm ? h('p', { class: 'muted small' }, 'Ouvrez un message (lecture) ou un brouillon (rédaction) dans Outlook pour insérer le texte.') : null,
      h('p', { class: 'muted small' }, 'Rien n’est envoyé automatiquement : relisez puis cliquez vous-même sur « Envoyer » dans Outlook.'),
      feedback,
    );
  };

  const doInsert = async () => {
    const text = getText().trim();
    if (!text) return toast('Aucun texte à insérer.', 'error');
    const r = await ctx.host.insertText(text, position.value as 'cursor' | 'start');
    if (r.ok) {
      addHistory({ kind, label: 'Inséré dans Outlook', original: '', result: text });
      toast('Texte inséré dans le brouillon. Le contenu existant et la signature sont conservés.', 'ok');
      replace(feedback);
      ctx.emit('host');
    } else {
      replace(
        feedback,
        h('div', { class: 'alert alert-error', role: 'alert' }, `Insertion impossible : ${r.error ?? 'erreur inconnue'}`, h('div', { class: 'row' }, button('Copier le texte', () => void doCopy(), { kind: 'primary', icon: 'copy' }))),
      );
    }
  };

  const doReplyForm = async () => {
    const r = await ctx.host.openReplyForm(getText());
    if (r.ok) toast('Formulaire de réponse ouvert. Vérifiez puis envoyez vous-même.', 'ok');
    else replace(feedback, h('div', { class: 'alert alert-error' }, r.error ?? 'Échec', h('div', { class: 'row' }, button('Copier le texte', () => void doCopy(), { kind: 'primary', icon: 'copy' }))));
  };

  render();
  ctx.on('host', render);
  return root;
}
