import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpertModeCard } from './expert-mode-card';
import {
  VaultPositionsSourceContext,
  type VaultPositionsSource,
} from '@/hooks/use-vault-positions';
import { setLanguage } from '@/i18n';

const VAULT = '0x1234567890123456789012345678901234567890';
const OWNER = '0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa';
const SOMEONE_ELSE = '0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB';

const writeContractAsync = vi.fn();
const waitForTransactionReceipt = vi.fn();
const reload = vi.fn();
const readContract = vi.fn();

/** The wallet currently connected to the app, per test. */
let account: string | undefined;

vi.mock('wagmi', () => ({
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
  useAccount: () => ({ address: account }),
  useReadContract: (args: unknown) => readContract(args),
}));

/** The one cockpit source the page holds, faked for the card under test. */
let source: VaultPositionsSource;

function sourceWith(over: Partial<VaultPositionsSource> = {}): VaultPositionsSource {
  return {
    data: null,
    loading: false,
    refreshing: false,
    failed: false,
    error: null,
    protection: { status: 'standard', checkedAt: new Date().toISOString() },
    reload,
    ...over,
  };
}

const card = () => (
  <VaultPositionsSourceContext.Provider value={source}>
    <ExpertModeCard vaultAddress={VAULT} />
  </VaultPositionsSourceContext.Provider>
);

beforeEach(() => {
  vi.clearAllMocks();
  account = OWNER;
  source = sourceWith();
  readContract.mockReturnValue({ data: OWNER });
  writeContractAsync.mockResolvedValue('0xhash');
  waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
  reload.mockResolvedValue(undefined);
});

afterEach(async () => {
  cleanup();
  await setLanguage('en');
});

/** Opens the warning gate and returns the dialog. */
async function openWarning() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /turn on expert mode/i }));
  });
  return screen.getByRole('dialog');
}

const acknowledgeBox = () => screen.getByRole('checkbox');
const confirmButton = () =>
  screen
    .getAllByRole('button', { name: /turn on expert mode/i })
    .at(-1) as HTMLButtonElement;

