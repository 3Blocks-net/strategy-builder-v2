import { expect } from "chai";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// ─── Inventory (issue #19, PRD S5) ───────────────────────────────────────────
// The acceptance criterion is not "the two actions we remembered are protected"
// but "no swapping action is unprotected". That only stays true if it is checked
// rather than asserted once in a commit message: a third swapping action added
// later would otherwise ship with amountOutMinimum = 0 and nobody would notice.
//
// The rule: exactly one production file may call the router. Everything that
// swaps goes through SlippageGuard.

const CONTRACTS_ROOT = fileURLToPath(new URL("../contracts", import.meta.url));
const GUARD = "libraries/SlippageGuard.sol";
// Interfaces declare the router; test doubles impersonate it. Neither swaps.
const EXCLUDED_DIRS = ["interfaces", "test"];

function solidityFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      return EXCLUDED_DIRS.includes(entry) ? [] : solidityFiles(full, rel);
    }
    return entry.endsWith(".sol") ? [rel] : [];
  });
}

describe("swap inventory — no unprotected swap path", function () {
  const files = solidityFiles(CONTRACTS_ROOT);
  const source = new Map(files.map((rel) => [rel, readFileSync(join(CONTRACTS_ROOT, rel), "utf8")]));

  it("finds the production contracts at all (guards the guard)", function () {
    expect(files).to.include("actions/PancakeSwapV3SwapAction.sol");
    expect(files).to.include("actions/PancakeSwapV3SwapToRangeRatioAction.sol");
    expect(files).to.include(GUARD);
  });

  it("routes every router call through SlippageGuard", function () {
    const callers = files.filter((rel) => source.get(rel)!.includes("exactInputSingle("));
    expect(callers).to.deep.equal([GUARD]);
  });

  it("gives every swapping action a minimum-out path", function () {
    // Reaching for the router (`registry.swapRouter()`) is what makes a contract
    // a swapping one — the registry that merely holds the address does not.
    const swapping = files.filter(
      (rel) => rel !== GUARD && source.get(rel)!.includes("swapRouter()"),
    );
    expect(swapping.length).to.be.greaterThan(0);
    for (const rel of swapping) {
      expect(source.get(rel), `${rel} must import the shared guard`).to.contain(
        'import "../libraries/SlippageGuard.sol"',
      );
    }
  });
});
