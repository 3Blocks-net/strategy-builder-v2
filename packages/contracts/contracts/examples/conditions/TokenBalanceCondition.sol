// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/ICondition.sol";

/**
 * @title TokenBalanceCondition
 * @notice Returns true when a given address holds at least `minBalance` of a token.
 *
 * Params encoding (ABI):
 *   address token        – ERC-20 token to check
 *   address account      – address whose balance is checked
 *   uint256 minBalance   – threshold (in token's smallest unit);
 *                          ignored when minBalanceFromSlot != NO_SLOT
 *   bool    aboveOrEqual – true: balance >= threshold  |  false: balance < threshold
 *   uint32  minBalanceFromSlot – if != NO_SLOT, read the threshold from ctx[slot]
 *                                instead of the static minBalance field
 */
contract TokenBalanceCondition is ICondition {
    uint32 private constant NO_SLOT = type(uint32).max;

    struct Params {
        address token;
        address account;
        uint256 minBalance;
        bool aboveOrEqual;
        uint32 minBalanceFromSlot;
    }

    error SlotOutOfBounds(uint32 slot);

    function check(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view override returns (bool met) {
        Params memory p = abi.decode(params, (Params));

        uint256 threshold;
        if (p.minBalanceFromSlot != NO_SLOT) {
            if (p.minBalanceFromSlot >= uint32(ctx.length))
                revert SlotOutOfBounds(p.minBalanceFromSlot);
            threshold = abi.decode(ctx[p.minBalanceFromSlot], (uint256));
        } else {
            threshold = p.minBalance;
        }

        uint256 balance = IERC20(p.token).balanceOf(p.account);
        met = p.aboveOrEqual ? balance >= threshold : balance < threshold;
    }
}
