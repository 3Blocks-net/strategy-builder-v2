import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the full StrategyBuilder system:
 *   1. StrategyBuilderVault         — implementation contract (initializers disabled)
 *   2. StrategyBuilderVaultFactory  — plain Ownable factory, deploys ERC1967 vault proxies
 *   3. setVaultImplementation       — links the vault impl to the factory
 *   4. Example condition / action contracts
 */
const StrategyBuilderVaultModule = buildModule("StrategyBuilderVaultModule", (m) => {
  // 1. Deploy the vault implementation (constructor calls _disableInitializers)
  const vaultImpl = m.contract("StrategyBuilderVault");

  // 2. Deploy the factory (constructor: Ownable(msg.sender), no args)
  const factory = m.contract("StrategyBuilderVaultFactory");

  // 3. Point the factory at the vault implementation
  m.call(factory, "setVaultImplementation", [vaultImpl]);

  // 4. Deploy example condition and action contracts
  const tokenBalanceCondition = m.contract("TokenBalanceCondition");
  const erc20TransferAction   = m.contract("ERC20TransferAction");

  return { vaultImpl, factory, tokenBalanceCondition, erc20TransferAction };
});

export default StrategyBuilderVaultModule;
