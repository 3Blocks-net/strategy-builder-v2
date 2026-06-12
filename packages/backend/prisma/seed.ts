import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { RECIPES } from '../src/recipe/recipe-seed-data';
import { buildCatalog, validateRecipeShape } from '../src/recipe/recipe-validation';
import { STEP_TYPE_CATALOG } from './seed/step-types';

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


async function main() {
  const addresses = loadContractAddresses();

  const stepTypes = STEP_TYPE_CATALOG.map(({ contractKey, ...rest }) => ({
    ...rest,
    contractAddress: addresses[contractKey] ?? '0x0000000000000000000000000000000000000000',
  }));

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
