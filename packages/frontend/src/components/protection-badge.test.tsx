import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectionBadge } from './protection-badge';
import { setLanguage } from '@/i18n';

afterEach(async () => {
  cleanup();
  await setLanguage('en');
});

const justNow = () => new Date(Date.now() - 30_000).toISOString();

describe('the protection badge', () => {
  it('calls a curated vault protected and says when that was established', () => {
    render(
      <ProtectionBadge protection={{ status: 'standard', checkedAt: justNow() }} />,
    );

    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(screen.getByText(/checked/i)).toBeInTheDocument();
  });

  it('names expert mode instead of claiming protection', () => {
    render(
      <ProtectionBadge protection={{ status: 'expert', checkedAt: justNow() }} />,
    );

    expect(screen.getByText('Expert mode')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    expect(screen.getByText(/checked/i)).toBeInTheDocument();
  });

  it('tells a checked status apart from an unread one', () => {
    render(<ProtectionBadge protection={{ status: 'unknown', checkedAt: null }} />);

    expect(screen.getByText(/protection status unknown/i)).toBeInTheDocument();
    expect(screen.getByText(/not checked/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('says what a reader can do about an unknown status', () => {
    render(<ProtectionBadge protection={{ status: 'unknown', checkedAt: null }} />);

    expect(
      screen.getByText(/could not be read from the vault/i),
    ).toBeInTheDocument();
  });

  it('puts the next step on the page, not in a tooltip', () => {
    // A hint that only a hovering mouse pointer can reach is no hint on a
    // phone and none for a keyboard, so the unknown badge states it as text.
    const { container } = render(
      <ProtectionBadge protection={{ status: 'unknown', checkedAt: null }} />,
    );

    const hint = screen.getByText(/reload the positions/i);
    expect(hint).toBeVisible();
    expect(container.querySelector('[title*="Reload the positions"]')).toBeNull();
  });

  it('offers the German next step as text as well', async () => {
    await setLanguage('de');
    render(<ProtectionBadge protection={{ status: 'unknown', checkedAt: null }} />);

    expect(screen.getByText(/Lade die Positionen neu/i)).toBeVisible();
  });

  it('claims nothing when no status arrived at all', () => {
    render(<ProtectionBadge />);

    expect(screen.getByText(/protection status unknown/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('refuses to call a vault protected without a read behind the claim', () => {
    // A status with no check time is not evidence — it renders as unknown.
    render(<ProtectionBadge protection={{ status: 'standard', checkedAt: null }} />);

    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    expect(screen.getByText(/protection status unknown/i)).toBeInTheDocument();
  });

  it('ignores a status it does not know', () => {
    render(
      <ProtectionBadge
        protection={
          { status: 'something-new', checkedAt: justNow() } as never
        }
      />,
    );

    expect(screen.getByText(/protection status unknown/i)).toBeInTheDocument();
  });

  it('speaks German when the app does', async () => {
    await setLanguage('de');
    render(
      <ProtectionBadge protection={{ status: 'standard', checkedAt: justNow() }} />,
    );

    expect(screen.getByText('Geschützt')).toBeInTheDocument();
    expect(screen.getByText(/geprüft/i)).toBeInTheDocument();
  });

  it('names expert mode in German too', async () => {
    await setLanguage('de');
    render(
      <ProtectionBadge protection={{ status: 'expert', checkedAt: justNow() }} />,
    );

    expect(screen.getByText('Experten-Modus')).toBeInTheDocument();
  });
});
