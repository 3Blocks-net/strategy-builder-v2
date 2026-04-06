// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ICrossChainFeeManager
 * @notice Interface for the CrossChainFeeManager — the LayerZero V2 OApp that
 *         routes fee settlement across chains.
 *
 * Architecture
 * ────────────
 * Each chain runs one CrossChainFeeManager.  The BSC instance is special: it is
 * the Protocol Token Hub — the only chain where protocolToken can be set in
 * FeeRegistry, and therefore the first stop for every cross-chain fee request.
 *
 * Fee resolution — two phases
 * ───────────────────────────
 * Phase 1 (always on BSC):
 *   Execution Chain ──LZ──▶ BSC CrossChainFeeManager
 *     Try ownerProtocolDeposits[owner][protocolToken] (discounted)
 *     ├─ success → LZ response back ─ done
 *     └─ fail    → Phase 2
 *
 * Phase 2 (vault's feeChainEid):
 *   ├─ feeChainEid == BSC  → try vaultDeposits locally on BSC, LZ response back
 *   └─ feeChainEid != BSC  → BSC ──LZ──▶ feeChain → try vaultDeposits
 *                                         feeChain ──LZ──▶ Execution Chain
 *
 * Executor Collateral
 * ────────────────────
 * Executors pre-deposit collateral (accepted tokens only) into this contract.
 * Before cross-chain settlement is confirmed, the required amount is locked.
 * On success → released; on failure → slashed to protocolVault.claimable.
 */
interface ICrossChainFeeManager {
    // ── Events ────────────────────────────────────────────────────────────────

    /// @dev Emitted when an executor deposits collateral.
    event CollateralDeposited(address indexed executor, address indexed token, uint256 amount);
    /// @dev Emitted when an executor withdraws collateral.
    event CollateralWithdrawn(address indexed executor, address indexed token, uint256 amount);
    /// @dev Emitted when collateral is locked for a pending cross-chain request.
    event CollateralLocked(bytes32 indexed guid, address indexed executor, address indexed token, uint256 amount);
    /// @dev Emitted when collateral is released after successful settlement.
    event CollateralReleased(bytes32 indexed guid, address indexed executor, uint256 amount);
    /// @dev Emitted when collateral is slashed after failed settlement.
    event CollateralSlashed(bytes32 indexed guid, address indexed executor, uint256 amount);
    /// @dev Emitted when a cross-chain fee request is initiated on the execution chain.
    event FeeRequestSent(bytes32 indexed guid, address indexed vault, address indexed executor, uint32 bscEid);
    /// @dev Emitted when a fee forward is sent from BSC to the vault's feeChain.
    event FeeForwardSent(bytes32 indexed guid, uint32 indexed feeChainEid);
    /// @dev Emitted when a fee response is received and the request is settled.
    event FeeRequestSettled(bytes32 indexed guid, bool success);

    // ── Errors ────────────────────────────────────────────────────────────────

    error OnlyFeeRegistry();
    error InsufficientCollateral(uint256 required, uint256 available);
    error CollateralTokenNotAccepted();
    error WithdrawExceedsCollateral(uint256 requested, uint256 available);
    error NothingToWithdraw();
    error RequestAlreadySettled(bytes32 guid);
    error UnknownRequest(bytes32 guid);
    error ZeroAmount();

    // ── Executor collateral ───────────────────────────────────────────────────

    /**
     * @notice Deposit collateral to cover cross-chain fee relay.
     *         Token must be accepted by the local FeeRegistry.
     *         One active collateral token per executor — calling with a
     *         different token replaces the active token (only if balance is 0).
     * @param token  Accepted ERC-20 collateral token.
     * @param amount Amount to deposit.
     */
    function depositCollateral(address token, uint256 amount) external;

    /**
     * @notice Withdraw unlocked collateral back to the executor.
     * @param token  Collateral token to withdraw.
     * @param amount Amount to withdraw (0 = full unlocked balance).
     */
    function withdrawCollateral(address token, uint256 amount) external;

    // ── Vault-facing ──────────────────────────────────────────────────────────

    /**
     * @notice Initiate a cross-chain fee settlement request.
     *         Called by FeeRegistry on the execution chain when local deposits
     *         are insufficient and the vault has a non-local feeChainEid.
     *         msg.value must cover the LayerZero relay fees for all hops.
     *
     * @param vault        Vault that triggered the execution.
     * @param executor     Address that called executeAutomation.
     * @param creator      Vault's creator for the creator fee share.
     * @param volumeFeeUSD Accumulated volume-based fee (18 dec, USD).
     * @param gasCompUSD   Gas compensation already computed in USD (18 dec).
     * @param feeChainEid  LayerZero EID of the chain where the vault deposit lives.
     */
    function requestCrossChainFee(
        address vault,
        address executor,
        address creator,
        uint256 volumeFeeUSD,
        uint256 gasCompUSD,
        uint32  feeChainEid
    ) external payable;

    // ── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the executor's total and locked collateral for a token.
     * @return total  Total deposited (locked + unlocked).
     * @return locked Amount currently locked in pending requests.
     */
    function collateralOf(address executor, address token)
        external view returns (uint256 total, uint256 locked);

    /**
     * @notice Quote the native-token relay fee required for requestCrossChainFee.
     * @param feeChainEid Target chain for Phase 2 (vault deposit chain).
     * @return fee Native token amount to pass as msg.value.
     */
    function quoteRelayFee(uint32 feeChainEid) external view returns (uint256 fee);

    /// @notice LayerZero Endpoint ID of the BSC Protocol Token Hub.
    function BSC_EID() external view returns (uint32);

    /// @notice FeeRegistry this manager interacts with.
    function feeRegistry() external view returns (address);
}
