import { expect } from "chai";
import { network } from "hardhat";
import {
  ACTION_KIND,
  asCuratedRegistry,
  CONDITION_KIND,
  classifyTarget,
  curateTargets,
  curationRecord,
  mergeCurationRecords,
  toCatalogTarget,
  type CatalogTarget,
} from "../scripts/curated-catalog.js";

const { ethers } = await network.connect();

// The deploy-side half of the curation gate: what a local deploy puts on the
// curated lists, and under which kind. The gate itself is covered by
// VaultCurationGate.ts and CuratedRegistry.ts — here the question is whether the
// deploy fills the lists the way the gate expects, because a fork whose catalog
// is curated under the wrong kind looks fine until the first automation.
//
// No fork state is involved (classification reads compiled interfaces, curation
// runs against a freshly deployed registry), so this is part of every
// `pnpm contracts:test` run.

/** Every step target a full local deploy curates, with the kind it belongs to. */
const CATALOG_CONDITIONS = [
  "TokenBalanceCondition",
  "IntervalCondition",
  "TimerCondition",
  "WickWaitRebalanceCondition",
];

const CATALOG_ACTIONS = [
  "ERC20TransferAction",
  "FeeDepositAction",
  "AaveV3SupplyAction",
  "AaveV3WithdrawAction",
  "AaveV3BorrowAction",
  "AaveV3RepayAction",
  "PancakeSwapV3SwapAction",
  "PancakeSwapV3MintAction",
  "PancakeSwapV3IncreaseLiquidityAction",
  "PancakeSwapV3DecreaseLiquidityAction",
  "PancakeSwapV3CollectAction",
  "PancakeSwapV3SwapToRangeRatioAction",
];

/** Deployed by the same script but never curated: they are not step targets. */
const SUPPORT_CONTRACTS = [
  "AaveV3Registry",
  "PancakeSwapV3Registry",
  "FeeRegistry",
  "CuratedRegistry",
  "StrategyBuilderVaultFactory",
];

async function interfaceOf(name: string) {
  return (await ethers.getContractFactory(name)).interface;
}

