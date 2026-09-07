import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// The curated list of step targets. No external protocol is involved, so these
// run on the in-process network (same as AaveV3Registry.ts) and are part of
// every `pnpm contracts:test` run rather than a fork-gated suite.
//
// Observable behaviour only: who may change the lists, what the lists report,
// which events a change leaves behind, and what a curator hand-over does.

// Mirrors ICuratedRegistry.TargetKind, which in turn mirrors
// StrategyBuilderVault.StepType (CONDITION = 0, ACTION = 1).
const CONDITION = 0;
const ACTION = 1;

describe("CuratedRegistry", function () {
  async function fixture() {
    const [owner, curator, newCurator, stranger] = await ethers.getSigners();

    const registry = await ethers.deployContract("CuratedRegistry", [
      curator.address,
    ]);

    // Two real targets: an action and a condition, the two kinds of address a
    // vault delegatecalls / staticcalls.
    const action = await ethers.deployContract("ERC20TransferAction");
    const condition = await ethers.deployContract("TimerCondition");

    return {
      registry,
      owner,
      curator,
      newCurator,
      stranger,
      action: await action.getAddress(),
      condition: await condition.getAddress(),
    };
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("deployer owns the registry, the constructor argument curates", async function () {
      const { registry, owner, curator } = await fixture();
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.curator()).to.equal(curator.address);
    });

    it("announces the initial curator", async function () {
      const [, curator] = await ethers.getSigners();
      const registry = await ethers.deployContract("CuratedRegistry", [
        curator.address,
      ]);
      await expect(registry.deploymentTransaction())
        .to.emit(registry, "CuratorChanged")
        .withArgs(ethers.ZeroAddress, curator.address);
    });

    it("starts with both lists empty", async function () {
      const { registry, action, condition } = await fixture();
      expect(await registry.isCurated(action, ACTION)).to.equal(false);
      expect(await registry.isCurated(condition, CONDITION)).to.equal(false);
    });

    it("rejects a zero-address curator", async function () {
      const Registry = await ethers.getContractFactory("CuratedRegistry");
      await expect(
        Registry.deploy(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(Registry, "ZeroAddress");
    });
  });

  // ── Action and condition are separate lists ───────────────────────────────
  //
  // The vault delegatecalls actions (they run in the VAULT's storage) and
  // staticcalls conditions (they cannot write). A single flat list would make
  // every reviewed condition a legal delegatecall target too — the storage
  // corruption this registry exists to prevent. So curation never crosses over.

  describe("kinds are curated independently", function () {
    it("a condition target is NOT thereby an allowed action target", async function () {
      const { registry, curator, condition } = await fixture();
      await registry.connect(curator).addCuratedTarget(condition, CONDITION);

      expect(await registry.isCurated(condition, CONDITION)).to.equal(true);
      expect(await registry.isCurated(condition, ACTION)).to.equal(false);
    });

    it("an action target is NOT thereby an allowed condition target", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);

      expect(await registry.isCurated(action, ACTION)).to.equal(true);
      expect(await registry.isCurated(action, CONDITION)).to.equal(false);
    });

    it("the same address can be curated for both kinds, one decision each", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await registry.connect(curator).addCuratedTarget(action, CONDITION);

      expect(await registry.isCurated(action, ACTION)).to.equal(true);
      expect(await registry.isCurated(action, CONDITION)).to.equal(true);
    });

    it("removing one kind leaves the other kind curated", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await registry.connect(curator).addCuratedTarget(action, CONDITION);

      await registry.connect(curator).removeCuratedTarget(action, ACTION);

      expect(await registry.isCurated(action, ACTION)).to.equal(false);
      expect(await registry.isCurated(action, CONDITION)).to.equal(true);
    });

    it("curating one kind does not make the other kind removable", async function () {
      const { registry, curator, condition } = await fixture();
      await registry.connect(curator).addCuratedTarget(condition, CONDITION);

      await expect(
        registry.connect(curator).removeCuratedTarget(condition, ACTION),
      )
        .to.be.revertedWithCustomError(registry, "TargetNotCurated")
        .withArgs(condition, ACTION);
    });

    it("curating one kind does not block curating the other", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);

      // Same address, other kind: not a duplicate.
      await expect(registry.connect(curator).addCuratedTarget(action, CONDITION))
        .to.emit(registry, "TargetCurationChanged")
        .withArgs(action, CONDITION, curator.address, true);
    });
  });

  // ── Curating ──────────────────────────────────────────────────────────────

  describe("addCuratedTarget", function () {
    it("the curator adds a target and the view reports it", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      expect(await registry.isCurated(action, ACTION)).to.equal(true);
    });

    it("emits address, kind, curator and action", async function () {
      const { registry, curator, action } = await fixture();
      await expect(registry.connect(curator).addCuratedTarget(action, ACTION))
        .to.emit(registry, "TargetCurationChanged")
        .withArgs(action, ACTION, curator.address, true);
    });

    it("curates each target on its own", async function () {
      const { registry, curator, action, condition } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      expect(await registry.isCurated(action, ACTION)).to.equal(true);
      expect(await registry.isCurated(condition, ACTION)).to.equal(false);
    });

    it("rejects a stranger", async function () {
      const { registry, stranger, action } = await fixture();
      await expect(registry.connect(stranger).addCuratedTarget(action, ACTION))
        .to.be.revertedWithCustomError(registry, "NotCurator")
        .withArgs(stranger.address);
    });

    it("rejects the owner as caller — owning the registry is not holding the curator role", async function () {
      const { registry, owner, action } = await fixture();
      await expect(registry.connect(owner).addCuratedTarget(action, ACTION))
        .to.be.revertedWithCustomError(registry, "NotCurator")
        .withArgs(owner.address);
    });

    it("rejects the zero address", async function () {
      const { registry, curator } = await fixture();
      await expect(
        registry.connect(curator).addCuratedTarget(ethers.ZeroAddress, ACTION),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("rejects an address without code", async function () {
      const { registry, curator, stranger } = await fixture();
      await expect(
        registry.connect(curator).addCuratedTarget(stranger.address, ACTION),
      )
        .to.be.revertedWithCustomError(registry, "TargetNotAContract")
        .withArgs(stranger.address);
    });

    it("rejects a target that is already curated for that kind", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await expect(registry.connect(curator).addCuratedTarget(action, ACTION))
        .to.be.revertedWithCustomError(registry, "TargetAlreadyCurated")
        .withArgs(action, ACTION);
    });
  });

  // ── Removing ──────────────────────────────────────────────────────────────

  describe("removeCuratedTarget", function () {
    it("the curator removes a target and the view stops reporting it", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await registry.connect(curator).removeCuratedTarget(action, ACTION);
      expect(await registry.isCurated(action, ACTION)).to.equal(false);
    });

    it("emits address, kind, curator and action", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await expect(registry.connect(curator).removeCuratedTarget(action, ACTION))
        .to.emit(registry, "TargetCurationChanged")
        .withArgs(action, ACTION, curator.address, false);
    });

    it("leaves the other targets curated", async function () {
      const { registry, curator, action, condition } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await registry.connect(curator).addCuratedTarget(condition, CONDITION);
      await registry.connect(curator).removeCuratedTarget(action, ACTION);
      expect(await registry.isCurated(condition, CONDITION)).to.equal(true);
    });

    it("rejects a stranger", async function () {
      const { registry, curator, stranger, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await expect(
        registry.connect(stranger).removeCuratedTarget(action, ACTION),
      )
        .to.be.revertedWithCustomError(registry, "NotCurator")
        .withArgs(stranger.address);
    });

    it("rejects the owner as caller", async function () {
      const { registry, owner, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await expect(registry.connect(owner).removeCuratedTarget(action, ACTION))
        .to.be.revertedWithCustomError(registry, "NotCurator")
        .withArgs(owner.address);
    });

    it("rejects a target that is not curated", async function () {
      const { registry, curator, action } = await fixture();
      await expect(registry.connect(curator).removeCuratedTarget(action, ACTION))
        .to.be.revertedWithCustomError(registry, "TargetNotCurated")
        .withArgs(action, ACTION);
    });

    it("a removed target can be curated again", async function () {
      const { registry, curator, action } = await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await registry.connect(curator).removeCuratedTarget(action, ACTION);
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      expect(await registry.isCurated(action, ACTION)).to.equal(true);
    });
  });

  // ── The curator role ──────────────────────────────────────────────────────

  describe("setCurator", function () {
    it("the owner hands the role over and it is visible", async function () {
      const { registry, owner, newCurator } = await fixture();
      await registry.connect(owner).setCurator(newCurator.address);
      expect(await registry.curator()).to.equal(newCurator.address);
    });

    it("emits the hand-over", async function () {
      const { registry, owner, curator, newCurator } = await fixture();
      await expect(registry.connect(owner).setCurator(newCurator.address))
        .to.emit(registry, "CuratorChanged")
        .withArgs(curator.address, newCurator.address);
    });

    it("the new curator may curate", async function () {
      const { registry, owner, newCurator, action } = await fixture();
      await registry.connect(owner).setCurator(newCurator.address);
      await registry.connect(newCurator).addCuratedTarget(action, ACTION);
      expect(await registry.isCurated(action, ACTION)).to.equal(true);
    });

    it("the previous curator may not", async function () {
      const { registry, owner, curator, newCurator, action } = await fixture();
      await registry.connect(owner).setCurator(newCurator.address);
      await expect(registry.connect(curator).addCuratedTarget(action, ACTION))
        .to.be.revertedWithCustomError(registry, "NotCurator")
        .withArgs(curator.address);
    });

    it("the lists survive the hand-over", async function () {
      const { registry, owner, curator, newCurator, action, condition } =
        await fixture();
      await registry.connect(curator).addCuratedTarget(action, ACTION);
      await registry.connect(curator).addCuratedTarget(condition, CONDITION);
      await registry.connect(owner).setCurator(newCurator.address);
      expect(await registry.isCurated(action, ACTION)).to.equal(true);
      expect(await registry.isCurated(condition, CONDITION)).to.equal(true);
    });

    it("rejects a non-owner — the curator cannot appoint a successor", async function () {
      const { registry, curator, newCurator } = await fixture();
      await expect(registry.connect(curator).setCurator(newCurator.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
        .withArgs(curator.address);
    });

    it("rejects the zero address", async function () {
      const { registry, owner } = await fixture();
      await expect(
        registry.connect(owner).setCurator(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    // What the owner/curator split is actually worth. Not a security boundary:
    // the owner can take the role and curate in the next transaction. What it
    // does buy is that taking the role is a separate, visible on-chain step.
    it("the owner can name itself curator and then curate — the split is per transaction, not a barrier", async function () {
      const { registry, owner, action } = await fixture();

      await expect(registry.connect(owner).addCuratedTarget(action, ACTION))
        .to.be.revertedWithCustomError(registry, "NotCurator")
        .withArgs(owner.address);

      // One extra transaction, and it leaves a trail.
      await expect(registry.connect(owner).setCurator(owner.address)).to.emit(
        registry,
        "CuratorChanged",
      );

      await registry.connect(owner).addCuratedTarget(action, ACTION);
      expect(await registry.isCurated(action, ACTION)).to.equal(true);
    });
  });
});
