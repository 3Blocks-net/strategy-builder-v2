import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Registry unit tests (no fork): constructor resolves + caches the Pool from the
// AddressesProvider, resolves the oracle at runtime, and rejects zero addresses.
describe("AaveV3Registry", function () {
  async function fixture() {
    const oracle = ethers.Wallet.createRandom().address;
    const pool = await ethers.deployContract("MockAaveV3Pool");
    const provider = await ethers.deployContract("MockPoolAddressesProvider", [
      await pool.getAddress(),
      oracle,
    ]);
    const registry = await ethers.deployContract("AaveV3Registry", [
      await provider.getAddress(),
    ]);
    return { registry, provider, pool, oracle };
  }

  it("stores the AddressesProvider", async function () {
    const { registry, provider } = await fixture();
    expect(await registry.addressesProvider()).to.equal(
      await provider.getAddress(),
    );
  });

  it("resolves and caches the Pool from the provider", async function () {
    const { registry, pool } = await fixture();
    expect(await registry.pool()).to.equal(await pool.getAddress());
  });

  it("resolves the price oracle at runtime (not cached)", async function () {
    const { registry, oracle } = await fixture();
    expect(await registry.priceOracle()).to.equal(oracle);
  });

  it("reverts on zero-address provider construction", async function () {
    const Registry = await ethers.getContractFactory("AaveV3Registry");
    await expect(
      Registry.deploy(ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(Registry, "ZeroAddress");
  });

  it("reverts when the provider resolves a zero Pool", async function () {
    const provider = await ethers.deployContract("MockPoolAddressesProvider", [
      ethers.ZeroAddress,
      ethers.Wallet.createRandom().address,
    ]);
    const Registry = await ethers.getContractFactory("AaveV3Registry");
    await expect(
      Registry.deploy(await provider.getAddress()),
    ).to.be.revertedWithCustomError(Registry, "ZeroAddress");
  });
});
