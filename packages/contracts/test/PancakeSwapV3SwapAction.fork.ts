import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, concat, id } from "ethers";
import {
  curateActions,
  deployCuratedVaultImpl,
} from "./helpers/curated-vault.js";

// ─── Forked-mainnet test (core deliverable) ──────────────────────────────────
// Proves the slippage guard (issue #19, PRD S4 + S5) against live PancakeSwap V3
// pools: a protected USDT→WBNB swap executes at the tolerance floor and ceiling,
// a swap whose price impact blows past the tolerance reverts, and — the point of
// the measured window ceiling — the LONGEST window a user may pick is a window
// these pools really serve, so choosing it prices against the TWAP instead of
// silently dropping into the halved-tolerance spot fallback.
//
// The wei-exact boundary cases (payout exactly at minOut, one wei below) and the
// spot fallback itself live in SlippageGuard.ts, where the pool's oracle can be
// made to fail on demand — on a live pool that is not something a test may
// arrange. Requires an archive BSC RPC.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

// PancakeSwap V3 BSC addresses.
const PCS_SWAP_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const PCS_NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const PCS_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT_WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BUSD = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";

// The two narrowest oracle reaches from the 2026-09-07 measurement (see the
// table in SlippageGuard.sol): BUSD/WBNB 0.05 % at a 1_039 s low and
// USDC/WBNB 0.01 % at 1_566 s. They sit closest to MAX_TWAP_WINDOW and are
// therefore the pools that would breach it first.
const TIGHTEST_MEASURED_POOLS = [
  { label: "BUSD/WBNB 0.05 %", tokenA: BUSD, tokenB: WBNB, fee: 500 },
  { label: "USDC/WBNB 0.01 %", tokenA: USDC, tokenB: WBNB, fee: 100 },
];
const FEE_TIERS = [100, 500, 2500, 10000];

// On-chain bounds from SlippageGuard.
const MIN_TOLERANCE_BPS = 10;
const MAX_TOLERANCE_BPS = 1_000;
const MAX_TWAP_WINDOW = 900; // measured ceiling, see SlippageGuard.sol
const TWAP_WINDOW = 300;

function encodeSwapParams(
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint,
  amountOutToSlot = NO_SLOT,
  slippageToleranceBps = 100,
  twapWindow = TWAP_WINDOW,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint256", "uint32", "uint32", "uint16", "uint32"],
    [tokenIn, tokenOut, fee, amountIn, NO_SLOT, amountOutToSlot, slippageToleranceBps, twapWindow],
  );
}

// PancakeSwap's SwapRouter refuses a swap below `amountOutMinimum` with
// `require(..., 'Too little received')` — an Error(string) revert.
const ROUTER_MIN_OUT_REJECTION = concat([
  id("Error(string)").slice(0, 10),
  abiCoder.encode(["string"], ["Too little received"]),
]);

// The fork's gas estimation is noisy across back-to-back live-pool swaps; a fixed
// generous limit keeps the tests about the guard, not about estimation.
const GAS_LIMIT = 5_000_000;

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

