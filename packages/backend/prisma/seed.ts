import { PrismaClient, StepCategory, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { RECIPES } from '../src/recipe/recipe-seed-data';
import { buildCatalog, validateRecipeShape } from '../src/recipe/recipe-validation';

const prisma = new PrismaClient();

function loadContractAddresses(): Record<string, string> {
  const deploymentPath = path.resolve(
    __dirname,
    '../../../packages/contracts/deployments/fork-latest.json',
  );

  if (fs.existsSync(deploymentPath)) {
    const data = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
    return {
      TokenBalanceCondition: data.TokenBalanceCondition,
      IntervalCondition: data.IntervalCondition,
      TimerCondition: data.TimerCondition,
      ERC20TransferAction: data.ERC20TransferAction,
      FeeDepositAction: data.FeeDepositAction,
      // Newer deployments add this; coalesce so a pre-existing fork-latest.json
      // (written before this action shipped) still seeds. Re-deploy + re-seed
      // to populate the real address (existing gotcha).
      AaveV3SupplyAction:
        data.AaveV3SupplyAction ??
        '0x0000000000000000000000000000000000000000',
      AaveV3WithdrawAction:
        data.AaveV3WithdrawAction ??
        '0x0000000000000000000000000000000000000000',
      AaveV3BorrowAction:
        data.AaveV3BorrowAction ??
        '0x0000000000000000000000000000000000000000',
      AaveV3RepayAction:
        data.AaveV3RepayAction ??
        '0x0000000000000000000000000000000000000000',
      PancakeSwapV3SwapAction:
        data.PancakeSwapV3SwapAction ??
        '0x0000000000000000000000000000000000000000',
      PancakeSwapV3MintAction:
        data.PancakeSwapV3MintAction ??
        '0x0000000000000000000000000000000000000000',
      PancakeSwapV3IncreaseLiquidityAction:
        data.PancakeSwapV3IncreaseLiquidityAction ??
        '0x0000000000000000000000000000000000000000',
      PancakeSwapV3DecreaseLiquidityAction:
        data.PancakeSwapV3DecreaseLiquidityAction ??
        '0x0000000000000000000000000000000000000000',
      PancakeSwapV3CollectAction:
        data.PancakeSwapV3CollectAction ??
        '0x0000000000000000000000000000000000000000',
    };
  }

  return {
    TokenBalanceCondition:
      process.env.TOKEN_BALANCE_CONDITION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    IntervalCondition:
      process.env.INTERVAL_CONDITION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    TimerCondition:
      process.env.TIMER_CONDITION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    ERC20TransferAction:
      process.env.ERC20_TRANSFER_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    FeeDepositAction:
      process.env.FEE_DEPOSIT_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    AaveV3SupplyAction:
      process.env.AAVE_V3_SUPPLY_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    AaveV3WithdrawAction:
      process.env.AAVE_V3_WITHDRAW_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    AaveV3BorrowAction:
      process.env.AAVE_V3_BORROW_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    AaveV3RepayAction:
      process.env.AAVE_V3_REPAY_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    PancakeSwapV3SwapAction:
      process.env.PANCAKESWAP_V3_SWAP_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    PancakeSwapV3MintAction:
      process.env.PANCAKESWAP_V3_MINT_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    PancakeSwapV3IncreaseLiquidityAction:
      process.env.PANCAKESWAP_V3_INCREASE_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    PancakeSwapV3DecreaseLiquidityAction:
      process.env.PANCAKESWAP_V3_DECREASE_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
    PancakeSwapV3CollectAction:
      process.env.PANCAKESWAP_V3_COLLECT_ACTION_ADDRESS ??
      '0x0000000000000000000000000000000000000000',
  };
}

// Curated PancakeSwap V3 test pairs (BSC, all 18 decimals) — standard ERC-20s
// only (no fee-on-transfer / rebasing). `decimals` feeds the frontend
// tokenDecimals map for correct token-amount → base-units conversion.
const PANCAKESWAP_BSC_TOKENS = [
  { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
  { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  { symbol: 'BTCB', address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
  { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
  { symbol: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18 },
];

// Curated Aave V3 BSC reserves (all 18 decimals on BSC). `decimals` feeds the
// frontend tokenDecimals map for correct token-amount → base-units conversion.
const AAVE_BSC_TOKENS = [
  { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
  { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  { symbol: 'BTCB', address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
  { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
  { symbol: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18 },
  { symbol: 'FDUSD', address: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', decimals: 18 },
  { symbol: 'wstETH', address: '0x26c5e01524d2E6280A48F2c50fF6De7e52E9611C', decimals: 18 },
];

const CHECK_SELECTOR = '0xd89f1e36';
const EXECUTE_SELECTOR = '0x24856bc3';
const AFTER_EXECUTION_SELECTOR = '0xb2792168';

async function main() {
  const addresses = loadContractAddresses();

  const stepTypes = [
    {
      name: 'Token Balance Condition',
      description:
        'Checks whether an account holds at least a specified amount of an ERC-20 token. Can compare above/below a threshold.',
      category: StepCategory.CONDITION,
      contractAddress: addresses.TokenBalanceCondition,
      selector: CHECK_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'token', type: 'address' },
          { name: 'account', type: 'address' },
          { name: 'minBalance', type: 'uint256' },
          { name: 'aboveOrEqual', type: 'bool' },
          { name: 'minBalanceFromSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            title: 'Token',
            description: 'The ERC-20 token address to check',
            'x-ui-widget': 'token-selector',
          },
          account: {
            type: 'string',
            title: 'Account',
            description: 'The account whose balance to check',
            'x-ui-widget': 'account-selector',
          },
          minBalance: {
            type: 'string',
            title: 'Minimum Balance',
            description:
              'The threshold amount in human units (e.g. 1.5). Converted to base units using the selected token\'s decimals.',
            'x-ui-widget': 'token-amount',
            // Links to the token field so the friendly amount can be converted
            // with the right decimals (no toggle — 0 is a valid threshold).
            'x-ui-amount-token-field': 'token',
          },
          aboveOrEqual: {
            type: 'boolean',
            title: 'Above or Equal',
            description:
              'If true, condition is met when balance >= threshold. If false, when balance < threshold.',
            default: true,
          },
          minBalanceFromSlot: {
            type: 'integer',
            title: 'Balance from Context Slot',
            description:
              'Read the threshold from a context slot instead of using the static value. Set to max uint32 to use the static minBalance.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
        },
        required: ['token', 'account', 'minBalance', 'aboveOrEqual'],
      },
    },
    {
      name: 'Interval Condition',
      description:
        'Time-based trigger that fires at regular intervals. After each execution, the next trigger time advances by the interval (drift-free).',
      category: StepCategory.CONDITION,
      contractAddress: addresses.IntervalCondition,
      selector: CHECK_SELECTOR,
      afterExecutionSelector: AFTER_EXECUTION_SELECTOR,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'interval', type: 'uint256' },
          { name: 'timeSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          interval: {
            type: 'object',
            title: 'Interval',
            description:
              'How often the trigger fires. Enter a number and a unit (minutes, hours, days, weeks).',
            'x-ui-widget': 'duration',
            default: { value: 1, unit: 'days' },
          },
          startTime: {
            type: 'integer',
            title: 'Start Time',
            description:
              'When the trigger first fires (default: now). Friendly-only — written as the initial value of the auto-assigned time slot at deploy.',
            'x-ui-widget': 'start-time',
            // Points at the context-slot field whose initial value this start
            // time seeds (the mapper routes startTime → contextOverrides[<slotName>]).
            'x-ui-time-slot-field': 'timeSlot',
          },
          timeSlot: {
            type: 'integer',
            title: 'Time Slot',
            description:
              'Context slot storing the next trigger timestamp. The slot is automatically advanced after each execution.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read-write',
            // Auto-assigned and seeded from Start Time — hidden from the friendly UI.
            'x-ui-hidden': true,
          },
        },
        required: ['interval', 'timeSlot'],
      },
    },
    {
      name: 'Timer Condition',
      description:
        'One-shot trigger that fires once after a specified delay from a start time stored in a context slot. Resets the slot to 0 after firing.',
      category: StepCategory.CONDITION,
      contractAddress: addresses.TimerCondition,
      selector: CHECK_SELECTOR,
      afterExecutionSelector: AFTER_EXECUTION_SELECTOR,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'delta', type: 'uint256' },
          { name: 'timeSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          delta: {
            type: 'object',
            title: 'Delay',
            description:
              'How long after the start time the timer fires once. Enter a number and a unit (minutes, hours, days, weeks).',
            'x-ui-widget': 'duration',
            default: { value: 30, unit: 'days' },
          },
          startTime: {
            type: 'integer',
            title: 'Start Time',
            description:
              'Anchor the delay counts from (default: now). Friendly-only — written as the initial value of the auto-assigned time slot at deploy.',
            'x-ui-widget': 'start-time',
            'x-ui-time-slot-field': 'timeSlot',
          },
          timeSlot: {
            type: 'integer',
            title: 'Time Slot',
            description:
              'Context slot storing the start timestamp. Set to 0 to stop the timer. Reset to 0 after firing.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read-write',
            // Auto-assigned and seeded from Start Time — hidden from the friendly UI.
            'x-ui-hidden': true,
          },
        },
        required: ['delta', 'timeSlot'],
      },
    },
    {
      name: 'ERC-20 Transfer',
      description:
        'Transfers ERC-20 tokens from the vault to a recipient. Optionally deducts a withdraw fee. Amount can be read from a context slot.',
      category: StepCategory.ACTION,
      contractAddress: addresses.ERC20TransferAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'token', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'amountFromSlot', type: 'uint32' },
          { name: 'amountToSlot', type: 'uint32' },
          { name: 'feeRegistry', type: 'address' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            title: 'Token',
            description: 'The ERC-20 token to transfer',
            'x-ui-widget': 'token-selector',
          },
          recipient: {
            type: 'string',
            title: 'Recipient',
            description: 'The address that will receive the tokens',
            // Rollen-Marker (MVP-Pflicht): macht das Geld-Ziel-Feld für
            // SummaryDecoder + Adress-Allowlist-Guard schema-getrieben sichtbar.
            'x-ui-role': 'recipient',
          },
          amount: {
            type: 'string',
            title: 'Amount',
            description:
              'Amount to transfer in human units (e.g. 1.5). Toggle to send the full vault balance instead.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'token',
            'x-ui-zero-toggle': { label: 'Volles Vault-Guthaben', default: false },
          },
          amountFromSlot: {
            type: 'integer',
            title: 'Amount from Context Slot',
            description:
              'Read the amount from a context slot instead of using the static value. Set to max uint32 to use the static amount.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
          amountToSlot: {
            type: 'integer',
            title: 'Amount to Context Slot',
            description:
              'Write the actual transferred amount to a context slot. Set to max uint32 to skip.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'write',
            default: 4294967295,
          },
          feeRegistry: {
            type: 'string',
            title: 'Fee Registry',
            description:
              'Address of the FeeRegistry contract to deduct withdraw fees. Set to zero address to skip fee deduction.',
            default: '0x0000000000000000000000000000000000000000',
          },
        },
        required: ['token', 'recipient', 'amount'],
      },
    },
    {
      name: 'Fee Deposit',
      description:
        "Tops up the vault's gas compensation deposit in the FeeRegistry when the balance falls below the vault's minimum fee deposit target.",
      category: StepCategory.ACTION,
      contractAddress: addresses.FeeDepositAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'feeRegistry', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'topUpAmount', type: 'uint256' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          feeRegistry: {
            type: 'string',
            title: 'Fee Registry',
            description: 'Address of the FeeRegistry contract',
          },
          token: {
            type: 'string',
            title: 'Token',
            description: 'The ERC-20 token used for gas compensation deposits',
            'x-ui-widget': 'token-selector',
          },
          topUpAmount: {
            type: 'string',
            title: 'Top-up Amount',
            description:
              'Amount to deposit in human units. Toggle to fill exactly to the minimum fee deposit target instead.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'token',
            'x-ui-zero-toggle': { label: 'Bis Zielreserve auffüllen', default: true },
          },
        },
        required: ['feeRegistry', 'token', 'topUpAmount'],
      },
    },
    {
      name: 'Aave V3 Supply',
      description:
        'Supplies a token from the vault to Aave V3 as collateral. Choose the amount as a fixed value, from a context slot, or the full vault balance.',
      category: StepCategory.ACTION,
      contractAddress: addresses.AaveV3SupplyAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'asset', type: 'address' },
          { name: 'mode', type: 'uint8' },
          { name: 'amount', type: 'uint256' },
          { name: 'amountFromSlot', type: 'uint32' },
          { name: 'targetHealthFactor', type: 'uint256' },
          { name: 'amountToSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          asset: {
            type: 'string',
            title: 'Token',
            description: 'The Aave V3 reserve to supply',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'aave',
          },
          mode: {
            type: 'integer',
            title: 'Amount',
            description:
              'How the supplied amount is determined: 0 = FIXED (explicit amount), 1 = FROM_SLOT (amount from a previous step), 2 = MAX_AVAILABLE (full vault balance of the token), 3 = TARGET_HF (supply collateral until the position’s health factor rises to `targetHealthFactor`).',
            'x-ui-widget': 'aave-amount-mode',
            'x-ui-amount-field': 'amount',
            'x-ui-amount-token-field': 'asset',
            'x-ui-slot-field': 'amountFromSlot',
            'x-ui-target-hf-field': 'targetHealthFactor',
            'x-ui-modes': [0, 1, 2, 3],
            default: 0,
          },
          amount: {
            type: 'string',
            title: 'Amount',
            description: 'Amount to supply in human units (e.g. 1.5). Used when mode is FIXED.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'asset',
            // Rendered by the aave-amount-mode composite (FIXED mode), so hidden
            // from the generic field loop to avoid a double render.
            'x-ui-hidden': true,
            default: '0',
          },
          amountFromSlot: {
            type: 'integer',
            title: 'Amount from Context Slot',
            description:
              'Read the amount from a context slot. Used when mode is FROM_SLOT. Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            // Rendered by the aave-amount-mode composite (FROM_SLOT mode).
            'x-ui-hidden': true,
            default: 4294967295,
          },
          targetHealthFactor: {
            type: 'string',
            title: 'Target Health Factor',
            'x-ui-widget': 'health-factor',
            description:
              'Target health factor for mode 3 (TARGET_HF), in 1e18 WAD units (e.g. 1.5 → "1500000000000000000"). The action moves the position toward this HF and is a no-op if the position is already past the target (wrong direction). Must be > 1.05 ("1050000000000000000").',
            'x-ui-hidden': true,
            default: '0',
          },
          amountToSlot: {
            type: 'integer',
            title: 'Supplied Amount to Context Slot',
            description:
              'Write the actual supplied amount to a context slot for later steps. Max uint32 = skip.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'write',
            default: 4294967295,
          },
        },
        required: ['asset', 'mode'],
      },
    },
    {
      name: 'Aave V3 Withdraw',
      description:
        'Withdraws a supplied token (collateral) from Aave V3 back into the vault. Choose a fixed amount, an amount from a context slot, or withdraw everything. The actual withdrawn amount can be written to a context slot.',
      category: StepCategory.ACTION,
      contractAddress: addresses.AaveV3WithdrawAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'asset', type: 'address' },
          { name: 'mode', type: 'uint8' },
          { name: 'amount', type: 'uint256' },
          { name: 'amountFromSlot', type: 'uint32' },
          { name: 'targetHealthFactor', type: 'uint256' },
          { name: 'amountToSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          asset: {
            type: 'string',
            title: 'Token',
            description: 'The Aave V3 reserve to withdraw',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'aave',
          },
          mode: {
            type: 'integer',
            title: 'Amount',
            description:
              'How the withdrawn amount is determined: 0 = FIXED (explicit amount), 1 = FROM_SLOT (amount from a previous step), 2 = MAX_AVAILABLE (your entire supplied balance), 3 = TARGET_HF (withdraw collateral until the position’s health factor drops to `targetHealthFactor`).',
            'x-ui-widget': 'aave-amount-mode',
            'x-ui-amount-field': 'amount',
            'x-ui-amount-token-field': 'asset',
            'x-ui-slot-field': 'amountFromSlot',
            'x-ui-target-hf-field': 'targetHealthFactor',
            'x-ui-max-label': 'Withdraw everything',
            'x-ui-max-note':
              'Withdraws your entire supplied balance of the selected token from Aave.',
            default: 0,
          },
          amount: {
            type: 'string',
            title: 'Amount',
            description: 'Amount to withdraw in human units (e.g. 1.5). Used when mode is FIXED.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'asset',
            'x-ui-hidden': true,
            default: '0',
          },
          amountFromSlot: {
            type: 'integer',
            title: 'Amount from Context Slot',
            description:
              'Read the amount from a context slot. Used when mode is FROM_SLOT. Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            'x-ui-hidden': true,
            default: 4294967295,
          },
          targetHealthFactor: {
            type: 'string',
            title: 'Target Health Factor',
            'x-ui-widget': 'health-factor',
            description:
              'Target health factor for mode 3 (TARGET_HF), in 1e18 WAD units (e.g. 1.5 → "1500000000000000000"). The action moves the position toward this HF and is a no-op if the position is already past the target (wrong direction). Must be > 1.05 ("1050000000000000000").',
            'x-ui-hidden': true,
            default: '0',
          },
          amountToSlot: {
            type: 'integer',
            title: 'Actual Withdrawn Amount to Context Slot',
            description:
              'Write the actual withdrawn amount (which differs from a "withdraw everything" request) to a context slot for later steps. Max uint32 = skip.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'write',
            default: 4294967295,
          },
        },
        required: ['asset', 'mode'],
      },
    },
    {
      name: 'Aave V3 Borrow',
      description:
        'Borrows a token from Aave V3 against the vault’s collateral (always variable rate). The borrowed amount is written to a context slot so it can feed a later swap or transfer.',
      category: StepCategory.ACTION,
      contractAddress: addresses.AaveV3BorrowAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'asset', type: 'address' },
          { name: 'mode', type: 'uint8' },
          { name: 'amount', type: 'uint256' },
          { name: 'amountFromSlot', type: 'uint32' },
          { name: 'targetHealthFactor', type: 'uint256' },
          { name: 'amountToSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          asset: {
            type: 'string',
            title: 'Token',
            description: 'The Aave V3 reserve to borrow',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'aave',
          },
          mode: {
            type: 'integer',
            title: 'Amount',
            description:
              'How the borrowed amount is determined: 0 = FIXED (explicit amount), 1 = FROM_SLOT (amount from a previous step), 2 = MAX_AVAILABLE (maximum borrowable against current collateral), 3 = TARGET_HF (borrow until the position’s health factor drops to `targetHealthFactor`).',
            'x-ui-widget': 'aave-amount-mode',
            'x-ui-amount-field': 'amount',
            'x-ui-amount-token-field': 'asset',
            'x-ui-slot-field': 'amountFromSlot',
            'x-ui-target-hf-field': 'targetHealthFactor',
            'x-ui-modes': [0, 1, 2, 3],
            default: 0,
          },
          amount: {
            type: 'string',
            title: 'Amount',
            description: 'Amount to borrow in human units (e.g. 1.5). Used when mode is FIXED.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'asset',
            'x-ui-hidden': true,
            default: '0',
          },
          amountFromSlot: {
            type: 'integer',
            title: 'Amount from Context Slot',
            description:
              'Read the amount from a context slot. Used when mode is FROM_SLOT. Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            'x-ui-hidden': true,
            default: 4294967295,
          },
          targetHealthFactor: {
            type: 'string',
            title: 'Target Health Factor',
            'x-ui-widget': 'health-factor',
            description:
              'Target health factor for mode 3 (TARGET_HF), in 1e18 WAD units (e.g. 1.5 → "1500000000000000000"). The action moves the position toward this HF and is a no-op if the position is already past the target (wrong direction). Must be > 1.05 ("1050000000000000000").',
            'x-ui-hidden': true,
            default: '0',
          },
          amountToSlot: {
            type: 'integer',
            title: 'Borrowed Amount to Context Slot',
            description:
              'Write the borrowed amount to a context slot for later steps (e.g. a swap). Max uint32 = skip.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'write',
            default: 4294967295,
          },
        },
        required: ['asset', 'mode'],
      },
    },
    {
      name: 'Aave V3 Repay',
      description:
        'Repays an Aave V3 loan from the vault (always variable rate). Repay a fixed amount, an amount from a context slot, or your full debt (capped at your balance). The actual repaid amount is written to a context slot.',
      category: StepCategory.ACTION,
      contractAddress: addresses.AaveV3RepayAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'asset', type: 'address' },
          { name: 'mode', type: 'uint8' },
          { name: 'amount', type: 'uint256' },
          { name: 'amountFromSlot', type: 'uint32' },
          { name: 'targetHealthFactor', type: 'uint256' },
          { name: 'amountToSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          asset: {
            type: 'string',
            title: 'Token',
            description: 'The borrowed Aave V3 reserve to repay',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'aave',
          },
          mode: {
            type: 'integer',
            title: 'Amount',
            description:
              'How the repaid amount is determined: 0 = FIXED (explicit amount), 1 = FROM_SLOT (amount from a previous step), 2 = MAX_AVAILABLE (full outstanding debt, capped at your balance), 3 = TARGET_HF (repay debt until the position’s health factor rises to `targetHealthFactor`).',
            'x-ui-widget': 'aave-amount-mode',
            'x-ui-amount-field': 'amount',
            'x-ui-amount-token-field': 'asset',
            'x-ui-slot-field': 'amountFromSlot',
            'x-ui-target-hf-field': 'targetHealthFactor',
            'x-ui-modes': [0, 1, 2, 3],
            'x-ui-max-label': 'Repay full debt',
            'x-ui-max-note':
              'Repays as much of your loan as your balance allows (capped at the outstanding debt).',
            default: 0,
          },
          amount: {
            type: 'string',
            title: 'Amount',
            description: 'Amount to repay in human units (e.g. 1.5). Used when mode is FIXED.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'asset',
            'x-ui-hidden': true,
            default: '0',
          },
          amountFromSlot: {
            type: 'integer',
            title: 'Amount from Context Slot',
            description:
              'Read the amount from a context slot. Used when mode is FROM_SLOT. Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            'x-ui-hidden': true,
            default: 4294967295,
          },
          targetHealthFactor: {
            type: 'string',
            title: 'Target Health Factor',
            'x-ui-widget': 'health-factor',
            description:
              'Target health factor for mode 3 (TARGET_HF), in 1e18 WAD units (e.g. 1.5 → "1500000000000000000"). The action moves the position toward this HF and is a no-op if the position is already past the target (wrong direction). Must be > 1.05 ("1050000000000000000").',
            'x-ui-hidden': true,
            default: '0',
          },
          amountToSlot: {
            type: 'integer',
            title: 'Actual Repaid Amount to Context Slot',
            description:
              'Write the actual repaid amount (which differs from a "repay full debt" request) to a context slot. Max uint32 = skip.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'write',
            default: 4294967295,
          },
        },
        required: ['asset', 'mode'],
      },
    },
    {
      name: 'PancakeSwap V3 Swap',
      description:
        'Swaps one token for another via PancakeSwap V3 (single-hop). Ships without on-chain minimum-out (amountOutMinimum = 0) — the step executes rather than reverting on price movement. The output amount is written to a context slot.',
      category: StepCategory.ACTION,
      contractAddress: addresses.PancakeSwapV3SwapAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountInFromSlot', type: 'uint32' },
          { name: 'amountOutToSlot', type: 'uint32' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'minOutFromSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          tokenIn: {
            type: 'string',
            title: 'From Token',
            description: 'The token to swap from',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'pancakeswap',
          },
          tokenOut: {
            type: 'string',
            title: 'To Token',
            description: 'The token to swap to',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'pancakeswap',
          },
          fee: {
            type: 'integer',
            title: 'Fee Tier',
            description: 'The PancakeSwap V3 pool fee tier to route through.',
            'x-ui-widget': 'fee-tier',
            default: 500,
          },
          amountIn: {
            type: 'string',
            title: 'Amount In',
            description:
              'Amount of the from-token to swap in human units (e.g. 1.5). Toggle to swap the full vault balance instead.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'tokenIn',
            'x-ui-zero-toggle': { label: 'Volles Guthaben tauschen', default: false },
          },
          amountInFromSlot: {
            type: 'integer',
            title: 'Amount In from Context Slot',
            description:
              'Read the input amount from a context slot (e.g. a previous step’s output). Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
          amountOutToSlot: {
            type: 'integer',
            title: 'Output Amount to Context Slot',
            description:
              'Write the swap output amount to a context slot to chain it into a later step. Max uint32 = skip.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'write',
            default: 4294967295,
          },
          amountOutMinimum: {
            type: 'string',
            title: 'Minimum Output',
            description:
              'Forward-compat: minimum acceptable output (base units). Hidden — ships at 0 (no slippage protection).',
            'x-ui-hidden': true,
            default: '0',
          },
          minOutFromSlot: {
            type: 'integer',
            title: 'Minimum Output from Context Slot',
            description: 'Forward-compat: read the minimum output from a slot. Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            'x-ui-hidden': true,
            default: 4294967295,
          },
        },
        required: ['tokenIn', 'tokenOut', 'fee', 'amountIn'],
      },
    },
    {
      name: 'PancakeSwap V3 LP Mint',
      description:
        'Opens a new PancakeSwap V3 concentrated-liquidity position from the vault. Define the price range as explicit min/max prices or a preset width around the current price. The position NFT token-id is written to a context slot.',
      category: StepCategory.ACTION,
      contractAddress: addresses.PancakeSwapV3MintAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'tokenA', type: 'address' },
          { name: 'tokenB', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'rangeMode', type: 'uint8' },
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'tickDelta', type: 'int24' },
          { name: 'amountADesired', type: 'uint256' },
          { name: 'amountBDesired', type: 'uint256' },
          { name: 'tokenIdToSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          tokenA: {
            type: 'string',
            title: 'Token A',
            description: 'First token of the pair',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'pancakeswap',
          },
          tokenB: {
            type: 'string',
            title: 'Token B',
            description: 'Second token of the pair',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'pancakeswap',
          },
          fee: {
            type: 'integer',
            title: 'Fee Tier',
            description: 'The PancakeSwap V3 pool fee tier.',
            'x-ui-widget': 'fee-tier',
            default: 500,
          },
          rangeMode: {
            type: 'integer',
            title: 'Price Range',
            description:
              'Define the position range as explicit min/max prices, or a preset width around the current price.',
            'x-ui-widget': 'tick-range',
            'x-ui-token0-field': 'tokenA',
            'x-ui-token1-field': 'tokenB',
            'x-ui-fee-field': 'fee',
            'x-ui-tick-lower-field': 'tickLower',
            'x-ui-tick-upper-field': 'tickUpper',
            'x-ui-tick-delta-field': 'tickDelta',
            default: 1,
          },
          tickLower: { type: 'integer', title: 'Tick Lower', 'x-ui-hidden': true, default: 0 },
          tickUpper: { type: 'integer', title: 'Tick Upper', 'x-ui-hidden': true, default: 0 },
          tickDelta: { type: 'integer', title: 'Tick Delta', 'x-ui-hidden': true, default: 0 },
          amountADesired: {
            type: 'string',
            title: 'Amount A',
            description: 'Amount of Token A to add (human units). Toggle to use the full vault balance.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'tokenA',
            'x-ui-zero-toggle': { label: 'Volles Guthaben', default: false },
          },
          amountBDesired: {
            type: 'string',
            title: 'Amount B',
            description: 'Amount of Token B to add (human units). Toggle to use the full vault balance.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'tokenB',
            'x-ui-zero-toggle': { label: 'Volles Guthaben', default: false },
          },
          tokenIdToSlot: {
            type: 'integer',
            title: 'Position Token-ID to Context Slot',
            description:
              'Write the new position NFT token-id to a context slot so later automations can manage it.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'write',
            default: 4294967295,
          },
        },
        required: ['tokenA', 'tokenB', 'fee', 'tokenIdToSlot'],
      },
    },
    {
      name: 'PancakeSwap V3 Increase Liquidity',
      description:
        'Adds liquidity to an existing PancakeSwap V3 position identified by a token-id from a context slot (written by an earlier Mint). Configure the amount of each token to add.',
      category: StepCategory.ACTION,
      contractAddress: addresses.PancakeSwapV3IncreaseLiquidityAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'tokenA', type: 'address' },
          { name: 'tokenB', type: 'address' },
          { name: 'tokenIdFromSlot', type: 'uint32' },
          { name: 'amountADesired', type: 'uint256' },
          { name: 'amountAFromSlot', type: 'uint32' },
          { name: 'amountBDesired', type: 'uint256' },
          { name: 'amountBFromSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          tokenA: {
            type: 'string',
            title: 'Token A',
            description: 'First token of the position pair',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'pancakeswap',
          },
          tokenB: {
            type: 'string',
            title: 'Token B',
            description: 'Second token of the position pair',
            'x-ui-widget': 'token-selector',
            'x-ui-token-source': 'pancakeswap',
          },
          tokenIdFromSlot: {
            type: 'integer',
            title: 'Position Token-ID from Context Slot',
            description: 'Read the position NFT token-id from a context slot (written by a Mint step).',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
          amountADesired: {
            type: 'string',
            title: 'Amount A',
            description: 'Amount of Token A to add (human units). Toggle to use the full vault balance.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'tokenA',
            'x-ui-zero-toggle': { label: 'Volles Guthaben', default: false },
          },
          amountAFromSlot: {
            type: 'integer',
            title: 'Amount A from Context Slot',
            description: 'Read amount A from a context slot. Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
          amountBDesired: {
            type: 'string',
            title: 'Amount B',
            description: 'Amount of Token B to add (human units). Toggle to use the full vault balance.',
            'x-ui-widget': 'token-amount',
            'x-ui-amount-token-field': 'tokenB',
            'x-ui-zero-toggle': { label: 'Volles Guthaben', default: false },
          },
          amountBFromSlot: {
            type: 'integer',
            title: 'Amount B from Context Slot',
            description: 'Read amount B from a context slot. Max uint32 = unset.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
        },
        required: ['tokenA', 'tokenB', 'tokenIdFromSlot'],
      },
    },
    {
      name: 'PancakeSwap V3 Decrease Liquidity',
      description:
        'Removes a percentage of liquidity from an existing PancakeSwap V3 position and delivers the freed tokens (plus accrued fees) to the vault in one step (decrease + collect bundled). The position token-id comes from a context slot.',
      category: StepCategory.ACTION,
      contractAddress: addresses.PancakeSwapV3DecreaseLiquidityAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'tokenIdFromSlot', type: 'uint32' },
          { name: 'percent', type: 'uint16' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          tokenIdFromSlot: {
            type: 'integer',
            title: 'Position Token-ID from Context Slot',
            description: 'Read the position NFT token-id from a context slot (written by a Mint step).',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
          percent: {
            type: 'integer',
            title: 'Percentage to Remove',
            description: 'How much of the position liquidity to remove (1–100; 100 = all).',
            'x-ui-widget': 'percent',
            default: 100,
          },
        },
        required: ['tokenIdFromSlot', 'percent'],
      },
    },
    {
      name: 'PancakeSwap V3 Collect',
      description:
        'Collects accrued fees (and any owed tokens) from an existing PancakeSwap V3 position into the vault. The position token-id comes from a context slot.',
      category: StepCategory.ACTION,
      contractAddress: addresses.PancakeSwapV3CollectAction,
      selector: EXECUTE_SELECTOR,
      afterExecutionSelector: null,
      abiFragment: {
        type: 'tuple',
        components: [{ name: 'tokenIdFromSlot', type: 'uint32' }],
      },
      paramSchema: {
        type: 'object',
        properties: {
          tokenIdFromSlot: {
            type: 'integer',
            title: 'Position Token-ID from Context Slot',
            description: 'Read the position NFT token-id from a context slot (written by a Mint step).',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
            default: 4294967295,
          },
        },
        required: ['tokenIdFromSlot'],
      },
    },
  ];

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  // Drop any stale zero-address rows from a prior partial seed — multiple
  // not-yet-deployed actions share (0x0…0, executeSelector), so they would
  // otherwise collapse into a single row and hide the others in the editor.
  await prisma.stepType.deleteMany({ where: { contractAddress: ZERO_ADDRESS } });

  let seeded = 0;
  let skipped = 0;
  for (const stepType of stepTypes) {
    // Skip steps whose contract isn't deployed yet (address(0)) — seeding them
    // would collide on the (contractAddress, selector) unique key. Deploy the
    // contracts (writes real addresses to fork-latest.json) and re-seed.
    if (stepType.contractAddress === ZERO_ADDRESS) {
      console.warn(`  ⚠ skipping "${stepType.name}" — not deployed (address(0))`);
      skipped++;
      continue;
    }
    await prisma.stepType.upsert({
      where: {
        contractAddress_selector: {
          contractAddress: stepType.contractAddress,
          selector: stepType.selector,
        },
      },
      update: {
        name: stepType.name,
        description: stepType.description,
        category: stepType.category,
        afterExecutionSelector: stepType.afterExecutionSelector,
        abiFragment: stepType.abiFragment,
        paramSchema: stepType.paramSchema,
      },
      create: stepType,
    });
    seeded++;
  }

  console.log(
    `Seeded ${seeded} step types${skipped > 0 ? ` (skipped ${skipped} not-yet-deployed)` : ''}`,
  );

  // Curated few-shot recipe shapes — validated against the *deployed* catalog
  // before insert (unknown step type / param drift => not delivered).
  // Seed-/team-curated only; there is no user/community write path.
  const catalog = buildCatalog(
    stepTypes.filter((s) => s.contractAddress !== ZERO_ADDRESS),
  );
  let recipesSeeded = 0;
  let recipesSkipped = 0;
  for (const recipe of RECIPES) {
    const errors = validateRecipeShape(recipe.shape, catalog);
    if (errors.length > 0) {
      console.warn(`  ⚠ skipping recipe "${recipe.key}" — ${errors.join('; ')}`);
      recipesSkipped++;
      continue;
    }
    const data = {
      name: recipe.name,
      description: recipe.description,
      category: recipe.category,
      shape: recipe.shape as unknown as Prisma.InputJsonValue,
    };
    await prisma.recipe.upsert({
      where: { key: recipe.key },
      update: data,
      create: { key: recipe.key, ...data },
    });
    recipesSeeded++;
  }
  console.log(
    `Seeded ${recipesSeeded} recipes${recipesSkipped > 0 ? ` (skipped ${recipesSkipped} invalid)` : ''}`,
  );

  // Curated per-protocol token allowlists (Aave reserves).
  for (const t of AAVE_BSC_TOKENS) {
    await prisma.protocolToken.upsert({
      where: { protocol_address: { protocol: 'aave', address: t.address } },
      update: { symbol: t.symbol, decimals: t.decimals, enabled: true },
      create: {
        protocol: 'aave',
        address: t.address,
        symbol: t.symbol,
        decimals: t.decimals,
        enabled: true,
      },
    });
  }
  console.log(`Seeded ${AAVE_BSC_TOKENS.length} Aave protocol tokens`);

  for (const t of PANCAKESWAP_BSC_TOKENS) {
    await prisma.protocolToken.upsert({
      where: { protocol_address: { protocol: 'pancakeswap', address: t.address } },
      update: { symbol: t.symbol, decimals: t.decimals, enabled: true },
      create: {
        protocol: 'pancakeswap',
        address: t.address,
        symbol: t.symbol,
        decimals: t.decimals,
        enabled: true,
      },
    });
  }
  console.log(`Seeded ${PANCAKESWAP_BSC_TOKENS.length} PancakeSwap protocol tokens`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
