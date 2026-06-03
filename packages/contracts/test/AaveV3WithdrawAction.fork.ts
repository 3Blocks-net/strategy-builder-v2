import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id, MaxUint256 } from "ethers";

// ─── Forked-mainnet test (core deliverable) ──────────────────────────────────
// Supplies real BSC reserves to live Aave V3 (via the supply spine), then
// withdraws them back into the vault across FIXED / FROM_SLOT / withdraw-all,
// asserting the vault balance increases and that withdraw-all writes the ACTUAL
// amount (≠ the uint256.max sentinel) to a context slot. Requires an archive
// BSC RPC; skipped otherwise.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const Mode = { FIXED: 0, FROM_SLOT: 1, MAX_AVAILABLE: 2 } as const;

const AAVE_PROVIDER = "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D";

const RESERVES = [
  {
    symbol: "USDT",
    token: "0x55d398326f99059fF775485246999027B3197955",
    whale: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    decimals: 18,
  },
  {
    symbol: "USDC",
    token: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    whale: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    decimals: 18,
  },
  {
    symbol: "WBNB",
    token: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    whale: "",
    wrap: true,
    decimals: 18,
  },
];

function encodeAmountParams(
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

forkDescribe("AaveV3WithdrawAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
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
    const withdraw = await ethers.deployContract("AaveV3WithdrawAction", [
      await registry.getAddress(),
    ]);

    return { ethers, owner, vault, registry, supply, withdraw };
  }

  async function fundVault(
    ethers: any,
    owner: any,
    vault: string,
    reserve: (typeof RESERVES)[number] & { wrap?: boolean },
    amount: bigint,
  ) {
    if (reserve.wrap) {
      const wbnb = new ethers.Contract(
        reserve.token,
        ["function deposit() payable", ...ERC20_ABI],
        owner,
      );
      await (await wbnb.deposit({ value: amount })).wait();
      await (await wbnb.transfer(vault, amount)).wait();
      return;
    }
    const whaleAddr = ethers.getAddress(reserve.whale.toLowerCase());
    await ethers.provider.send("hardhat_impersonateAccount", [whaleAddr]);
    await ethers.provider.send("hardhat_setBalance", [whaleAddr, "0xDE0B6B3A7640000"]);
    const whale = await ethers.getSigner(whaleAddr);
    const token = new ethers.Contract(reserve.token, ERC20_ABI, whale);
    await (await token.transfer(vault, amount)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [whaleAddr]);
  }

  // Supply the full funded balance to Aave (automation 0).
  async function supplyAll(vault: any, supply: any, token: string) {
    await vault.createOwnerAutomation([
      actionStep(await supply.getAddress(), encodeAmountParams(token, Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(0);
  }

  for (const reserve of RESERVES) {
    it(`withdraws ${reserve.symbol} (FIXED) back into the vault`, async function () {
      const { ethers, owner, vault, supply, withdraw } = await deploy();
      const amount = ethers.parseUnits("10", reserve.decimals);
      const half = amount / 2n;
      await fundVault(ethers, owner, await vault.getAddress(), reserve, amount);
      await supplyAll(vault, supply, reserve.token);

      const erc20 = new ethers.Contract(reserve.token, ERC20_ABI, ethers.provider);
      expect(await erc20.balanceOf(await vault.getAddress())).to.equal(0n);

      await vault.createOwnerAutomation([
        actionStep(await withdraw.getAddress(), encodeAmountParams(reserve.token, Mode.FIXED, half)),
      ]);
      await vault.executeAutomation(1);

      expect(await erc20.balanceOf(await vault.getAddress())).to.equal(half);
    });
  }

  it("withdraw-everything writes the ACTUAL amount (≠ sentinel) to a slot", async function () {
    const { ethers, owner, vault, supply, withdraw } = await deploy();
    const reserve = RESERVES[0];
    const amount = ethers.parseUnits("12", reserve.decimals);
    await fundVault(ethers, owner, await vault.getAddress(), reserve, amount);
    await supplyAll(vault, supply, reserve.token);
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);

    await vault.createOwnerAutomation([
      actionStep(
        await withdraw.getAddress(),
        encodeAmountParams(reserve.token, Mode.MAX_AVAILABLE, 0n, NO_SLOT, 0),
      ),
    ]);
    await vault.executeAutomation(1);

    const erc20 = new ethers.Contract(reserve.token, ERC20_ABI, ethers.provider);
    const vaultBal = (await erc20.balanceOf(await vault.getAddress())) as bigint;
    expect(vaultBal).to.be.greaterThanOrEqual(amount - 2n);

    const ctx = await vault.getContext();
    const written = abiCoder.decode(["uint256"], ctx[0])[0] as bigint;
    expect(written).to.equal(vaultBal);
    expect(written).to.not.equal(MaxUint256);
  });

  it("withdraws an amount read FROM_SLOT", async function () {
    const { ethers, owner, vault, supply, withdraw } = await deploy();
    const reserve = RESERVES[0];
    const amount = ethers.parseUnits("10", reserve.decimals);
    const want = ethers.parseUnits("3", reserve.decimals);
    await fundVault(ethers, owner, await vault.getAddress(), reserve, amount);
    await supplyAll(vault, supply, reserve.token);
    await vault.setContext([abiCoder.encode(["uint256"], [want])]);

    await vault.createOwnerAutomation([
      actionStep(
        await withdraw.getAddress(),
        encodeAmountParams(reserve.token, Mode.FROM_SLOT, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(1);

    const erc20 = new ethers.Contract(reserve.token, ERC20_ABI, ethers.provider);
    expect(await erc20.balanceOf(await vault.getAddress())).to.equal(want);
  });
});
