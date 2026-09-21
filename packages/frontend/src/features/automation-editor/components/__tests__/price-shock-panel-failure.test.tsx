import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceShockPanel } from '../price-shock-panel';

/**
 * The one property this panel must never lose: whatever goes wrong inside it
 * stays inside it. Here the preview does the worst thing it could do — throw
 * while rendering — and the surrounding dialog has to survive it.
 */
vi.mock('../../hooks/use-price-shock-preview', () => ({
  usePriceShockPreview: () => {
    throw new Error('preview exploded');
  },
}));

beforeEach(() => {
  // React logs the caught render error; the test asserts on the fallback.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a preview that throws', () => {
  it('replaces itself with a plain "not available", leaving the page standing', () => {
    render(
      <div>
        <PriceShockPanel vaultAddress="0x1234567890123456789012345678901234567890" />
        <button type="button">Confirm &amp; Deploy</button>
      </div>,
    );

    expect(screen.getByText(/preview not available/i)).toBeInTheDocument();
    expect(screen.getByText(/never blocks a deploy/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & deploy/i })).toBeEnabled();
  });
});
