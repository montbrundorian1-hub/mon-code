/** Avatar à initiales, teinte stable dérivée du nom (décoratif : le nom est toujours écrit à côté). */

import { h } from '../ui/dom';
import { avatarHue, initials } from '../ui/greeting';

export function avatar(name: string, small = false): HTMLElement {
  return h('span', { class: `avatar${small ? ' small' : ''}`, style: `--hue:${avatarHue(name || '?')}`, 'aria-hidden': 'true' }, initials(name || '?'));
}
