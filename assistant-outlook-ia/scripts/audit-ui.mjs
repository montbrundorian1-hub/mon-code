// Audit d'interface automatisé (sans téléchargement de modèle) :
// - captures de chaque vue, largeurs de panneau 320 / 450 px, thèmes clair et sombre ;
// - accessibilité (axe-core, règles WCAG 2.1 A/AA) ;
// - débordement horizontal, cibles tactiles trop petites, textes trop petits ;
// - parcours au clavier (ordre de tabulation) ;
// - erreurs de console.
// Usage : npm run build && node scripts/audit-ui.mjs [dossier-sortie]

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const OUT = process.argv[2] ?? join(root, 'audit-results');
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(join(root, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4181, '127.0.0.1', r));

const proxy = process.env.HTTPS_PROXY;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [])],
});

const TABS = ['Dicter', 'Rédiger', 'Répondre', 'Rechercher', 'Modèles', 'Diagnostic', 'Aide'];
const report = { axe: {}, overflow: [], smallTargets: {}, smallText: {}, console: [], tabOrder: [] };

async function prepare(page, tab) {
  if (tab === 'Rédiger') {
    await page.locator('textarea[aria-label="Texte original"]').fill('euh bonjour docteur martin je vous confirme le staff de jeudi à 14 h 30 avec le dossier de la chambre 12 pouvez vous apporter la biologie');
    await page.locator('#btn-redact').click();
    await page.waitForSelector('.validation');
  }
  if (tab === 'Répondre') {
    await page.locator('#btn-analyze').click();
    await page.locator('textarea[aria-label="Intentions de réponse"]').fill('oui pour jeudi, je prépare la présentation');
    await page.locator('#btn-reply').click();
    await page.waitForSelector('textarea[aria-label="Réponse (modifiable)"]');
  }
  if (tab === 'Rechercher') {
    await page.locator('input[type=search]').fill('mails du Dr Fictif en mars');
    await page.locator('input[type=search]').press('Enter');
    await page.waitForSelector('.result');
  }
  if (tab === 'Diagnostic') await page.waitForSelector('.check');
}

for (const width of [320, 450]) {
  for (const scheme of ['light', 'dark']) {
    // bypassCSP : uniquement pour injecter l'outil d'audit axe-core (la CSP bloque tout script inline).
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme, locale: 'fr-FR', ignoreHTTPSErrors: true, bypassCSP: true });
    const page = await ctx.newPage();
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && report.console.push(`${width}/${scheme}: ${m.text().slice(0, 160)}`));
    page.on('pageerror', (e) => report.console.push(`${width}/${scheme} PAGEERROR: ${e.message.slice(0, 160)}`));
    await page.goto('http://localhost:4181/');
    await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
    await page.waitForTimeout(600);
    for (const tab of TABS) {
      await page.locator('.tab', { hasText: tab }).click();
      await page.waitForTimeout(200);
      await prepare(page, tab).catch((e) => report.console.push(`prepare ${tab}: ${e.message.slice(0, 120)}`));
      await page.waitForTimeout(250);
      const key = `${tab}-${width}-${scheme}`;
      await page.screenshot({ path: join(OUT, `${key}.png`), fullPage: true });
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = doc.scrollWidth > doc.clientWidth + 1 ? doc.scrollWidth - doc.clientWidth : 0;
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > doc.clientWidth + 1; })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
        const targets = [...document.querySelectorAll('button, a, input, select, summary, [role=tab]')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.height < 24 || r.width < 24))
          .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} « ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 25)} » ${Math.round(r.width)}×${Math.round(r.height)}`);
        const small = [...document.querySelectorAll('body *')]
          .filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.offsetParent !== null)
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${getComputedStyle(el).fontSize}`);
        return { overflow, wide, targets, small: [...new Set(small)] };
      });
      if (m.overflow) report.overflow.push(`${key}: +${m.overflow}px ${m.wide.join(', ')}`);
      if (width === 320 && scheme === 'light') {
        report.smallTargets[tab] = m.targets;
        report.smallText[tab] = m.small;
      }
      if (width === 450) {
        await page.addScriptTag({ content: AXE });
        const res = await page.evaluate(async () => {
          // eslint-disable-next-line no-undef
          const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } });
          return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
        });
        report.axe[key] = res;
      }
    }
    if (width === 450 && scheme === 'light') {
      await page.locator('.tab', { hasText: 'Dicter' }).click();
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.activeElement?.blur());
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab');
        report.tabOrder.push(await page.evaluate(() => {
          const el = document.activeElement;
          const visible = el && getComputedStyle(el).outlineStyle !== 'none';
          return `${el?.tagName.toLowerCase()} « ${(el?.getAttribute('aria-label') || el?.textContent || '').trim().slice(0, 30)} »${visible ? '' : ' [focus peu visible]'}`;
        }));
      }
    }
    await ctx.close();
  }
}
writeFileSync(join(OUT, 'audit.json'), JSON.stringify(report, null, 1));
await browser.close();
server.close();
const axeCount = Object.values(report.axe).flat().length;
console.log(`axe : ${axeCount} violation(s) (toutes vues) ; débordements : ${report.overflow.length} ; erreurs console : ${report.console.length}`);
