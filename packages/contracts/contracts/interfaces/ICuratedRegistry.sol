// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ICuratedRegistry
 * @notice The list of reviewed step targets a standard-mode vault is allowed to
 *         deploy against, kept separately per kind of call.
 *
 * Two kinds, never one list
 * ─────────────────────────
 * The vault calls the two kinds of step in fundamentally different ways:
 * a condition is `staticcall`ed (it cannot write anything), an action is
 * `delegatecall`ed and therefore runs in the VAULT's storage. A single flat
 * list would make every curated condition a legal `delegatecall` target as
 * well, and a condition contract that writes its own slots would then overwrite
 * the vault's — the storage corruption this registry exists to prevent. So a
 * target is curated for a `TargetKind`, and the caller must ask for the kind it
 * is about to use.
 *
 * Roles
 * ─────
 * • owner   — appoints/replaces the curator (OpenZeppelin `Ownable`).
 * • curator — the only role that may add or remove targets. Held separately
 *   from the owner because the key that curates is operational and rotates,
 *   while the key that owns the registry is cold. This separation is per
 *   transaction, not a security boundary: see `setCurator`.
 *   The fee epic introduces `discountSetter` in the same shape.
 *
 * Scope
 * ─────
 * This contract only keeps the list. It knows nothing about vaults or running
 * automations, so removing a target has no effect on automations that are
 * already deployed — the check against this list lives in the vault.
 */
interface ICuratedRegistry {
    // ── Types ─────────────────────────────────────────────────────────────────

    /**
     * @notice How the vault will call this target.
     * @dev `Condition` — `staticcall`ed, cannot write anything.
     *      `Action` — `delegatecall`ed, runs in the vault's own storage.
     *
     *      The order deliberately mirrors `StrategyBuilderVault.StepType`
     *      (`CONDITION = 0`, `ACTION = 1`), so a caller maps a step to its kind
     *      by value and cannot silently swap the two.
     */
    enum TargetKind {
        Condition,
        Action
    }

    // ── Events ────────────────────────────────────────────────────────────────

    /**
     * @notice A target was added to (`curated == true`) or removed from
     *         (`curated == false`) the curated list for one kind.
     * @param target  The step target address.
     * @param kind    Which list changed — action targets and condition targets
     *                are curated independently.
     * @param curator The curator that made the change.
     * @param curated The new curation state (the action taken).
     */
    event TargetCurationChanged(
        address indexed target,
        TargetKind indexed kind,
        address indexed curator,
        bool curated
    );

    /// @notice The curator role moved from `previousCurator` to `newCurator`.
    event CuratorChanged(address indexed previousCurator, address indexed newCurator);

    // ── Errors ────────────────────────────────────────────────────────────────

    /// @notice Caller is not the curator.
    error NotCurator(address caller);

    /// @notice A zero address was passed where a real address is required.
    error ZeroAddress();

    /// @notice Target has no code — a `delegatecall` into it would silently succeed.
    error TargetNotAContract(address target);

    /// @notice Target is already on this kind's list; the call would be a no-op.
    error TargetAlreadyCurated(address target, TargetKind kind);

    /// @notice Target is not on this kind's list; the call would be a no-op.
    error TargetNotCurated(address target, TargetKind kind);

    // ── Curator ───────────────────────────────────────────────────────────────

    /// @notice Add `target` to the curated list for `kind`. Curator only.
    function addCuratedTarget(address target, TargetKind kind) external;

    /// @notice Remove `target` from the curated list for `kind`. Curator only.
    function removeCuratedTarget(address target, TargetKind kind) external;

    // ── Owner ─────────────────────────────────────────────────────────────────

    /// @notice Hand the curator role to `newCurator`. Owner only.
    function setCurator(address newCurator) external;

    // ── Views ─────────────────────────────────────────────────────────────────

    /**
     * @notice True when `target` is currently curated **for `kind`**. Read by
     *         vault, backend and tests.
     * @dev Curation for one kind says nothing about the other: a condition on
     *      the list is not thereby a legal `delegatecall` target.
     */
    function isCurated(address target, TargetKind kind) external view returns (bool);

    /// @notice The address currently holding the curator role.
    function curator() external view returns (address);
}
