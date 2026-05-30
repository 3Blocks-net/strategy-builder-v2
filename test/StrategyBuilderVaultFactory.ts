import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder } from "ethers";

const { ethers } = await network.connect();

describe("StrategyBuilderVaultFactory", function () {
  async function deployFactoryFixture() {
    const [deployer, alice, bob, other] = await ethers.getSigners();

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());

    return { vaultImpl, factory, deployer, alice, bob, other };
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("factory is deployed with correct owner", async function () {
      const { factory, deployer } = await deployFactoryFixture();
      expect(await factory.owner()).to.equal(deployer.address);
    });

    it("factory stores the correct vault implementation", async function () {
      const { factory, vaultImpl } = await deployFactoryFixture();
      expect(await factory.vaultImplementation()).to.equal(await vaultImpl.getAddress());
    });

    it("starts with zero vaults", async function () {
      const { factory } = await deployFactoryFixture();
      expect(await factory.vaultCount()).to.equal(0n);
    });

    it("vault implementation cannot be initialised directly", async function () {
      const { vaultImpl, alice } = await deployFactoryFixture();
      await expect(
        vaultImpl.initialize(alice.address, ethers.ZeroAddress, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(vaultImpl, "InvalidInitialization");
    });

    it("feeRegistry is zero by default", async function () {
      const { factory } = await deployFactoryFixture();
      expect(await factory.feeRegistry()).to.equal(ethers.ZeroAddress);
    });
  });

  // ── createVault ───────────────────────────────────────────────────────────

  describe("createVault", function () {
    it("deploys a vault proxy and emits VaultCreated", async function () {
      const { factory, alice } = await deployFactoryFixture();
      const tx = await factory.createVault(alice.address, ethers.ZeroAddress, ethers.ZeroHash);
      const vaultAddress = await factory.getVault(0);

      await expect(tx)
        .to.emit(factory, "VaultCreated")
        .withArgs(vaultAddress, alice.address, 0n);

      expect(await factory.vaultCount()).to.equal(1n);
    });

    it("vault proxy is owned by vaultOwner, not factory deployer", async function () {
      const { factory, alice, deployer } = await deployFactoryFixture();
      await factory.createVault(alice.address, ethers.ZeroAddress, ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      expect(await vault.owner()).to.equal(alice.address);
      expect(await vault.owner()).to.not.equal(deployer.address);
    });

    it("each vault proxy has independent storage", async function () {
      const { factory, alice, bob } = await deployFactoryFixture();
      await factory.createVault(alice.address, ethers.ZeroAddress, ethers.ZeroHash);
      await factory.createVault(bob.address, ethers.ZeroAddress, ethers.ZeroHash);

      const vaultA = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      const vaultB = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(1));

      expect(await vaultA.getAddress()).to.not.equal(await vaultB.getAddress());

      await vaultA.connect(alice).setContext([
        AbiCoder.defaultAbiCoder().encode(["uint256"], [42n]),
      ]);
      expect((await vaultA.getContext()).length).to.equal(1);
      expect((await vaultB.getContext()).length).to.equal(0);
    });

    it("anyone can create a vault", async function () {
      const { factory, other } = await deployFactoryFixture();
      await expect(factory.connect(other).createVault(other.address, ethers.ZeroAddress, ethers.ZeroHash))
        .to.emit(factory, "VaultCreated");
    });

    it("reverts when vaultOwner is zero address", async function () {
      const { factory } = await deployFactoryFixture();
      await expect(
        factory.createVault(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  // ── Vault implementation management ───────────────────────────────────────

  describe("setVaultImplementation", function () {
    it("only factory owner can update the vault implementation", async function () {
      const { factory, other, vaultImpl } = await deployFactoryFixture();
      await expect(
        factory.connect(other).setVaultImplementation(await vaultImpl.getAddress()),
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("reverts when implementation is an EOA", async function () {
      const { factory, deployer, other } = await deployFactoryFixture();
      await expect(
        factory.connect(deployer).setVaultImplementation(other.address),
      ).to.be.revertedWithCustomError(factory, "InvalidImplementation");
    });

    it("new vaults use the updated implementation", async function () {
      const { factory, alice, deployer } = await deployFactoryFixture();

      const newVaultImpl = await ethers.deployContract("StrategyBuilderVault");
      await expect(
        factory.connect(deployer).setVaultImplementation(await newVaultImpl.getAddress()),
      )
        .to.emit(factory, "VaultImplementationUpdated")
        .withArgs(await newVaultImpl.getAddress());

      await factory.createVault(alice.address, ethers.ZeroAddress, ethers.ZeroHash);
      const newVault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );
      expect(await newVault.owner()).to.equal(alice.address);
    });
  });

  // ── createVault safety ─────────────────────────────────────────────────────

  describe("createVault safety", function () {
    it("reverts when implementation has not been set", async function () {
      const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
      await expect(
        factory.createVault(ethers.Wallet.createRandom().address, ethers.ZeroAddress, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(factory, "ImplementationNotSet");
    });

    it("same caller + same salt + different vaultOwner produces different addresses", async function () {
      const { factory, alice, bob } = await deployFactoryFixture();
      await factory.createVault(alice.address, ethers.ZeroAddress, ethers.ZeroHash);
      await factory.createVault(bob.address, ethers.ZeroAddress, ethers.ZeroHash);
      expect(await factory.getVault(0)).to.not.equal(await factory.getVault(1));
    });

    it("same salt from different callers produces different vault addresses", async function () {
      const { factory, alice, bob } = await deployFactoryFixture();
      await factory.connect(alice).createVault(alice.address, ethers.ZeroAddress, ethers.ZeroHash);
      await factory.connect(bob).createVault(bob.address, ethers.ZeroAddress, ethers.ZeroHash);
      expect(await factory.getVault(0)).to.not.equal(await factory.getVault(1));
    });
  });

  // ── FeeRegistry management ─────────────────────────────────────────────────

  describe("setFeeRegistry", function () {
    it("only owner can set the fee registry", async function () {
      const { factory, other } = await deployFactoryFixture();
      await expect(
        factory.connect(other).setFeeRegistry(other.address),
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("owner can set fee registry and emits FeeRegistryUpdated", async function () {
      const { factory, deployer, other } = await deployFactoryFixture();
      await expect(factory.connect(deployer).setFeeRegistry(other.address))
        .to.emit(factory, "FeeRegistryUpdated")
        .withArgs(other.address);
      expect(await factory.feeRegistry()).to.equal(other.address);
    });

    it("owner can clear fee registry by setting zero address", async function () {
      const { factory, deployer, other } = await deployFactoryFixture();
      await factory.connect(deployer).setFeeRegistry(other.address);
      await factory.connect(deployer).setFeeRegistry(ethers.ZeroAddress);
      expect(await factory.feeRegistry()).to.equal(ethers.ZeroAddress);
    });

    it("newly created vault inherits the fee registry", async function () {
      const { factory, deployer, alice } = await deployFactoryFixture();
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await factory.connect(deployer).setFeeRegistry(await feeRegistry.getAddress());

      await factory.createVault(alice.address, ethers.ZeroAddress, ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      expect(await vault.feeRegistry()).to.equal(await feeRegistry.getAddress());
    });
  });
});
