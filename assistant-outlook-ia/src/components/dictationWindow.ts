/**
 * Dictée dans une FENÊTRE SÉPARÉE, pour contourner proprement un panneau Outlook dont le cadre
 * n'autorise pas le micro (aucune politique n'est contournée : la fenêtre est une page de
 * premier niveau, soumise à sa propre demande d'autorisation du navigateur).
 *
 * 1. Dialog API Office (Mailbox 1.4+) : displayDialogAsync + messageParent.
 * 2. Sinon : window.open + postMessage vers la fenêtre d'origine (même origine vérifiée).
 * Le texte transite uniquement entre deux fenêtres locales de l'application.
 */

import type { AppContext } from '../ui/context';
import { toast } from '../ui/dom';

const MSG_TYPE = 'aoia:dictation-text';

function dialogUrl(): string {
  const u = new URL('./', document.baseURI);
  u.searchParams.set('mode', 'dialog');
  return u.href;
}

function receiveText(ctx: AppContext, text: string): void {
  if (typeof text !== 'string' || !text.trim()) return;
  ctx.draft.source = text.slice(0, 20000);
  ctx.navigate('rediger');
  ctx.emit('draft');
  document.dispatchEvent(new CustomEvent('aoia:generate'));
  toast('Texte reçu depuis la fenêtre de dictée.', 'ok');
}

export function openDictationWindow(ctx: AppContext): void {
  const info = ctx.host.info();
  if (info.kind === 'office' && info.dialogApi && Office.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(dialogUrl(), { height: 70, width: 35, displayInIframe: false }, (res) => {
      if (res.status !== Office.AsyncResultStatus.Succeeded) {
        toast('Impossible d’ouvrir la fenêtre de dictée (bloqueur de fenêtres ?).', 'error');
        openPopup(ctx);
        return;
      }
      const dialog = res.value;
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        const a = arg as { message?: string; origin?: string };
        if (a.origin && a.origin !== location.origin) return;
        try {
          const data = JSON.parse(a.message ?? '{}');
          if (data.type === MSG_TYPE) receiveText(ctx, data.text);
        } catch {
          /* message ignoré */
        }
        dialog.close();
      });
    });
    return;
  }
  openPopup(ctx);
}

function openPopup(ctx: AppContext): void {
  const w = window.open(dialogUrl(), 'aoia-dictation', 'popup,width=460,height=720');
  if (!w) {
    toast('Le navigateur a bloqué la fenêtre. Autorisez les fenêtres contextuelles pour ce site.', 'error', 7000);
    return;
  }
  const onMessage = (ev: MessageEvent) => {
    if (ev.origin !== location.origin || ev.source !== w) return;
    if (ev.data?.type === MSG_TYPE) {
      receiveText(ctx, ev.data.text);
      window.removeEventListener('message', onMessage);
      w.close();
    }
  };
  window.addEventListener('message', onMessage);
}

/** Côté fenêtre de dictée : renvoie le texte au panneau. */
export function sendTextToParent(text: string): boolean {
  const payload = { type: MSG_TYPE, text };
  try {
    if (typeof Office !== 'undefined' && Office.context?.ui?.messageParent) {
      Office.context.ui.messageParent(JSON.stringify(payload));
      return true;
    }
  } catch {
    /* repli */
  }
  if (window.opener) {
    (window.opener as Window).postMessage(payload, location.origin);
    return true;
  }
  return false;
}
