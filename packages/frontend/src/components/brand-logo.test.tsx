import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrandLogo } from './brand-logo';

/** The file that is actually displayed, reduced to its name. */
function shownLogoFile(): string {
  const src = screen.getByRole('img', { name: 'Pecunity' }).getAttribute('src');
  return (src ?? '').split('/').pop() ?? '';
}

describe('BrandLogo', () => {
  it('shows the logo as the brand file, not as typeset letters', () => {
    render(<BrandLogo />);
    expect(shownLogoFile()).toBe('pecunity-logo-light.svg');
  });

  it('uses the variant the brand kit made for the background it sits on', () => {
    const { rerender } = render(<BrandLogo background="light" />);
    expect(shownLogoFile()).toBe('pecunity-logo-light.svg');

    rerender(<BrandLogo background="dark" />);
    expect(shownLogoFile()).toBe('pecunity-logo-dark.svg');
  });

  it('uses the mono cut where the full-color lockup would lack contrast', () => {
    const { rerender } = render(<BrandLogo tone="mono" background="light" />);
    expect(shownLogoFile()).toBe('pecunity-logo-mono-light.svg');

    rerender(<BrandLogo tone="mono" background="dark" />);
    expect(shownLogoFile()).toBe('pecunity-logo-mono-dark.svg');
  });

  it('keeps its native proportions, so sizing can never stretch it', () => {
    render(<BrandLogo className="h-5" />);
    const logo = screen.getByRole('img', { name: 'Pecunity' });
    // Height comes from the caller, width follows from the file's own ratio.
    expect(logo).toHaveStyle({ aspectRatio: '900.19 / 196.4' });
    expect(logo.className).toContain('w-auto');
  });
});
