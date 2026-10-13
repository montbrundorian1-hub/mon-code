// Refonte de l'interface (audit n°2) : briques d'interface, accueil personnalisé, mise en évidence.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { composer } from '../src/components/composer';
import { segmented } from '../src/components/segmented';
import { highlightParts } from '../src/search/search';
import { announce, iconButton, switchControl } from '../src/ui/dom';
import { avatarHue, firstNameFrom, initials, timeGreeting } from '../src/ui/greeting';
import { icon } from '../src/ui/icons';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('Accueil personnalisé (salutation locale)', () => {
  it('« Bonjour » en journée, « Bonsoir » le soir et la nuit', () => {
    expect(timeGreeting(new Date('2026-10-12T09:00:00'))).toBe('Bonjour');
    expect(timeGreeting(new Date('2026-10-12T17:59:00'))).toBe('Bonjour');
    expect(timeGreeting(new Date('2026-10-12T18:00:00'))).toBe('Bonsoir');
    expect(timeGreeting(new Date('2026-10-12T04:30:00'))).toBe('Bonsoir');
  });

  it('prénom extrait des formats Exchange courants, sinon rien', () => {
    expect(firstNameFrom('MARTIN Camille')).toBe('Camille');
    expect(firstNameFrom('Camille Martin')).toBe('Camille');
    expect(firstNameFrom('Dr Alice FICTIF')).toBe('Alice');
    expect(firstNameFrom('FICTIF')).toBeNull();
    expect(firstNameFrom('martin')).toBeNull();
    expect(firstNameFrom('')).toBeNull();
    expect(firstNameFrom(null)).toBeNull();
  });

  it('initiales et teinte d’avatar stables', () => {
    expect(initials('Dr FICTIF Alice')).toBe('FA');
    expect(initials('Pharmacie (démo)')).toBe('P');
    expect(initials('')).toBe('?');
    const hue = avatarHue('Secrétariat Pédagogique');
    expect(hue).toBe(avatarHue('Secrétariat Pédagogique'));
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});

describe('Mise en évidence des mots retrouvés (recherche)', () => {
  it('même règle que la recherche : racine, accents, début de mot', () => {
    const parts = highlightParts('Posologie de l’amoxicilline : rupture ; Amoxicilline buvable.', ['amoxicillin']);
    expect(parts.filter((p) => p.mark).map((p) => p.text)).toEqual(['amoxicilline', 'Amoxicilline']);
    expect(parts.map((p) => p.text).join('')).toBe('Posologie de l’amoxicilline : rupture ; Amoxicilline buvable.');
    expect(highlightParts('Réunion du staff', ['reunion', 'staff']).filter((p) => p.mark).map((p) => p.text)).toEqual(['Réunion', 'staff']);
  });

  it('sans mot retrouvé : texte intact', () => {
    expect(highlightParts('Planning des gardes', [])).toEqual([{ text: 'Planning des gardes', mark: false }]);
  });
});

describe('Zone de saisie façon messagerie', () => {
  const make = (extra: Partial<Parameters<typeof composer>[0]> = {}) => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    const c = composer({ placeholder: 'x', ariaLabel: 'Saisie', sendLabel: 'Envoyer', onSubmit, onStop, ...extra });
    document.body.append(c.root);
    const send = c.root.querySelector<HTMLButtonElement>('.send-btn')!;
    return { c, onSubmit, onStop, send };
  };
  const key = (el: HTMLElement, init: KeyboardEventInit) => el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

  it('Entrée envoie, Maj+Entrée va à la ligne, Ctrl+Entrée envoie', () => {
    const { c, onSubmit } = make();
    c.textarea.value = 'bonjour';
    key(c.textarea, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    key(c.textarea, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('bonjour');
    key(c.textarea, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('texte vide : rien n’est envoyé, le bouton est signalé indisponible', () => {
    const { onSubmit, send } = make();
    expect(send.getAttribute('aria-disabled')).toBe('true');
    send.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('pendant un calcul, le bouton devient « Arrêter » et arrête le calcul', () => {
    const { c, onSubmit, onStop, send } = make();
    c.setBusy(true);
    expect(send.getAttribute('aria-label')).toBe('Arrêter');
    c.textarea.value = 'consigne';
    send.click();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    c.setBusy(false);
    expect(send.getAttribute('aria-label')).toBe('Envoyer');
  });

  it('changement de mode : libellés accessibles mis à jour', () => {
    const { c, send } = make();
    c.setMode({ placeholder: 'Une modification ?', ariaLabel: 'Consigne de modification', sendLabel: 'Appliquer la consigne' });
    expect(c.textarea.getAttribute('aria-label')).toBe('Consigne de modification');
    expect(send.getAttribute('aria-label')).toBe('Appliquer la consigne');
  });
});

describe('Briques accessibles', () => {
  it('sélecteur segmenté : onglets, état sélectionné et flèches du clavier', () => {
    const onChange = vi.fn();
    const el = segmented(
      [
        ['a', 'Premier'],
        ['b', 'Deuxième'],
        ['c', 'Troisième'],
      ] as const,
      'a',
      onChange,
      { label: 'Test' },
    );
    document.body.append(el);
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(el.getAttribute('role')).toBe('tablist');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith('c');
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('interrupteur : rôle « switch » et rappel', () => {
    const onChange = vi.fn();
    const sw = switchControl('Ponctuation dictée', true, onChange, { hint: 'aide' });
    document.body.append(sw);
    expect(sw.input.getAttribute('role')).toBe('switch');
    expect(sw.input.checked).toBe(true);
    sw.input.click();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('bouton icône : libellé accessible et info-bulle', () => {
    const b = iconButton('Copier le mail', 'copy', () => undefined);
    expect(b.getAttribute('aria-label')).toBe('Copier le mail');
    expect(b.title).toBe('Copier le mail');
    expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('icônes construites sans HTML injecté', () => {
    const svg = icon('mic');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('path, line, rect, circle').length).toBeGreaterThan(1);
    expect(icon('stop', { filled: true }).getAttribute('fill')).toBe('currentColor');
  });

  it('annonces pour lecteurs d’écran dans une zone « live » invisible', () => {
    vi.useFakeTimers();
    announce('Mail rédigé.');
    vi.advanceTimersByTime(50);
    const region = document.querySelector('[role="status"][aria-live="polite"]');
    expect(region?.classList.contains('sr-only')).toBe(true);
    expect(region?.textContent).toBe('Mail rédigé.');
  });
});
