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
import "./interfaces/external/IPriceOracle.sol";
import "./crosschain/interfaces/ICrossChainFeeManager.sol";

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
 *      (updatedSlots[], updatedValues[]) plus a USD volume via delegatecall.
 *      The vault applies the diff immediately so the next step sees the update.
 *      If a FeeRegistry is set, the vault emits a FeeAccrued event.
 *   5. After traversal the final context is written back to vault storage.
 *
 * Condition branching
 * ────────────────────
 * Each condition carries two outgoing edges: nextOnTrue / nextOnFalse.
 * DONE (type(uint32).max) terminates traversal on that edge.
 * A false result does NOT revert — it follows nextOnFalse.
 *
 * Multi-function action contracts
 * ────────────────────────────────
 * The Step.selector field specifies which function to call on the target
 * contract, enabling a single contract to expose multiple action or condition
 * functions. All action functions must match the IAction return signature.
 *
 * Security notes
 * ───────────────
 * - executeAutomation is callable by anyone. The trigger condition (step 0)
 *   gates whether actions run.
 * - Action contracts are executed via delegatecall in the vault's storage/balance
 *   context. Only use audited, stateless action contracts without state variables.
 * - Context slots are shared across all automations: owners must manage slot
 *   assignments carefully to avoid unintended cross-automation reads/writes.
 */
