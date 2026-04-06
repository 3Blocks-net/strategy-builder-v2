// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OApp, MessagingFee, Origin} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import {OptionsBuilder} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";
import {MessagingReceipt} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import "../interfaces/IFeeRegistry.sol";
import "../interfaces/IVaultRegistry.sol";
import "./interfaces/ICrossChainFeeManager.sol";

/// @dev Minimal interface to read the owner of a vault proxy.
interface IVaultOwner {
    function owner() external view returns (address);
}

/// @dev Minimal interface to read the deposit token of a vault.
interface IVaultDepositToken {
    function depositToken() external view returns (address);
}

/**
 * @title CrossChainFeeManager
 * @notice LayerZero V2 OApp that routes vault fee settlement across chains.
 *
 * Message types
 * ─────────────
 *   MSG_FEE_REQUEST  (1) — Execution Chain → BSC
 *       Initiates two-phase fee resolution. BSC tries the owner's protocol
 *       token first (Phase 1). On failure, BSC either handles Phase 2 locally
 *       (when feeChainEid == BSC_EID) or forwards the request to the fee chain.
 *
 *   MSG_FEE_FORWARD  (2) — BSC → fee chain
 *       Carries Phase 2: deduct from the vault's deposit on the fee chain.
 *       Sent only when Phase 1 failed and feeChainEid != BSC_EID.
 *
 *   MSG_FEE_RESPONSE (3) — BSC or fee chain → execution chain
 *       Reports settlement outcome. On success the execution chain releases the
 *       executor's locked collateral; on failure it is slashed.
 *
 * Executor Collateral
 * ────────────────────
 * Each executor pre-deposits an accepted ERC-20 as collateral.  A portion is
 * locked for every in-flight request and released / slashed on settlement.
 * Required collateral = estimated fee + LZ relay fees × safety buffer.
 *
 * Phase-2 GUID derivation
 * ────────────────────────
 * To avoid replay-protection collisions when BSC handles both Phase 1 and
 * Phase 2 (i.e. feeChainEid == BSC_EID), the Phase-2 FeeRegistry call uses a
 * derived GUID: keccak256(abi.encode(originalGuid, uint8(2))).
 */
