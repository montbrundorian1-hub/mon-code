/**
 * Icônes au trait (24 × 24, trait 2 px, extrémités arrondies), construites sans innerHTML.
 *
 * Tracés issus de Lucide (https://lucide.dev) — licence ISC :
 *   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
 *   All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 *   Permission to use, copy, modify, and/or distribute this software for any purpose with or without
 *   fee is hereby granted, provided that the above copyright notice and this permission notice
 *   appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
 *
 * Format compact : éléments séparés par « | » ; « p: » chemin, « c: » cercle (cx cy r),
 * « r: » rectangle (x y largeur hauteur rayon), « l: » ligne (x1 y1 x2 y2), « pl: » polyligne, « pg: » polygone.
 */

const ICONS = {
  mic: 'p:M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z|p:M19 10v2a7 7 0 0 1-14 0v-2|l:12 19 12 22',
  stop: 'r:6 6 12 12 2',
  pause: 'r:14 4 4 16 1|r:6 4 4 16 1',
  play: 'pg:6 3 20 12 6 21 6 3',
  reset: 'p:M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8|p:M3 3v5h5',
  copy: 'r:8 8 14 14 2|p:M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  'arrow-up': 'p:m5 12 7-7 7 7|p:M12 19V5',
  'arrow-right': 'p:M5 12h14|p:m12 5 7 7-7 7',
  send: 'p:M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z|p:m21.854 2.147-10.94 10.939',
  search: 'c:11 11 8|p:m21 21-4.3-4.3',
  sliders: 'l:21 4 14 4|l:10 4 3 4|l:21 12 12 12|l:8 12 3 12|l:21 20 16 20|l:12 20 3 20|l:14 2 14 6|l:8 10 8 14|l:16 18 16 22',
  activity: 'p:M22 12h-4l-3 9L9 3l-3 9H2',
  help: 'c:12 12 10|p:M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3|p:M12 17h.01',
  check: 'p:M20 6 9 17l-5-5',
  'check-circle': 'c:12 12 10|p:m9 12 2 2 4-4',
  warn: 'p:m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3|p:M12 9v4|p:M12 17h.01',
  x: 'p:M18 6 6 18|p:m6 6 12 12',
  'x-circle': 'c:12 12 10|p:m15 9-6 6|p:m9 9 6 6',
  info: 'c:12 12 10|p:M12 16v-4|p:M12 8h.01',
  undo: 'p:M9 14 4 9l5-5|p:M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11',
  chat: 'p:M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
  external: 'p:M15 3h6v6|p:M10 14 21 3|p:M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  sparkles:
    'p:M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z|p:M20 3v4|p:M22 5h-4|p:M4 17v2|p:M5 18H3',
  'new-draft': 'p:M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|p:M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z',
  pencil: 'p:M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z|p:m15 5 4 4',
  file: 'p:M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z|p:M14 2v4a2 2 0 0 0 2 2h4|p:M10 9H8|p:M16 13H8|p:M16 17H8',
  inbox: 'pl:22 12 16 12 14 15 10 15 8 12 2 12|p:M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  reply: 'pl:9 17 4 12 9 7|p:M20 18v-2a4 4 0 0 0-4-4H4',
  mail: 'r:2 4 20 16 2|p:m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7',
  'chevron-down': 'p:m6 9 6 6 6-6',
  plus: 'p:M5 12h14|p:M12 5v14',
  shield: 'p:M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z|p:m9 12 2 2 4-4',
  cpu: 'r:4 4 16 16 2|r:9 9 6 6 1|p:M15 2v2|p:M15 20v2|p:M2 15h2|p:M2 9h2|p:M20 15h2|p:M20 9h2|p:M9 2v2|p:M9 20v2',
  download: 'p:M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|pl:7 10 12 15 17 10|l:12 15 12 3',
  keyboard: 'p:M10 8h.01|p:M12 12h.01|p:M14 8h.01|p:M16 12h.01|p:M18 8h.01|p:M6 8h.01|p:M7 16h10|p:M8 12h.01|r:2 4 20 16 2',
  wave: 'p:M2 10v3|p:M6 6v11|p:M10 3v18|p:M14 8v7|p:M18 5v13|p:M22 10v3',
  lock: 'r:3 11 18 11 2|p:M7 11V7a5 5 0 0 1 10 0v4',
  trash: 'p:M3 6h18|p:M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6|p:M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
  list: 'p:M3 12h.01|p:M3 18h.01|p:M3 6h.01|p:M8 12h13|p:M8 18h13|p:M8 6h13',
  shrink: 'p:M4 14h6v6|p:M20 10h-6V4|p:m14 10 7-7|p:m3 21 7-7',
  clock: 'c:12 12 10|pl:12 6 12 12 16 14',
  user: 'c:12 8 5|p:M20 21a8 8 0 0 0-16 0',
} as const;

export type IconName = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag: string, attrs: Record<string, string>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function shape(spec: string): SVGElement {
  const i = spec.indexOf(':');
  const kind = spec.slice(0, i);
  const data = spec.slice(i + 1);
  const n = data.split(' ');
  switch (kind) {
    case 'c':
      return el('circle', { cx: n[0], cy: n[1], r: n[2] });
    case 'r':
      return el('rect', { x: n[0], y: n[1], width: n[2], height: n[3], rx: n[4] ?? '0' });
    case 'l':
      return el('line', { x1: n[0], y1: n[1], x2: n[2], y2: n[3] });
    case 'pl':
      return el('polyline', { points: data });
    case 'pg':
      return el('polygon', { points: data });
    default:
      return el('path', { d: data });
  }
}

/** Icône décorative (aria-hidden) ; `filled` remplit les formes (bouton Arrêter, lecture). */
export function icon(name: IconName, opts: { filled?: boolean; size?: number } = {}): SVGSVGElement {
  const svg = el('svg', {
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    focusable: 'false',
    fill: opts.filled ? 'currentColor' : 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }) as SVGSVGElement;
  svg.classList.add('icon', `icon-${name}`);
  if (opts.size) {
    svg.setAttribute('width', String(opts.size));
    svg.setAttribute('height', String(opts.size));
  }
  for (const part of ICONS[name].split('|')) svg.append(shape(part));
  return svg;
}