describe("Curated catalog (deploy scripts)", function () {
  // ── Which list a target belongs on ────────────────────────────────────────

  describe("classifyTarget", function () {
    for (const name of CATALOG_CONDITIONS) {
      it(`${name} is a condition`, async function () {
        expect(classifyTarget(name, await interfaceOf(name))).to.equal(CONDITION_KIND);
      });
    }

    for (const name of CATALOG_ACTIONS) {
      it(`${name} is an action`, async function () {
        expect(classifyTarget(name, await interfaceOf(name))).to.equal(ACTION_KIND);
      });
    }

    // The trap this whole module exists for: an updatable condition exposes
    // afterExecution, whose signature is action-shaped. It is view, so it must
    // not make the condition a delegatecall target.
    it("an updatable condition is not classified as an action", async function () {
      expect(classifyTarget("TimerCondition", await interfaceOf("TimerCondition"))).to.equal(
        CONDITION_KIND,
      );
    });

    for (const name of SUPPORT_CONTRACTS) {
      it(`${name} is refused — it is no step target`, async function () {
        const iface = await interfaceOf(name);
        expect(() => classifyTarget(name, iface)).to.throw(/neither a condition/);
      });
    }

    it("a target answering to both kinds is refused rather than guessed", function () {
      const bothKinds = {
        fragments: [
          {
            type: "function",
            stateMutability: "view",
            inputs: [{ type: "bytes" }, { type: "bytes[]" }],
            outputs: [{ type: "bool" }],
          },
          {
            type: "function",
            stateMutability: "nonpayable",
            inputs: [{ type: "bytes" }, { type: "bytes[]" }],
            outputs: [{ type: "uint32[]" }, { type: "bytes[]" }],
          },
        ],
      };
      expect(() => classifyTarget("Ambiguous", bothKinds)).to.throw(/ambiguous/);
    });
  });

  // ── Writing the lists ─────────────────────────────────────────────────────

  describe("curateTargets", function () {
    async function fixture() {
      const [deployer, stranger] = await ethers.getSigners();
      const registry = await ethers.deployContract("CuratedRegistry", [deployer.address]);

      const condition = await ethers.deployContract("TimerCondition");
      const action = await ethers.deployContract("ERC20TransferAction");

      const targets: CatalogTarget[] = [
        toCatalogTarget("TimerCondition", await condition.getAddress(), condition.interface),
        toCatalogTarget("ERC20TransferAction", await action.getAddress(), action.interface),
      ];

      return { registry, deployer, stranger, targets };
    }

    it("curates each target under its own kind, and only that kind", async function () {
      const { registry, deployer, targets } = await fixture();
      await curateTargets(asCuratedRegistry(registry), targets, deployer.address, () => {});

      const [condition, action] = targets;
      expect(await registry.isCurated(condition.address, CONDITION_KIND)).to.equal(true);
      expect(await registry.isCurated(action.address, ACTION_KIND)).to.equal(true);

      // The separation the two lists exist for: a curated condition is not a
      // legal delegatecall target, and a curated action is not a legal
      // staticcall target.
      expect(await registry.isCurated(condition.address, ACTION_KIND)).to.equal(false);
      expect(await registry.isCurated(action.address, CONDITION_KIND)).to.equal(false);
    });

    it("a second run over the same targets is a no-op, not a revert", async function () {
      const { registry, deployer, targets } = await fixture();
      await curateTargets(asCuratedRegistry(registry), targets, deployer.address, () => {});

      const lines: string[] = [];
      await curateTargets(asCuratedRegistry(registry), targets, deployer.address, (l) => lines.push(l));

      expect(lines).to.have.lengthOf(2);
      for (const line of lines) expect(line).to.contain("already curated");
      for (const target of targets) {
        expect(await registry.isCurated(target.address, target.kind)).to.equal(true);
      }
    });

    it("adds only what is missing when part of the list is already curated", async function () {
      const { registry, deployer, targets } = await fixture();
      const [condition, action] = targets;

      await (await registry.addCuratedTarget(condition.address, CONDITION_KIND)).wait();
      await curateTargets(asCuratedRegistry(registry), targets, deployer.address, () => {});

      expect(await registry.isCurated(action.address, ACTION_KIND)).to.equal(true);
    });

    it("refuses to start when the signer does not hold the curator role", async function () {
      const { registry, stranger, targets } = await fixture();

      let message = "";
      try {
        await curateTargets(asCuratedRegistry(registry), targets, stranger.address, () => {});
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).to.contain("curator is");
      // Nothing was sent — a wrong key must not curate half the catalog.
      expect(await registry.isCurated(targets[0].address, CONDITION_KIND)).to.equal(false);
    });
  });

  // ── The record the seed reads ─────────────────────────────────────────────

  describe("curationRecord", function () {
    const registry = "0x00000000000000000000000000000000000000AA";
    const targets: CatalogTarget[] = [
      { name: "C", address: "0x0000000000000000000000000000000000000001", kind: CONDITION_KIND },
      { name: "A", address: "0x0000000000000000000000000000000000000002", kind: ACTION_KIND },
    ];

    it("splits the targets by kind", function () {
      expect(curationRecord(registry, targets)).to.deep.equal({
        registry,
        conditions: ["0x0000000000000000000000000000000000000001"],
        actions: ["0x0000000000000000000000000000000000000002"],
      });
    });

    it("an incremental deploy keeps what the base deploy curated", function () {
      const merged = mergeCurationRecords(curationRecord(registry, targets), {
        registry,
        conditions: [],
        actions: ["0x0000000000000000000000000000000000000003"],
      });

      expect(merged.conditions).to.deep.equal([
        "0x0000000000000000000000000000000000000001",
      ]);
      expect(merged.actions).to.deep.equal([
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
      ]);
    });

    it("a record from a different registry is dropped, not merged", function () {
      const merged = mergeCurationRecords(
        {
          registry: "0x00000000000000000000000000000000000000BB",
          conditions: ["0x0000000000000000000000000000000000000009"],
          actions: [],
        },
        curationRecord(registry, targets),
      );

      expect(merged.registry).to.equal(registry);
      expect(merged.conditions).to.deep.equal([
        "0x0000000000000000000000000000000000000001",
      ]);
    });

    it("re-listing the same address does not duplicate it", function () {
      const record = curationRecord(registry, targets);
      const merged = mergeCurationRecords(record, record);
      expect(merged.actions).to.have.lengthOf(1);
    });
  });
});
