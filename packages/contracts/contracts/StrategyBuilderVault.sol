// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ICondition.sol";
import "./interfaces/IUpdatableCondition.sol";
import "./interfaces/IAction.sol";
import "./interfaces/IFeeRegistry.sol";
import {ICuratedRegistry} from "./interfaces/ICuratedRegistry.sol";

/**
 * @title StrategyBuilderVault
 * @notice Owner-controlled vault that executes on-chain automations composed of
 *         Conditions and Actions arranged as a directed graph.
 *
 * Shared Persistent Context
 * ──────────────────────────
 * A single bytes[] context lives at the vault level and is shared by ALL
 * automations.  Any automation can read from or write to any context slot,
 * allowing values produced by one automation (e.g. amountOut from a swap) to
 * be consumed by a later automation in the same or a future transaction.
 *
 * Flow per execution:
 *   1. Vault context is loaded from storage into memory.
 *   2. Graph traversal starts at step 0 (always a Condition — the trigger).
 *   3. Conditions receive the context (read-only, staticcall).
 *   4. Actions receive the context and return a slot diff
 *      (updatedSlots[], updatedValues[]) via delegatecall.
 *      The vault applies the diff immediately so the next step sees the update.
 *   5. After traversal the final context is written back to vault storage.
 *
 * Fee model
 * ──────────
 * Fees are charged at the vault boundary (deposit/withdraw), not per-action.
 * Gas compensation for executors is deducted from a pre-funded deposit in
 * FeeRegistry and transferred directly to the executor.
 *
 * Curation gate
 * ─────────────
 * An action runs via `delegatecall` — in THIS vault's storage, with the owner
 * slot in reach. A condition runs via `staticcall` and can write nothing. So
 * before an automation is stored, every step target is checked against the
 * CuratedRegistry list **of its own kind**: a step of type CONDITION against
 * the condition list, a step of type ACTION against the action list. Checking
 * both against one list would make every reviewed condition a legal
 * `delegatecall` target, which is exactly the corruption the registry exists to
 * prevent.
 *
 * The gate sits on the deploy path (`createAutomation`, `createOwnerAutomation`,
 * `updateAutomationSteps`), never on the execution path: an automation that was
 * legal when it was stored keeps running even if its target is later removed
 * from the list. Removing a target therefore stops new deploys, not live vaults.
 *
 * The registry address is `immutable` — part of the implementation's bytecode,
 * not of the proxy's storage. A vault cannot be pointed at a different list
 * after the fact, and there is no configuration in which the gate is silently
 * off: the constructor refuses a zero address. Swapping the registry means
 * deploying a new implementation and letting the factory hand it to new vaults;
 * existing vaults keep the list they were reviewed against.
 *
 * Expert mode is the one deliberate way out, per vault and owner-only: with the
 * flag on, the gate does not run and any target may be used. It is stored, not
 * immutable, and readable on-chain so a UI can show which vaults are protected.
 */
