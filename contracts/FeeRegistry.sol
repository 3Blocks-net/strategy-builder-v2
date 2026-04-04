// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFeeRegistry.sol";
import "./interfaces/IVaultRegistry.sol";
import "./interfaces/external/IPriceOracle.sol";
import "./interfaces/external/IFeeReduction.sol";

/// @dev Minimal interface to read the owner of a vault proxy.
interface IVaultOwner {
    function owner() external view returns (address);
}

/**
 * @title FeeRegistry
 * @notice Custodian for vault fee deposits.  Stores per-action fee rates,
 *         distributes fees among four parties, and guarantees executors are
 *         reimbursed for their on-chain gas costs.
 *
 * Setup sequence
 * ──────────────
 * 1. Deploy FeeRegistry.
 * 2. addAcceptedToken(token, decimals) for each ERC-20 fee currency.
 * 3. setDistribution(protocolVault, burnContract, pBps, eBps, cBps, burnBps).
 * 4. setGasConfig(priceOracle, nativeToken, executorMarkupBps, overhead)  [optional].
 * 5. setFee(action, selector, bps) for each fee-bearing action.
 * 6. setFeeRegistry on the factory; vault owners call setFeeToken + depositFor.
 *
 * Fee deduction flow (per automation execution)
 * ──────────────────────────────────────────────
 * Vault passes (feeUSD, gasUsed) to deductFees.
 *
 *   nativePriceUSD = priceOracle.getTokenPrice(nativeToken)   (18 dec)
 *   gasCompUSD    = (gasUsed + overhead) × tx.gasprice × nativePriceUSD / 1e18
 *                   × (10_000 + executorMarkupBps) / 10_000
 *   gasCompTokens = feeTokenAmount(token, gasCompUSD)
 *   volumeTokens  = feeTokenAmount(token, feeUSD)
 *   totalTokens   = max(volumeTokens, gasCompTokens)   ← gas is the minimum fee
 *
 *   gasCompTokens → executor (gas reimbursement, guaranteed)
 *   remaining     = totalTokens − gasCompTokens → 4-way bps split
 *   executor also receives remaining × executorBps / 10_000
 *
 * When priceOracle == address(0) gas compensation is disabled; the fee floor is 0.
 *
 * Invariant (per accepted token)
 * ───────────────────────────────
 *   FeeRegistry.balanceOf(token) ==
 *       Σ vaultDeposits[vault][token]  (pre-fee, held for vaults)
 *     + Σ claimable[party][token]      (post-fee, ready to claim)
 */
