// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFeeRegistry.sol";
import "./interfaces/external/IPriceOracle.sol";

/**
 * @title FeeRegistry
 * @notice Simplified fee custodian.  Collects deposit/withdraw fees (flat BPS)
 *         and reimburses automation executors for gas costs.
 *
 * Setup sequence
 * ──────────────
 * 1. Deploy FeeRegistry.
 * 2. addAcceptedToken(token, decimals) for each ERC-20 fee currency.
 * 3. setDepositFeeBps / setWithdrawFeeBps.
 * 4. setGasConfig(priceOracle, nativeToken, executorMarkupBps, overhead, maxGasPrice) [optional].
 * 5. setFeeRegistry on the factory; vault owners call depositFor to pre-fund gas comp.
 *
 * Invariant (per accepted token)
 * ───────────────────────────────
 *   FeeRegistry.balanceOf(token) ==
 *       Σ vaultDeposits[vault][token]  (pre-funded gas comp)
 *     + collectedFees[token]           (accumulated deposit/withdraw fees)
 */
contract FeeRegistry is Ownable, ReentrancyGuard, IFeeRegistry {
    using SafeERC20 for IERC20;

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_FEE_BPS = 1_000;

    // ─── Types ────────────────────────────────────────────────────────────────

    struct TokenConfig {
        bool    enabled;
        uint8   decimals;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(address => TokenConfig) private _tokens;

    /// @notice Pre-funded deposit per vault per token (used for gas compensation).
    mapping(address vault => mapping(address token => uint256)) public vaultDeposits;

    /// @notice Accumulated deposit/withdraw fees per token, withdrawable by owner.
    mapping(address token => uint256) public collectedFees;

    /// @notice Global deposit fee rate in basis points.
    uint16 public depositFeeBps;

    /// @notice Global withdraw fee rate in basis points.
    uint16 public withdrawFeeBps;

    // Gas compensation
    IPriceOracle private _priceOracle;
    address private _nativeToken;
    uint256 public executorMarkupBps;
    uint256 public gasOverhead;
    uint256 public maxGasPrice;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

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

    // ─── Owner: fee BPS config ────────────────────────────────────────────────

    function setDepositFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        depositFeeBps = bps;
        emit DepositFeeBpsSet(bps);
    }

    function setWithdrawFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        withdrawFeeBps = bps;
        emit WithdrawFeeBpsSet(bps);
    }

    // ─── Owner: gas compensation config ──────────────────────────────────────

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

    // ─── Owner: withdraw collected fees ──────────────────────────────────────

    function withdrawFees(address token) external onlyOwner nonReentrant {
        uint256 amount = collectedFees[token];
        if (amount == 0) revert NothingToWithdraw();
        collectedFees[token] = 0;
        IERC20(token).safeTransfer(owner(), amount);
        emit FeesWithdrawn(token, amount);
    }

    // ─── Vault deposits (gas comp pre-funding) ───────────────────────────────

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

    function withdrawDeposit(address token, uint256 amount) external nonReentrant {
        uint256 available = vaultDeposits[msg.sender][token];
        if (available == 0) revert NothingToWithdraw();

        uint256 toWithdraw = amount == 0 ? available : amount;
        if (toWithdraw > available) revert WithdrawExceedsDeposit(toWithdraw, available);

        vaultDeposits[msg.sender][token] = available - toWithdraw;
        IERC20(token).safeTransfer(msg.sender, toWithdraw);
        emit FeeDepositWithdrawn(msg.sender, token, toWithdraw);
    }

    // ─── Vault-facing ─────────────────────────────────────────────────────────

    function collectFee(address token, uint256 amount) external nonReentrant {
        if (amount == 0) return;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        collectedFees[token] += amount;
        emit FeeCollected(msg.sender, token, amount);
    }

    function deductGasComp(
        address token,
        address executor,
        uint256 gasUsed
    ) external nonReentrant returns (uint256 gasCompTokens) {
        gasCompTokens = _computeGasComp(token, gasUsed);
        if (gasCompTokens == 0) return 0;

        uint256 available = vaultDeposits[msg.sender][token];
        if (available < gasCompTokens)
            revert InsufficientFeeDeposit(gasCompTokens, available);

        vaultDeposits[msg.sender][token] = available - gasCompTokens;
        IERC20(token).safeTransfer(executor, gasCompTokens);
        emit GasCompDeducted(msg.sender, executor, token, gasCompTokens);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function isAcceptedToken(address token) external view returns (bool) {
        return _tokens[token].enabled;
    }

    function vaultDeposit(address vault, address token) external view returns (uint256) {
        return vaultDeposits[vault][token];
    }

    function priceOracle() external view returns (address) {
        return address(_priceOracle);
    }

    function nativeToken() external view returns (address) {
        return _nativeToken;
    }

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

    function _feeTokenAmount(address token, uint256 feeUSD) internal view returns (uint256) {
        if (feeUSD == 0) return 0;
        TokenConfig storage cfg = _tokens[token];
        if (!cfg.enabled) return 0;

        uint8 dec = cfg.decimals;

        if (address(_priceOracle) != address(0)) {
            try _priceOracle.getTokenPrice(token) returns (uint256 tokenPriceUSD) {
                if (tokenPriceUSD > 0) {
                    return (feeUSD * 10 ** dec) / tokenPriceUSD;
                }
            } catch {}
        }

        if (dec == 18) return feeUSD;
        if (dec ==  6) return feeUSD / 1e12;
        if (dec ==  8) return feeUSD / 1e10;
        if (dec  > 18) return feeUSD * 10 ** (dec - 18);
        return feeUSD / 10 ** (18 - dec);
    }

    function _fetchNativePrice() internal view returns (uint256) {
        try _priceOracle.getTokenPrice(_nativeToken) returns (uint256 price) {
            return price;
        } catch {
            return 0;
        }
    }

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
        uint256 gasCostUSD = (totalGas * gasPrice * nativePriceUSD) / 1e18;
        uint256 gasCompUSD = gasCostUSD + (gasCostUSD * executorMarkupBps) / 10_000;
        return _feeTokenAmount(token, gasCompUSD);
    }
}
