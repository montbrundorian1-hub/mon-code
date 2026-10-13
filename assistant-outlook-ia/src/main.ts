/**
 * Point d'entrée du panneau.
 * 1. Garde réseau (avant tout autre code).
 * 2. Nettoyage de session à la fermeture.
 * 3. Détection Outlook / démonstration, puis interface.
 */

import './styles.css';
import { ALLOWED_EXTERNAL_HOSTS } from './config';
import { installNetworkGuard } from './security/networkGuard';
import { installSessionCleanup } from './security/sessionMemory';
import { bootstrapHost } from './outlook/bootstrap';
import { AppContext } from './ui/context';
import { mountApp } from './ui/app';
import { recordCspViolation } from './diagnostics/diagnostics';

installNetworkGuard({
  selfOrigin: location.origin,
  allowedHosts: ALLOWED_EXTERNAL_HOSTS.map((h) => h.host),
  allowSameOriginWebSocket: import.meta.env.DEV,
});
installSessionCleanup();

// Les erreurs non interceptées ne doivent jamais exposer de contenu : message générique.
window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  console.warn('[assistant] opération asynchrone échouée');
});

// Journal des violations CSP : seul l'hôte bloqué est retenu (diagnostic).
document.addEventListener('securitypolicyviolation', (e) => {
  let host = e.blockedURI.slice(0, 20);
  try {
    host = new URL(e.blockedURI).host || host;
  } catch {
    /* « inline », « eval »… */
  }
  recordCspViolation(`${host} (${e.effectiveDirective})`);
  console.warn(`[CSP] ressource bloquée : ${host}`);
});

async function start(): Promise<void> {
  const root = document.getElementById('app')!;
  const dialogMode = new URLSearchParams(location.search).get('mode') === 'dialog';
  const boot = await bootstrapHost();
  const ctx = new AppContext(boot);
  mountApp(root, ctx, { dialogMode });
  document.documentElement.dataset.ready = 'true';
}

void start();
