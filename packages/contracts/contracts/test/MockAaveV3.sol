// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../interfaces/external/IPoolAddressesProvider.sol";

/// @dev Mintable ERC-20 standing in for an Aave aToken. Test-only.
contract MockAToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

/**
 * @dev Minimal Aave V3 Pool stand-in for unit tests (no fork). `supply` pulls
 *      the asset and mints a 1:1 aToken to `onBehalfOf`; `getReserveData`
 *      resolves the registered aToken. Other Pool methods are interface stubs.
 *      Test-only.
 */
contract MockAaveV3Pool is IAaveV3Pool {
    mapping(address => address) public aTokenOf;
    mapping(address => address) public debtTokenOf;
    mapping(address => mapping(address => uint256)) public debtOf;

    function setAToken(address asset, address aToken) external {
        aTokenOf[asset] = aToken;
    }

    /// Register the variable debt token so `getReserveData` + repay-max work.
    function setDebtToken(address asset, address debtToken) external {
        debtTokenOf[asset] = debtToken;
    }

    /// Test helper: give `user` an outstanding debt (mirrors the debt token).
    function seedDebt(address asset, address user, uint256 amount) external {
        debtOf[asset][user] += amount;
        address dt = debtTokenOf[asset];
        if (dt != address(0)) MockAToken(dt).mint(user, amount);
    }

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16
    ) external override {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        MockAToken(aTokenOf[asset]).mint(onBehalfOf, amount);
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        address aToken = aTokenOf[asset];
        uint256 bal = MockAToken(aToken).balanceOf(msg.sender);
        uint256 actual = amount == type(uint256).max ? bal : amount;
        if (actual > bal) actual = bal;
        MockAToken(aToken).burn(msg.sender, actual);
        IERC20(asset).transfer(to, actual);
        return actual;
    }

    function borrow(
        address asset,
        uint256 amount,
        uint256,
        uint16,
        address onBehalfOf
    ) external override {
        debtOf[asset][onBehalfOf] += amount;
        address dt = debtTokenOf[asset];
        if (dt != address(0)) MockAToken(dt).mint(onBehalfOf, amount);
        IERC20(asset).transfer(onBehalfOf, amount);
    }

    function repay(
        address asset,
        uint256 amount,
        uint256,
        address onBehalfOf
    ) external override returns (uint256) {
        uint256 debt = debtOf[asset][onBehalfOf];
        uint256 pay = amount == type(uint256).max
            ? debt
            : (amount > debt ? debt : amount);
        if (pay > 0) {
            IERC20(asset).transferFrom(msg.sender, address(this), pay);
            debtOf[asset][onBehalfOf] = debt - pay;
            address dt = debtTokenOf[asset];
            if (dt != address(0)) MockAToken(dt).burn(onBehalfOf, pay);
        }
        return pay;
    }

    function getUserAccountData(
        address
    )
        external
        pure
        override
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        return (0, 0, 0, 0, 0, 0);
    }

    function getReserveData(
        address asset
    ) external view override returns (ReserveData memory data) {
        data.aTokenAddress = aTokenOf[asset];
        data.variableDebtTokenAddress = debtTokenOf[asset];
    }
}

/// @dev PoolAddressesProvider stand-in returning configured addresses. Test-only.
contract MockPoolAddressesProvider is IPoolAddressesProvider {
    address public poolAddr;
    address public oracleAddr;

    constructor(address pool_, address oracle_) {
        poolAddr = pool_;
        oracleAddr = oracle_;
    }

    function getPool() external view override returns (address) {
        return poolAddr;
    }

    function getPriceOracle() external view override returns (address) {
        return oracleAddr;
    }
}