contract StrategyBuilderVault is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;
    // ─── Constants ────────────────────────────────────────────────────────────

    uint32 public constant DONE = type(uint32).max;
    uint32 public constant MAX_STEPS = 256;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum StepType {
        CONDITION,
        ACTION
    }

    struct Step {
        StepType stepType;
        address target;
        bytes4 selector;
        uint32 nextOnTrue;
        uint32 nextOnFalse;
        bytes data;
    }

    struct Automation {
        bool active;
        bool ownerOnly;
        Step[] steps;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(uint32 => Automation) private _automations;
    uint32 private _automationCount;

    bytes[] private _ctx;

    /// @dev Optional fee registry. address(0) = fees disabled.
    IFeeRegistry private _feeRegistry;

    /// @dev ERC-20 token used for gas compensation pre-funding.
    ///      address(0) = gas compensation disabled.
    address private _depositToken;

    /// @dev Minimum fee deposit (in token units) that should be maintained in FeeRegistry.
    uint256 private _minFeeDeposit;

    /// @dev Expert mode: the owner has waived the curation gate for THIS vault.
    ///      Appended after every pre-existing variable on purpose — the vault
    ///      lives behind an ERC1967 proxy, so a new field may only extend the
    ///      layout, never shift or share a slot that is already in use.
    bool private _expertMode;

    // ─── Immutable ────────────────────────────────────────────────────────────

    /// @dev The curated list this vault deploys against. Immutable, so it lives
    ///      in the implementation's bytecode and costs the proxy no storage
    ///      slot; a vault can never be re-pointed at a different list.
    ICuratedRegistry private immutable _curatedRegistry;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AutomationCreated(uint32 indexed automationId, uint256 stepCount);
    event AutomationExecuted(
        uint32 indexed automationId,
        address indexed executor
    );
    event AutomationActiveChanged(uint32 indexed automationId, bool active);
    event AutomationStepsUpdated(
        uint32 indexed automationId,
        uint256 stepCount
    );
    event ContextSlotSet(uint32 indexed slot);
    event MinFeeDepositUpdated(uint256 newMinFeeDeposit);
    /// @notice The owner turned the curation gate off (`enabled == true`) or
    ///         back on (`enabled == false`) for this vault.
    event ExpertModeChanged(bool enabled);

    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(
        address indexed token,
        uint256 amount,
        uint256 fee,
        address indexed recipient
    );
    event GasCompSettled(
        uint32 indexed automationId,
        address indexed executor,
        address indexed token,
        uint256 gasCompTokens
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NoSteps();
    error FirstStepMustBeCondition();
    error InvalidStepReference(uint32 stepIndex);
    error ZeroTargetAddress(uint32 stepIndex);
    error ZeroSelector(uint32 stepIndex);
    error AutomationNotActive();
    error AutomationDoesNotExist();
    error CallerNotOwner();
    error TriggerNotMet();
    error ConditionCallFailed(uint32 stepIndex, bytes reason);
    error ActionExecutionFailed(uint32 stepIndex, bytes reason);
    error MaxStepsExceeded();
    error ContextSlotOutOfBounds(uint32 slot);
    error ContextDiffLengthMismatch();
    error ZeroRecipient();
    error ETHTransferFailed();
    /// @notice A step target is not on the curated list for its own kind.
    error StepTargetNotCurated(
        uint32 stepIndex,
        address target,
        ICuratedRegistry.TargetKind kind
    );
    /// @notice The implementation was deployed without a curated registry —
    ///         there is no vault whose gate is off by configuration.
    error ZeroCuratedRegistry();
    /// @notice The address given as the curated registry holds no code, so the
    ///         gate could never answer. Caught at deploy time, not at first use.
    error CuratedRegistryNotAContract(address curatedRegistry);

    // ─── Constructor / Initializer ────────────────────────────────────────────

    /**
     * @param curatedRegistry_ The curated list every vault behind this
     *        implementation deploys against. Required: a zero address would be
     *        a vault whose curation gate is off without anyone saying so.
     */
    constructor(address curatedRegistry_) {
        if (curatedRegistry_ == address(0)) revert ZeroCuratedRegistry();
        if (curatedRegistry_.code.length == 0)
            revert CuratedRegistryNotAContract(curatedRegistry_);
        _curatedRegistry = ICuratedRegistry(curatedRegistry_);
        _disableInitializers();
    }

    /**
     * @notice Initializer — called once by the factory through the proxy.
     * @param initialOwner  Address that will own this vault instance.
     * @param feeRegistry_  Optional FeeRegistry address. Pass address(0) to disable fees.
     * @param depositToken_ ERC-20 token used for gas compensation pre-funding.
     *                      Pass address(0) to disable gas compensation.
     */
    function initialize(
        address initialOwner,
        address feeRegistry_,
        address depositToken_
    ) external initializer {
        __Ownable_init(initialOwner);
        _feeRegistry = IFeeRegistry(feeRegistry_);
        _depositToken = depositToken_;
    }

    // ─── Owner: expert mode ──────────────────────────────────────────────────

    /**
     * @notice Turn the curation gate off (`true`) or back on (`false`) for this
     *         vault. Only the vault owner decides this, and only for their own
     *         vault — the curator cannot force a vault into expert mode and
     *         cannot take it out of one.
     * @dev With the flag on, `createAutomation` / `createOwnerAutomation` /
     *      `updateAutomationSteps` accept any target, including one that will be
     *      `delegatecall`ed into this vault's storage. Turning the flag back off
     *      gates future deploys only; automations stored while it was on keep
     *      running, exactly as they do when a target is un-curated.
     *
     *      The event is emitted on every call, not only on a change: the owner's
     *      decision is what an off-chain protection badge follows, and a
     *      re-affirmation is part of that trail.
     */
    function setExpertMode(bool enabled) external onlyOwner {
        _expertMode = enabled;
        emit ExpertModeChanged(enabled);
    }

    // ─── Owner: fee deposit management ───────────────────────────────────────

    function setMinFeeDeposit(uint256 minAmount) external onlyOwner {
        _minFeeDeposit = minAmount;
        emit MinFeeDepositUpdated(minAmount);
    }

    /**
     * @notice Move ERC-20 tokens from this vault's balance into FeeRegistry
     *         to pre-fund gas compensation.
     */
    function depositFees(address token, uint256 amount) external onlyOwner {
        IFeeRegistry reg = _feeRegistry;
        IERC20(token).forceApprove(address(reg), amount);
        reg.depositFor(address(this), token, amount);
    }

    // ─── Owner: deposit / withdraw tokens ────────────────────────────────────

    /**
     * @notice Deposit ERC-20 tokens into the vault. A deposit fee (if configured)
     *         is deducted and sent to FeeRegistry.
     * @param token  ERC-20 token to deposit.
     * @param amount Gross amount to pull from msg.sender. Vault receives amount - fee.
     */
    function deposit(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        IFeeRegistry reg = _feeRegistry;
        if (address(reg) != address(0)) {
            uint16 feeBps = reg.depositFeeBps();
            if (feeBps > 0) {
                uint256 fee = (amount * feeBps) / 10_000;
                IERC20(token).forceApprove(address(reg), fee);
                reg.collectFee(token, fee);
            }
        }

        emit Deposited(token, amount);
    }

    /**
     * @notice Withdraw ERC-20 tokens from the vault. A withdraw fee (if configured)
     *         is deducted from the amount and sent to FeeRegistry.
     * @param token     ERC-20 token to withdraw.
     * @param amount    Gross amount. Recipient receives amount - fee.
     * @param recipient Destination address.
     */
    function withdraw(address token, uint256 amount, address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroRecipient();

        uint256 fee = 0;
        IFeeRegistry reg = _feeRegistry;
        if (address(reg) != address(0)) {
            uint16 feeBps = reg.withdrawFeeBps();
            if (feeBps > 0) {
                fee = (amount * feeBps) / 10_000;
                IERC20(token).forceApprove(address(reg), fee);
                reg.collectFee(token, fee);
            }
        }

        IERC20(token).safeTransfer(recipient, amount - fee);
        emit Withdrawn(token, amount, fee, recipient);
    }

    // ─── Owner: Automation management ─────────────────────────────────────────

    function createAutomation(
        Step[] calldata steps
    ) external onlyOwner returns (uint32 automationId) {
        _validateSteps(steps, false);
        automationId = _storeAutomation(steps, false);
    }

    function createOwnerAutomation(
        Step[] calldata steps
    ) external onlyOwner returns (uint32 automationId) {
        _validateSteps(steps, true);
        automationId = _storeAutomation(steps, true);
    }

    function updateAutomationSteps(
        uint32 automationId,
        Step[] calldata steps
    ) external onlyOwner {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();
        _validateSteps(steps, _automations[automationId].ownerOnly);

        Automation storage automation = _automations[automationId];

        uint256 oldLen = automation.steps.length;
        uint256 newLen = steps.length;

        uint256 overwrite = oldLen < newLen ? oldLen : newLen;
        for (uint256 i = 0; i < overwrite; ) {
            automation.steps[i] = steps[i];
            unchecked { ++i; }
        }
        for (uint256 i = overwrite; i < newLen; ) {
            automation.steps.push(steps[i]);
            unchecked { ++i; }
        }
        for (uint256 i = oldLen; i > newLen; ) {
            automation.steps.pop();
            unchecked { --i; }
        }

        emit AutomationStepsUpdated(automationId, steps.length);
    }

    function setAutomationActive(
        uint32 automationId,
        bool active
    ) external onlyOwner {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();
        _automations[automationId].active = active;
        emit AutomationActiveChanged(automationId, active);
    }

    // ─── Owner: Shared context management ────────────────────────────────────

    function setContext(bytes[] calldata ctx) external onlyOwner {
        uint256 newLen = ctx.length;
        uint256 oldLen = _ctx.length;

        for (uint256 i = oldLen; i < newLen; ) {
            _ctx.push();
            unchecked { ++i; }
        }
        for (uint256 i = oldLen; i > newLen; ) {
            _ctx.pop();
            unchecked { --i; }
        }
        for (uint256 i = 0; i < newLen; ) {
            _ctx[i] = ctx[i];
            unchecked { ++i; }
        }
    }

    function setContextSlot(
        uint32 slot,
        bytes calldata value
    ) external onlyOwner {
        if (slot >= _ctx.length) revert ContextSlotOutOfBounds(slot);
        _ctx[slot] = value;
        emit ContextSlotSet(slot);
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    function executeAutomation(uint32 automationId) external nonReentrant {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();

        Automation storage automation = _automations[automationId];
        if (!automation.active) revert AutomationNotActive();
        if (automation.ownerOnly && msg.sender != owner()) revert CallerNotOwner();

        uint256 gasStart = gasleft();

        bytes[] memory ctx = _loadCtx();

        uint32 current = 0;
        uint32 stepCount = 0;
        bool triggerFired = automation.ownerOnly &&
            automation.steps[0].stepType == StepType.ACTION;
        bool ctxDirty = false;

        while (current != DONE) {
            if (stepCount >= MAX_STEPS) revert MaxStepsExceeded();

            Step storage step = automation.steps[current];

            if (step.stepType == StepType.CONDITION) {
                bool met = _checkCondition(
                    step.target,
                    step.selector,
                    step.data,
                    current,
                    ctx
                );
                if (current == 0 && stepCount == 0) {
                    triggerFired = met;
                    if (!met && msg.sender != owner()) revert TriggerNotMet();
                }
                current = met ? step.nextOnTrue : step.nextOnFalse;
            } else {
                ctx = _executeAction(
                    step.target,
                    step.selector,
                    step.data,
                    current,
                    ctx
                );
                ctxDirty = true;
                current = step.nextOnTrue;
            }

            unchecked {
                ++stepCount;
            }
        }

        if (triggerFired) {
            ctx = _updateTriggerCondition(automation.steps[0], ctx);
            ctxDirty = true;
        }

        if (ctxDirty) _saveCtx(ctx);

        if (msg.sender != owner()) {
            uint256 gasUsed = gasStart - gasleft();
            _settleGasComp(automationId, msg.sender, gasUsed);
        }

        emit AutomationExecuted(automationId, msg.sender);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function isTriggerMet(uint32 automationId) external view returns (bool) {
        if (automationId >= _automationCount) return false;
        Automation storage automation = _automations[automationId];
        if (!automation.active || automation.steps.length == 0) return false;

        Step storage trigger = automation.steps[0];

        if (automation.ownerOnly && trigger.stepType == StepType.ACTION) return true;

        bytes[] memory ctx = _loadCtx();
        (bool success, bytes memory result) = trigger.target.staticcall(
            abi.encodeWithSelector(trigger.selector, trigger.data, ctx)
        );
        if (!success || result.length < 32) return false;
        return abi.decode(result, (bool));
    }

    function getAutomation(
        uint32 automationId
    ) external view returns (bool active, bool ownerOnly, Step[] memory steps) {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();
        Automation storage automation = _automations[automationId];
        return (automation.active, automation.ownerOnly, automation.steps);
    }

    function getContext() external view returns (bytes[] memory) {
        return _ctx;
    }

    function automationCount() external view returns (uint32) {
        return _automationCount;
    }

    function feeRegistry() external view returns (address) {
        return address(_feeRegistry);
    }

    function depositToken() external view returns (address) {
        return _depositToken;
    }

    function minFeeDeposit() external view returns (uint256) {
        return _minFeeDeposit;
    }

    /// @notice True when the owner has waived the curation gate for this vault.
    function expertMode() external view returns (bool) {
        return _expertMode;
    }

    /// @notice The curated list this vault's deploy path checks against.
    function curatedRegistry() external view returns (address) {
        return address(_curatedRegistry);
    }

    // ─── ABI helpers ──────────────────────────────────────────────────────────

    function decodeContextDiff(
        bytes calldata data
    ) external pure returns (uint32[] memory slots, bytes[] memory values) {
        (slots, values) = abi.decode(data, (uint32[], bytes[]));
    }

    // ─── Internal: automation storage ─────────────────────────────────────────

    function _storeAutomation(
        Step[] calldata steps,
        bool ownerOnly
    ) internal returns (uint32 automationId) {
        automationId = _automationCount++;
        Automation storage automation = _automations[automationId];
        automation.active    = true;
        automation.ownerOnly = ownerOnly;
        for (uint256 i = 0; i < steps.length; ) {
            automation.steps.push(steps[i]);
            unchecked { ++i; }
        }
        emit AutomationCreated(automationId, steps.length);
    }

    // ─── Internal: step validation ────────────────────────────────────────────

    /**
     * @dev Shape checks first, then the curation gate. The order is deliberate:
     *      a malformed step keeps its own precise error (a zero target is
     *      `ZeroTargetAddress`, not "not curated"), and the gate only ever
     *      speaks about steps that are otherwise well-formed.
     *
     *      The gate is skipped entirely in expert mode; the flag is read once,
     *      not per step.
     */
    function _validateSteps(Step[] calldata steps, bool ownerOnly) internal view {
        if (steps.length == 0) revert NoSteps();
        if (!ownerOnly && steps[0].stepType != StepType.CONDITION)
            revert FirstStepMustBeCondition();

        bool gated = !_expertMode;

        uint32 len = uint32(steps.length);
        for (uint32 i = 0; i < len; ) {
            if (steps[i].target == address(0)) revert ZeroTargetAddress(i);
            if (steps[i].selector == bytes4(0)) revert ZeroSelector(i);

            uint32 onTrue = steps[i].nextOnTrue;
            uint32 onFalse = steps[i].nextOnFalse;

            if (onTrue != DONE && onTrue >= len) revert InvalidStepReference(i);

            if (steps[i].stepType == StepType.CONDITION) {
                if (onFalse != DONE && onFalse >= len)
                    revert InvalidStepReference(i);
            } else {
                if (onFalse != DONE) revert InvalidStepReference(i);
            }

            if (gated) _requireCurated(i, steps[i]);

            unchecked { ++i; }
        }
    }

    /**
     * @dev Each step is checked against the curated list of ITS OWN kind.
     *
     *      This mapping is the whole point of keeping two lists. A CONDITION is
     *      reached by `staticcall` and cannot write; an ACTION is reached by
     *      `delegatecall` and writes into this vault's storage. If both kinds
     *      were checked against one list, every reviewed condition would also be
     *      a legal `delegatecall` target — and a condition that writes its own
     *      slots would then write the vault's, owner slot included.
     *
     *      Written out as a branch rather than a cast: `StepType` and
     *      `TargetKind` happen to agree in order today, and a cast would keep
     *      compiling — silently checking the wrong list — if either enum ever
     *      gained a member.
     */
    function _requireCurated(uint32 stepIndex, Step calldata step) internal view {
        ICuratedRegistry.TargetKind kind = step.stepType == StepType.CONDITION
            ? ICuratedRegistry.TargetKind.Condition
            : ICuratedRegistry.TargetKind.Action;

        if (!_curatedRegistry.isCurated(step.target, kind))
            revert StepTargetNotCurated(stepIndex, step.target, kind);
    }

    // ─── Internal: context load / save ────────────────────────────────────────

    function _loadCtx() internal view returns (bytes[] memory ctx) {
        uint256 len = _ctx.length;
        ctx = new bytes[](len);
        for (uint256 i = 0; i < len; ) {
            ctx[i] = _ctx[i];
            unchecked { ++i; }
        }
    }

    function _saveCtx(bytes[] memory ctx) internal {
        uint256 newLen = ctx.length;
        uint256 oldLen = _ctx.length;

        for (uint256 i = oldLen; i < newLen; ) {
            _ctx.push();
            unchecked { ++i; }
        }
        for (uint256 i = oldLen; i > newLen; ) {
            _ctx.pop();
            unchecked { --i; }
        }
        for (uint256 i = 0; i < newLen; ) {
            _ctx[i] = ctx[i];
            unchecked { ++i; }
        }
    }

    // ─── Internal: condition / action dispatch ────────────────────────────────

    function _updateTriggerCondition(
        Step storage step,
        bytes[] memory ctx
    ) internal view returns (bytes[] memory) {
        (bool ok, bytes memory ret) = step.target.staticcall(
            abi.encodeWithSelector(
                IUpdatableCondition.afterExecution.selector,
                step.data,
                ctx
            )
        );
        if (!ok || ret.length == 0) return ctx;

        uint32[] memory slots;
        bytes[] memory values;
        try this.decodeContextDiff(ret) returns (uint32[] memory s, bytes[] memory v) {
            slots  = s;
            values = v;
        } catch {
            return ctx;
        }
        if (slots.length != values.length) return ctx;

        for (uint256 i = 0; i < slots.length; ) {
            if (slots[i] < ctx.length) {
                ctx[slots[i]] = values[i];
            }
            unchecked { ++i; }
        }
        return ctx;
    }

    function _checkCondition(
        address target,
        bytes4 selector,
        bytes storage data,
        uint32 stepIndex,
        bytes[] memory ctx
    ) internal view returns (bool) {
        (bool success, bytes memory result) = target.staticcall(
            abi.encodeWithSelector(selector, data, ctx)
        );
        if (!success || result.length < 32)
            revert ConditionCallFailed(stepIndex, result);
        return abi.decode(result, (bool));
    }

    function _executeAction(
        address target,
        bytes4 selector,
        bytes storage data,
        uint32 stepIndex,
        bytes[] memory ctx
    ) internal returns (bytes[] memory) {
        (bool success, bytes memory returnData) = target.delegatecall(
            abi.encodeWithSelector(selector, data, ctx)
        );
        if (!success) revert ActionExecutionFailed(stepIndex, returnData);

        if (returnData.length > 0) {
            (
                uint32[] memory slots,
                bytes[] memory values
            ) = abi.decode(returnData, (uint32[], bytes[]));

            if (slots.length != values.length)
                revert ContextDiffLengthMismatch();

            for (uint256 i = 0; i < slots.length; ) {
                if (slots[i] >= ctx.length)
                    revert ContextSlotOutOfBounds(slots[i]);
                ctx[slots[i]] = values[i];
                unchecked { ++i; }
            }
        }

        return ctx;
    }

    /**
     * @notice Settle gas compensation at the end of an automation execution.
     *         Deducts from the vault's pre-funded deposit in FeeRegistry and
     *         transfers directly to the executor.
     */
    function _settleGasComp(
        uint32 automationId,
        address executor,
        uint256 gasUsed
    ) internal {
        IFeeRegistry reg = _feeRegistry;
        if (address(reg) == address(0)) return;

        address token = _depositToken;
        if (token == address(0)) return;

        uint256 gasCompTokens = reg.deductGasComp(token, executor, gasUsed);

        if (gasCompTokens > 0) {
            emit GasCompSettled(automationId, executor, token, gasCompTokens);
        }
    }

    // ─── ETH handling ─────────────────────────────────────────────────────────

    receive() external payable {}

    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroRecipient();
        uint256 toSend = amount == 0 ? address(this).balance : amount;
        (bool ok,) = to.call{value: toSend}("");
        if (!ok) revert ETHTransferFailed();
    }

    // ─── ERC-721 custody ────────────────────────────────────────────────────

    /**
     * Accept ERC-721 transfers so the vault can hold PancakeSwap V3 LP position
     * NFTs. Implemented proactively and unconditionally (a 4-line magic-selector
     * return, zero downside) — immune to today's non-safe NPM `_mint` and a
     * future switch to `_safeMint`.
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
