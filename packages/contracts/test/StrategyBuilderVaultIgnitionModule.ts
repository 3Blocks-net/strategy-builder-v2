import { expect } from "chai";
import { network } from "hardhat";
import StrategyBuilderVaultModule from "../ignition/modules/StrategyBuilderVault.js";

const { ethers, ignition } = await network.connect();

// ── Behaviour under test ─────────────────────────────────────────────────────
//
// The Ignition module is the only path onto BSC testnet and mainnet
// (`pnpm contracts:deploy:testnet` / `:mainnet`). `hardhat compile` and `tsc`
// say nothing about it: Ignition checks constructor arguments against the
// artifact, and it does so at deploy time. Without a test the first place a
// broken module shows up is a failed deploy on a real chain.
//
// What is pinned here is what the deploy has to produce: a vault
// implementation that is actually bound to the registry the module deployed
// (an unbound implementation would mean vaults with no curation gate), the
// owner/curator split on that registry, a factory pointing at that
// implementation — and a deploy that refuses to run at all when nobody named
// the curator.

const CURATOR = "0x00000000000000000000000000000000000000C0";

function parametersWith(curator: string) {
  return { StrategyBuilderVaultModule: { curator } };
}

describe("StrategyBuilderVaultModule (Ignition)", function () {
  describe("with a curator parameter", function () {
    it("binds the vault implementation to the registry it deploys", async function () {
      const { vaultImpl, curatedRegistry } = await ignition.deploy(
        StrategyBuilderVaultModule,
        { parameters: parametersWith(CURATOR) },
      );

      expect(await vaultImpl.curatedRegistry()).to.equal(
        await curatedRegistry.getAddress(),
      );
    });

    it("leaves the curator role with the named key, ownership with the deployer", async function () {
      const [deployer] = await ethers.getSigners();

      const { curatedRegistry } = await ignition.deploy(StrategyBuilderVaultModule, {
        parameters: parametersWith(CURATOR),
      });

      expect(await curatedRegistry.curator()).to.equal(CURATOR);
      expect(await curatedRegistry.owner()).to.equal(deployer.address);
    });

    it("points the factory at that vault implementation", async function () {
      const { factory, vaultImpl } = await ignition.deploy(StrategyBuilderVaultModule, {
        parameters: parametersWith(CURATOR),
      });

      expect(await factory.vaultImplementation()).to.equal(
        await vaultImpl.getAddress(),
      );
    });

    it("curates nothing — the list arrives empty", async function () {
      const { curatedRegistry, tokenBalanceCondition, erc20TransferAction } =
        await ignition.deploy(StrategyBuilderVaultModule, {
          parameters: parametersWith(CURATOR),
        });

      const CONDITION = 0;
      const ACTION = 1;
      expect(
        await curatedRegistry.isCurated(
          await tokenBalanceCondition.getAddress(),
          CONDITION,
        ),
      ).to.equal(false);
      expect(
        await curatedRegistry.isCurated(
          await erc20TransferAction.getAddress(),
          ACTION,
        ),
      ).to.equal(false);
    });
  });

  describe("without a curator parameter", function () {
    it("refuses to deploy instead of defaulting the role", async function () {
      let error: unknown;
      try {
        await ignition.deploy(StrategyBuilderVaultModule);
      } catch (caught) {
        error = caught;
      }

      expect(error, "deploy without a curator should fail").to.be.instanceOf(Error);
      expect((error as Error).message).to.contain("curator");
    });
  });
});
