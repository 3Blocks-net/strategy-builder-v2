import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepSchema } from 'shared';
import { DeployDialog } from '../deploy-dialog';
import { useEditorStore } from '../../store/editor-store';
import { presetTickDelta } from '../../lib/ticks';
import { setLanguage } from '@/i18n';

const VAULT = '0x1234567890123456789012345678901234567890';
const TOKEN_IN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_OUT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const sendTransactionAsync = vi.fn();
const readContract = vi.fn();
const apiFetch = vi.fn();

vi.mock('wagmi', () => ({
  useSendTransaction: () => ({ sendTransactionAsync }),
  usePublicClient: () => ({ readContract }),
}));

vi.mock('react-router', () => ({
  useParams: () => ({ address: VAULT }),
  useNavigate: () => vi.fn(),
}));

// The receipt helper reaches for the real wagmi config, which the mock above
// deliberately does not provide; the deploy path here ends at the encode call.
vi.mock('@/lib/wait-for-receipt', () => ({
  waitForReceipt: async () => ({ logs: [] }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const SWAP_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: {
      tokenIn: { type: 'string', 'x-ui-widget': 'token-selector' },
      tokenOut: { type: 'string', 'x-ui-widget': 'token-selector' },
      fee: { type: 'integer', 'x-ui-widget': 'fee-tier' },
      amountIn: {
        type: 'string',
        'x-ui-widget': 'token-amount',
        'x-ui-amount-token-field': 'tokenIn',
      },
      slippageToleranceBps: { type: 'integer', 'x-ui-widget': 'slippage-tolerance' },
      twapWindow: { type: 'integer', 'x-ui-widget': 'twap-window' },
    },
  },
};

const LP_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: {
      rangeMode: {
        type: 'integer',
        'x-ui-widget': 'tick-range',
        'x-ui-tick-delta-field': 'tickDelta',
      },
      tickDelta: { type: 'integer' },
    },
  },
};

const AAVE_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'integer',
        'x-ui-widget': 'aave-amount-mode',
        'x-ui-target-hf-field': 'targetHealthFactor',
      },
      targetHealthFactor: { type: 'string', 'x-ui-widget': 'health-factor' },
    },
  },
};

const TIMER_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: { delta: { type: 'integer', 'x-ui-widget': 'duration' } },
  },
};

function storeWith(
  nodes: { id: string; stepTypeId: string; stepTypeName: string; params: Record<string, unknown> }[],
) {
  useEditorStore.setState({
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: 0, y: 0 },
      data: {
        stepTypeId: n.stepTypeId,
        stepTypeName: n.stepTypeName,
        category: 'ACTION',
        contractAddress: TOKEN_IN,
        selector: '0x00000000',
        params: n.params,
      },
    })) as never,
    edges: [],
    stepSchemas: { swap: SWAP_SCHEMA, lp: LP_SCHEMA, aave: AAVE_SCHEMA, timer: TIMER_SCHEMA },
    tokenDecimals: { [TOKEN_IN]: 18, [TOKEN_OUT]: 18 },
  });
}

const swapStep = (params: Record<string, unknown> = {}) => ({
  id: 's1',
  stepTypeId: 'swap',
  stepTypeName: 'PancakeSwap V3 Swap',
  params: {
    tokenIn: TOKEN_IN,
    tokenOut: TOKEN_OUT,
    fee: 500,
    amountIn: '10',
    slippageToleranceBps: 100,
    twapWindow: 300,
    ...params,
  },
});

const lpStep = () => ({
  id: 'l1',
  stepTypeId: 'lp',
  stepTypeName: 'PancakeSwap V3 LP Mint',
  params: { rangeMode: 1, tickDelta: presetTickDelta(10) },
});

function renderDialog() {
  return render(
    <DeployDialog automationId="auto-1" label="My strategy" onClose={() => {}} />,
  );
}

const deployButton = () => screen.getByRole('button', { name: /confirm & deploy/i });

