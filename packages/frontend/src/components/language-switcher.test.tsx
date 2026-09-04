import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';
import { PublicShell } from './public-shell';
import { LANGUAGE_STORAGE_KEY, setLanguage } from '@/i18n';

vi.mock('@/providers/auth-context', () => ({
  useAuth: () => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    logout: vi.fn(),
  }),
}));

afterEach(async () => {
  // Unmount before resetting the language: a switch on a mounted tree would
  // re-render outside of act().
  cleanup();
  window.localStorage.clear();
  await setLanguage('en');
});

function renderInRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** Clicking a language reloads the catalog — let React settle before asserting. */
async function chooseLanguage(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('language switcher in the public shell', () => {
  it('offers both languages and switches the shell copy', async () => {
    renderInRouter(<PublicShell>content</PublicShell>);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await chooseLanguage('Deutsch');

    expect(screen.getByRole('link', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deutsch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('is reachable on the sign-in door, which has no top bar', () => {
    renderInRouter(<PublicShell variant="entry">content</PublicShell>);

    expect(screen.getByRole('button', { name: 'Deutsch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
  });
});

describe('language switcher in the signed-in shell', () => {
  it('offers both languages and switches the shell copy', async () => {
    renderInRouter(<AppShell>content</AppShell>);

    expect(
      screen.getByRole('button', { name: 'Disconnect' }),
    ).toBeInTheDocument();

    await chooseLanguage('Deutsch');

    expect(screen.getByRole('button', { name: 'Trennen' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disconnect' }),
    ).not.toBeInTheDocument();
  });

  it('remembers the choice for the next visit', async () => {
    renderInRouter(<AppShell>content</AppShell>);

    await chooseLanguage('Deutsch');

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('de');
  });
});
