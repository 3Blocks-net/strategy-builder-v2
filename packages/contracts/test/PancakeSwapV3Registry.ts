import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Registry unit tests (no fork): stores the three PCS addresses as immutables;
// zero-address construction reverts.
describe("PancakeSwapV3Registry", function () {
  const A = "0x1111111111111111111111111111111111111111";
  const B = "0x2222222222222222222222222222222222222222";
  const C = "0x3333333333333333333333333333333333333333";

  it("stores swapRouter / positionManager / factory", async function () {
    const reg = await ethers.deployContract("PancakeSwapV3Registry", [A, B, C]);
    expect(await reg.swapRouter()).to.equal(A);
    expect(await reg.positionManager()).to.equal(B);
    expect(await reg.factory()).to.equal(C);
  });

  it("reverts on a zero swapRouter", async function () {
    const Reg = await ethers.getContractFactory("PancakeSwapV3Registry");
    await expect(Reg.deploy(ethers.ZeroAddress, B, C)).to.be.revertedWithCustomError(Reg, "ZeroAddress");
  });

  it("reverts on a zero positionManager", async function () {
    const Reg = await ethers.getContractFactory("PancakeSwapV3Registry");
    await expect(Reg.deploy(A, ethers.ZeroAddress, C)).to.be.revertedWithCustomError(Reg, "ZeroAddress");
  });

  it("reverts on a zero factory", async function () {
    const Reg = await ethers.getContractFactory("PancakeSwapV3Registry");
    await expect(Reg.deploy(A, B, ethers.ZeroAddress)).to.be.revertedWithCustomError(Reg, "ZeroAddress");
  });
});
