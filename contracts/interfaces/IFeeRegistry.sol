// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IFeeRegistry
 * @notice Maps (actionContract, functionSelector) → fee basis points, manages
 *         vault fee deposits, and guarantees executors are reimbursed for gas.
 *
 * Architecture
 * ────────────
 * • Owner registers accepted ERC-20 tokens via addAcceptedToken.
 * • Vault owners pre-fund a vault's fee balance via depositFor.
 * • At the end of executeAutomation the vault calls deductFees, which
 *   redistributes from vaultDeposits[vault][token] to the four parties.
 * • Parties pull their share via claim(token).  Burn share is direct-transferred.
 *
 * Gas compensation
 * ────────────────
 * The vault passes gasUsed to deductFees.  FeeRegistry fetches the native-token
 * price from its configured IPriceOracle and converts gas cost to token units:
 *
 *   nativePriceUSD = priceOracle.getTokenPrice(nativeToken)   (18 dec)
 *   gasCompUSD     = gasUsed × tx.gasprice × nativePriceUSD / 1e18
 *                    × (10_000 + executorMarkupBps) / 10_000
 *   gasCompTokens  = feeTokenAmount(token, gasCompUSD)
 *
 * Gas compensation is the minimum total fee:
 *   totalTokens = max(volumeBasedTokens, gasCompTokens)
 *
 * gasCompTokens go entirely to the executor (gas reimbursement).
 * The remaining (totalTokens − gasCompTokens) is split via the four-way bps.
 * executorBps share of the remainder is additional profit for the executor.
 * When priceOracle == address(0) gas compensation is disabled; the fee floor is 0.
 *
 * Invariant
 * ─────────
 *   physicalBalance(token) == Σ vaultDeposits[*][token] + Σ claimable[*][token]
 */
interface IFeeRegistry {
    // ── Events ────────────────────────────────────────────────────────────────

