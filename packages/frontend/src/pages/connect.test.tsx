import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectPage } from './connect';

vi.mock('wagmi', () => ({
  useConnect: () => ({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'Injected', type: 'injected' }],
    error: null,
    isPending: false,
  }),
}));

describe('ConnectPage', () => {
  it('renders connect wallet button when MetaMask is available', () => {
    Object.defineProperty(window, 'ethereum', { value: {}, writable: true });
    render(<ConnectPage />);
    expect(
      screen.getByRole('button', { name: /connect wallet/i }),
    ).toBeInTheDocument();
  });

  it('shows install MetaMask message when not available', () => {
    Object.defineProperty(window, 'ethereum', {
      value: undefined,
      writable: true,
    });
    render(<ConnectPage />);
    expect(screen.getByText(/metamask is not installed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /install metamask/i }),
    ).toBeInTheDocument();
  });
});