/** A cockpit answer with an Aave account that is one price move from trouble. */
function positionsRespondWith(healthFactor: number | null) {
  apiFetch.mockImplementation(async (path: string) => {
    if (typeof path === 'string' && path.endsWith('/positions')) {
      return {
        ok: true,
        json: async () => ({
          positions: [
            {
              protocol: 'aave-v3',
              kind: 'summary',
              label: 'Account health',
              legs: [],
              metrics: { healthFactor },
            },
          ],
        }),
      };
    }
    return { ok: false, json: async () => ({ message: 'nope' }) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
  readContract.mockRejectedValue(new Error('no chain here'));
  sendTransactionAsync.mockResolvedValue('0xhash');
  storeWith([swapStep()]);
});

afterEach(async () => {
  cleanup();
  await setLanguage('en');
});

describe('the price-shock preview in the deploy dialog', () => {
  it('names what a move against the swap does to it', async () => {
    renderDialog();

    expect(await screen.findByText(/price shock preview/i)).toBeInTheDocument();
    expect(screen.getByText(/swap with 1% tolerance/i)).toBeInTheDocument();
    expect(screen.getAllByText('reverts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('runs').length).toBeGreaterThan(0);
  });

  it('ties the outcomes to the window they hold for, not to the market at large', async () => {
    renderDialog();

    await screen.findByText(/price shock preview/i);
    expect(
      screen.getByText(/move within the reference window of 5 min/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/drifts more slowly, the reference price moves with it/i),
    ).toBeInTheDocument();
  });

  it('says the swap can revert at half the tolerance on the spot fallback', async () => {
    renderDialog();

    await screen.findByText(/price shock preview/i);
    expect(
      screen.getByText(/halves the tolerance: the swap then already reverts at 0.5%/i),
    ).toBeInTheDocument();
  });

  it('still scopes the outcomes to a window when the step names no seconds', async () => {
    storeWith([swapStep({ twapWindow: undefined })]);
    renderDialog();

    await screen.findByText(/price shock preview/i);
    expect(
      screen.getByText(/move within this swap's reference window/i),
    ).toBeInTheDocument();
  });

  it('shows the moves in both directions', async () => {
    renderDialog();

    await screen.findByText(/price shock preview/i);
    for (const label of ['-50%', '-20%', '-10%', '+10%', '+20%', '+50%']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('says an LP range leaves its band instead of showing nothing', async () => {
    storeWith([lpStep()]);
    renderDialog();

    await screen.findByText(/range \+10% \/ −9.09% around the pool price/i);
    expect(screen.getAllByText('out of range').length).toBeGreaterThan(0);
  });

  it('warns about a tolerance that stopped being protection', async () => {
    storeWith([swapStep({ slippageToleranceBps: 500 })]);
    renderDialog();

    expect(await screen.findByText(/worth a second look/i)).toBeInTheDocument();
    expect(screen.getByText(/tolerance of 5%/i)).toBeInTheDocument();
  });

  it('warns when the swap is a large share of the pool it routes through', async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'getPool') return '0xcccccccccccccccccccccccccccccccccccccccc';
      if (functionName === 'slot0') return [2n ** 96n, 0, 0, 0, 0, 0, true];
      return 10n ** 20n; // liquidity ⇒ 100 tokens active, the swap is 10 % of it
    });
    renderDialog();

    expect(
      await screen.findByText(/this swap takes 10% of the liquidity active/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/worth a second look/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the swap is 10% of the liquidity active/i),
    ).toBeInTheDocument();
  });

  it('moves the Health Factor with the collateral price', async () => {
    positionsRespondWith(1.5);
    storeWith([
      {
        id: 'a1',
        stepTypeId: 'aave',
        stepTypeName: 'Aave V3 Borrow',
        params: { mode: 3, targetHealthFactor: '1.6' },
      },
    ]);
    renderDialog();

    expect(
      await screen.findByText(/health factor 1.50 . the vault as it stands now/i),
    ).toBeInTheDocument();
    expect(await screen.findByText('1.20')).toBeInTheDocument();
    expect(await screen.findByText(/0.75 · liquidation/i)).toBeInTheDocument();
  });

  it('says outright that the Health Factor row is today, not after the deploy', async () => {
    positionsRespondWith(1.5);
    storeWith([
      {
        id: 'a1',
        stepTypeId: 'aave',
        stepTypeName: 'Aave V3 Borrow',
        params: { mode: 3, targetHealthFactor: '1.6' },
      },
    ]);
    renderDialog();

    expect(
      await screen.findByText(/before this automation has run/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not the health factor it will have after the deploy/i),
    ).toBeInTheDocument();
  });

  it('names the target the step steers at, apart from the current reading', async () => {
    positionsRespondWith(1.5);
    storeWith([
      {
        id: 'a1',
        stepTypeId: 'aave',
        stepTypeName: 'Aave V3 Borrow',
        params: { mode: 3, targetHealthFactor: '1.6' },
      },
    ]);
    renderDialog();

    expect(
      await screen.findByText(/steers the health factor towards 1.60/i),
    ).toBeInTheDocument();
  });

  it('names no target for a step that does not steer at one', async () => {
    positionsRespondWith(1.5);
    storeWith([
      {
        id: 'a1',
        stepTypeId: 'aave',
        stepTypeName: 'Aave V3 Borrow',
        params: { mode: 0, targetHealthFactor: '0' },
      },
    ]);
    renderDialog();

    expect(
      await screen.findByText(/health factor 1.50 . the vault as it stands now/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/steers the health factor/i)).toBeNull();
  });

  it('keeps quiet when no step depends on a price at all', async () => {
    storeWith([{ id: 't1', stepTypeId: 'timer', stepTypeName: 'Timer', params: {} }]);
    renderDialog();

    expect(await screen.findByText(/no price exposure/i)).toBeInTheDocument();
  });

  it('speaks German when the app does', async () => {
    await setLanguage('de');
    renderDialog();

    expect(await screen.findByText(/preis-schock-preview/i)).toBeInTheDocument();
    expect(screen.getByText(/swap mit 1 % slippage-toleranz/i)).toBeInTheDocument();
  });
});

describe('a preview that cannot be computed', () => {
  it('says so, naming the step and the reason', async () => {
    storeWith([swapStep({ slippageToleranceBps: undefined })]);
    renderDialog();

    expect(await screen.findByText(/preview not available/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no tolerance is set yet/i),
    ).toBeInTheDocument();
  });

  it('does not call a pending cockpit answer a failed one', async () => {
    let release: (() => void) | undefined;
    apiFetch.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.endsWith('/positions')) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: true, json: async () => ({ positions: [] }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    storeWith([
      {
        id: 'a1',
        stepTypeId: 'aave',
        stepTypeName: 'Aave V3 Borrow',
        params: { mode: 3, targetHealthFactor: '1.6' },
      },
    ]);
    renderDialog();

    expect(await screen.findByText(/aave v3 borrow: computing preview/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument();

    release?.();
    expect(
      await screen.findByText(/carries no aave debt yet/i),
    ).toBeInTheDocument();
  });

  it('never stands between the owner and the deploy', async () => {
    // Everything the preview could read is broken: the cockpit call rejects
    // and the chain read throws.
    apiFetch.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.endsWith('/positions')) {
        throw new Error('cockpit down');
      }
      return { ok: false, json: async () => ({ message: 'encoding failed' }) };
    });
    renderDialog();

    await screen.findByText(/price shock preview/i);
    expect(deployButton()).toBeEnabled();

    fireEvent.click(deployButton());

    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some(([path]) => String(path).endsWith('/encode')),
      ).toBe(true),
    );
  });

  it('promises in so many words that a missing preview blocks nothing', async () => {
    storeWith([swapStep({ slippageToleranceBps: undefined })]);
    renderDialog();

    expect(
      await screen.findByText(/a missing preview never blocks a deploy/i),
    ).toBeInTheDocument();
  });
});
