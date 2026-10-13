// Vérification dans un VRAI navigateur du mode « Outlook » (Office.js simulé, aucune boîte réelle) :
// badge Outlook, onglet Rechercher (recherche préparée à coller dans le webmail), copie dans le
// presse-papiers, accessibilité (axe-core) en thèmes clair et sombre, captures.
// Office.js est remplacé, à l'adresse du CDN officiel, par une simulation minimale (message reçu fictif).
// Usage : npm run build && node scripts/check-outlook-mode.mjs [dossier-captures]

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const OUT = process.argv[2] ?? join(root, 'outlook-mode-results');
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
await new Promise((r) => server.listen(4183, '127.0.0.1', r));
const BASE = 'http://localhost:4183/';

// Simulation minimale d'Office.js : message reçu FICTIF, Mailbox 1.1 → 1.5 (Exchange 2016/2019).
const OFFICE_MOCK = `
(() => {
  const ok = (value) => ({ status: 'succeeded', value });
  const sets = ['1.1', '1.2', '1.3', '1.4', '1.5'];
  window.Office = {
    HostType: { Outlook: 'Outlook' },
    AsyncResultStatus: { Succeeded: 'succeeded', Failed: 'failed' },
    CoercionType: { Html: 'html', Text: 'text' },
    EventType: { ItemChanged: 'olkItemSelectedChanged', DialogMessageReceived: 'dialogMessageReceived' },
    onReady: () => Promise.resolve({ host: 'Outlook', platform: 'OfficeOnline' }),
    context: {
      platform: 'OfficeOnline',
      diagnostics: { hostName: 'OutlookWebApp', hostVersion: '15.2.0.0', platform: 'OfficeOnline' },
      requirements: { isSetSupported: (name, v) => name === 'Mailbox' && sets.includes(v) },
      mailbox: {
        userProfile: { displayName: 'Étudiant Démo' },
        addHandlerAsync: () => undefined,
        item: {
          itemType: 'message',
          subject: 'Sujet fictif reçu',
          from: { displayName: 'Pr EXEMPLE Bruno', emailAddress: 'b.exemple@exemple.test' },
          to: [{ displayName: 'Étudiant Démo', emailAddress: 'demo@exemple.test' }],
          body: { getTypeAsync: (cb) => cb(ok('html')), getAsync: (t, cb) => cb(ok('<div>Bonjour, message fictif de test.</div>')) },
          displayReplyForm: () => undefined,
        },
      },
      ui: {},
    },
  };
})();`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
try {
  for (const scheme of ['light', 'dark']) {
    // bypassCSP : uniquement pour injecter l'outil d'audit axe-core (la CSP bloque tout script inline).
    const context = await browser.newContext({ viewport: { width: 400, height: 900 }, locale: 'fr-FR', colorScheme: scheme, bypassCSP: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
    await context.route('https://officeapis.public.onecdn.static.microsoft/**', (r) => r.fulfill({ contentType: 'text/javascript', body: OFFICE_MOCK }));
    await context.route('https://appsforoffice.microsoft.com/**', (r) => r.abort());
    // Débordement horizontal surveillé à chaque image (un contrôle ponctuel a manqué un débord transitoire).
    await context.addInitScript(() => {
      window.__overflow = new Set();
      const probe = () => {
        const w = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > w) window.__overflow.add(`${document.documentElement.scrollWidth} px > ${w} px`);
        requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
    // « _host_Info » : paramètre ajouté par Outlook à l'adresse du panneau.
    await page.goto(`${BASE}?_host_Info=Outlook$Web$16.01$fr-FR$$$$0`);
    await page.waitForSelector('html[data-ready="true"]', { state: 'attached', timeout: 30000 });
    const welcome = page.getByRole('button', { name: 'J’ai compris' });
    if (await welcome.count()) await welcome.click();
    const badge = (await page.locator('.badges').innerText()).replace(/\s+/g, ' ');
    check(`[${scheme}] Mode Outlook détecté (Office.js simulé)`, /Outlook · lecture/.test(badge), badge);

    await page.locator('.tab', { hasText: 'Rechercher' }).click();
    const text = await page.locator('.view-rechercher').innerText();
    check(`[${scheme}] Rechercher : aucune donnée fictive affichée dans Outlook`, !/fictif/i.test(text) && /ReadWriteMailbox/.test(text));
    await page.locator('input[type=search]').fill('mails du secrétariat cette semaine');
    await page.locator('input[type=search]').press('Enter');
    await page.waitForSelector('.query-box');
    const query = (await page.locator('.query-box').innerText()).trim();
    const now = new Date();
    const expected = `from:secrétariat received:${iso(new Date(now.getTime() - 7 * 86400000))}..${iso(now)}`;
    check(`[${scheme}] Recherche préparée`, query === expected, query);
    await page.locator('#btn-copy-search').click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(`[${scheme}] Copie dans le presse-papiers`, clip === query, clip);

    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } });
      return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
    });
    check(`[${scheme}] Accessibilité (axe-core) : 0 violation`, axe.length === 0, axe.join(', '));
    await page.waitForTimeout(6500); // fin de la notification « Recherche copiée »
    const overflow = await page.evaluate(() => [...window.__overflow].join(', '));
    check(`[${scheme}] Jamais de défilement horizontal à 400 px (surveillé en continu)`, !overflow, overflow);
    check(`[${scheme}] Aucune erreur de console`, errors.length === 0, errors.join(' | '));
    // Capture lisible : en-tête « collant » remis dans le flux, page en haut.
    await page.addStyleTag({ content: '.app-header, .composer-dock { position: static !important; }' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(OUT, `${scheme}-recherche-outlook.png`), fullPage: true, animations: 'disabled' });
    await context.close();
  }
} catch (e) {
  check('Exécution du scénario', false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies. Captures : ${OUT}`);
  process.exit(failed ? 1 : 0);
}
