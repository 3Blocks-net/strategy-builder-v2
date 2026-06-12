import { StepCategory } from '@prisma/client';
import { EXECUTE_SELECTOR, type StepTypeDef } from './_shared';

// `satisfies` preserves the concrete JSON literal types Prisma / recipe-validation need.
export const AAVE_STEP_TYPES = [
    {
      name: 'Aave V3 Supply',
      description:
        'Supplies a token from the vault to Aave V3 as collateral. Choose the amount as a fixed value, from a context slot, or the full vault balance.',
      category: StepCategory.ACTION,
      contractKey: 'AaveV3SupplyAction',
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
      contractKey: 'AaveV3WithdrawAction',
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
            'x-ui-modes': [0, 1, 2, 3],
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
      contractKey: 'AaveV3BorrowAction',
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
      contractKey: 'AaveV3RepayAction',
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
] satisfies StepTypeDef[];
