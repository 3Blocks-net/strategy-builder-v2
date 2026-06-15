import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

// ─── Forked-mainnet test (core deliverable) ──────────────────────────────────
// Supplies WBNB collateral to live Aave V3, then borrows real BSC reserves
// against it across FIXED / FROM_SLOT, asserting the vault balance increases,
// on-chain debt increases, and the borrowed amount lands in a context slot.
// Requires an archive BSC RPC; skipped otherwise.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const Mode = { FIXED: 0, FROM_SLOT: 1, MAX_AVAILABLE: 2 } as const;

const AAVE_PROVIDER = "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// Reserves to borrow (all borrowable on Aave BSC).
const RESERVES = [
  { symbol: "USDT", token: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  { symbol: "USDC", token: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  { symbol: "WBNB", token: WBNB, decimals: 18 },
];

function encodeParams(
  asset: string,
  mode: number,
  amount: bigint,
  amountFromSlot = NO_SLOT,
  amountToSlot = NO_SLOT,
): string {
  return abiCoder.encode(
    ["address", "uint8", "uint256", "uint32", "uint256", "uint32"],
    [asset, mode, amount, amountFromSlot, 0n, amountToSlot],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

forkDescribe("AaveV3BorrowAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function deposit() payable",
  ];

  async function deploy() {
    const { ethers } = await network.connect("bscFork");
    const [owner] = await ethers.getSigners();

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt(
      "StrategyBuilderVault",
      await factory.getVault(0),
    );

    const registry = await ethers.deployContract("AaveV3Registry", [AAVE_PROVIDER]);
    const supply = await ethers.deployContract("AaveV3SupplyAction", [
      await registry.getAddress(),
    ]);
    const borrow = await ethers.deployContract("AaveV3BorrowAction", [
      await registry.getAddress(),
    ]);

    return { ethers, owner, vault, registry, supply, borrow };
  }

  // Wrap WBNB collateral into the vault and supply all of it to Aave so the
  // vault has borrowing power. Uses automation 0.
  async function supplyCollateral(ethers: any, owner: any, vault: any, supply: any) {
    const collateral = ethers.parseEther("5");
    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, owner);
    await (await wbnb.deposit({ value: collateral })).wait();
    await (await wbnb.transfer(await vault.getAddress(), collateral)).wait();
    await vault.createOwnerAutomation([
      actionStep(await supply.getAddress(), encodeParams(WBNB, Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(0);
  }

  async function totalDebtBase(ethers: any, registry: any, vault: string): Promise<bigint> {
    const pool = await ethers.getContractAt("IAaveV3Pool", await registry.pool());
    const data = await pool.getUserAccountData(vault);
    return data[1] as bigint; // totalDebtBase
  }

  for (const reserve of RESERVES) {
    it(`borrows ${reserve.symbol} (FIXED) against WBNB collateral`, async function () {
      const { ethers, owner, vault, registry, supply, borrow } = await deploy();
      await supplyCollateral(ethers, owner, vault, supply);

      const want = ethers.parseUnits("1", reserve.decimals);
      const erc20 = new ethers.Contract(reserve.token, ERC20_ABI, ethers.provider);
      const before = (await erc20.balanceOf(await vault.getAddress())) as bigint;

      await vault.createOwnerAutomation([
        actionStep(await borrow.getAddress(), encodeParams(reserve.token, Mode.FIXED, want)),
      ]);
      await vault.executeAutomation(1);

      const after = (await erc20.balanceOf(await vault.getAddress())) as bigint;
      expect(after - before).to.equal(want);
      expect(await totalDebtBase(ethers, registry, await vault.getAddress())).to.be.greaterThan(0n);
    });
  }

  it("borrows FROM_SLOT and writes the borrowed amount to a slot", async function () {
    const { ethers, owner, vault, supply, borrow } = await deploy();
    await supplyCollateral(ethers, owner, vault, supply);

    const reserve = RESERVES[0];
    const want = ethers.parseUnits("2", reserve.decimals);
    await vault.setContext([
      abiCoder.encode(["uint256"], [want]),
      abiCoder.encode(["uint256"], [0n]),
    ]);

    const erc20 = new ethers.Contract(reserve.token, ERC20_ABI, ethers.provider);
    const before = (await erc20.balanceOf(await vault.getAddress())) as bigint;

    await vault.createOwnerAutomation([
      actionStep(
        await borrow.getAddress(),
        encodeParams(reserve.token, Mode.FROM_SLOT, 0n, 0, 1),
      ),
    ]);
    await vault.executeAutomation(1);

    const after = (await erc20.balanceOf(await vault.getAddress())) as bigint;
    expect(after - before).to.equal(want);
    const ctx = await vault.getContext();
    expect(abiCoder.decode(["uint256"], ctx[1])[0]).to.equal(want);
  });
});