contract FeeRegistry is Ownable, ReentrancyGuard, IFeeRegistry {
    using SafeERC20 for IERC20;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Maximum fee per action: 10 % (1 000 basis points).
    uint256 public constant MAX_FEE_BPS = 1_000;

    // ─── Types ────────────────────────────────────────────────────────────────

    struct TokenConfig {
        bool    enabled;
        uint8   decimals;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    /// @dev (actionContract => (selector => feeBps))
    mapping(address => mapping(bytes4 => uint256)) private _fees;

    /// @dev Accepted fee-payment tokens.
    mapping(address => TokenConfig) private _tokens;

    /// @notice Pre-funded deposit balance per vault per token.
    mapping(address vault  => mapping(address token => uint256)) public vaultDeposits;

    /// @notice Accumulated unclaimed balance per party per token (pull pattern).
    mapping(address party  => mapping(address token => uint256)) public claimable;

    // Distribution
    address public protocolVault;
    address public burnContract;
    uint16  public protocolBps;
    uint16  public executorBps;
    uint16  public creatorBps;
    uint16  public burnBps;

    // Gas compensation
    /// @notice Oracle used to fetch the native-token price at execution time.
    ///         address(0) = gas compensation disabled.
    IPriceOracle private _priceOracle;
    /// @notice Token address passed to the oracle to look up the native-token price.
    ///         Typically address(0) (convention) or the wrapped-native ERC-20.
    address private _nativeToken;
    /// @notice Extra markup on top of raw gas cost.  0 = exact reimbursement, 2000 = 20 %.
    uint256 public executorMarkupBps;
    /// @notice Fixed gas added to the vault's gasleft() measurement to cover
    ///         the _settleFees + event emission path not captured by the vault.
    uint256 public gasOverhead;
    /// @notice Maximum gas price (in wei) used for gas compensation calculation.
    ///         Prevents executors from inflating their reimbursement with a high gasprice.
    ///         0 = no cap (not recommended for production).
    uint256 public maxGasPrice;

    // Fee reduction
    /// @notice External contract that returns a per-wallet fee reduction in bps.
    ///         address(0) = fee reduction disabled.
    IFeeReduction private _feeReduction;
    /// @notice Trusted vault registry (factory).  Only vaults registered here can
    ///         benefit from fee reduction or protocol token payments, preventing
    ///         arbitrary contracts from impersonating a vault owner.
    IVaultRegistry private _trustedFactory;

    // Protocol token
    /// @notice Special ERC-20 that vault owners deposit once to cover fees for
    ///         all their vaults at a discount.  address(0) = feature disabled.
    address public protocolToken;
    /// @notice Volume-fee discount in bps for protocol-token payments
    ///         (0 = no discount, 5_000 = 50 % off, 10_000 = free).
    ///         Gas compensation is never discounted.
    uint256 public protocolTokenDiscountBps;
    /// @notice Protocol-token balance deposited per owner per token.
    ///         Indexed by token so withdrawals still work if protocolToken is later changed.
    mapping(address owner => mapping(address token => uint256)) public ownerProtocolDeposits;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Owner: fee rate config ───────────────────────────────────────────────

    function setFee(
        address target,
        bytes4 selector,
        uint256 feeBps
    ) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        _fees[target][selector] = feeBps;
        emit FeeSet(target, selector, feeBps);
    }

    // ─── Owner: accepted tokens ───────────────────────────────────────────────

    function addAcceptedToken(address token, uint8 decimals) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        _tokens[token] = TokenConfig({ enabled: true, decimals: decimals });
        emit TokenAdded(token, decimals);
    }

    function removeAcceptedToken(address token) external onlyOwner {
        _tokens[token].enabled = false;
        emit TokenRemoved(token);
    }

    // ─── Owner: distribution config ───────────────────────────────────────────

    function setDistribution(
        address protocolVault_,
        address burnContract_,
        uint16  protocolBps_,
        uint16  executorBps_,
        uint16  creatorBps_,
        uint16  burnBps_
    ) external onlyOwner {
        if (protocolVault_ == address(0)) revert ZeroAddress();
        if (burnContract_  == address(0)) revert ZeroAddress();
        if (uint256(protocolBps_) + executorBps_ + creatorBps_ + burnBps_ != 10_000)
            revert InvalidDistribution();

        protocolVault = protocolVault_;
        burnContract  = burnContract_;
        protocolBps   = protocolBps_;
        executorBps   = executorBps_;
        creatorBps    = creatorBps_;
        burnBps       = burnBps_;

        emit DistributionSet(
            protocolVault_, burnContract_,
            protocolBps_, executorBps_, creatorBps_, burnBps_
        );
    }

    // ─── Owner: gas compensation config ──────────────────────────────────────

    /**
     * @notice Configure gas reimbursement for executors via an external price oracle.
     * @param priceOracle_       IPriceOracle contract for native-token price lookup.
     *                           Pass address(0) to disable gas compensation entirely.
     * @param nativeToken_       Address used to query oracle for the native token
     *                           (e.g. address(0) or a wrapped-native ERC-20 address).
     * @param executorMarkupBps_ Markup over raw gas cost (0 = exact, 2000 = 20 %).
     * @param overhead_          Extra gas units added to vault's measurement.
     */
    function setGasConfig(
        address priceOracle_,
        address nativeToken_,
        uint256 executorMarkupBps_,
        uint256 overhead_,
        uint256 maxGasPrice_
    ) external onlyOwner {
        _priceOracle      = IPriceOracle(priceOracle_);
        _nativeToken      = nativeToken_;
        executorMarkupBps = executorMarkupBps_;
        gasOverhead       = overhead_;
        maxGasPrice       = maxGasPrice_;
        emit GasConfigSet(priceOracle_, nativeToken_, executorMarkupBps_, overhead_, maxGasPrice_);
    }

    // ─── Owner: fee reduction config ─────────────────────────────────────────

    /**
     * @notice Configure per-owner fee reduction.
     * @param feeReduction_   IFeeReduction contract.  address(0) = disabled.
     * @param trustedFactory_ IVaultRegistry that whitelists eligible vaults.
     *                        Only vaults registered here receive fee reduction;
     *                        unregistered callers (e.g. other smart contracts)
     *                        cannot claim a reduction by passing an arbitrary owner.
     *                        address(0) = disabled.
     */
    function setFeeReductionConfig(
        address feeReduction_,
        address trustedFactory_
    ) external onlyOwner {
        _feeReduction  = IFeeReduction(feeReduction_);
        _trustedFactory = IVaultRegistry(trustedFactory_);
        emit FeeReductionConfigSet(feeReduction_, trustedFactory_);
    }

    // ─── Owner: protocol token config ────────────────────────────────────────

    /**
     * @notice Set the protocol token and its volume-fee discount.
     *         The token must already be accepted (addAcceptedToken), or be address(0)
     *         to disable protocol token payments.
     * @param token       ERC-20 vault owners deposit to cover fees for all their vaults.
     *                    Pass address(0) to disable the feature.
     * @param discountBps Volume-fee discount in bps (0–10_000).
     *                    Gas compensation is never discounted.
     */
    function setProtocolToken(address token, uint256 discountBps) external onlyOwner {
        if (discountBps > 10_000) revert InvalidDiscountBps();
        if (token != address(0) && !_tokens[token].enabled) revert TokenNotAccepted();
        protocolToken = token;
        protocolTokenDiscountBps = discountBps;
        emit ProtocolTokenSet(token, discountBps);
    }

    // ─── Deposit ──────────────────────────────────────────────────────────────

    function depositFor(
        address vault,
        address token,
        uint256 amount
    ) external nonReentrant {
        if (vault == address(0)) revert ZeroAddress();
        if (!_tokens[token].enabled) revert TokenNotAccepted();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        vaultDeposits[vault][token] += amount;
        emit FeeDeposited(vault, token, amount);
    }

    // ─── Deposit withdrawal ───────────────────────────────────────────────────

    /**
     * @notice Withdraw tokens from the calling vault's fee deposit back to the vault.
     *         Intentionally works even when the token has been removed from the accepted
     *         list — this allows vault owners to recover funds after a token is delisted.
     * @param token   Fee token to withdraw.
     * @param amount  Amount to withdraw (0 = withdraw full balance).
     */
    function withdrawDeposit(address token, uint256 amount) external nonReentrant {
        uint256 available = vaultDeposits[msg.sender][token];
        if (available == 0) revert NothingToWithdraw();

        uint256 toWithdraw = amount == 0 ? available : amount;
        if (toWithdraw > available) revert WithdrawExceedsDeposit(toWithdraw, available);

        vaultDeposits[msg.sender][token] = available - toWithdraw;
        IERC20(token).safeTransfer(msg.sender, toWithdraw);
        emit FeeDepositWithdrawn(msg.sender, token, toWithdraw);
    }

    // ─── Protocol token deposits ──────────────────────────────────────────────

    /**
     * @notice Deposit protocol tokens to cover fees for all vaults owned by msg.sender.
     *         Pulls `amount` of the current protocolToken from the caller.
     */
    function depositProtocolToken(uint256 amount) external nonReentrant {
        address pt = protocolToken;
        if (pt == address(0)) revert ProtocolTokenNotSet();
        IERC20(pt).safeTransferFrom(msg.sender, address(this), amount);
        ownerProtocolDeposits[msg.sender][pt] += amount;
        emit ProtocolTokenDeposited(msg.sender, pt, amount);
    }

    /**
     * @notice Withdraw previously deposited protocol tokens back to msg.sender.
     *         Specify the token explicitly so withdrawals work even after protocolToken
     *         has been changed to a different address.
     * @param token   Token to withdraw.
     * @param amount  Amount to withdraw (0 = full balance for that token).
     */
    function withdrawProtocolToken(address token, uint256 amount) external nonReentrant {
        uint256 available = ownerProtocolDeposits[msg.sender][token];
        if (available == 0) revert NothingToWithdraw();
        uint256 toWithdraw = amount == 0 ? available : amount;
        if (toWithdraw > available) revert WithdrawExceedsDeposit(toWithdraw, available);
        ownerProtocolDeposits[msg.sender][token] = available - toWithdraw;
        IERC20(token).safeTransfer(msg.sender, toWithdraw);
        emit ProtocolTokenWithdrawn(msg.sender, token, toWithdraw);
    }

    // ─── Vault-facing ─────────────────────────────────────────────────────────

    /**
     * @notice Deduct fees from the calling vault's deposit and distribute them.
     *
     *   gasCompUSD    = (gasUsed + overhead) × tx.gasprice × nativeTokenPriceUSD / 1e18
     *                   × (10_000 + executorMarkupBps) / 10_000
     *   gasCompTokens = feeTokenAmount(token, gasCompUSD)
     *   volumeTokens  = feeTokenAmount(token, feeUSD)
     *   totalTokens   = max(volumeTokens, gasCompTokens)
     *
     *   gasCompTokens  → executor (guaranteed gas reimbursement)
     *   remaining      = totalTokens − gasCompTokens → 4-way bps split
     *   executor also gets remaining × executorBps / 10_000
     */
    function deductFees(
        address token,
        address executor,
        address creator,
        uint256 feeUSD,
        uint256 gasUsed
    ) external nonReentrant returns (uint256 totalTokens, uint256 gasCompTokens) {
        if (protocolVault == address(0)) revert DistributionNotSet();

        // ── Protocol token priority path ──────────────────────────────────────
        // If a protocol token is configured and the vault's owner has a sufficient
        // deposit, pay in protocol token at the discounted rate.
        (bool usedProto, uint256 protoTotal, uint256 protoGasComp) =
            _tryProtocolTokenPayment(executor, creator, feeUSD, gasUsed);
        if (usedProto) return (protoTotal, protoGasComp);

        // ── Normal deposit-token path ──────────────────────────────────────────
        gasCompTokens = _computeGasComp(token, gasUsed);
        uint256 volumeTokens = _applyFeeReduction(_feeTokenAmount(token, feeUSD));
        totalTokens = volumeTokens > gasCompTokens ? volumeTokens : gasCompTokens;

        if (totalTokens == 0) return (0, 0);

        uint256 available = vaultDeposits[msg.sender][token];
        if (available < totalTokens)
            revert InsufficientFeeDeposit(totalTokens, available);

        vaultDeposits[msg.sender][token] = available - totalTokens;

        _distribute(token, executor, creator, totalTokens, gasCompTokens);
        emit FeeDeducted(msg.sender, executor, creator, token, feeUSD, totalTokens, gasCompTokens);
    }

    // ─── Pull pattern ─────────────────────────────────────────────────────────

    function claim(address token) external nonReentrant {
        uint256 amount = claimable[msg.sender][token];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit FeeClaimed(msg.sender, token, amount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getFee(address target, bytes4 selector) external view returns (uint256) {
        return _fees[target][selector];
    }

    function isAcceptedToken(address token) external view returns (bool) {
        return _tokens[token].enabled;
    }

    function vaultDeposit(address vault, address token) external view returns (uint256) {
        return vaultDeposits[vault][token];
    }

    function feeTokenAmount(address token, uint256 feeUSD) external view returns (uint256) {
        return _feeTokenAmount(token, feeUSD);
    }

    /// @notice Price oracle used for native-token gas compensation pricing.
    function priceOracle() external view returns (address) {
        return address(_priceOracle);
    }

    /// @notice Native-token address queried in the price oracle.
    function nativeToken() external view returns (address) {
        return _nativeToken;
    }

    /// @notice IFeeReduction contract for per-owner volume-fee reduction.
    function feeReduction() external view returns (address) {
        return address(_feeReduction);
    }

    /// @notice Trusted IVaultRegistry — only its vaults benefit from fee reduction.
    function trustedFactory() external view returns (address) {
        return address(_trustedFactory);
    }

    /**
     * @notice Estimate gas compensation in token units for off-chain callers.
     *         Pass the expected gasPrice (e.g. current block.basefee + priority)
     *         since tx.gasprice is unavailable in static calls.
     *         The oracle is queried live — no stored price is used.
     */
    function estimateGasComp(
        address token,
        uint256 gasUsed,
        uint256 gasPrice
    ) external view returns (uint256) {
        if (address(_priceOracle) == address(0)) return 0;
        uint256 nativePrice = _fetchNativePrice();
        if (nativePrice == 0) return 0;
        return _estimateGasCompWithPrice(token, gasUsed + gasOverhead, gasPrice, nativePrice);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Attempt to pay fees using the protocol token from the vault owner's deposit.
     *      Returns (true, totalTokens, gasCompTokens) when payment succeeds.
     *      Returns (false, 0, 0) and makes NO state changes when payment is skipped
     *      (feature disabled, vault not registered, owner balance insufficient, etc.).
     *
     *      Only the volume-fee component is discounted; gas compensation is not.
     */
    function _tryProtocolTokenPayment(
        address executor,
        address creator,
        uint256 feeUSD,
        uint256 gasUsed
    ) internal returns (bool, uint256, uint256) {
        address pt = protocolToken;
        if (pt == address(0)) return (false, 0, 0);
        // The trusted factory gate is required to prevent arbitrary contracts from
        // impersonating a vault and draining another owner's protocol token deposit.
        if (address(_trustedFactory) == address(0)) return (false, 0, 0);

        bool registered;
        try _trustedFactory.isRegisteredVault(msg.sender) returns (bool r) {
            registered = r;
        } catch {
            return (false, 0, 0);
        }
        if (!registered) return (false, 0, 0);

        address vaultOwner;
        try IVaultOwner(msg.sender).owner() returns (address o) {
            vaultOwner = o;
        } catch {
            return (false, 0, 0);
        }
        if (vaultOwner == address(0)) return (false, 0, 0);

        // Compute costs in protocol token; gas comp is not discounted.
        uint256 gasCompTokens = _computeGasComp(pt, gasUsed);
        uint256 rawVolumeTokens = _feeTokenAmount(pt, feeUSD);
        uint256 disc = protocolTokenDiscountBps;
        uint256 volumeTokens = disc == 0
            ? rawVolumeTokens
            : rawVolumeTokens * (10_000 - disc) / 10_000;
        uint256 totalTokens = volumeTokens > gasCompTokens ? volumeTokens : gasCompTokens;

        // If nothing to pay, fall through to the deposit-token path.
        if (totalTokens == 0) return (false, 0, 0);

        uint256 ownerBalance = ownerProtocolDeposits[vaultOwner][pt];
        if (ownerBalance < totalTokens) return (false, 0, 0);

        ownerProtocolDeposits[vaultOwner][pt] = ownerBalance - totalTokens;

        _distribute(pt, executor, creator, totalTokens, gasCompTokens);
        emit FeeDeducted(msg.sender, executor, creator, pt, feeUSD, totalTokens, gasCompTokens);

        return (true, totalTokens, gasCompTokens);
    }

    /// @dev Distribute `totalTokens` of `token` among the four parties.
    ///      `gasCompTokens` is guaranteed to the executor; the remainder is split by bps.
    function _distribute(
        address token,
        address executor,
        address creator,
        uint256 totalTokens,
        uint256 gasCompTokens
    ) internal {
        uint256 remaining = totalTokens - gasCompTokens;

        uint256 protocolShare = (remaining * protocolBps) / 10_000;
        uint256 executorSplit = (remaining * executorBps) / 10_000;
        uint256 creatorShare  = (remaining * creatorBps)  / 10_000;
        uint256 burnShare     = remaining - protocolShare - executorSplit - creatorShare;

        address effectiveExecutor = executor != address(0) ? executor : protocolVault;
        address effectiveCreator  = creator  != address(0) ? creator  : protocolVault;

        claimable[protocolVault][token]     += protocolShare;
        claimable[effectiveExecutor][token] += gasCompTokens + executorSplit;
        claimable[effectiveCreator][token]  += creatorShare;

        if (burnShare > 0) {
            IERC20(token).safeTransfer(burnContract, burnShare);
        }
    }

    /**
     * @dev Apply the vault owner's fee reduction to `volumeTokens`.
     *      Only reduces the volume-based fee component; gas compensation is never touched.
     *      Returns `volumeTokens` unchanged when any of these conditions hold:
     *        – _feeReduction is not configured
     *        – _trustedFactory is not configured
     *        – msg.sender is not a registered vault
     *        – the vault's owner() call reverts
     *        – getFeeReduction reverts or returns 0
     */
    function _applyFeeReduction(uint256 volumeTokens) internal view returns (uint256) {
        if (volumeTokens == 0) return 0;
        if (address(_feeReduction)  == address(0)) return volumeTokens;
        if (address(_trustedFactory) == address(0)) return volumeTokens;

        // Gate: only factory-registered vaults can claim a reduction.
        bool registered;
        try _trustedFactory.isRegisteredVault(msg.sender) returns (bool r) {
            registered = r;
        } catch {
            return volumeTokens;
        }
        if (!registered) return volumeTokens;

        // Fetch the vault's current owner.
        address vaultOwner;
        try IVaultOwner(msg.sender).owner() returns (address o) {
            vaultOwner = o;
        } catch {
            return volumeTokens;
        }
        if (vaultOwner == address(0)) return volumeTokens;

        // Fetch the reduction in basis points (0 = none, 10_000 = 100 %).
        uint256 reductionBps;
        try _feeReduction.getFeeReduction(vaultOwner) returns (uint256 bps) {
            reductionBps = bps;
        } catch {
            return volumeTokens;
        }
        if (reductionBps == 0) return volumeTokens;
        if (reductionBps >= 10_000) return 0;

        return volumeTokens * (10_000 - reductionBps) / 10_000;
    }

    function _feeTokenAmount(address token, uint256 feeUSD) internal view returns (uint256) {
        if (feeUSD == 0) return 0;
        TokenConfig storage cfg = _tokens[token];
        if (!cfg.enabled) return 0;

        uint8 dec = cfg.decimals;

        // If a price oracle is configured, use the deposit token's live market price
        // for an accurate USD → token conversion.
        //
        //   rawTokens = feeUSD (18-dec) * 10^dec / tokenPriceUSD (18-dec)
        //
        // Example: feeUSD = $1 (1e18), BNB at $300 (300e18), dec=18
        //   → 1e18 * 1e18 / 300e18 = 1e18/300 ≈ 3.33e15  (≈ 0.00333 BNB)  ✓
        //
        // Falls back to the 1-token-per-USD assumption when the oracle is unavailable
        // or returns no price for this token.
        if (address(_priceOracle) != address(0)) {
            try _priceOracle.getTokenPrice(token) returns (uint256 tokenPriceUSD) {
                if (tokenPriceUSD > 0) {
                    return (feeUSD * 10 ** dec) / tokenPriceUSD;
                }
            } catch {}
        }

        // Fallback: decimal-only adjustment, assumes 1 full token = $1.
        if (dec == 18) return feeUSD;
        // Fast paths for the two most common decimals (avoids runtime exponentiation).
        if (dec ==  6) return feeUSD / 1e12;
        if (dec ==  8) return feeUSD / 1e10;
        if (dec  > 18) return feeUSD * 10 ** (dec - 18);
        return feeUSD / 10 ** (18 - dec);
    }

    /// @dev Fetch native-token price from the oracle; returns 0 on failure.
    function _fetchNativePrice() internal view returns (uint256) {
        try _priceOracle.getTokenPrice(_nativeToken) returns (uint256 price) {
            return price;
        } catch {
            return 0;
        }
    }

    /// @dev Compute gas compensation using the live tx.gasprice (called during a tx).
    ///      tx.gasprice is capped at maxGasPrice (when set) to prevent executor manipulation.
    function _computeGasComp(address token, uint256 gasUsed) internal view returns (uint256) {
        if (address(_priceOracle) == address(0)) return 0;
        uint256 nativePrice = _fetchNativePrice();
        if (nativePrice == 0) return 0;
        uint256 effectiveGasPrice = tx.gasprice;
        uint256 cap = maxGasPrice;
        if (cap > 0 && effectiveGasPrice > cap) effectiveGasPrice = cap;
        return _estimateGasCompWithPrice(token, gasUsed + gasOverhead, effectiveGasPrice, nativePrice);
    }

    function _estimateGasCompWithPrice(
        address token,
        uint256 totalGas,
        uint256 gasPrice,
        uint256 nativePriceUSD
    ) internal view returns (uint256) {
        if (gasPrice == 0) return 0;
        // gasCostUSD = totalGas × gasPrice (wei) × nativePriceUSD (USD per 1e18 wei) / 1e18
        uint256 gasCostUSD = (totalGas * gasPrice * nativePriceUSD) / 1e18;
        uint256 gasCompUSD = gasCostUSD + (gasCostUSD * executorMarkupBps) / 10_000;
        return _feeTokenAmount(token, gasCompUSD);
    }
}
