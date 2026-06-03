import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id, MaxUint256 } from "ethers";

// ─── Forked-mainnet test (core deliverable) ──────────────────────────────────
// Supplies WBNB collateral, borrows real BSC reserves, then repays them via the
// Repay action across FIXED / FROM_SLOT / repay-full-debt, asserting the debt is
// reduced/cleared, the allowance is reset to 0, and the ACTUAL repaid amount
// (≠ uint256.max) lands in a context slot. Requires an archive BSC RPC.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const Mode = { FIXED: 0, FROM_SLOT: 1, MAX_AVAILABLE: 2 } as const;

const AAVE_PROVIDER = "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const RESERVES = [
  { symbol: "USDT", token: "0x55d398326f99059fF775485246999027B3197955", whale: "0xF977814e90dA44bFA03b6295A0616a897441aceC", decimals: 18 },
  { symbol: "USDC", token: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", whale: "0xF977814e90dA44bFA03b6295A0616a897441aceC", decimals: 18 },
  { symbol: "WBNB", token: WBNB, whale: "", wrap: true, decimals: 18 },
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

forkDescribe("AaveV3RepayAction (fork)", function () {
  this.timeout(240_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
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
    const supply = await ethers.deployContract("AaveV3SupplyAction", [await registry.getAddress()]);
    const borrow = await ethers.deployContract("AaveV3BorrowAction", [await registry.getAddress()]);
    const repay = await ethers.deployContract("AaveV3RepayAction", [await registry.getAddress()]);

    return { ethers, owner, vault, registry, supply, borrow, repay };
  }

  async function fund(ethers: any, owner: any, to: string, reserve: any, amount: bigint) {
    if (reserve.wrap) {
      const wbnb = new ethers.Contract(reserve.token, ERC20_ABI, owner);
      await (await wbnb.deposit({ value: amount })).wait();
      await (await wbnb.transfer(to, amount)).wait();
      return;
    }
    const whaleAddr = ethers.getAddress(reserve.whale.toLowerCase());
    await ethers.provider.send("hardhat_impersonateAccount", [whaleAddr]);
    await ethers.provider.send("hardhat_setBalance", [whaleAddr, "0xDE0B6B3A7640000"]);
    const whale = await ethers.getSigner(whaleAddr);
    await (await new ethers.Contract(reserve.token, ERC20_ABI, whale).transfer(to, amount)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [whaleAddr]);
  }

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

  async function variableDebt(ethers: any, registry: any, asset: string, vault: string): Promise<bigint> {
    const pool = await ethers.getContractAt("IAaveV3Pool", await registry.pool());
    const data = await pool.getReserveData(asset);
    const debtToken = new ethers.Contract(data.variableDebtTokenAddress, ERC20_ABI, ethers.provider);
    return (await debtToken.balanceOf(vault)) as bigint;
  }

  for (const reserve of RESERVES) {
    it(`repays ${reserve.symbol} in full (MAX) — debt cleared, allowance reset, actual ≠ sentinel`, async function () {
      const { ethers, owner, vault, registry, supply, borrow, repay } = await deploy();
      await supplyCollateral(ethers, owner, vault, supply);

      const borrowAmt = ethers.parseUnits("1", reserve.decimals);
      await vault.createOwnerAutomation([
        actionStep(await borrow.getAddress(), encodeParams(reserve.token, Mode.FIXED, borrowAmt)),
      ]);
      await vault.executeAutomation(1);

      // Buffer so balance > debt (which accrues interest) → full clear.
      await fund(ethers, owner, await vault.getAddress(), reserve, ethers.parseUnits("1", reserve.decimals));
      await vault.setContext([abiCoder.encode(["uint256"], [0n])]);

      await vault.createOwnerAutomation([
        actionStep(await repay.getAddress(), encodeParams(reserve.token, Mode.MAX_AVAILABLE, 0n, NO_SLOT, 0)),
      ]);
      await vault.executeAutomation(2);

      expect(await variableDebt(ethers, registry, reserve.token, await vault.getAddress())).to.equal(0n);

      const erc20 = new ethers.Contract(reserve.token, ERC20_ABI, ethers.provider);
      expect(await erc20.allowance(await vault.getAddress(), await registry.pool())).to.equal(0n);

      const ctx = await vault.getContext();
      const written = abiCoder.decode(["uint256"], ctx[0])[0] as bigint;
      expect(written).to.be.greaterThan(0n);
      expect(written).to.not.equal(MaxUint256);
    });
  }

  it("partial FIXED repay reduces the debt", async function () {
    const { ethers, owner, vault, registry, supply, borrow, repay } = await deploy();
    await supplyCollateral(ethers, owner, vault, supply);
    const reserve = RESERVES[0];

    const borrowAmt = ethers.parseUnits("4", reserve.decimals);
    await vault.createOwnerAutomation([
      actionStep(await borrow.getAddress(), encodeParams(reserve.token, Mode.FIXED, borrowAmt)),
    ]);
    await vault.executeAutomation(1);
    const debtBefore = await variableDebt(ethers, registry, reserve.token, await vault.getAddress());

    await vault.createOwnerAutomation([
      actionStep(await repay.getAddress(), encodeParams(reserve.token, Mode.FIXED, ethers.parseUnits("2", reserve.decimals))),
    ]);
    await vault.executeAutomation(2);

    const debtAfter = await variableDebt(ethers, registry, reserve.token, await vault.getAddress());
    expect(debtBefore - debtAfter).to.be.greaterThanOrEqual(ethers.parseUnits("2", reserve.decimals) - ethers.parseUnits("0.001", reserve.decimals));
  });

  it("FROM_SLOT repay reduces the debt by the slot amount", async function () {
    const { ethers, owner, vault, registry, supply, borrow, repay } = await deploy();
    await supplyCollateral(ethers, owner, vault, supply);
    const reserve = RESERVES[0];

    await vault.createOwnerAutomation([
      actionStep(await borrow.getAddress(), encodeParams(reserve.token, Mode.FIXED, ethers.parseUnits("4", reserve.decimals))),
    ]);
    await vault.executeAutomation(1);
    const debtBefore = await variableDebt(ethers, registry, reserve.token, await vault.getAddress());

    await vault.setContext([abiCoder.encode(["uint256"], [ethers.parseUnits("1", reserve.decimals)])]);
    await vault.createOwnerAutomation([
      actionStep(await repay.getAddress(), encodeParams(reserve.token, Mode.FROM_SLOT, 0n, 0)),
    ]);
    await vault.executeAutomation(2);

    const debtAfter = await variableDebt(ethers, registry, reserve.token, await vault.getAddress());
    expect(debtBefore - debtAfter).to.be.greaterThanOrEqual(ethers.parseUnits("1", reserve.decimals) - ethers.parseUnits("0.001", reserve.decimals));
  });
});