forkDescribe("PancakeSwapV3SwapAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
  ];
  const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
  const POOL_ABI = ["function observe(uint32[]) view returns (int56[], uint160[])"];

  async function deploy() {
    const { ethers } = await network.connect("bscFork");
    const [owner] = await ethers.getSigners();

    const { curatedRegistry, vaultImpl } = await deployCuratedVaultImpl(ethers);
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      PCS_SWAP_ROUTER,
      PCS_NPM,
      PCS_FACTORY,
    ]);
    const action = await ethers.deployContract("PancakeSwapV3SwapAction", [await registry.getAddress()]);
    // The guard is a library: under delegatecall the VAULT emits its events.
    const guard = await ethers.getContractAt("SlippageGuard", await vault.getAddress());

    // The vault refuses uncurated targets in standard mode.
    await curateActions(curatedRegistry, action);

    return { ethers, vault, registry, action, guard, curatedRegistry };
  }

  async function fundUsdt(ethers: any, to: string, amount: bigint) {
    await ethers.provider.send("hardhat_impersonateAccount", [USDT_WHALE]);
    await ethers.provider.send("hardhat_setBalance", [USDT_WHALE, "0xDE0B6B3A7640000"]);
    const whale = await ethers.getSigner(USDT_WHALE);
    await (await new ethers.Contract(USDT, ERC20_ABI, whale).transfer(to, amount)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [USDT_WHALE]);
  }

  async function firstValidFee(ethers: any): Promise<number> {
    const f = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider);
    for (const fee of FEE_TIERS) {
      const pool = await f.getPool(USDT, WBNB, fee);
      if (pool !== ethers.ZeroAddress) return fee;
    }
    throw new Error("no USDT/WBNB pool found");
  }

  async function poolFor(ethers: any, fee: number): Promise<string> {
    return new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider).getPool(USDT, WBNB, fee);
  }

  async function poolForPair(ethers: any, a: string, b: string, fee: number): Promise<string> {
    return new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider).getPool(a, b, fee);
  }

  /** Does this pool's cumulative-tick oracle reach back `window` seconds? */
  async function oracleCovers(ethers: any, pool: string, window: number): Promise<boolean> {
    try {
      await new ethers.Contract(pool, POOL_ABI, ethers.provider).observe([window, 0]);
      return true;
    } catch {
      return false;
    }
  }

  it("executes a protected USDT→WBNB swap; output → slot; allowance reset", async function () {
    const { ethers, vault, action, guard } = await deploy();
    const amountIn = ethers.parseEther("100"); // 100 USDT
    await fundUsdt(ethers, await vault.getAddress(), amountIn);

    const fee = await firstValidFee(ethers);
    const pool = await poolFor(ethers, fee);
    expect(await oracleCovers(ethers, pool, TWAP_WINDOW)).to.equal(
      true,
      "precondition: the pool's oracle must cover the TWAP window",
    );
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);

    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, ethers.provider);
    const before = (await wbnb.balanceOf(await vault.getAddress())) as bigint;

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeSwapParams(USDT, WBNB, fee, amountIn, 0)),
    ]);
    const tx = await vault.executeAutomation(0, { gasLimit: GAS_LIMIT });

    const after = (await wbnb.balanceOf(await vault.getAddress())) as bigint;
    const received = after - before;
    expect(received).to.be.greaterThan(0n);

    // The guard priced against the live TWAP (not the fallback) and the swap
    // cleared the bound it published.
    const receipt = await tx.wait();
    const emitted = receipt!.logs
      .map((log: any) => {
        try {
          return guard.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "SwapMinOutEnforced");
    expect(emitted, "guard event must be emitted").to.not.equal(undefined);
    expect(emitted!.args.pool).to.equal(pool);
    expect(emitted!.args.spotFallback).to.equal(false);
    expect(emitted!.args.effectiveToleranceBps).to.equal(100n);
    expect(emitted!.args.minOut).to.be.greaterThan(0n);
    expect(received).to.be.greaterThanOrEqual(emitted!.args.minOut);

    // Output amount written to the slot, matching the received balance.
    const written = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;
    expect(written).to.equal(received);

    // Approval hygiene.
    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    expect(await usdt.allowance(await vault.getAddress(), PCS_SWAP_ROUTER)).to.equal(0n);
  });

  it("executes at the tolerance floor and at the ceiling", async function () {
    const { ethers, vault, action } = await deploy();
    const amountIn = ethers.parseEther("50");
    await fundUsdt(ethers, await vault.getAddress(), amountIn * 2n);
    const fee = await firstValidFee(ethers);

    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, ethers.provider);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(USDT, WBNB, fee, amountIn, NO_SLOT, MIN_TOLERANCE_BPS),
      ),
    ]);
    await vault.executeAutomation(0, { gasLimit: GAS_LIMIT });
    const afterFloor = (await wbnb.balanceOf(await vault.getAddress())) as bigint;
    expect(afterFloor).to.be.greaterThan(0n);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(USDT, WBNB, fee, amountIn, NO_SLOT, MAX_TOLERANCE_BPS),
      ),
    ]);
    await vault.executeAutomation(1, { gasLimit: GAS_LIMIT });
    expect((await wbnb.balanceOf(await vault.getAddress())) as bigint).to.be.greaterThan(afterFloor);
  });

  it("reverts when the swap's price impact exceeds the tolerance", async function () {
    const { ethers, vault, action } = await deploy();
    // Large enough that the realised price on a live pool leaves the floor
    // tolerance far behind — this is the sandwich/thin-pool case, refused.
    const amountIn = ethers.parseEther("500000"); // 500 k USDT
    await fundUsdt(ethers, await vault.getAddress(), amountIn);
    const fee = await firstValidFee(ethers);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(USDT, WBNB, fee, amountIn, NO_SLOT, MIN_TOLERANCE_BPS),
      ),
    ]);

    // Refused for the minimum-out we passed to the router — not for some
    // unrelated failure. The vault re-reverts with the inner reason bytes.
    await expect(vault.executeAutomation(0, { gasLimit: GAS_LIMIT }))
      .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
      .withArgs(0, ROUTER_MIN_OUT_REJECTION);

    // Nothing left the vault.
    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    expect(await usdt.balanceOf(await vault.getAddress())).to.equal(amountIn);
  });

  // The bound that was measured rather than guessed. A V3 pool answers `observe`
  // only as far back as its observation ring reaches; if MAX_TWAP_WINDOW is
  // longer than that, the longest window a user can pick is exactly the one that
  // always lands in the spot fallback with half the tolerance — the ceiling
  // would guarantee the weaker path. So the ceiling must be servable, on every
  // fee tier of the pair these tests trade through.
  it("every live USDT/WBNB tier serves the maximum allowed window", async function () {
    const { ethers } = await deploy();
    const reaches: string[] = [];

    for (const fee of FEE_TIERS) {
      const pool = await poolFor(ethers, fee);
      if (pool === ethers.ZeroAddress) continue;
      const covers = await oracleCovers(ethers, pool, MAX_TWAP_WINDOW);
      reaches.push(`${fee}: ${covers ? "ok" : "TOO SHORT"}`);
      expect(covers).to.equal(
        true,
        `USDT/WBNB fee tier ${fee} cannot serve a ${MAX_TWAP_WINDOW}s window (${reaches.join(", ")}) — ` +
          "MAX_TWAP_WINDOW has drifted past what live pools reach; re-measure it",
      );
    }

    // Thin pools are deliberately NOT asserted here. Measuring them turned an
    // assumption into a fact: BUSD/WBNB 0.05 % reached 1_039 s on 2026-09-07 and
    // 621 s two days later — below the ceiling either way at some point. No fixed
    // constant can promise TWAP coverage for every pool, because reach is ring
    // size over write rate and both move. The ceiling keeps absurd windows out;
    // it cannot rule out the fallback. Whether a *chosen* window fits the pool a
    // user actually selected is per-pool and current, so it belongs in the editor,
    // not in a constant (see the follow-up issue referenced in SlippageGuard.sol).
    for (const tight of TIGHTEST_MEASURED_POOLS) {
      const pool = await poolForPair(ethers, tight.tokenA, tight.tokenB, tight.fee);
      if (pool === ethers.ZeroAddress) continue;
      const covers = await oracleCovers(ethers, pool, MAX_TWAP_WINDOW);
      // Recorded, not enforced: a swap through such a pool takes the documented
      // spot fallback, which the deterministic tests already cover end to end.
      console.log(
        `      note: ${tight.label} ${covers ? "serves" : "does NOT serve"} ${MAX_TWAP_WINDOW}s`,
      );
    }
    expect(reaches.length).to.be.greaterThan(0);
  });

  it("prices the maximum allowed window against the live TWAP, not the fallback", async function () {
    const { ethers, vault, action, guard } = await deploy();
    const amountIn = ethers.parseEther("100");
    await fundUsdt(ethers, await vault.getAddress(), amountIn);
    const fee = await firstValidFee(ethers);
    const pool = await poolFor(ethers, fee);

    expect(await oracleCovers(ethers, pool, MAX_TWAP_WINDOW)).to.equal(
      true,
      "precondition: the pool's oracle must cover the maximum allowed window",
    );

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(USDT, WBNB, fee, amountIn, NO_SLOT, 100, MAX_TWAP_WINDOW),
      ),
    ]);
    const tx = await vault.executeAutomation(0, { gasLimit: GAS_LIMIT });
    const receipt = await tx.wait();

    const emitted = receipt!.logs
      .map((log: any) => {
        try {
          return guard.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "SwapMinOutEnforced");
    expect(emitted, "guard event must be emitted").to.not.equal(undefined);
    // The longest window keeps the full tolerance: no silent downgrade.
    expect(emitted!.args.spotFallback).to.equal(false);
    expect(emitted!.args.effectiveToleranceBps).to.equal(100n);
  });

  it("sweeps the full USDT balance with the amountIn = 0 toggle", async function () {
    const { ethers, vault, action } = await deploy();
    await fundUsdt(ethers, await vault.getAddress(), ethers.parseEther("50"));
    const fee = await firstValidFee(ethers);

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeSwapParams(USDT, WBNB, fee, 0n)),
    ]);
    await vault.executeAutomation(0, { gasLimit: GAS_LIMIT });

    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    expect(await usdt.balanceOf(await vault.getAddress())).to.equal(0n); // fully swept
  });
});
