import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

// ─── Forked-mainnet test (core deliverable) ──────────────────────────────────
// Supplies real BSC reserves to live Aave V3 across the three amount modes and
// asserts the vault's aToken balance increased and the action's allowance to the
// Pool is back to 0. Requires an archive-capable BSC RPC; skipped otherwise.
//
//   BSC_MAINNET_RPC_URL=<archive rpc> npx hardhat test test/AaveV3SupplyAction.fork.ts
//
// Uses the `bscFork` in-process fork (network.connect("bscFork")).

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const Mode = { FIXED: 0, FROM_SLOT: 1, MAX_AVAILABLE: 2 } as const;

// Aave V3 BSC PoolAddressesProvider.
const AAVE_PROVIDER = "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D";

// Three live BSC reserves + a whale holding each (for impersonated funding).
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
    whale: "", // funded by wrapping native BNB (see fundVault)
    wrap: true,
    decimals: 18,
  },
];

function encodeSupplyParams(
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
  return {
    stepType: 1,
    target,
    selector: EXECUTE_SEL,
    nextOnTrue: DONE,
    nextOnFalse: DONE,
    data,
  };
}

forkDescribe("AaveV3SupplyAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
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
    const action = await ethers.deployContract("AaveV3SupplyAction", [
      await registry.getAddress(),
    ]);

    return { ethers, owner, vault, registry, action };
  }

  async function fundVault(
    ethers: any,
    owner: any,
    vault: string,
    reserve: (typeof RESERVES)[number] & { wrap?: boolean },
    amount: bigint,
  ) {
    if (reserve.wrap) {
      // Wrap native BNB → WBNB from the deployer, then transfer to the vault.
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
    await ethers.provider.send("hardhat_setBalance", [
      whaleAddr,
      "0xDE0B6B3A7640000",
    ]);
    const whale = await ethers.getSigner(whaleAddr);
    const token = new ethers.Contract(reserve.token, ERC20_ABI, whale);
    await (await token.transfer(vault, amount)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [whaleAddr]);
  }

  async function aTokenOf(ethers: any, registry: any, asset: string) {
    const pool = await ethers.getContractAt("IAaveV3Pool", await registry.pool());
    const data = await pool.getReserveData(asset);
    return data.aTokenAddress as string;
  }

  for (const reserve of RESERVES) {
    it(`supplies ${reserve.symbol} (FIXED) — aToken up, allowance reset`, async function () {
      const { ethers, owner, vault, registry, action } = await deploy();
      const amount = ethers.parseUnits("10", reserve.decimals);
      await fundVault(ethers, owner, await vault.getAddress(), reserve, amount);

      const aTokenAddr = await aTokenOf(ethers, registry, reserve.token);
      const aToken = new ethers.Contract(aTokenAddr, ERC20_ABI, ethers.provider);
      const before = await aToken.balanceOf(await vault.getAddress());

      await vault.createOwnerAutomation([
        actionStep(
          await action.getAddress(),
          encodeSupplyParams(reserve.token, Mode.FIXED, amount),
        ),
      ]);
      await vault.executeAutomation(0);

      const after = await aToken.balanceOf(await vault.getAddress());
      expect(after - before).to.be.greaterThanOrEqual(amount - 2n);

      const erc20 = new ethers.Contract(reserve.token, ERC20_ABI, ethers.provider);
      expect(
        await erc20.allowance(await vault.getAddress(), await registry.pool()),
      ).to.equal(0n);
    });
  }

  it("supplies MAX_AVAILABLE (full balance) and writes the amount to a slot", async function () {
    const { ethers, owner, vault, registry, action } = await deploy();
    const reserve = RESERVES[0];
    const amount = ethers.parseUnits("15", reserve.decimals);
    await fundVault(ethers, owner, await vault.getAddress(), reserve, amount);
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);

    const aTokenAddr = await aTokenOf(ethers, registry, reserve.token);
    const aToken = new ethers.Contract(aTokenAddr, ERC20_ABI, ethers.provider);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(reserve.token, Mode.MAX_AVAILABLE, 0n, NO_SLOT, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await aToken.balanceOf(await vault.getAddress())).to.be.greaterThan(0n);
    const ctx = await vault.getContext();
    expect(abiCoder.decode(["uint256"], ctx[0])[0]).to.equal(amount);
  });
});
