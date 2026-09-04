import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect } from 'vitest';
import { DiscoveryPage } from './discovery';
import { strategyExamples } from '@/lib/discovery-fixtures';

function renderPage() {
  return render(
    <MemoryRouter>
      <DiscoveryPage />
    </MemoryRouter>,
  );
}

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
      expect(screen.getByText(s.name)).toBeInTheDocument();
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