contract StrategyBuilderVault is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;
    // ─── Constants ────────────────────────────────────────────────────────────

    /// @dev Sentinel: "end of path". Use as nextOnTrue / nextOnFalse to stop traversal.
    uint32 public constant DONE = type(uint32).max;

    /// @dev Maximum steps traversed per execution to prevent infinite loops / cycles.
    uint32 public constant MAX_STEPS = 256;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum StepType {
        CONDITION,
        ACTION
    }

    struct Step {
        StepType stepType;
        address target; // condition or action contract — must not be address(0)
        bytes4 selector; // function to call on target (must not be bytes4(0))
        uint32 nextOnTrue; // CONDITION: next step if true  | ACTION: next step
        uint32 nextOnFalse; // CONDITION: next step if false | ACTION: must be DONE
        bytes data; // ABI-encoded static params forwarded to the function
    }

    struct Automation {
        bool active;
        /// @dev When true: only owner can execute; step 0 may be ACTION or CONDITION.
        ///      When false: anyone can execute; step 0 must be CONDITION.
        bool ownerOnly;
        Step[] steps;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(uint32 => Automation) private _automations;
    uint32 private _automationCount;

    /// @dev Vault-wide shared context — all automations read and write the same slots.
    bytes[] private _ctx;

    /// @dev Optional fee registry. address(0) = fee tracking disabled.
    IFeeRegistry private _feeRegistry;

    /// @dev Strategy creator address. Receives the creator fee share.
    ///      Defaults to the vault owner set at initialization. Changeable by owner.
    address private _creator;

    /// @dev ERC-20 token this vault uses as deposit currency and to pay fees
    ///      (must be accepted by _feeRegistry).  address(0) = fees are tracked but not settled.
    address private _depositToken;

    /// @dev Minimum fee deposit (in token units) that should be maintained in FeeRegistry.
    ///      Read by FeeDepositAction to decide whether to top up after an action step.
    ///      0 = no minimum enforced.
    uint256 private _minFeeDeposit;

    /// @dev Price oracle used to convert (volumeToken, volumeAmount) → volumeUSD for
    ///      per-step fee calculation.  address(0) = fee accrual disabled even if
    ///      FeeRegistry is set.
    IPriceOracle private _priceOracle;

    /// @dev LayerZero Endpoint ID of the chain where fees are settled.
    ///      0 = local chain only (default behaviour, no cross-chain).
    uint32 private _feeChainEid;

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

    /**
     * @dev Emitted for each action step when a non-zero USD volume is derived via the
     *      price oracle from the action's (volumeToken, volumeAmount) return values,
     *      and FeeRegistry has a non-zero fee for that function.
     * @param automationId  ID of the automation being executed.
     * @param stepIndex     Index of the action step within the automation.
     * @param target        Action contract address.
     * @param selector      Function selector that was called.
     * @param volumeUSD     Oracle-derived USD volume (18 decimals).
     * @param feeUSD        Computed fee: volumeUSD * feeBps / 10_000 (18 decimals).
     */
    event FeeAccrued(
        uint32 indexed automationId,
        uint32 indexed stepIndex,
        address indexed target,
        bytes4 selector,
        uint256 volumeUSD,
        uint256 feeUSD
    );

    /**
     * @dev Emitted once per automation execution when fees are settled.
     * @param automationId       ID of the automation that was executed.
     * @param executor           Address that called executeAutomation.
     * @param depositToken       ERC-20 token used as deposit currency and to pay fees.
     * @param creator            Vault's strategy creator address.
     * @param totalFeeUSD        Sum of all per-step fees, 18 decimals.
     * @param depositTokenAmount Total deposit-token amount deducted from FeeRegistry.
     * @param gasCompTokens      Portion of depositTokenAmount guaranteed to executor for gas.
     */
    event FeesSettled(
        uint32 indexed automationId,
        address indexed executor,
        address indexed depositToken,
        address creator,
        uint256 totalFeeUSD,
        uint256 depositTokenAmount,
        uint256 gasCompTokens
    );

    event MinFeeDepositUpdated(uint256 newMinFeeDeposit);

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
    error ConditionCallFailed(uint32 stepIndex);
    error ActionExecutionFailed(uint32 stepIndex);
    error MaxStepsExceeded();
    error ContextSlotOutOfBounds(uint32 slot);
    error ContextDiffLengthMismatch();
    error ZeroRecipient();
    error ETHTransferFailed();

    // ─── Constructor / Initializer ────────────────────────────────────────────

    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer — called once by the factory through the proxy.
     *         All fee-related addresses are fixed at creation and cannot
     *         be changed afterwards (immutable-by-convention).
     *
     * @param initialOwner  Address that will own this vault instance.
     * @param feeRegistry_  Optional FeeRegistry address. Pass address(0) to disable fees.
     * @param depositToken_ ERC-20 token used as deposit currency and to pay fees
     *                      (must be accepted by feeRegistry_).
     *                      Pass address(0) to disable fee settlement.
     * @param creator_     Strategy creator that receives the creator fee share.
     *                      Pass address(0) to route that share to the protocol vault.
     * @param priceOracle_  IPriceOracle used to convert (volumeToken, volumeAmount) → USD.
     *                      Pass address(0) to disable fee accrual (FeeAccrued not emitted).
     * @param feeChainEid_  LayerZero Endpoint ID of the chain where fees are settled.
     *                      0 = local chain only (no cross-chain settlement).
     */
    function initialize(
        address initialOwner,
        address feeRegistry_,
        address depositToken_,
        address creator_,
        address priceOracle_,
        uint32  feeChainEid_
    ) external initializer {
        __Ownable_init(initialOwner);
        // ReentrancyGuardTransient is stateless — no init needed
        _feeRegistry = IFeeRegistry(feeRegistry_);
        _depositToken = depositToken_;
        _creator = creator_;
        _priceOracle = IPriceOracle(priceOracle_);
        _feeChainEid = feeChainEid_;
    }

    /**
     * @notice Set the minimum fee deposit that should be maintained in FeeRegistry.
     *         FeeDepositAction compares the current deposit against this value and
     *         tops up automatically when the balance falls below it.
     *         Set to 0 to disable the minimum-deposit check.
     */
    function setMinFeeDeposit(uint256 minAmount) external onlyOwner {
        _minFeeDeposit = minAmount;
        emit MinFeeDepositUpdated(minAmount);
    }

    /**
     * @notice Move ERC-20 tokens from THIS vault's balance into the FeeRegistry
     *         deposit, so they are protected from automation actions.
     *         Can be called by the vault owner directly, or encoded as an action
     *         step so that a strategy can top up its own fee deposit automatically.
     *
     *         Approval of FeeRegistry is given for exactly `amount` tokens and
     *         revoked implicitly once the transferFrom in depositFor consumes it.
     *
     * @param token   Accepted fee token (must be registered in FeeRegistry).
     * @param amount  Amount to move from vault balance → FeeRegistry deposit.
     */
    function depositFees(address token, uint256 amount) external onlyOwner {
        IFeeRegistry reg = _feeRegistry;
        IERC20(token).forceApprove(address(reg), amount);
        reg.depositFor(address(this), token, amount);
    }

    // ─── Owner: Automation management ─────────────────────────────────────────

    /**
     * @notice Create a new public automation executable by anyone.
     *         steps[0] MUST be a CONDITION — it acts as the public gate.
     * @return automationId  The uint32 ID of the newly created automation.
     */
    function createAutomation(
        Step[] calldata steps
    ) external onlyOwner returns (uint32 automationId) {
        _validateSteps(steps, false);
        automationId = _storeAutomation(steps, false);
    }

    /**
     * @notice Create an owner-only automation.
     *         Only the vault owner can execute it.
     *         steps[0] may be a CONDITION or an ACTION — no public gate is required
     *         since the owner's call is the authorisation.
     *         Fees are never charged when the owner executes any automation.
     * @return automationId  The uint32 ID of the newly created automation.
     */
    function createOwnerAutomation(
        Step[] calldata steps
    ) external onlyOwner returns (uint32 automationId) {
        _validateSteps(steps, true);
        automationId = _storeAutomation(steps, true);
    }

    /**
     * @notice Replace all steps of an existing automation.
     *         Validates against the same rules used at creation (ownerOnly flag preserved).
     *         The shared vault context is NOT affected.
     */
    function updateAutomationSteps(
        uint32 automationId,
        Step[] calldata steps
    ) external onlyOwner {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();
        _validateSteps(steps, _automations[automationId].ownerOnly);

        Automation storage automation = _automations[automationId];

        uint256 oldLen = automation.steps.length;
        uint256 newLen = steps.length;

        // Overwrite existing slots to avoid the SSTORE overhead of pop+push.
        uint256 overwrite = oldLen < newLen ? oldLen : newLen;
        for (uint256 i = 0; i < overwrite; ) {
            automation.steps[i] = steps[i];
            unchecked { ++i; }
        }
        // Append extra steps if newLen > oldLen.
        for (uint256 i = overwrite; i < newLen; ) {
            automation.steps.push(steps[i]);
            unchecked { ++i; }
        }
        // Remove trailing steps if newLen < oldLen.
        for (uint256 i = oldLen; i > newLen; ) {
            automation.steps.pop();
            unchecked { --i; }
        }

        emit AutomationStepsUpdated(automationId, steps.length);
    }

    /**
     * @notice Activate or deactivate an automation.
     */
    function setAutomationActive(
        uint32 automationId,
        bool active
    ) external onlyOwner {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();
        _automations[automationId].active = active;
        emit AutomationActiveChanged(automationId, active);
    }

    // ─── Owner: Shared context management ────────────────────────────────────

    /**
     * @notice Replace the entire vault context.
     *         Resizes the slot array to match the new length.
     */
    function setContext(bytes[] calldata ctx) external onlyOwner {
        uint256 newLen = ctx.length;
        uint256 oldLen = _ctx.length;

        for (uint256 i = oldLen; i < newLen; ) {
            _ctx.push();
            unchecked {
                ++i;
            }
        }
        for (uint256 i = oldLen; i > newLen; ) {
            _ctx.pop();
            unchecked {
                --i;
            }
        }
        for (uint256 i = 0; i < newLen; ) {
            _ctx[i] = ctx[i];
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Override a single context slot.
     *         slot must be within the current context length.
     */
    function setContextSlot(
        uint32 slot,
        bytes calldata value
    ) external onlyOwner {
        if (slot >= _ctx.length) revert ContextSlotOutOfBounds(slot);
        _ctx[slot] = value;
        emit ContextSlotSet(slot);
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    /**
     * @notice Execute an automation.
     *         Public automations (ownerOnly = false) can be called by anyone;
     *         the trigger condition (step 0) acts as the gate.
     *         Owner-only automations (ownerOnly = true) can only be called by the
     *         vault owner; no condition is required at step 0.
     *         When the vault owner executes ANY automation, fees are never charged.
     * @param automationId ID of the automation to run.
     */
    function executeAutomation(uint32 automationId) external payable nonReentrant {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();

        Automation storage automation = _automations[automationId];
        if (!automation.active) revert AutomationNotActive();
        if (automation.ownerOnly && msg.sender != owner()) revert CallerNotOwner();

        uint256 gasStart = gasleft();

        bytes[] memory ctx = _loadCtx();

        uint32 current = 0;
        uint32 stepCount = 0;
        uint256 totalFeeUSD = 0;
        // For ownerOnly automations whose first step is an ACTION there is no condition
        // to gate execution — the owner's call is the authorisation, so we treat the
        // trigger as always fired so afterExecution hooks are called correctly.
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
                // current == 0 && stepCount == 0: this is the initial trigger condition.
                if (current == 0 && stepCount == 0) {
                    triggerFired = met;
                    // Non-owners cannot benefit from running a graph whose trigger is
                    // false — revert immediately to save their remaining gas.
                    if (!met && msg.sender != owner()) revert TriggerNotMet();
                }
                current = met ? step.nextOnTrue : step.nextOnFalse;
            } else {
                uint256 stepFeeUSD;
                (ctx, stepFeeUSD) = _executeAction(
                    step.target,
                    step.selector,
                    step.data,
                    current,
                    automationId,
                    ctx
                );
                totalFeeUSD += stepFeeUSD;
                ctxDirty = true;
                current = step.nextOnTrue;
            }

            unchecked {
                ++stepCount;
            }
        }

        // If the trigger fired, give step 0 a chance to update the context
        // (e.g. advance an interval schedule). Silently skipped when step 0 does
        // not implement IUpdatableCondition.afterExecution.
        if (triggerFired) {
            ctx = _updateTriggerCondition(automation.steps[0], ctx);
            ctxDirty = true;
        }

        // Only write context back when it was actually modified.
        // When the trigger condition is false (common case), this avoids
        // re-writing every slot to storage — a significant gas saving.
        if (ctxDirty) _saveCtx(ctx);

        // Owner pays no fees when executing any automation.
        if (msg.sender != owner()) {
            uint256 gasUsed = gasStart - gasleft();
            _settleFees(automationId, msg.sender, totalFeeUSD, gasUsed);
        }

        emit AutomationExecuted(automationId, msg.sender);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Returns true when the trigger condition (step 0) is currently met.
     *         For owner-only automations whose step 0 is an ACTION, always returns
     *         true — the owner's call is the only gate.
     *         Returns false (not reverts) on any condition failure or bad config.
     */
    function isTriggerMet(uint32 automationId) external view returns (bool) {
        if (automationId >= _automationCount) return false;
        Automation storage automation = _automations[automationId];
        if (!automation.active || automation.steps.length == 0) return false;

        Step storage trigger = automation.steps[0];

        // Owner-only automations with no condition are always "ready".
        if (automation.ownerOnly && trigger.stepType == StepType.ACTION) return true;

        bytes[] memory ctx = _loadCtx();
        (bool success, bytes memory result) = trigger.target.staticcall(
            abi.encodeWithSelector(trigger.selector, trigger.data, ctx)
        );
        if (!success || result.length < 32) return false;
        return abi.decode(result, (bool));
    }

    /** @notice Return the metadata and steps of an automation. */
    function getAutomation(
        uint32 automationId
    ) external view returns (bool active, bool ownerOnly, Step[] memory steps) {
        if (automationId >= _automationCount) revert AutomationDoesNotExist();
        Automation storage automation = _automations[automationId];
        return (automation.active, automation.ownerOnly, automation.steps);
    }

    /** @notice Return the current vault-wide shared context. */
    function getContext() external view returns (bytes[] memory) {
        return _ctx;
    }

    /** @notice Total number of automations ever created (includes inactive ones). */
    function automationCount() external view returns (uint32) {
        return _automationCount;
    }

    /** @notice Current fee registry address (address(0) = disabled). */
    function feeRegistry() external view returns (address) {
        return address(_feeRegistry);
    }

    /** @notice Strategy creator address that receives the creator fee share. */
    function creator() external view returns (address) {
        return _creator;
    }

    /** @notice ERC-20 token used as deposit currency and to settle fees. address(0) = settlement disabled. */
    function depositToken() external view returns (address) {
        return _depositToken;
    }

    /** @notice LayerZero EID of the chain where fees are settled. 0 = local only. */
    function feeChainEid() external view returns (uint32) {
        return _feeChainEid;
    }

    /** @notice Minimum fee deposit (in token units) required in FeeRegistry. */
    function minFeeDeposit() external view returns (uint256) {
        return _minFeeDeposit;
    }

    /** @notice Price oracle used to derive USD volume from action return values. */
    function priceOracle() external view returns (address) {
        return address(_priceOracle);
    }

    // ─── ABI helpers ──────────────────────────────────────────────────────────

    /**
     * @notice Decode a (uint32[], bytes[]) context diff returned by afterExecution.
     *         Exposed as external pure so _updateTriggerCondition can wrap the decode
     *         in a try/catch — abi.decode reverts on malformed input and try/catch
     *         only works on external calls in Solidity.
     */
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

    /// @param ownerOnly  When false, step 0 must be a CONDITION.
    ///                   When true, step 0 may be a CONDITION or an ACTION.
    function _validateSteps(Step[] calldata steps, bool ownerOnly) internal pure {
        if (steps.length == 0) revert NoSteps();
        if (!ownerOnly && steps[0].stepType != StepType.CONDITION)
            revert FirstStepMustBeCondition();

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
                // ACTION: nextOnFalse is never read — enforce DONE to prevent
                // silent misconfiguration where an owner expects branching.
                if (onFalse != DONE) revert InvalidStepReference(i);
            }

            unchecked {
                ++i;
            }
        }
    }

    // ─── Internal: context load / save ────────────────────────────────────────

    function _loadCtx() internal view returns (bytes[] memory ctx) {
        uint256 len = _ctx.length;
        ctx = new bytes[](len);
        for (uint256 i = 0; i < len; ) {
            ctx[i] = _ctx[i];
            unchecked {
                ++i;
            }
        }
    }

    function _saveCtx(bytes[] memory ctx) internal {
        uint256 newLen = ctx.length;
        uint256 oldLen = _ctx.length;

        for (uint256 i = oldLen; i < newLen; ) {
            _ctx.push();
            unchecked {
                ++i;
            }
        }
        for (uint256 i = oldLen; i > newLen; ) {
            _ctx.pop();
            unchecked {
                --i;
            }
        }
        for (uint256 i = 0; i < newLen; ) {
            _ctx[i] = ctx[i];
            unchecked {
                ++i;
            }
        }
    }

    // ─── Internal: condition / action dispatch ────────────────────────────────

    /**
     * @dev Call afterExecution on the trigger condition (step 0) if it implements
     *      IUpdatableCondition. Uses staticcall — the condition only computes a
     *      context diff, the vault applies the write. Silently skips on any failure.
     */
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
            unchecked {
                ++i;
            }
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
            revert ConditionCallFailed(stepIndex);
        return abi.decode(result, (bool));
    }

    function _executeAction(
        address target,
        bytes4 selector,
        bytes storage data,
        uint32 stepIndex,
        uint32 automationId,
        bytes[] memory ctx
    ) internal returns (bytes[] memory, uint256 stepFeeUSD) {
        (bool success, bytes memory returnData) = target.delegatecall(
            abi.encodeWithSelector(selector, data, ctx)
        );
        if (!success) revert ActionExecutionFailed(stepIndex);

        // Apply context diff and accumulate per-step fee.
        if (returnData.length > 0) {
            (
                uint32[] memory slots,
                bytes[] memory values,
                address volumeToken,
                uint256 volumeAmount
            ) = abi.decode(returnData, (uint32[], bytes[], address, uint256));

            if (slots.length != values.length)
                revert ContextDiffLengthMismatch();

            for (uint256 i = 0; i < slots.length; ) {
                if (slots[i] >= ctx.length)
                    revert ContextSlotOutOfBounds(slots[i]);
                ctx[slots[i]] = values[i];
                unchecked {
                    ++i;
                }
            }

            // Convert (volumeToken, volumeAmount) → volumeUSD via the price oracle,
            // then compute the per-step fee and emit an audit event.
            if (
                volumeToken != address(0) &&
                volumeAmount > 0 &&
                address(_feeRegistry) != address(0) &&
                address(_priceOracle) != address(0)
            ) {
                uint256 feeBps = _feeRegistry.getFee(target, selector);
                if (feeBps > 0) {
                    uint256 volumeUSD;
                    try _priceOracle.getTokenPrice(volumeToken) returns (
                        uint256 price
                    ) {
                        if (price > 0) {
                            volumeUSD = (volumeAmount * price) / 1e18;
                        }
                    } catch {}

                    if (volumeUSD > 0) {
                        stepFeeUSD = (volumeUSD * feeBps) / 10_000;
                        emit FeeAccrued(
                            automationId,
                            stepIndex,
                            target,
                            selector,
                            volumeUSD,
                            stepFeeUSD
                        );
                    }
                }
            }
        }

        return (ctx, stepFeeUSD);
    }

    /**
     * @notice Settle accumulated fees at the end of an automation execution.
     *         Tokens are already held by FeeRegistry (pre-deposited via depositFees /
     *         depositFor) — no ERC-20 approval is needed here.
     *         Silently skips when registry/feeToken is not set.
     *         Reverts (via FeeRegistry) when the vault's deposit is insufficient.
     * @param gasUsed  Gas consumed so far (gasleft() diff); FeeRegistry adds its
     *                 configured overhead to cover the settlement path.
     */
    function _settleFees(
        uint32 automationId,
        address executor,
        uint256 totalFeeUSD,
        uint256 gasUsed
    ) internal {
        IFeeRegistry reg = _feeRegistry;
        if (address(reg) == address(0)) return;

        address token = _depositToken;
        if (token == address(0)) return;

        uint32 chainEid = _feeChainEid;

        // ── Cross-chain settlement ─────────────────────────────────────────────
        // When chainEid is set the fee is settled on a remote chain via LZ.
        // gasCompUSD is pre-computed here using the local oracle so the remote
        // chain doesn't need to know the execution chain's gas price or native
        // token denomination.
        if (chainEid != 0) {
            address ccfm = reg.crossChainFeeManager();
            if (ccfm != address(0)) {
                // Compute gasCompUSD locally so the remote chain receives a USD amount.
                uint256 gasCompUSD = _computeGasCompUSD(reg, gasUsed);
                ICrossChainFeeManager(ccfm).requestCrossChainFee{value: msg.value}(
                    address(this),
                    executor,
                    _creator,
                    totalFeeUSD,
                    gasCompUSD,
                    chainEid
                );
                // FeesSettled is emitted by CrossChainFeeManager on settlement confirmation.
                return;
            }
        }

        // ── Local settlement (default) ─────────────────────────────────────────
        (uint256 totalTokens, uint256 gasCompTokens) = reg.deductFees(
            token,
            executor,
            _creator,
            totalFeeUSD,
            gasUsed
        );

        if (totalTokens == 0) return;

        emit FeesSettled(
            automationId,
            executor,
            token,
            _creator,
            totalFeeUSD,
            totalTokens,
            gasCompTokens
        );
    }

    /**
     * @dev Compute gas compensation in USD using the local FeeRegistry oracle config.
     *      Mirrors FeeRegistry._computeGasComp but returns USD instead of tokens,
     *      so the value can be forwarded cross-chain for remote token conversion.
     */
    function _computeGasCompUSD(IFeeRegistry reg, uint256 gasUsed) internal view returns (uint256) {
        address oracle = reg.priceOracle();
        if (oracle == address(0)) return 0;
        address nativeTok = reg.nativeToken();
        uint256 nativePrice;
        try IPriceOracle(oracle).getTokenPrice(nativeTok) returns (uint256 p) {
            nativePrice = p;
        } catch {
            return 0;
        }
        if (nativePrice == 0) return 0;
        uint256 gasOverhead = reg.gasOverhead();
        uint256 markupBps   = reg.executorMarkupBps();
        uint256 maxGp       = reg.maxGasPrice();
        uint256 effectiveGp = tx.gasprice;
        if (maxGp > 0 && effectiveGp > maxGp) effectiveGp = maxGp;
        uint256 gasCostUSD  = ((gasUsed + gasOverhead) * effectiveGp * nativePrice) / 1e18;
        return gasCostUSD + (gasCostUSD * markupBps) / 10_000;
    }

    // ─── ETH handling ─────────────────────────────────────────────────────────

    receive() external payable {}

    /**
     * @notice Withdraw ETH accidentally sent to the vault.
     *         Only the vault owner can call this.
     * @param to     Recipient address (must not be address(0)).
     * @param amount Amount in wei (0 = withdraw full balance).
     */
    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroRecipient();
        uint256 toSend = amount == 0 ? address(this).balance : amount;
        (bool ok,) = to.call{value: toSend}("");
        if (!ok) revert ETHTransferFailed();
    }
}
