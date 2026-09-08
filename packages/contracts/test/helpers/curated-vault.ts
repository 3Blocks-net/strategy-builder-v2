/**
 * Test wiring for the curation gate.
 *
 * A vault implementation cannot be deployed without a CuratedRegistry, and a
 * vault in standard mode refuses any step target that is not on the list of its
 * own kind. Every test that deploys a vault therefore needs the same two moves:
 * put a registry behind the implementation, and curate the targets it is about
 * to use. This module is that setup, not a way around the gate — the gate stays
 * on in every test that uses these helpers.
 *
 * `ethers` is passed in rather than imported: the fork tests connect to their
 * own network (`network.connect("bscFork")`) and get their own helpers with it.
 */

/** Mirrors `ICuratedRegistry.TargetKind`. */
export const TargetKind = {
  Condition: 0,
  Action: 1,
} as const;

/** Anything the tests use as a step target: a contract object or a raw address. */
type Target = string | { getAddress(): Promise<string> };

/** The slice of Hardhat's network-scoped ethers helpers this module needs. */
interface EthersHelpers {
  getSigners(): Promise<{ address: string }[]>;
  // biome-ignore lint/suspicious/noExplicitAny: Hardhat returns a generic Contract
  deployContract(name: string, args?: unknown[]): Promise<any>;
}

// biome-ignore lint/suspicious/noExplicitAny: ethers Contract has no static type here
type CuratedRegistryContract = any;

async function addressOf(target: Target): Promise<string> {
  return typeof target === "string" ? target : await target.getAddress();
}

/**
 * Deploys a CuratedRegistry plus a vault implementation bound to it.
 *
 * The first signer becomes registry owner and curator unless `curator` says
 * otherwise, so `curateActions` / `curateConditions` work from the default
 * signer the tests already use.
 */
export async function deployCuratedVaultImpl(
  ethers: EthersHelpers,
  curator?: { address: string },
): Promise<{
  curatedRegistry: CuratedRegistryContract;
  // biome-ignore lint/suspicious/noExplicitAny: ethers Contract has no static type here
  vaultImpl: any;
}> {
  const curatorAddress = curator?.address ?? (await ethers.getSigners())[0].address;
  const curatedRegistry = await ethers.deployContract("CuratedRegistry", [
    curatorAddress,
  ]);
  const vaultImpl = await ethers.deployContract("StrategyBuilderVault", [
    await curatedRegistry.getAddress(),
  ]);
  return { curatedRegistry, vaultImpl };
}

/**
 * Curates `targets` as `delegatecall` targets (`TargetKind.Action`).
 *
 * Deliberately separate from `curateConditions`: curating for one kind grants
 * nothing for the other, and a test that needs both has to say so twice.
 */
export async function curateActions(
  curatedRegistry: CuratedRegistryContract,
  ...targets: Target[]
): Promise<void> {
  for (const target of targets) {
    await (
      await curatedRegistry.addCuratedTarget(await addressOf(target), TargetKind.Action)
    ).wait();
  }
}

/** Curates `targets` as `staticcall` targets (`TargetKind.Condition`). */
export async function curateConditions(
  curatedRegistry: CuratedRegistryContract,
  ...targets: Target[]
): Promise<void> {
  for (const target of targets) {
    await (
      await curatedRegistry.addCuratedTarget(
        await addressOf(target),
        TargetKind.Condition,
      )
    ).wait();
  }
}
