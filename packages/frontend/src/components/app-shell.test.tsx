import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('@/providers/auth-context', () => ({
  useAuth: () => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    logout: vi.fn(),
  }),
}));

describe('AppShell', () => {
  it('carries the logo file in the header, linking home', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>page</p>
        </AppShell>
      </MemoryRouter>,
    );

    const logo = screen.getByRole('img', { name: 'Pecunity' });
    // White bar, so the variant made for light backgrounds.
    expect(logo.getAttribute('src')).toMatch(/pecunity-logo-light\.svg$/);
    expect(logo.closest('a')).toHaveAttribute('href', '/dashboard');
  });
});
