import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, afterEach } from 'vitest';
import { DiscoveryPage } from './discovery';
import { en } from '@/i18n/locales/en';
import { setLanguage } from '@/i18n';
import { strategyExamples } from '@/lib/discovery-fixtures';

function renderPage() {
  return render(
    <MemoryRouter>
      <DiscoveryPage />
    </MemoryRouter>,
  );
}

/** Clicking a language reloads the catalog — let React settle before asserting. */
async function chooseLanguage(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

afterEach(async () => {
  cleanup();
  window.localStorage.clear();
  await setLanguage('en');
});

describe('DiscoveryPage', () => {
  it('leads with the offer and a launch action into the app', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /defi that feels like a broker/i }),
    ).toBeInTheDocument();
    const launchLinks = screen.getAllByRole('link', { name: /launch app/i });
    expect(launchLinks.length).toBeGreaterThan(0);
    for (const link of launchLinks) {
      expect(link).toHaveAttribute('href', '/connect');
    }
  });

  it('shows every strategy example from the catalog fixtures', () => {
    renderPage();
    for (const s of strategyExamples) {
      expect(screen.getByText(en.discovery.examples[s.id].name)).toBeInTheDocument();
    }
  });

  it('makes no performance promises and labels sample data', () => {
    renderPage();
    // The gallery states explicitly that no yield figures are shown yet …
    expect(screen.getByText(/no yield promises/i)).toBeInTheDocument();
    // … and the markets table carries its sample badge.
    expect(screen.getByText(/illustrative sample/i)).toBeInTheDocument();
    // No percent figure anywhere except pool fee tiers (e.g. "0.25%").
    const percents = screen.queryAllByText(/\d+(\.\d+)?\s?%/);
    for (const el of percents) {
      expect(el.textContent).toMatch(/PancakeSwap V3/);
    }
  });

  it('links the real documentation site in the footer', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute(
      'href',
      'https://docs.octodefi.com',
    );
  });
});

describe('DiscoveryPage in German', () => {
  it('translates the shop window without translating the finance terms', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: 'How it works' }),
    ).toBeInTheDocument();

    await chooseLanguage('Deutsch');

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'DeFi, das sich anfühlt wie ein Broker.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'So funktioniert es' }),
    ).toBeInTheDocument();
    // Named strategies and terms stay as they are …
    expect(screen.getByText('Wick-Wait Range Rebalance')).toBeInTheDocument();
    expect(screen.getByText('Swap auf Range-Ratio')).toBeInTheDocument();
    expect(screen.getAllByText('Liquidity Pool').length).toBeGreaterThan(0);
    // … while the ordinary copy around them is German.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Märkte' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Beispielhafte Auswahl')).toBeInTheDocument();
  });

  it('still keeps the sample data visibly labeled and promises nothing', async () => {
    renderPage();
    await chooseLanguage('Deutsch');

    expect(screen.getByText(/keine Yield-Versprechen/)).toBeInTheDocument();
    const percents = screen.queryAllByText(/\d+(\.\d+)?\s?%/);
    for (const el of percents) {
      expect(el.textContent).toMatch(/PancakeSwap V3/);
    }
  });
});
