import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DashboardPage } from './dashboard';

const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

vi.mock('@/providers/auth-context', () => ({
  useAuth: () => ({
    address: TEST_ADDRESS,
    logout: vi.fn(),
  }),
}));

describe('DashboardPage', () => {
  it('displays truncated wallet address', () => {
    render(<DashboardPage />);
    expect(screen.getByText('0xf39F...2266')).toBeInTheDocument();
  });

  it('has a copy button', () => {
    render(<DashboardPage />);
    expect(
      screen.getByRole('button', { name: /copy/i }),
    ).toBeInTheDocument();
  });

  it('has a disconnect button', () => {
    render(<DashboardPage />);
    expect(
      screen.getByRole('button', { name: /disconnect/i }),
    ).toBeInTheDocument();
  });
});
