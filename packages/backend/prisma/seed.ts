import { PrismaClient, StepCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

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
  };
}

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
            description: 'The threshold amount (in token base units)',
            'x-ui-widget': 'amount',
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
          },
          amount: {
            type: 'string',
            title: 'Amount',
            description:
              'Amount to transfer in token base units. Set to 0 to transfer the full vault balance.',
            'x-ui-widget': 'amount',
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
              'Amount to deposit. Set to 0 to fill exactly to the minimum fee deposit target.',
            'x-ui-widget': 'amount',
            default: '0',
          },
        },
        required: ['feeRegistry', 'token', 'topUpAmount'],
      },
    },
  ];

  for (const stepType of stepTypes) {
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
  }

  console.log(`Seeded ${stepTypes.length} step types`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
