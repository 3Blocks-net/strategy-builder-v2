/**
 * Keeper script: executes every externally-executable automation across all
 * registered vaults, from an external (non-owner) account — exactly what a
 * public executor would do to earn gas compensation.
 *
 * An automation is executed when it is:
 *   - active (else `AutomationNotActive`),
 *   - public (not owner-only — external callers get `CallerNotOwner` otherwise),
 *   - and its trigger is currently met (else `TriggerNotMet` for non-owners).
 *
 * Usage:
 *   npx hardhat run scripts/execute-automations.ts --network localhost
 *   pnpm execute:fork
 *
 * Before checking triggers it mines a block at the current wall-clock time so
 * the fork's block.timestamp matches real time (an idle fork's clock lags).
 *
 * Optional env:
 *   FACTORY_ADDRESS         override the factory (defaults to deployments/fork-latest.json)
 *   EXECUTOR_PRIVATE_KEY    run as a specific external account (must hold gas)
 *   SKIP_TIME_SYNC=1        do not advance the chain clock to wall-clock
 */
import { network } from "hardhat";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Failure reporting (PEC-219 #05) ─────────────────────────────────────────
// Reverts emit no logs, so the indexer can't see them. The keeper reports each
// failed execution (and reverting trigger check) to the backend ingest endpoint,
// authenticated by a shared secret. Built prod-ready; reporting is skipped when
// KEEPER_INGEST_SECRET is unset so the keeper still runs standalone.
const INGEST_URL = process.env.KEEPER_INGEST_URL ?? "http://localhost:3001";
const INGEST_SECRET = process.env.KEEPER_INGEST_SECRET;

async function reportFailure(args: {
  vaultAddress: string;
  automationId: number;
  executorAddress: string;
  failurePath: "execution" | "trigger-check";
  txHash?: string | null;
  error: any;
}): Promise<void> {
  if (!INGEST_SECRET) return; // reporting disabled
  const rawData = args.error?.data ?? args.error?.info?.error?.data ?? null;
  try {
    await fetch(`${INGEST_URL}/internal/executions/failures`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-keeper-secret": INGEST_SECRET },
      body: JSON.stringify({
        vaultAddress: args.vaultAddress,
        automationId: args.automationId,
        executorAddress: args.executorAddress,
        failurePath: args.failurePath,
        txHash: args.txHash ?? null,
        // raw revert bytes for the backend decoder; shortMessage as fallback
        errorData: typeof rawData === "string" ? rawData : null,
        errorMessageFallback: args.error?.shortMessage ?? args.error?.message ?? "reverted",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    console.log(`     ⚠ could not report failure: ${err.shortMessage ?? err.message}`);
  }
}

async function main() {
  const networkName = process.env.HARDHAT_NETWORK ?? "localhost";
  const { ethers } = await network.connect(networkName);
  const provider = ethers.provider;

  // ─── Executor account ─────────────────────────────────────────────────────
  const executor = process.env.EXECUTOR_PRIVATE_KEY
    ? new ethers.Wallet(process.env.EXECUTOR_PRIVATE_KEY, provider)
    : (await ethers.getSigners())[0];
  console.log(`Executor: ${executor.address}`);

  // ─── Sync the fork clock to wall-clock time ───────────────────────────────
  // A Hardhat fork only advances block.timestamp when a block is mined, so an
  // idle fork's chain clock lags real time. Trigger conditions — and the
  // isTriggerMet read below — evaluate against block.timestamp, while the
  // frontend shows status from wall-clock. Mining a block at the current real
  // time aligns the two, so time-based triggers that are "due" in the UI are
  // also seen as due on-chain. No-op (with a warning) on a non-dev node.
  if (process.env.SKIP_TIME_SYNC !== "1") {
    try {
      const realNow = Math.floor(Date.now() / 1000);
      const latest = await provider.getBlock("latest");
      const chainTs = latest ? Number(latest.timestamp) : 0;
      if (realNow > chainTs) {
        await provider.send("evm_setNextBlockTimestamp", [realNow]);
        await provider.send("evm_mine", []);
        console.log(
          `Synced chain time to wall-clock (+${realNow - chainTs}s → ${realNow})`,
        );
      } else {
        console.log(`Chain time already >= wall-clock; no sync needed`);
      }
    } catch (e: any) {
      console.log(
        `⚠ Could not sync chain time (evm_* unsupported — not a dev node?): ${e.shortMessage ?? e.message}`,
      );
    }
  }
  console.log();

  // ─── Factory address ──────────────────────────────────────────────────────
  let factoryAddr = process.env.FACTORY_ADDRESS;
  if (!factoryAddr) {
    const deployment = JSON.parse(
      readFileSync(join(__dirname, "../deployments/fork-latest.json"), "utf-8"),
    );
    factoryAddr = deployment.StrategyBuilderVaultFactory as string;
  }
  const factory = await ethers.getContractAt(
    "StrategyBuilderVaultFactory",
    factoryAddr!,
  );

  const vaultCount = Number(await factory.vaultCount());
  console.log(`Factory ${factoryAddr}: ${vaultCount} vault(s)`);

  let executed = 0;
  let skipped = 0;
  let failed = 0;

  for (let v = 0; v < vaultCount; v++) {
    const vaultAddr: string = await factory.getVault(v);
    const vault = await ethers.getContractAt("StrategyBuilderVault", vaultAddr);
    const owner: string = await vault.owner();
    const autoCount = Number(await vault.automationCount());
    console.log(`\nVault ${vaultAddr}  (owner ${owner}, ${autoCount} automation(s))`);

    if (owner.toLowerCase() === executor.address.toLowerCase()) {
      console.log(
        "  ⚠ executor is this vault's owner — owner execution bypasses the trigger and pays no gas comp",
      );
    }

    for (let id = 0; id < autoCount; id++) {
      const tag = `  [${id}]`;
      const [active, ownerOnly] = await vault.getAutomation(id);

      if (!active) {
        console.log(`${tag} skip: inactive`);
        skipped++;
        continue;
      }
      if (ownerOnly) {
        console.log(`${tag} skip: owner-only (not externally executable)`);
        skipped++;
        continue;
      }

      let met: boolean;
      try {
        met = await vault.isTriggerMet(id);
      } catch (e: any) {
        // A reverting trigger check = a broken automation the user can't see
        // otherwise. Report it (no txHash — it's a staticcall) so it surfaces.
        console.log(`${tag} skip: isTriggerMet reverted (reported)`);
        await reportFailure({
          vaultAddress: vaultAddr,
          automationId: id,
          executorAddress: executor.address,
          failurePath: "trigger-check",
          error: e,
        });
        skipped++;
        continue;
      }
      if (!met) {
        console.log(`${tag} skip: trigger not met`);
        skipped++;
        continue;
      }

      // Executable → run it from the external account.
      let txHash: string | null = null;
      try {
        const tx = await vault
          .connect(executor)
          .executeAutomation(id, { gasLimit: 2_000_000n });
        txHash = tx.hash;
        const receipt = await tx.wait();

        let comp = 0n;
        let compToken: string | null = null;
        for (const log of receipt!.logs) {
          try {
            const parsed = vault.interface.parseLog(log);
            if (parsed?.name === "GasCompSettled") {
              comp = parsed.args.gasCompTokens as bigint;
              compToken = parsed.args.token as string;
            }
          } catch {
            // not one of our events
          }
        }

        const compStr =
          comp > 0n
            ? `${ethers.formatUnits(comp, 18)} (token ${compToken})`
            : "none";
        console.log(
          `${tag} executed ✓  gasUsed ${receipt!.gasUsed}  gasComp ${compStr}`,
        );
        executed++;
      } catch (e: any) {
        console.log(`${tag} FAILED: ${e.shortMessage ?? e.message}`);
        await reportFailure({
          vaultAddress: vaultAddr,
          automationId: id,
          executorAddress: executor.address,
          failurePath: "execution",
          txHash,
          error: e,
        });
        failed++;
      }
    }
  }

  console.log(
    `\n${"═".repeat(48)}\n executed=${executed}  skipped=${skipped}  failed=${failed}\n${"═".repeat(48)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
