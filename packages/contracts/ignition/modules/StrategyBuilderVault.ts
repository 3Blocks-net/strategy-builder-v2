import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the StrategyBuilder core onto a real chain (BSC testnet / mainnet):
 *   1. CuratedRegistry              — the list of reviewed step targets
 *   2. StrategyBuilderVault         — implementation, bound to that registry
 *   3. StrategyBuilderVaultFactory  — plain Ownable factory, deploys ERC1967 vault proxies
 *   4. setVaultImplementation       — links the vault impl to the factory
 *   5. Example condition / action contracts
 *
 * How to run it
 * ─────────────
 *   pnpm contracts:deploy:testnet ignition/modules/StrategyBuilderVault.ts \
 *     --parameters ./ignition/parameters.json
 *
 * with a parameters file that names the curator, e.g.
 *   { "StrategyBuilderVaultModule": { "curator": "0x…" } }
 *
 * The curator is a required parameter on purpose
 * ──────────────────────────────────────────────
 * The registry is what keeps a standard-mode vault from `delegatecall`ing an
 * arbitrary address into its own storage, and the curator key is the only key
 * that may put targets on that list. It therefore has to be named per deploy —
 * there is deliberately no default, so a deploy without a curator aborts before
 * it sends a transaction instead of quietly leaving the role with the deployer.
 * On a real chain owner and curator are separate keys: the deployer becomes the
 * registry's owner (cold, appoints the curator), the parameter names the
 * operational curation key.
 *
 * Nothing is curated here
 * ───────────────────────
 * The example condition and action are deployed but not put on the list.
 * Curation is a reviewed step done by the curator key afterwards; a fresh
 * registry arrives empty, and until it is filled a vault either gets its
 * targets curated or its owner turns on expert mode.
 *
 * The registry address is immutable in the implementation, so every vault the
 * factory creates from this implementation checks against exactly this list.
 * Swapping the list means deploying a new implementation and handing that to
 * the factory; vaults already out there keep the list they were reviewed
 * against.
 *
 * Scope
 * ─────
 * This module is the core set only. The fork deploy (`scripts/deploy-fork.ts`)
 * additionally wires FeeRegistry, PriceOracle and the DeFi actions; whoever
 * takes this to a real chain deploys and wires those separately.
 */
const StrategyBuilderVaultModule = buildModule("StrategyBuilderVaultModule", (m) => {
  // 1. Deploy the curated registry. Required parameter, no default — see header.
  const curator = m.getParameter("curator");
  const curatedRegistry = m.contract("CuratedRegistry", [curator]);

  // 2. Deploy the vault implementation against that registry
  //    (constructor stores the registry immutably and calls _disableInitializers)
  const vaultImpl = m.contract("StrategyBuilderVault", [curatedRegistry]);

  // 3. Deploy the factory (constructor: Ownable(msg.sender), no args)
  const factory = m.contract("StrategyBuilderVaultFactory");

  // 4. Point the factory at the vault implementation
  m.call(factory, "setVaultImplementation", [vaultImpl]);

  // 5. Deploy example condition and action contracts (not curated, see header)
  const tokenBalanceCondition = m.contract("TokenBalanceCondition");
  const erc20TransferAction   = m.contract("ERC20TransferAction");

  return { curatedRegistry, vaultImpl, factory, tokenBalanceCondition, erc20TransferAction };
});

export default StrategyBuilderVaultModule;