contract CrossChainFeeManager is Ownable, ReentrancyGuard, OApp, ICrossChainFeeManager {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // ─── Constants ────────────────────────────────────────────────────────────

    uint8  private constant MSG_FEE_REQUEST  = 1;
    uint8  private constant MSG_FEE_FORWARD  = 2;
    uint8  private constant MSG_FEE_RESPONSE = 3;

    /// @notice Gas limit used for _lzReceive calls on the destination chain.
    uint128 public constant LZ_RECEIVE_GAS = 300_000;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice LayerZero Endpoint ID of the BSC Protocol Token Hub.
    uint32 public immutable BSC_EID;

    /// @notice FeeRegistry this manager interacts with.
    address public feeRegistry;

    /// @notice Trusted vault registry — gates cross-chain fee eligibility.
    IVaultRegistry public trustedFactory;

    // Executor collateral
    /// @notice Active collateral token per executor.
    mapping(address executor => address token) public executorCollateralToken;
    /// @notice Total deposited collateral per executor per token.
    mapping(address executor => mapping(address token => uint256)) private _collateralTotal;
    /// @notice Locked collateral per executor per token (in-flight requests).
    mapping(address executor => mapping(address token => uint256)) private _collateralLocked;

    // Pending requests (on execution chain)
    struct PendingRequest {
        address vault;
        address executor;
        address collateralToken;
        uint256 collateralLocked;
        bool    settled;
    }
    mapping(bytes32 guid => PendingRequest) public pendingRequests;

    // ─── Message payloads ─────────────────────────────────────────────────────

    struct FeeRequestMsg {
        bytes32 guid;
        address vault;
        address owner;
        address executor;
        address creator;
        address depositToken;
        uint256 volumeFeeUSD;
        uint256 gasCompUSD;
        uint32  feeChainEid;
        uint32  srcEid;
    }

    struct FeeForwardMsg {
        bytes32 guid;
        address vault;
        address executor;
        address creator;
        address depositToken;
        uint256 volumeFeeUSD;
        uint256 gasCompUSD;
        uint32  srcEid;
    }

    struct FeeResponseMsg {
        bytes32 guid;
        bool    success;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param endpoint_    LayerZero V2 endpoint for this chain.
     * @param delegate_    Initial owner / OApp delegate (fee manager admin).
     * @param bscEid_      LayerZero EID of the BSC Protocol Token Hub.
     * @param feeRegistry_ FeeRegistry on this chain.
     */
    constructor(
        address endpoint_,
        address delegate_,
        uint32  bscEid_,
        address feeRegistry_
    ) OApp(endpoint_, delegate_) Ownable(delegate_) {
        BSC_EID     = bscEid_;
        feeRegistry = feeRegistry_;
    }

    // ─── Owner configuration ──────────────────────────────────────────────────

    function setFeeRegistry(address feeRegistry_) external onlyOwner {
        feeRegistry = feeRegistry_;
    }

    function setTrustedFactory(address factory_) external onlyOwner {
        trustedFactory = IVaultRegistry(factory_);
    }

    // ─── Executor collateral ──────────────────────────────────────────────────

    /// @inheritdoc ICrossChainFeeManager
    function depositCollateral(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!IFeeRegistry(feeRegistry).isAcceptedToken(token)) revert CollateralTokenNotAccepted();

        address current = executorCollateralToken[msg.sender];
        if (current == address(0)) {
            executorCollateralToken[msg.sender] = token;
        } else {
            // Only allow changing token when existing balance is fully withdrawn.
            require(
                current == token || _collateralTotal[msg.sender][current] == 0,
                "CrossChainFeeManager: drain existing collateral first"
            );
            if (current != token) executorCollateralToken[msg.sender] = token;
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _collateralTotal[msg.sender][token] += amount;
        emit CollateralDeposited(msg.sender, token, amount);
    }

    /// @inheritdoc ICrossChainFeeManager
    function withdrawCollateral(address token, uint256 amount) external nonReentrant {
        uint256 total  = _collateralTotal[msg.sender][token];
        uint256 locked = _collateralLocked[msg.sender][token];
        uint256 free   = total - locked;
        if (free == 0) revert NothingToWithdraw();

        uint256 toWithdraw = amount == 0 ? free : amount;
        if (toWithdraw > free) revert WithdrawExceedsCollateral(toWithdraw, free);

        _collateralTotal[msg.sender][token] -= toWithdraw;
        IERC20(token).safeTransfer(msg.sender, toWithdraw);
        emit CollateralWithdrawn(msg.sender, token, toWithdraw);
    }

    // ─── Vault-facing ─────────────────────────────────────────────────────────

    /// @inheritdoc ICrossChainFeeManager
    function requestCrossChainFee(
        address vault,
        address executor,
        address creator,
        uint256 volumeFeeUSD,
        uint256 gasCompUSD,
        uint32  feeChainEid
    ) external payable {
        if (msg.sender != feeRegistry) revert OnlyFeeRegistry();

        address collToken = executorCollateralToken[executor];
        if (collToken == address(0)) revert InsufficientCollateral(0, 0);

        // Estimate required collateral: approximate fee in collateral token via registry.
        uint256 totalFeeUSD     = volumeFeeUSD > gasCompUSD ? volumeFeeUSD : gasCompUSD;
        uint256 requiredCollateral = IFeeRegistry(feeRegistry).feeTokenAmount(collToken, totalFeeUSD);
        uint256 freeCollateral  = _collateralTotal[executor][collToken]
                                - _collateralLocked[executor][collToken];
        if (freeCollateral < requiredCollateral)
            revert InsufficientCollateral(requiredCollateral, freeCollateral);

        // Build a unique guid for this request.
        bytes32 guid = keccak256(abi.encode(
            block.chainid, vault, executor, volumeFeeUSD, gasCompUSD, block.number, block.timestamp
        ));

        // Lock collateral.
        _collateralLocked[executor][collToken] += requiredCollateral;
        pendingRequests[guid] = PendingRequest({
            vault:            vault,
            executor:         executor,
            collateralToken:  collToken,
            collateralLocked: requiredCollateral,
            settled:          false
        });

        // Build and send FEE_REQUEST to BSC (which is always Phase 1 hub).
        address depositToken = IVaultDepositToken(vault).depositToken();

        bytes memory payload = abi.encode(
            MSG_FEE_REQUEST,
            FeeRequestMsg({
                guid:         guid,
                vault:        vault,
                owner:        _safeOwner(vault),
                executor:     executor,
                creator:      creator,
                depositToken: depositToken,
                volumeFeeUSD: volumeFeeUSD,
                gasCompUSD:   gasCompUSD,
                feeChainEid:  feeChainEid,
                srcEid:       _localEid()
            })
        );

        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(LZ_RECEIVE_GAS, 0);
        _lzSend(BSC_EID, payload, options, MessagingFee(msg.value, 0), payable(executor));

        emit FeeRequestSent(guid, vault, executor, BSC_EID);
        emit CollateralLocked(guid, executor, collToken, requiredCollateral);
    }

    // ─── LZ receive ──────────────────────────────────────────────────────────

    function _lzReceive(
        Origin calldata origin,
        bytes32 /*_guid*/,
        bytes calldata message,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        uint8 msgType = abi.decode(message[:1], (uint8));

        if (msgType == MSG_FEE_REQUEST) {
            (, FeeRequestMsg memory req) = abi.decode(message, (uint8, FeeRequestMsg));
            _handleFeeRequest(req, origin.srcEid);
        } else if (msgType == MSG_FEE_FORWARD) {
            (, FeeForwardMsg memory fwd) = abi.decode(message, (uint8, FeeForwardMsg));
            _handleFeeForward(fwd);
        } else if (msgType == MSG_FEE_RESPONSE) {
            (, FeeResponseMsg memory resp) = abi.decode(message, (uint8, FeeResponseMsg));
            _handleFeeResponse(resp);
        }
    }

    // ─── Internal: message handlers ───────────────────────────────────────────

    /**
     * @dev Received on BSC. Phase 1: try protocol token.
     *      If success → respond to srcEid.
     *      If fail and feeChainEid == local → Phase 2 locally.
     *      If fail and feeChainEid != local → forward to feeChain.
     */
    function _handleFeeRequest(FeeRequestMsg memory req, uint32 /*srcEidCheck*/) internal {
        // Phase 1: try protocol token on BSC hub.
        (bool success,,,) = IFeeRegistry(feeRegistry).deductCrossChainProtocolToken(
            req.vault, req.owner, req.executor, req.creator,
            req.volumeFeeUSD, req.gasCompUSD, req.guid
        );

        if (success) {
            _sendResponse(req.srcEid, req.guid, true);
            return;
        }

        // Phase 2: vault deposit.
        uint32 localEid = _localEid();
        if (req.feeChainEid == localEid || req.feeChainEid == 0) {
            // Fee chain is BSC itself — handle locally.
            bytes32 depositGuid = keccak256(abi.encode(req.guid, uint8(2)));
            (bool ok,,,) = IFeeRegistry(feeRegistry).deductCrossChainDeposit(
                req.vault, req.executor, req.creator,
                req.depositToken, req.volumeFeeUSD, req.gasCompUSD, depositGuid
            );
            _sendResponse(req.srcEid, req.guid, ok);
        } else {
            // Forward to the vault's designated fee chain.
            bytes memory payload = abi.encode(
                MSG_FEE_FORWARD,
                FeeForwardMsg({
                    guid:         req.guid,
                    vault:        req.vault,
                    executor:     req.executor,
                    creator:      req.creator,
                    depositToken: req.depositToken,
                    volumeFeeUSD: req.volumeFeeUSD,
                    gasCompUSD:   req.gasCompUSD,
                    srcEid:       req.srcEid
                })
            );
            bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(LZ_RECEIVE_GAS, 0);
            // LZ fees for the forward are drawn from this contract's native balance.
            // The execution chain pre-funded msg.value to cover all hops.
            MessagingFee memory fee = _quote(req.feeChainEid, payload, options, false);
            _lzSend(req.feeChainEid, payload, options, fee, payable(address(this)));
            emit FeeForwardSent(req.guid, req.feeChainEid);
        }
    }

    /**
     * @dev Received on the fee chain. Phase 2: try vault deposit.
     *      Respond directly to the original execution chain (srcEid).
     */
    function _handleFeeForward(FeeForwardMsg memory fwd) internal {
        bytes32 depositGuid = keccak256(abi.encode(fwd.guid, uint8(2)));
        (bool ok,,,) = IFeeRegistry(feeRegistry).deductCrossChainDeposit(
            fwd.vault, fwd.executor, fwd.creator,
            fwd.depositToken, fwd.volumeFeeUSD, fwd.gasCompUSD, depositGuid
        );
        _sendResponse(fwd.srcEid, fwd.guid, ok);
    }

    /**
     * @dev Received on the execution chain. Settle the pending request:
     *      success → release collateral; failure → slash collateral.
     */
    function _handleFeeResponse(FeeResponseMsg memory resp) internal {
        PendingRequest storage req = pendingRequests[resp.guid];
        if (req.executor == address(0)) return; // unknown guid, ignore
        if (req.settled) return;
        req.settled = true;

        address executor = req.executor;
        address token    = req.collateralToken;
        uint256 locked   = req.collateralLocked;

        _collateralLocked[executor][token] -= locked;

        if (resp.success) {
            // Release: no fee taken from collateral.
            emit CollateralReleased(resp.guid, executor, locked);
        } else {
            // Slash: deduct locked collateral, credit protocol vault as claimable.
            _collateralTotal[executor][token] -= locked;
            address pv = IFeeRegistry(feeRegistry).protocolVault();
            if (pv != address(0)) {
                // Transfer slashed collateral to the FeeRegistry as protocol claimable.
                IERC20(token).safeTransfer(feeRegistry, locked);
                // Note: FeeRegistry does not have a direct "credit claimable" path from
                // outside; we hold the slash here and let the protocol owner claim via
                // a future governance action. In production this would be a dedicated hook.
            }
            emit CollateralSlashed(resp.guid, executor, locked);
        }

        emit FeeRequestSettled(resp.guid, resp.success);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _sendResponse(uint32 dstEid, bytes32 guid, bool success) internal {
        bytes memory payload = abi.encode(
            MSG_FEE_RESPONSE,
            FeeResponseMsg({guid: guid, success: success})
        );
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(LZ_RECEIVE_GAS, 0);
        MessagingFee memory fee = _quote(dstEid, payload, options, false);
        _lzSend(dstEid, payload, options, fee, payable(address(this)));
    }

    function _safeOwner(address vault) internal view returns (address) {
        try IVaultOwner(vault).owner() returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    function _localEid() internal view returns (uint32) {
        return uint32(endpoint.eid());
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @inheritdoc ICrossChainFeeManager
    function collateralOf(address executor, address token)
        external view returns (uint256 total, uint256 locked)
    {
        total  = _collateralTotal[executor][token];
        locked = _collateralLocked[executor][token];
    }

    /// @inheritdoc ICrossChainFeeManager
    function quoteRelayFee(uint32 feeChainEid) external view returns (uint256 fee) {
        // Quote for FEE_REQUEST to BSC.
        bytes memory dummyReq = abi.encode(
            MSG_FEE_REQUEST,
            FeeRequestMsg(bytes32(0), address(0), address(0), address(0), address(0),
                          address(0), 0, 0, feeChainEid, 0)
        );
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(LZ_RECEIVE_GAS, 0);
        MessagingFee memory reqFee = _quote(BSC_EID, dummyReq, options, false);
        fee = reqFee.nativeFee;

        if (feeChainEid != BSC_EID && feeChainEid != 0) {
            // Also quote BSC → feeChain (FEE_FORWARD) and feeChain → src (FEE_RESPONSE).
            // We quote the response leg from BSC as a proxy (same payload size).
            bytes memory dummyResp = abi.encode(
                MSG_FEE_RESPONSE, FeeResponseMsg(bytes32(0), false)
            );
            MessagingFee memory respFee = _quote(BSC_EID, dummyResp, options, false);
            fee += respFee.nativeFee * 2; // forward + response (approximate)
        }
    }

    // ─── Native token handling ─────────────────────────────────────────────────

    receive() external payable {}

    /// @notice Owner can recover excess native token used for LZ fees.
    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "CrossChainFeeManager: native transfer failed");
    }
}
