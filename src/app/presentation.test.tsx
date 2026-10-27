import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import SponsorBanner from './c/[token]/SponsorBanner';

const css = readFileSync('src/app/globals.css', 'utf8');
it('presents sponsors as a viewport popup with a contained vertical canvas', () => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  try {
    render(<SponsorBanner image={{bucket:'event-media',path:'org/event/banner.png',alt_text:'Sponsor canvas'}}/>);
    const dialog = screen.getByRole('dialog');
    expect(getComputedStyle(dialog.parentElement!).position).toBe('fixed');
    expect(getComputedStyle(dialog.parentElement!).inset).toBe('0px');
    expect(getComputedStyle(screen.getByAltText('Sponsor canvas')).objectFit).toBe('contain');
    expect(getComputedStyle(dialog).maxWidth).not.toBe('');
  } finally { style.remove(); }
});

it('gives course-specific tee colors a visible swatch and wraps staff navigation', () => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  try {
    const {container}=render(<><span className="tee-swatch" style={{backgroundColor:'#0000ff'}} aria-label="Tee color #0000ff"/><nav className="admin-nav"/><div className="table-scroll"/></>);
    const swatch=screen.getByLabelText('Tee color #0000ff');
    expect(getComputedStyle(swatch).display).toBe('inline-block');
    expect(getComputedStyle(swatch).width).toBe('20px');
    expect(getComputedStyle(container.querySelector('nav')!).flexWrap).toBe('wrap');
    expect(getComputedStyle(container.querySelector('.table-scroll')!).overflowX).toBe('auto');
  } finally { style.remove(); }
});
it('prints one branded sheet without navigation or print controls', () => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  try {
    const media = Array.from(style.sheet!.cssRules).find(rule =>
      rule instanceof CSSMediaRule && rule.conditionText === 'print') as CSSMediaRule | undefined;
    expect(media, 'dedicated print styles').toBeDefined();
    const rules = Array.from(media!.cssRules) as CSSStyleRule[];
    expect(rules.find(rule => rule.selectorText.includes('.no-print'))?.style.display).toBe('none');
    expect(rules.find(rule => rule.selectorText === '.print-sheet')?.style.breakInside).toBe('avoid');
    expect(rules.find(rule => rule.selectorText === '.print-shell')?.style.maxWidth).toBe('none');
  } finally { style.remove(); }
});
