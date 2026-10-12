/**
 * Onglet « Diagnostic » : compatibilité Outlook / Exchange / Edge / micro / IA locale.
 */

import { MicCapture, classifyMicError, policyAllowsMicrophone } from '../audio/micCapture';
import { runDiagnostics, technicalReport, type Check } from '../diagnostics/diagnostics';
import type { AppContext } from '../ui/context';
import { button, copyText, h, icon, replace, toast } from '../ui/dom';

const STATUS_LABEL: Record<Check['status'], string> = { ok: 'OK', warn: 'Attention', fail: 'Bloquant', info: 'Info', unknown: 'Inconnu' };

export function diagnosticView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-diagnostic' });
  const list = h('div', { class: 'list-gap', 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Analyse en cours…'));
  const micResult = h('div');
  let last: Check[] = [];

  const run = async () => {
    replace(list, h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Analyse en cours…'));
    last = await runDiagnostics(ctx.boot);
    const groups = [...new Set(last.map((c) => c.group))];
    replace(
      list,
      ...groups.map((g) =>
        h(
          'section',
          { class: 'card' },
          h('h2', {}, g),
          h(
            'ul',
            { class: 'checks' },
            ...last
              .filter((c) => c.group === g)
              .map((c) =>
                h(
                  'li',
                  { class: `check check-${c.status}` },
                  icon(c.status === 'ok' ? 'check' : c.status === 'fail' ? 'x' : c.status === 'warn' ? 'warn' : 'info'),
                  h('span', { class: 'check-label' }, c.label),
                  h('span', { class: 'check-value' }, c.value),
                  h('span', { class: 'sr-only' }, STATUS_LABEL[c.status]),
                  c.detail ? h('span', { class: 'check-detail small muted' }, c.detail) : null,
                ),
              ),
          ),
        ),
      ),
    );
  };

  // Test micro : action explicite, 3 secondes, aucune transcription, aucun enregistrement.
  const micTest = async () => {
    let peak = 0;
    const mic = new MicCapture({ onAudio: () => undefined, onLevel: (l) => (peak = Math.max(peak, l)) });
    replace(micResult, h('p', { class: 'state' }, h('span', { class: 'rec-dot' }), ' Micro ACTIF pendant 3 secondes : prononcez une phrase fictive…'));
    try {
      await mic.start();
      await new Promise((r) => setTimeout(r, 3000));
      mic.stop();
      replace(
        micResult,
        h('p', { class: peak > 0.01 ? 'state ok' : 'state warn' }, peak > 0.01 ? `Micro fonctionnel (niveau maximal ${(peak * 100).toFixed(1)} %). Micro libéré.` : 'Micro ouvert mais aucun son détecté : vérifiez le périphérique sélectionné dans Windows/Edge. Micro libéré.'),
      );
    } catch (e) {
      mic.stop();
      const err = classifyMicError(e, { policyAllowsMic: policyAllowsMicrophone() });
      replace(micResult, h('div', { class: 'alert alert-error' }, `${err.message} (type : ${err.kind})`));
    }
  };

  root.append(
    h(
      'section',
      { class: 'card' },
      h('p', { class: 'muted small' }, 'Diagnostic non intrusif : aucun message n’est lu, le micro n’est ouvert que par le bouton ci-dessous.'),
      h(
        'div',
        { class: 'row wrap' },
        button('Relancer le diagnostic', () => void run(), { icon: 'reset' }),
        button('Tester le micro (3 s)', () => void micTest(), { icon: 'mic' }),
        button(
          'Copier le rapport technique',
          async () => {
            const ok = await copyText(technicalReport(last));
            toast(ok ? 'Rapport copié (informations techniques uniquement).' : 'Copie impossible.', ok ? 'ok' : 'error');
          },
          { icon: 'copy' },
        ),
      ),
      micResult,
    ),
    list,
  );
  void run();
  return root;
}