describe('the expert-mode switch', () => {
  it('names the mode the vault is actually in', () => {
    render(card());

    expect(screen.getByText(/standard mode/i)).toBeInTheDocument();
    expect(screen.getByText(/curated list/i)).toBeInTheDocument();
  });

  it('says that a switch only affects new deploys', () => {
    render(card());

    expect(screen.getByText(/applies to new deploys/i)).toBeInTheDocument();
    expect(screen.getByText(/keep running unchanged/i)).toBeInTheDocument();
  });

  it('signs nothing when the switch is merely clicked', async () => {
    render(card());

    await openWarning();

    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('spells out what protection falls away before it can be confirmed', async () => {
    render(card());

    const dialog = await openWarning();

    expect(dialog).toHaveTextContent(/stops checking step targets/i);
    expect(dialog).toHaveTextContent(/any contract address/i);
    expect(dialog).toHaveTextContent(/delegatecall/i);
    expect(dialog).toHaveTextContent(/owner slot/i);
    expect(dialog).toHaveTextContent(/take over the vault/i);
  });

  it('offers the confirmation unticked and refuses to proceed until it is ticked', async () => {
    render(card());

    await openWarning();

    expect(acknowledgeBox()).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();

    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('turns the mode on once the warning is acknowledged', async () => {
    render(card());

    await openWarning();
    await act(async () => {
      fireEvent.click(acknowledgeBox());
    });
    expect(confirmButton()).toBeEnabled();

    await act(async () => {
      fireEvent.click(confirmButton());
    });

    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT,
        functionName: 'setExpertMode',
        args: [true],
      }),
    );
    // The wallet is the confirm gate: the change is only done once the
    // transaction it signed is mined.
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xhash' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('starts from an unticked box again after a cancelled attempt', async () => {
    render(card());

    await openWarning();
    await act(async () => {
      fireEvent.click(acknowledgeBox());
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });

    await openWarning();

    expect(acknowledgeBox()).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();
  });

  it('reports a rejected signature and leaves the mode alone', async () => {
    writeContractAsync.mockRejectedValue(
      new Error('User rejected the request.'),
    );
    render(card());

    await openWarning();
    await act(async () => {
      fireEvent.click(acknowledgeBox());
    });
    await act(async () => {
      fireEvent.click(confirmButton());
    });

    expect(screen.getByRole('dialog')).toHaveTextContent(
      /rejected the signature/i,
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('switches back to the curated standard without a warning gate', async () => {
    source = sourceWith({
      protection: { status: 'expert', checkedAt: new Date().toISOString() },
    });
    render(card());

    expect(screen.getByText(/curation switched off/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /back to standard mode/i }),
      );
    });

    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'setExpertMode', args: [false] }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('claims no mode when the vault cannot be read, and still offers the way back', () => {
    source = sourceWith({
      protection: undefined,
      failed: true,
      error: 'HTTP request failed',
    });
    render(card());

    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing on the vault has changed/i)).toBeInTheDocument();
    expect(screen.getByText(/HTTP request failed/)).toBeInTheDocument();
    expect(screen.queryByText(/standard mode — curated steps only/i)).toBeNull();
    expect(
      screen.getByRole('button', { name: /read again/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /back to standard mode/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /turn on expert mode/i }),
    ).toBeNull();
  });

  it('speaks German when the UI is German', async () => {
    render(card());

    await act(async () => {
      await setLanguage('de');
    });

    expect(
      screen.getByRole('button', { name: /experten-modus einschalten/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nur kuratierte Steps/i)).toBeInTheDocument();
  });

  describe('reads the mode from one source only', () => {
    it('shows what the shared cockpit source says, not a read of its own', () => {
      source = sourceWith({
        protection: { status: 'expert', checkedAt: new Date().toISOString() },
      });
      render(card());

      expect(screen.getByText(/curation switched off/i)).toBeInTheDocument();
      // Every chain read this card makes is about ownership. The mode itself
      // arrives through the cockpit path, so card and badge cannot disagree.
      for (const [args] of readContract.mock.calls) {
        expect((args as { functionName: string }).functionName).toBe('owner');
      }
    });

    it('says nothing while that source is still on its way', () => {
      source = sourceWith({ loading: true, protection: undefined });
      render(card());

      expect(screen.getByText(/reading the current mode/i)).toBeInTheDocument();
      expect(screen.queryByText(/standard mode/i)).toBeNull();
      expect(
        screen.queryByRole('button', { name: /turn on expert mode/i }),
      ).toBeNull();
    });

    it('asks that same source to read again after a successful switch', async () => {
      source = sourceWith({
        protection: { status: 'expert', checkedAt: new Date().toISOString() },
      });
      render(card());

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /back to standard mode/i }),
        );
      });

      await waitFor(() => expect(reload).toHaveBeenCalled());
    });
  });

  describe('offers a switch only to the owner', () => {
    it('does not blame a connected wallet when none is connected', () => {
      // "your connected wallet is not the owner" names a wallet that is not
      // there. Three reasons for having no switch, three sentences.
      account = undefined;
      render(card());

      expect(screen.getByText(/connect a wallet/i)).toBeInTheDocument();
      expect(screen.queryByText(/your connected wallet/i)).not.toBeInTheDocument();
    });

    it('shows the mode but no switch to a wallet that does not own the vault', () => {
      account = SOMEONE_ELSE;
      render(card());

      expect(screen.getByText(/standard mode/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /turn on expert mode/i }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: /back to standard mode/i }),
      ).toBeNull();
      expect(screen.getByText(/only this vault.s owner can switch the mode/i)).toBeInTheDocument();
    });

    it('offers no switch when the vault owner could not be read', () => {
      readContract.mockReturnValue({ data: undefined });
      render(card());

      expect(screen.getByText(/standard mode/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /turn on expert mode/i }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: /back to standard mode/i }),
      ).toBeNull();
      expect(
        screen.getByText(/could not establish who owns this vault/i),
      ).toBeInTheDocument();
    });

    it('offers no switch when no wallet is connected', () => {
      account = undefined;
      render(card());

      expect(
        screen.queryByRole('button', { name: /turn on expert mode/i }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: /back to standard mode/i }),
      ).toBeNull();
    });

    it('offers no switch to a non-owner even when the mode is unknown', () => {
      // The "back to standard" button is the safe direction, but it is still
      // an onlyOwner transaction — a non-owner must not be offered it either.
      account = SOMEONE_ELSE;
      source = sourceWith({ protection: undefined, failed: true, error: null });
      render(card());

      expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /back to standard mode/i }),
      ).toBeNull();
    });

    it('recognises the owner regardless of address casing', () => {
      account = OWNER.toLowerCase();
      readContract.mockReturnValue({ data: OWNER.toUpperCase() });
      render(card());

      expect(
        screen.getByRole('button', { name: /turn on expert mode/i }),
      ).toBeInTheDocument();
    });

    it('explains the missing switch in German too', async () => {
      account = SOMEONE_ELSE;
      render(card());

      await act(async () => {
        await setLanguage('de');
      });

      expect(screen.getByText(/Nur der Owner dieses Vaults/i)).toBeInTheDocument();
    });
  });
});
