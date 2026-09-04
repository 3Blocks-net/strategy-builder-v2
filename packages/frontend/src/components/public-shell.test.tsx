import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect } from 'vitest';
import { PublicShell } from './public-shell';

function shownLogoFile(): string {
  const src = screen.getByRole('img', { name: 'Pecunity' }).getAttribute('src');
  return (src ?? '').split('/').pop() ?? '';
}

describe('PublicShell', () => {
  it('carries the logo file in the header of the public pages', () => {
    render(
      <MemoryRouter>
        <PublicShell>
          <p>page</p>
        </PublicShell>
      </MemoryRouter>,
    );
    // White bar, so the variant made for light backgrounds.
    expect(shownLogoFile()).toBe('pecunity-logo-light.svg');
  });

  it('uses the mono cut on the Brand Blue band of the sign-in door', () => {
    render(
      <MemoryRouter>
        <PublicShell variant="entry" band={<p>tagline</p>}>
          <p>sign in</p>
        </PublicShell>
      </MemoryRouter>,
    );
    expect(shownLogoFile()).toBe('pecunity-logo-mono-dark.svg');
  });
});
