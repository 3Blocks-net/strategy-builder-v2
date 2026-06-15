import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

// ─── Forked-mainnet tests for the HF/oracle engine (slice #5) ────────────────
// Exercises MAX_AVAILABLE (oracle-bound) and TARGET_HF against live BSC Aave:
// TARGET_HF reaches the target within tolerance, wrong-direction is a no-op, and
// MAX is best-effort (never reverts, stays safe). Requires an archive BSC RPC.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const Mode = { FIXED: 0, FROM_SLOT: 1, MAX_AVAILABLE: 2, TARGET_HF: 3 } as const;

const AAVE_PROVIDER = "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

function encode(
  asset: string,
  mode: number,
  amount: bigint,
  targetHF: bigint = 0n,
  amountToSlot = NO_SLOT,
): string {
  return abiCoder.encode(
    ["address", "uint8", "uint256", "uint32", "uint256", "uint32"],
    [asset, mode, amount, NO_SLOT, targetHF, amountToSlot],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

forkDescribe("Aave HF/oracle modes (fork)", function () {
  this.timeout(240_000);

  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "function deposit() payable",
  ];

  async function setup() {
    const { ethers } = await network.connect("bscFork");
    const [owner] = await ethers.getSigners();

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

    const registry = await ethers.deployContract("AaveV3Registry", [AAVE_PROVIDER]);
    const supply = await ethers.deployContract("AaveV3SupplyAction", [await registry.getAddress()]);
    const borrow = await ethers.deployContract("AaveV3BorrowAction", [await registry.getAddress()]);
    const withdraw = await ethers.deployContract("AaveV3WithdrawAction", [await registry.getAddress()]);

    // Supply 5 WBNB collateral (automation 0).
    const collateral = ethers.parseEther("5");
    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, owner);
    await (await wbnb.deposit({ value: collateral })).wait();
    await (await wbnb.transfer(await vault.getAddress(), collateral)).wait();
    await vault.createOwnerAutomation([
      actionStep(await supply.getAddress(), encode(WBNB, Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(0);

    return { ethers, owner, vault, registry, supply, borrow, withdraw };
  }

  async function hf(ethers: any, registry: any, vault: string): Promise<bigint> {
    const pool = await ethers.getContractAt("IAaveV3Pool", await registry.pool());
    const d = await pool.getUserAccountData(vault);
    return d[5] as bigint; // healthFactor (1e18)
  }

  let nextAuto = 1;

  it("Borrow TARGET_HF brings the position to the target HF (within tolerance)", async function () {
    const { ethers, vault, registry, borrow } = await setup();
    const target = ethers.parseEther("2"); // HF 2.0

    await vault.createOwnerAutomation([
      actionStep(await borrow.getAddress(), encode(USDT, Mode.TARGET_HF, 0n, target)),
    ]);
    await vault.executeAutomation(1);

    const resultHF = await hf(ethers, registry, await vault.getAddress());
    // Within ±4% of the target (aggregate-LT approximation + rounding).
    expect(resultHF).to.be.greaterThan((target * 96n) / 100n);
    expect(resultHF).to.be.lessThan((target * 104n) / 100n);
  });

  it("Borrow MAX_AVAILABLE borrows ~availableBorrows (minus haircut), stays safe", async function () {
    const { ethers, vault, registry, borrow } = await setup();
    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);

    await vault.createOwnerAutomation([
      actionStep(await borrow.getAddress(), encode(USDT, Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(1);

    expect(await usdt.balanceOf(await vault.getAddress())).to.be.greaterThan(0n);
    // Haircut keeps HF safely above 1.
    expect(await hf(ethers, registry, await vault.getAddress())).to.be.greaterThan(ethers.parseEther("1"));
  });

  it("Supply TARGET_HF wrong-direction (HF already above target) is a no-op", async function () {
    const { ethers, vault, registry, borrow, supply } = await setup();
    // Create a debt so HF is finite (~2.0).
    await vault.createOwnerAutomation([
      actionStep(await borrow.getAddress(), encode(USDT, Mode.TARGET_HF, 0n, ethers.parseEther("2"))),
    ]);
    await vault.executeAutomation(1);
    const hfBefore = await hf(ethers, registry, await vault.getAddress());

    // Fund the vault with WBNB and try Supply TARGET_HF target 1.5 (< current
    // ~2.0): supplying raises HF, so this is the wrong direction → no-op.
    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, (await ethers.getSigners())[0]);
    await (await wbnb.deposit({ value: ethers.parseEther("1") })).wait();
    await (await wbnb.transfer(await vault.getAddress(), ethers.parseEther("1"))).wait();
    const wbnbBalBefore = await new ethers.Contract(WBNB, ERC20_ABI, ethers.provider).balanceOf(
      await vault.getAddress(),
    );

    await vault.createOwnerAutomation([
      actionStep(await supply.getAddress(), encode(WBNB, Mode.TARGET_HF, 0n, ethers.parseEther("1.5"))),
    ]);
    await vault.executeAutomation(2); // must not revert

    // Nothing supplied: WBNB balance unchanged, HF unchanged.
    const wbnbBalAfter = await new ethers.Contract(WBNB, ERC20_ABI, ethers.provider).balanceOf(
      await vault.getAddress(),
    );
    expect(wbnbBalAfter).to.equal(wbnbBalBefore);
    const hfAfter = await hf(ethers, registry, await vault.getAddress());
    // unchanged (allow tiny interest drift)
    expect(hfAfter).to.be.greaterThan((hfBefore * 99n) / 100n);
  });

  it("Withdraw MAX_AVAILABLE with debt keeps HF ≥ 1 (max-safe, never reverts)", async function () {
    const { ethers, vault, registry, borrow, withdraw } = await setup();
    // Borrow to HF ~2.5 so there is debt but room to withdraw some collateral.
    await vault.createOwnerAutomation([
      actionStep(await borrow.getAddress(), encode(USDT, Mode.TARGET_HF, 0n, ethers.parseEther("2.5"))),
    ]);
    await vault.executeAutomation(1);

    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, ethers.provider);
    const before = (await wbnb.balanceOf(await vault.getAddress())) as bigint;

    await vault.createOwnerAutomation([
      actionStep(await withdraw.getAddress(), encode(WBNB, Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(2); // must not revert

    const after = (await wbnb.balanceOf(await vault.getAddress())) as bigint;
    expect(after).to.be.greaterThan(before); // some collateral freed
    // Still solvent — HF stayed at/above 1 (haircut margin).
    expect(await hf(ethers, registry, await vault.getAddress())).to.be.greaterThanOrEqual(ethers.parseEther("1"));
  });
});
