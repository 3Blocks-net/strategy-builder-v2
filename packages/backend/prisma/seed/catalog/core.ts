import { StepCategory } from '@prisma/client';
import { CHECK_SELECTOR, EXECUTE_SELECTOR, AFTER_EXECUTION_SELECTOR, type StepTypeDef } from './_shared';

// `satisfies` preserves the concrete JSON literal types Prisma / recipe-validation need.
export const CORE_STEP_TYPES = [
    {
      name: 'Token Balance Condition',
      description:
        'Checks whether an account holds at least a specified amount of an ERC-20 token. Can compare above/below a threshold.',
      category: StepCategory.CONDITION,
      contractKey: 'TokenBalanceCondition',
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
      contractKey: 'IntervalCondition',
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
      contractKey: 'TimerCondition',
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
      contractKey: 'ERC20TransferAction',
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
      contractKey: 'FeeDepositAction',
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
      name: 'Wick & Wait Rebalance',
      description:
        'Fires only when the pool’s time-weighted-average price has left the open position’s range for the configured window (so short wicks are ignored) and a cooldown since the last rebalance has elapsed. Use it as the trigger of a concentrated-liquidity rebalance automation.',
      category: StepCategory.CONDITION,
      contractKey: 'WickWaitRebalanceCondition',
      selector: CHECK_SELECTOR,
      afterExecutionSelector: AFTER_EXECUTION_SELECTOR,
      abiFragment: {
        type: 'tuple',
        components: [
          { name: 'tokenIdSlot', type: 'uint32' },
          { name: 'twapWindow', type: 'uint32' },
          { name: 'cooldown', type: 'uint256' },
          { name: 'lastRebalanceSlot', type: 'uint32' },
        ],
      },
      paramSchema: {
        type: 'object',
        properties: {
          tokenIdSlot: {
            type: 'integer',
            title: 'Position Token-Id Slot',
            description:
              'Context slot holding the LP position token-id (written by the Mint action). The condition reads the position’s range and pool from it.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read',
          },
          twapWindow: {
            type: 'object',
            title: 'TWAP Window',
            description:
              'The averaging window. A move shorter than this (a wick) barely shifts the average and does not trigger a rebalance. Conservative 1h / Balanced 30m / Aggressive 10m.',
            'x-ui-widget': 'duration',
            default: { value: 30, unit: 'minutes' },
          },
          cooldown: {
            type: 'object',
            title: 'Rebalance Cooldown',
            description:
              'Minimum time between rebalances, so small positions are not rebalanced too often. The trigger stays silent until this has elapsed since the last rebalance.',
            'x-ui-widget': 'duration',
            default: { value: 3, unit: 'days' },
          },
          lastRebalanceSlot: {
            type: 'integer',
            title: 'Last-Rebalance Slot',
            description:
              'Context slot storing the timestamp of the last rebalance. Advanced automatically after each firing; 0 means never rebalanced.',
            'x-ui-widget': 'context-slot',
            'x-ui-slot-access': 'read-write',
          },
        },
        required: ['tokenIdSlot', 'twapWindow', 'cooldown', 'lastRebalanceSlot'],
      },
    },
] satisfies StepTypeDef[];
