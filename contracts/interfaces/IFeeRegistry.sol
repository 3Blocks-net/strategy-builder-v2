// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IFeeRegistry
 * @notice Simplified fee registry: collects deposit/withdraw fees (flat BPS)
 *         and reimburses executors for gas costs.
 *
 * Fee model
 * ─────────
 * • depositFeeBps / withdrawFeeBps — global flat rates set by the owner.
 * • Vaults call collectFee() when tokens enter or leave, sending the fee
 *   via transferFrom.  Collected fees accumulate per token and the owner
 *   withdraws them via withdrawFees().
 *
 * Gas compensation
 * ────────────────
 * Vaults pre-fund a deposit via depositFor().  After automation execution the
 * vault calls deductGasComp(), which computes the gas cost in token units
 * (using IPriceOracle) and transfers it directly to the executor.
 *
 * Invariant
 * ─────────
 *   physicalBalance(token) == Σ vaultDeposits[*][token] + collectedFees[token]
 */
interface IFeeRegistry {
    // ── Events ────────────────────────────────────────────────────────────────

    event TokenAdded(address indexed token, uint8 decimals);
    event TokenRemoved(address indexed token);
    event GasConfigSet(
        address indexed priceOracle,
        address indexed nativeToken,
        uint256 executorMarkupBps,
        uint256 overhead,
        uint256 maxGasPrice
    );
    event FeeDeposited(address indexed vault, address indexed token, uint256 amount);
    event FeeDepositWithdrawn(address indexed vault, address indexed token, uint256 amount);
    event DepositFeeBpsSet(uint16 bps);
    event WithdrawFeeBpsSet(uint16 bps);
    event FeeCollected(address indexed vault, address indexed token, uint256 amount);
    event GasCompDeducted(
        address indexed vault,
        address indexed executor,
        address indexed token,
        uint256 gasCompTokens
    );
    event FeesWithdrawn(address indexed token, uint256 amount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error FeeTooHigh();
    error ZeroAddress();
    error TokenNotAccepted();
    error InsufficientFeeDeposit(uint256 required, uint256 available);
    error NothingToWithdraw();
    error WithdrawExceedsDeposit(uint256 requested, uint256 available);

    // ── Owner: accepted tokens ────────────────────────────────────────────────

    function addAcceptedToken(address token, uint8 decimals) external;
    function removeAcceptedToken(address token) external;

    // ── Owner: fee BPS config ─────────────────────────────────────────────────

    function setDepositFeeBps(uint16 bps) external;
    function setWithdrawFeeBps(uint16 bps) external;

    // ── Owner: gas compensation config ────────────────────────────────────────

    /**
     * @param priceOracle_       IPriceOracle for native token price. address(0) = disabled.
     * @param nativeToken_       Address queried in oracle for native token price.
     * @param executorMarkupBps_ Markup on gas cost. 0 = exact, 2000 = 20%.
     * @param overhead_          Fixed gas units added to measured gasUsed.
     * @param maxGasPrice_       Cap on tx.gasprice for compensation. 0 = no cap.
     */
    function setGasConfig(
        address priceOracle_,
        address nativeToken_,
        uint256 executorMarkupBps_,
        uint256 overhead_,
        uint256 maxGasPrice_
    ) external;

    // ── Owner: withdraw collected fees ────────────────────────────────────────

    function withdrawFees(address token) external;

    // ── Vault deposits (gas comp pre-funding) ─────────────────────────────────

    function depositFor(address vault, address token, uint256 amount) external;
    function withdrawDeposit(address token, uint256 amount) external;

    // ── Vault-facing ──────────────────────────────────────────────────────────

    /**
     * @notice Collect a deposit/withdraw fee from the calling vault.
     *         Pulls `amount` tokens via transferFrom(msg.sender, ...).
     */
    function collectFee(address token, uint256 amount) external;

    /**
     * @notice Deduct gas compensation from the calling vault's deposit and
     *         transfer it directly to the executor.
     * @param token    Fee token (must be accepted).
     * @param executor Address that triggered executeAutomation.
     * @param gasUsed  Gas measured by the vault (gasleft() diff, excl. overhead).
     * @return gasCompTokens Tokens transferred to the executor.
     */
    function deductGasComp(
        address token,
        address executor,
        uint256 gasUsed
    ) external returns (uint256 gasCompTokens);

    // ── Views ─────────────────────────────────────────────────────────────────

    function depositFeeBps() external view returns (uint16);
    function withdrawFeeBps() external view returns (uint16);
    function isAcceptedToken(address token) external view returns (bool);
    function vaultDeposit(address vault, address token) external view returns (uint256);
    function collectedFees(address token) external view returns (uint256);
    function priceOracle() external view returns (address);
    function nativeToken() external view returns (address);

    /**
     * @notice Estimate gas compensation in token units (off-chain helper).
     * @param token     Fee token.
     * @param gasUsed   Expected gas consumption (overhead added internally).
     * @param gasPrice  Gas price in wei.
     */
    function estimateGasComp(
        address token,
        uint256 gasUsed,
        uint256 gasPrice
    ) external view returns (uint256);
}