    event FeeSet(address indexed target, bytes4 indexed selector, uint256 feeBps);
    event TokenAdded(address indexed token, uint8 decimals);
    event TokenRemoved(address indexed token);
    event DistributionSet(
        address indexed protocolVault,
        address indexed burnContract,
        uint16 protocolBps,
        uint16 executorBps,
        uint16 creatorBps,
        uint16 burnBps
    );
    event GasConfigSet(address indexed priceOracle, address indexed nativeToken, uint256 executorMarkupBps, uint256 overhead, uint256 maxGasPrice);
    /**
     * @dev Emitted when the fee reduction contract or trusted factory is updated.
     *      feeReduction == address(0) disables per-owner fee reduction.
     *      trustedFactory == address(0) disables the vault-registration check
     *      (fee reduction is only applied for vaults known to trustedFactory).
     */
    event FeeReductionConfigSet(address indexed feeReduction, address indexed trustedFactory);
    event FeeDeposited(address indexed vault, address indexed token, uint256 amount);
    event FeeDepositWithdrawn(address indexed vault, address indexed token, uint256 amount);
    event FeeDeducted(
        address indexed vault,
        address indexed executor,
        address indexed creator,
        address token,
        uint256 feeUSD,
        uint256 totalTokens,
        uint256 gasCompTokens
    );
    event FeeClaimed(address indexed claimant, address indexed token, uint256 amount);
    /// @dev Emitted when the trusted CrossChainFeeManager is updated.
    event CrossChainFeeManagerSet(address indexed manager);
    /// @dev Emitted when the protocol token or its discount is updated.
    event ProtocolTokenSet(address indexed token, uint256 discountBps);
    /// @dev Emitted when a vault owner deposits protocol tokens.
    event ProtocolTokenDeposited(address indexed owner, address indexed token, uint256 amount);
    /// @dev Emitted when a vault owner withdraws protocol tokens.
    event ProtocolTokenWithdrawn(address indexed owner, address indexed token, uint256 amount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error FeeTooHigh();
    error ZeroAddress();
    error InvalidDistribution();
    error TokenNotAccepted();
    error DistributionNotSet();
    error InsufficientFeeDeposit(uint256 required, uint256 available);
    error NothingToClaim();
    error NothingToWithdraw();
    error WithdrawExceedsDeposit(uint256 requested, uint256 available);
    error ProtocolTokenNotSet();
    error InvalidDiscountBps();
    error NotProtocolTokenHub();
    error CallerNotCrossChainFeeManager();
    error RequestAlreadyProcessed(bytes32 guid);

    // ── Owner: fee rate config ─────────────────────────────────────────────────

    /** @notice Set (or remove) the fee for a specific action function. */
    function setFee(address target, bytes4 selector, uint256 feeBps) external;

    // ── Owner: accepted tokens ────────────────────────────────────────────────

    function addAcceptedToken(address token, uint8 decimals) external;
    function removeAcceptedToken(address token) external;

    // ── Owner: distribution config ────────────────────────────────────────────

    function setDistribution(
        address protocolVault_,
        address burnContract_,
        uint16  protocolBps_,
        uint16  executorBps_,
        uint16  creatorBps_,
        uint16  burnBps_
    ) external;

    // ── Owner: gas compensation config ────────────────────────────────────────

    /**
     * @notice Configure executor gas reimbursement via an external price oracle.
     * @param priceOracle_      IPriceOracle contract used to look up the native
     *                          token price at execution time.
     *                          Pass address(0) to disable gas compensation entirely.
     * @param nativeToken_      Address used to query the oracle for the native token
     *                          price (e.g. address(0) or a wrapped-native address).
     * @param executorMarkupBps_ Markup added on top of gas cost.
     *                          0 = exact gas reimbursement, 2000 = 20 % markup.
     * @param overhead_         Fixed gas units added to the measured gasUsed to
     *                          cover _settleFees + event emission overhead.
     */
    function setGasConfig(
        address priceOracle_,
        address nativeToken_,
        uint256 executorMarkupBps_,
        uint256 overhead_,
        uint256 maxGasPrice_
    ) external;

    // ── Owner: fee reduction config ───────────────────────────────────────────

    /**
     * @notice Configure the per-owner fee reduction.
     * @param feeReduction_    IFeeReduction contract. address(0) = disabled.
     * @param trustedFactory_  IVaultRegistry used to verify the calling vault was
     *                         created by a known factory.  Only registered vaults
     *                         receive fee reduction.  address(0) = disabled.
     */
    function setFeeReductionConfig(address feeReduction_, address trustedFactory_) external;

    // ── Owner: cross-chain config ─────────────────────────────────────────────

    /**
     * @notice Set the trusted CrossChainFeeManager for this chain.
     *         Only this address may call deductCrossChain.
     *         Pass address(0) to disable cross-chain fee settlement.
     */
    function setCrossChainFeeManager(address manager) external;

    // ── Owner: protocol token config ──────────────────────────────────────────

    /**
     * @notice Set the protocol token and its volume-fee discount.
     *         The token must already be accepted (addAcceptedToken).
     *         Pass address(0) to disable protocol token payments.
     * @param token       ERC-20 vault owners deposit to cover fees for all their vaults.
     * @param discountBps Volume-fee discount in bps (0 = none, 5_000 = 50 %, 10_000 = free).
     *                    Gas compensation is never discounted.
     */
    function setProtocolToken(address token, uint256 discountBps) external;

    // ── Deposit ───────────────────────────────────────────────────────────────

    function depositFor(address vault, address token, uint256 amount) external;

    /**
     * @notice Deposit protocol tokens to cover fees for all vaults owned by msg.sender.
     *         Pulls `amount` of the current protocolToken from msg.sender.
     * @param amount  Amount to deposit.
     */
    function depositProtocolToken(uint256 amount) external;

    /**
     * @notice Withdraw previously deposited protocol tokens back to msg.sender.
     *         Specify the token explicitly to handle cases where protocolToken changed
     *         after the deposit.
     * @param token   Token to withdraw (typically the current or former protocolToken).
     * @param amount  Amount to withdraw (0 = full balance for that token).
     */
    function withdrawProtocolToken(address token, uint256 amount) external;

    /**
     * @notice Withdraw tokens from the calling vault's fee deposit back to the vault.
     *         Only the vault itself can withdraw its own deposit (msg.sender == vault).
     *         Works even when the token has been removed from the accepted list, so
     *         vault owners can always recover funds after a token is delisted.
     * @param token   Fee token to withdraw.
     * @param amount  Amount to withdraw (0 = withdraw full balance).
     */
    function withdrawDeposit(address token, uint256 amount) external;

    // ── Cross-chain vault-facing ──────────────────────────────────────────────

    /**
     * @notice Phase 1: try paying from the vault owner's protocol token deposit on BSC.
     *         Only has effect when isProtocolTokenHub == true.
     *         Returns (false, ...) without reverting when funds are insufficient.
     *         Called exclusively by the trusted CrossChainFeeManager.
     */
    function deductCrossChainProtocolToken(
        address vault,
        address owner,
        address executor,
        address creator,
        uint256 volumeFeeUSD,
        uint256 gasCompUSD,
        bytes32 requestGuid
    ) external returns (bool success, address token, uint256 totalTokens, uint256 gasCompTokens);

    /**
     * @notice Phase 2: deduct from the vault's deposit on the fee chain.
     *         depositToken_ is forwarded from the vault's depositToken on the execution chain.
     *         requestGuid should be a phase-2 derivative to avoid collision with Phase 1.
     *         Called exclusively by the trusted CrossChainFeeManager.
     */
    function deductCrossChainDeposit(
        address vault,
        address executor,
        address creator,
        address depositToken_,
        uint256 volumeFeeUSD,
        uint256 gasCompUSD,
        bytes32 requestGuid
    ) external returns (bool success, address token, uint256 totalTokens, uint256 gasCompTokens);

    // ── Vault-facing ──────────────────────────────────────────────────────────

    /**
     * @notice Deduct fees from the calling vault's deposit and distribute them.
     *         Gas compensation is computed from gasUsed × tx.gasprice and the
     *         stored gas config; it is guaranteed to the executor and acts as the
     *         minimum total fee.
     *
     * @param token    Fee token (must be accepted).
     * @param executor Address that triggered executeAutomation.
     * @param creator  Vault's referral. address(0) → protocol.
     * @param feeUSD   Accumulated volume-based fee in USD (18 dec).
     * @param gasUsed  Gas measured by the vault (gasleft() diff, excl. overhead).
     * @return totalTokens    Actual tokens deducted from the vault's deposit.
     * @return gasCompTokens  Portion guaranteed to the executor for gas.
     */
    function deductFees(
        address token,
        address executor,
        address creator,
        uint256 feeUSD,
        uint256 gasUsed
    ) external returns (uint256 totalTokens, uint256 gasCompTokens);

    // ── Pull pattern ──────────────────────────────────────────────────────────

    function claim(address token) external;

    // ── Views ────────────────────────────────────────────────────────────────

    function getFee(address target, bytes4 selector) external view returns (uint256);
    function isAcceptedToken(address token) external view returns (bool);
    /// @notice Protocol vault that receives the protocol share of fees.
    function protocolVault() external view returns (address);
    function vaultDeposit(address vault, address token) external view returns (uint256);
    function claimable(address party, address token) external view returns (uint256);
    function feeTokenAmount(address token, uint256 feeUSD) external view returns (uint256);
    /// @notice Price oracle used to fetch the native-token price for gas compensation.
    function priceOracle() external view returns (address);
    /// @notice Token address passed to the price oracle to query the native-token price.
    function nativeToken() external view returns (address);
    /// @notice IFeeReduction contract used to look up per-owner volume-fee reductions.
    function feeReduction() external view returns (address);
    /// @notice Trusted IVaultRegistry — only its vaults benefit from fee reduction.
    function trustedFactory() external view returns (address);
    /// @notice Trusted CrossChainFeeManager — the only address allowed to call deductCrossChain.
    function crossChainFeeManager() external view returns (address);
    /// @notice True when this chain is the BSC Protocol Token Hub.
    ///         Only the hub can have protocolToken set.
    function isProtocolTokenHub() external view returns (bool);
    /// @notice Protocol token for owner-wide fee coverage with discount.
    function protocolToken() external view returns (address);
    /// @notice Volume-fee discount in bps when paying with the protocol token.
    function protocolTokenDiscountBps() external view returns (uint256);
    /// @notice Protocol-token balance deposited by a vault owner (not per vault).
    function ownerProtocolDeposits(address owner, address token) external view returns (uint256);

    /// @notice Fixed gas units added to measured gasUsed to cover settlement overhead.
    function gasOverhead() external view returns (uint256);
    /// @notice Executor markup in bps over raw gas cost.
    function executorMarkupBps() external view returns (uint256);
    /// @notice Maximum gas price cap in wei (0 = no cap).
    function maxGasPrice() external view returns (uint256);

    /**
     * @notice Estimate gas compensation in token units.
     *         Off-chain callers pass the expected gasPrice since tx.gasprice is
     *         not available in static calls.  The oracle is queried live.
     * @param token     Fee token.
     * @param gasUsed   Expected gas consumption (overhead is added internally).
     * @param gasPrice  Gas price in wei (e.g. current tx.gasprice).
     */
    function estimateGasComp(
        address token,
        uint256 gasUsed,
        uint256 gasPrice
    ) external view returns (uint256);
}
