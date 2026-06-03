// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/external/IPancakeV3SwapRouter.sol";
import "../interfaces/external/IPancakeV3Factory.sol";

/// @dev PancakeSwap V3 factory stand-in. Test-only.
contract MockPancakeV3Factory is IPancakeV3Factory {
    // keccak(t0,t1,fee) → pool. Order-independent (sorts the pair).
    mapping(bytes32 => address) public pools;

    function setPool(address tokenA, address tokenB, uint24 fee, address pool) external {
        pools[_key(tokenA, tokenB, fee)] = pool;
    }

    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view override returns (address) {
        return pools[_key(tokenA, tokenB, fee)];
    }

    function _key(address a, address b, uint24 fee) private pure returns (bytes32) {
        (address t0, address t1) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encodePacked(t0, t1, fee));
    }
}

/**
 * @dev PancakeSwap V3 SwapRouter stand-in. `exactInputSingle` pulls `amountIn`
 *      of tokenIn and pays out `amountIn × rateNum / rateDen` of tokenOut from
 *      its own (pre-funded) balance. Test-only.
 */
contract MockPancakeV3SwapRouter is IPancakeV3SwapRouter {
    uint256 public rateNum = 1;
    uint256 public rateDen = 1;

    function setRate(uint256 num, uint256 den) external {
        rateNum = num;
        rateDen = den;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata p
    ) external payable override returns (uint256 amountOut) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = (p.amountIn * rateNum) / rateDen;
        require(amountOut >= p.amountOutMinimum, "TooLittleReceived");
        IERC20(p.tokenOut).transfer(p.recipient, amountOut);
    }
}
