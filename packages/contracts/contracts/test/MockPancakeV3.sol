// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../interfaces/external/IPancakeV3SwapRouter.sol";
import "../interfaces/external/IPancakeV3Factory.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../interfaces/external/IPancakeV3Pool.sol";

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

/// @dev PancakeSwap V3 pool stand-in exposing a configurable tick + spacing.
contract MockPancakeV3Pool is IPancakeV3Pool {
    int24 public override tickSpacing;
    int24 public currentTick;
    address public override token0;
    address public override token1;

    constructor(address t0, address t1, int24 spacing, int24 tick) {
        token0 = t0;
        token1 = t1;
        tickSpacing = spacing;
        currentTick = tick;
    }

    function slot0()
        external
        view
        override
        returns (uint160, int24, uint16, uint16, uint16, uint32, bool)
    {
        return (0, currentTick, 0, 0, 0, 0, true);
    }
}

/**
 * @dev NonfungiblePositionManager stand-in (ERC-721). `mint` pulls both desired
 *      amounts and `_safeMint`s the position NFT to `recipient` — which triggers
 *      `onERC721Received`, so the custody test holds even were the real NPM to
 *      switch to `_safeMint`. Test-only.
 */
contract MockNonfungiblePositionManager is ERC721, INonfungiblePositionManager {
    uint256 public nextId = 1;

    struct Position {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }
    mapping(uint256 => Position) public positionOf;

    constructor() ERC721("Mock LP", "MLP") {}

    function mint(
        MintParams calldata p
    )
        external
        payable
        override
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        amount0 = p.amount0Desired;
        amount1 = p.amount1Desired;
        if (amount0 > 0) IERC20(p.token0).transferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(p.token1).transferFrom(msg.sender, address(this), amount1);

        tokenId = nextId++;
        liquidity = uint128(amount0 + amount1);
        positionOf[tokenId] = Position(
            p.token0,
            p.token1,
            p.fee,
            p.tickLower,
            p.tickUpper,
            liquidity
        );
        _safeMint(p.recipient, tokenId); // exercises onERC721Received
    }
}
