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

/// @dev PancakeSwap V3 pool stand-in exposing a configurable spot tick + spacing
///      and a configurable TWAP mean tick for the cumulative-tick oracle.
contract MockPancakeV3Pool is IPancakeV3Pool {
    int24 public override tickSpacing;
    int24 public currentTick;
    address public override token0;
    address public override token1;

    // TWAP oracle stand-in: `observe` returns cumulative ticks whose mean equals
    // `twapTick`; `observeReverts` simulates insufficient observation cardinality.
    int24 public twapTick;
    bool public observeReverts;

    constructor(address t0, address t1, int24 spacing, int24 tick) {
        token0 = t0;
        token1 = t1;
        tickSpacing = spacing;
        currentTick = tick;
        twapTick = tick;
    }

    function setTwapTick(int24 t) external {
        twapTick = t;
    }

    function setObserveReverts(bool r) external {
        observeReverts = r;
    }

    function slot0()
        external
        view
        override
        returns (uint160, int24, uint16, uint16, uint16, uint32, bool)
    {
        return (0, currentTick, 0, 0, 0, 0, true);
    }

    /// For `secondsAgos = [W, 0]` returns cumulatives whose difference over W is
    /// exactly `twapTick · W`, so the consumer's mean = `twapTick`.
    function observe(
        uint32[] calldata secondsAgos
    )
        external
        view
        override
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        if (observeReverts) revert("OLD");
        uint32 w = secondsAgos[0];
        tickCumulatives = new int56[](2);
        tickCumulatives[0] = 0;
        tickCumulatives[1] = int56(twapTick) * int56(uint56(w));
        secondsPerLiquidityCumulativeX128s = new uint160[](2);
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
        uint256 deposited0; // principal still in the position
        uint256 deposited1;
        uint128 owed0; // freed/accrued, awaiting collect
        uint128 owed1;
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
        Position storage pos = positionOf[tokenId];
        pos.token0 = p.token0;
        pos.token1 = p.token1;
        pos.fee = p.fee;
        pos.tickLower = p.tickLower;
        pos.tickUpper = p.tickUpper;
        pos.liquidity = liquidity;
        pos.deposited0 = amount0;
        pos.deposited1 = amount1;
        _safeMint(p.recipient, tokenId); // exercises onERC721Received
    }

    function increaseLiquidity(
        IncreaseLiquidityParams calldata p
    ) external payable override returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        Position storage pos = positionOf[p.tokenId];
        amount0 = p.amount0Desired;
        amount1 = p.amount1Desired;
        if (amount0 > 0) IERC20(pos.token0).transferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(pos.token1).transferFrom(msg.sender, address(this), amount1);
        liquidity = uint128(amount0 + amount1);
        pos.liquidity += liquidity;
        pos.deposited0 += amount0;
        pos.deposited1 += amount1;
    }

    /// Test helper: accrue collectable fees/owed amounts to a position (the
    /// caller must ensure this contract holds enough of each token to pay out).
    function accrue(uint256 tokenId, uint128 owed0, uint128 owed1) external {
        Position storage pos = positionOf[tokenId];
        pos.owed0 += owed0;
        pos.owed1 += owed1;
    }

    function decreaseLiquidity(
        DecreaseLiquidityParams calldata p
    ) external payable override returns (uint256 amount0, uint256 amount1) {
        Position storage pos = positionOf[p.tokenId];
        require(p.liquidity <= pos.liquidity, "too much");
        // Free principal proportionally and accrue it to owed (NOT yet sent —
        // the bundled collect is what delivers tokens).
        amount0 = (pos.deposited0 * p.liquidity) / pos.liquidity;
        amount1 = (pos.deposited1 * p.liquidity) / pos.liquidity;
        pos.deposited0 -= amount0;
        pos.deposited1 -= amount1;
        pos.liquidity -= p.liquidity;
        pos.owed0 += uint128(amount0);
        pos.owed1 += uint128(amount1);
    }

    function collect(
        CollectParams calldata p
    ) external payable override returns (uint256 amount0, uint256 amount1) {
        Position storage pos = positionOf[p.tokenId];
        amount0 = pos.owed0 < p.amount0Max ? pos.owed0 : p.amount0Max;
        amount1 = pos.owed1 < p.amount1Max ? pos.owed1 : p.amount1Max;
        pos.owed0 -= uint128(amount0);
        pos.owed1 -= uint128(amount1);
        if (amount0 > 0) IERC20(pos.token0).transfer(p.recipient, amount0);
        if (amount1 > 0) IERC20(pos.token1).transfer(p.recipient, amount1);
    }

    function positions(
        uint256 tokenId
    )
        external
        view
        override
        returns (
            uint96,
            address,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256,
            uint256,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position memory pos = positionOf[tokenId];
        return (
            0,
            address(0),
            pos.token0,
            pos.token1,
            pos.fee,
            pos.tickLower,
            pos.tickUpper,
            pos.liquidity,
            0,
            0,
            pos.owed0,
            pos.owed1
        );
    }
}
