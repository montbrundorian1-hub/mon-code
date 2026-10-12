/**
 * Onglet « Diagnostic » : synthèse lisible, puis détail par thème
 * (Outlook / Exchange, navigateur, micro, IA locale, sécurité).
 */

import { MicCapture, classifyMicError, policyAllowsMicrophone } from '../audio/micCapture';
import { runDiagnostics, technicalReport, type Check } from '../diagnostics/diagnostics';
import type { AppContext } from '../ui/context';
import { announce, button, copyText, h, icon, replace, toast } from '../ui/dom';

const STATUS_LABEL: Record<Check['status'], string> = { ok: 'OK', warn: 'Attention', fail: 'Bloquant', info: 'Info', unknown: 'Inconnu' };
const STATUS_ICON = { ok: 'check-circle', warn: 'warn', fail: 'x-circle', info: 'info', unknown: 'help' } as const;

export function diagnosticView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-diagnostic' });
  const summary = h('div', { class: 'diag-summary-body', 'aria-live': 'polite' });
  const list = h('div', { class: 'list-gap' });
  const micResult = h('div', { 'aria-live': 'polite' });
  let last: Check[] = [];

  const run = async () => {
    replace(summary, h('div', { class: 'diag-hero' }, h('span', { class: 'diag-icon running', 'aria-hidden': 'true' }, icon('activity')), h('div', {}, h('h3', {}, 'Analyse en cours…'), h('p', { class: 'muted small' }, 'Quelques secondes.'))));
    replace(list, h('div', { class: 'skeleton' }, h('span'), h('span'), h('span')));
    last = await runDiagnostics(ctx.boot);
    const fails = last.filter((c) => c.status === 'fail').length;
    const warns = last.filter((c) => c.status === 'warn').length;
    const oks = last.filter((c) => c.status === 'ok').length;
    const tone = fails ? 'fail' : warns ? 'warn' : 'ok';
    const title = fails ? `${fails} blocage${fails > 1 ? 's' : ''} détecté${fails > 1 ? 's' : ''}` : warns ? `${warns} point${warns > 1 ? 's' : ''} à vérifier` : 'Tout est prêt';
    replace(
      summary,
      h(
        'div',
        { class: `diag-hero diag-${tone}` },
        h('span', { class: 'diag-icon', 'aria-hidden': 'true' }, icon(STATUS_ICON[tone])),
        h('div', {}, h('h3', {}, title), h('p', { class: 'muted small' }, `${last.length} vérifications · ${oks} OK${ctx.boot.host.info().kind === 'demo' ? ' · mode démonstration' : ''}`)),
      ),
    );
    announce(`Diagnostic terminé : ${title}.`);
    const groups = [...new Set(last.map((c) => c.group))];
    replace(
      list,
      ...groups.map((g) => {
        const items = last.filter((c) => c.group === g);
        const bad = items.filter((c) => c.status === 'fail' || c.status === 'warn').length;
        return h(
          'details',
          { class: 'card diag-group', open: bad > 0 || g === 'Outlook' },
          h('summary', {}, h('span', { class: 'diag-group-title' }, g), h('span', { class: `chip ${bad ? 'chip-warn' : 'chip-ok'}` }, bad ? `${bad} à vérifier` : 'OK')),
          h(
            'ul',
            { class: 'checks' },
            ...items.map((c) =>
              h(
                'li',
                { class: `check check-${c.status}` },
                h('span', { class: 'check-icon' }, icon(STATUS_ICON[c.status])),
                h('span', { class: 'check-label' }, c.label),
                h('span', { class: 'check-value' }, c.value),
                h('span', { class: 'sr-only' }, STATUS_LABEL[c.status]),
                c.detail ? h('span', { class: 'check-detail' }, c.detail) : null,
              ),
            ),
          ),
        );
      }),
    );
  };

  // Test micro : action explicite, 3 secondes, aucune transcription, aucun enregistrement.
  const micTest = async () => {
    let peak = 0;
    const mic = new MicCapture({ onAudio: () => undefined, onLevel: (l) => (peak = Math.max(peak, l)) });
    replace(micResult, h('p', { class: 'state rec' }, h('span', { class: 'rec-dot', 'aria-hidden': 'true' }), 'Micro ACTIF pendant 3 secondes : prononcez une phrase fictive…'));
    try {
      await mic.start();
      await new Promise((r) => setTimeout(r, 3000));
      mic.stop();
      replace(
        micResult,
        h(
          'p',
          { class: peak > 0.01 ? 'state ok' : 'state warn' },
          icon(peak > 0.01 ? 'check-circle' : 'warn'),
          peak > 0.01 ? `Micro fonctionnel (niveau maximal ${(peak * 100).toFixed(1)} %). Micro libéré.` : 'Micro ouvert mais aucun son détecté : vérifiez le périphérique sélectionné dans Windows/Edge. Micro libéré.',
        ),
      );
    } catch (e) {
      mic.stop();
      const err = classifyMicError(e, { policyAllowsMic: policyAllowsMicrophone() });
      replace(micResult, h('div', { class: 'alert alert-error' }, icon('warn'), h('div', {}, `${err.message} (type : ${err.kind})`)));
    }
  };

  root.append(
    h('section', { class: 'hero compact' }, h('h2', { class: 'hero-title' }, 'Diagnostic du poste'), h('p', { class: 'hero-sub' }, 'Vérification non intrusive : aucun message n’est lu, le micro ne s’ouvre que si vous le testez.')),
    h(
      'section',
      { class: 'card diag-summary' },
      summary,
      h(
        'div',
        { class: 'row wrap' },
        button('Relancer', () => void run(), { icon: 'reset', size: 'sm' }),
        button('Tester le micro (3 s)', () => void micTest(), { icon: 'mic', size: 'sm' }),
        button(
          'Copier le rapport technique',
          async () => {
            const ok = await copyText(technicalReport(last));
            toast(ok ? 'Rapport copié (informations techniques uniquement).' : 'Copie impossible.', ok ? 'ok' : 'error');
          },
          { icon: 'copy', size: 'sm' },
        ),
      ),
      micResult,
    ),
    list,
  );
  void run();
  return root;
}
