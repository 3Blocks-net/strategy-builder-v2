// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICuratedRegistry} from "./interfaces/ICuratedRegistry.sol";

/**
 * @title CuratedRegistry
 * @notice The on-chain list of reviewed step targets. A vault in standard mode
 *         deploys automations only against addresses on this list; without it,
 *         any address can be `delegatecall`ed and overwrite the vault's storage
 *         (owner slot included).
 *
 * One list per kind
 * ─────────────────
 * Curation is per `TargetKind`, never flat. The vault `staticcall`s conditions
 * and `delegatecall`s actions: a condition runs read-only in its own context, an
 * action runs in the VAULT's storage. On one shared list every reviewed
 * condition would also be a legal `delegatecall` target, and a condition that
 * writes its own slots would then write the vault's — exactly the corruption
 * this registry is built against. A caller therefore asks for the kind it is
 * about to use, and a target curated as a condition is not an action.
 *
 * Roles
 * ─────
 * • owner   — appoints and replaces the curator.
 * • curator — the only role that may add/remove targets. Held separately from
 *   the owner on purpose: curation happens often and its key is operational,
 *   ownership is cold. The fee epic introduces `discountSetter` in exactly this
 *   shape (state + `only…` modifier + owner-only setter + change event), so the
 *   role landscape stays uniform.
 *
 *   What that separation is worth, precisely: within a single transaction the
 *   owner cannot curate. It is NOT a security boundary — the owner may call
 *   `setCurator(owner)` and curate in the very next transaction, and nothing
 *   here can stop that. The value is operational hygiene (the hot curation key
 *   is not the cold ownership key) plus an on-chain trail: taking the role
 *   emits `CuratorChanged` and is therefore visible.
 *
 * Scope
 * ─────
 * This contract enforces nothing. It knows neither vaults nor automations, so
 * removing a target cannot touch automations that are already running — the
 * check against `isCurated` lives in the vault's deploy path.
 *
 * Curation is a team process (code review + fork tests); on-chain there is only
 * the role, no governance mechanism.
 */
contract CuratedRegistry is Ownable, ICuratedRegistry {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @dev Holder of the curator role. Replaced by the owner via setCurator.
    address private _curator;

    /// @dev Curated targets, per kind. Absent == false == not curated.
    mapping(TargetKind kind => mapping(address target => bool curated)) private _curated;

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyCurator() {
        if (msg.sender != _curator) revert NotCurator(msg.sender);
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param curator_ Initial holder of the curator role. The deployer becomes
     *        the owner and is *not* implicitly the curator.
     */
    constructor(address curator_) Ownable(msg.sender) {
        _setCurator(curator_);
    }

    // ─── Curator: the curated lists ───────────────────────────────────────────

    /**
     * @notice Add `target` to the curated list for `kind`.
     * @dev Reverts on a target without code: `delegatecall` into a codeless
     *      address returns success with empty data, which the vault would read
     *      as a step that ran fine.
     *
     *      Curating for one kind grants nothing for the other. A target that is
     *      genuinely both has to be curated twice, each time as a deliberate
     *      decision.
     */
    function addCuratedTarget(address target, TargetKind kind) external onlyCurator {
        if (target == address(0)) revert ZeroAddress();
        if (target.code.length == 0) revert TargetNotAContract(target);
        if (_curated[kind][target]) revert TargetAlreadyCurated(target, kind);

        _curated[kind][target] = true;
        emit TargetCurationChanged(target, kind, msg.sender, true);
    }

    /**
     * @notice Remove `target` from the curated list for `kind`.
     * @dev Only affects future deploys — automations already deployed keep
     *      running, this contract does not know them. The other kind's list is
     *      untouched.
     */
    function removeCuratedTarget(address target, TargetKind kind) external onlyCurator {
        if (!_curated[kind][target]) revert TargetNotCurated(target, kind);

        _curated[kind][target] = false;
        emit TargetCurationChanged(target, kind, msg.sender, false);
    }

    // ─── Owner: the curator role ──────────────────────────────────────────────

    /**
     * @notice Hand the curator role to `newCurator`.
     * @dev The owner may name itself here; the owner/curator split is a
     *      per-transaction rule and an audit trail, not a barrier. See the
     *      contract header.
     */
    function setCurator(address newCurator) external onlyOwner {
        _setCurator(newCurator);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @inheritdoc ICuratedRegistry
    function isCurated(address target, TargetKind kind) external view returns (bool) {
        return _curated[kind][target];
    }

    /// @inheritdoc ICuratedRegistry
    function curator() external view returns (address) {
        return _curator;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _setCurator(address newCurator) internal {
        if (newCurator == address(0)) revert ZeroAddress();
        address previous = _curator;
        _curator = newCurator;
        emit CuratorChanged(previous, newCurator);
    }
}
