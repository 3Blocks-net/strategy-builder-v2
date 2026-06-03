#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dirname, '../artifacts/contracts');
const outDir = join(__dirname, '../../frontend/src/lib/abis');

const contracts = [
  {
    artifact: 'StrategyBuilderVaultFactory.sol/StrategyBuilderVaultFactory.json',
    name: 'StrategyBuilderVaultFactory',
  },
  {
    artifact: 'StrategyBuilderVault.sol/StrategyBuilderVault.json',
    name: 'StrategyBuilderVault',
  },
  {
    artifact: 'FeeRegistry.sol/FeeRegistry.json',
    name: 'FeeRegistry',
  },
  {
    artifact: 'actions/AaveV3SupplyAction.sol/AaveV3SupplyAction.json',
    name: 'AaveV3SupplyAction',
  },
  {
    artifact: 'actions/AaveV3WithdrawAction.sol/AaveV3WithdrawAction.json',
    name: 'AaveV3WithdrawAction',
  },
  {
    artifact: 'actions/AaveV3BorrowAction.sol/AaveV3BorrowAction.json',
    name: 'AaveV3BorrowAction',
  },
  {
    artifact: 'actions/AaveV3RepayAction.sol/AaveV3RepayAction.json',
    name: 'AaveV3RepayAction',
  },
  {
    artifact: 'actions/PancakeSwapV3SwapAction.sol/PancakeSwapV3SwapAction.json',
    name: 'PancakeSwapV3SwapAction',
  },
];

mkdirSync(outDir, { recursive: true });

for (const { artifact, name } of contracts) {
  const path = join(artifactsDir, artifact);
  const { abi } = JSON.parse(readFileSync(path, 'utf8'));

  const content = `export const ${name}Abi = ${JSON.stringify(abi, null, 2)} as const;\n`;
  const outPath = join(outDir, `${name}.ts`);
  writeFileSync(outPath, content);
  console.log(`Extracted ${name} ABI → ${outPath}`);
}

const indexLines = contracts.map(
  ({ name }) => `export { ${name}Abi } from './${name}';`,
);
writeFileSync(join(outDir, 'index.ts'), indexLines.join('\n') + '\n');
console.log('Generated index.ts');
