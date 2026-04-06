// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./StrategyBuilderVault.sol";
import "./interfaces/IVaultRegistry.sol";
import "./interfaces/IFeeRegistry.sol";

/**
 * @title StrategyBuilderVaultFactory
 * @notice Factory that deploys StrategyBuilderVault instances as ERC1967Proxy contracts.
 *         The factory itself is plain Ownable — it is NOT deployed behind a proxy
 *         and is NOT upgradeable.
 *
 * Architecture
 * ────────────
 * Each vault is an ERC1967Proxy pointing to the implementation held in
 * _vaultImplementation.  StrategyBuilderVault does not implement UUPSUpgradeable,
 * so vault proxies are effectively immutable after deployment.
 * The factory owner can point _vaultImplementation at a newer contract so that
 * subsequently created vaults use the latest logic; existing proxies are unaffected.
 *
 * Protocol-managed addresses
 * ───────────────────────────
 * The factory stores a FeeRegistry and a PriceOracle address.  Both are set by
 * the factory owner and forwarded to every new vault at creation time — vault
 * creators cannot override them.  This ensures all vaults use the same trusted
 * infrastructure without per-vault owner setup.
 * Pass address(0) to create vaults without fee tracking / price conversion.
 *
 * Deployment sequence
 * ────────────────────
 * 1. Deploy StrategyBuilderVault implementation  (constructor disables initializers)
 * 2. Deploy StrategyBuilderVaultFactory
 * 3. Call setVaultImplementation(vaultImplAddress)
 * 4. (Optional) Call setFeeRegistry(feeRegistryAddress)
 * 5. (Optional) Call setPriceOracle(priceOracleAddress)
 * 6. Users call createVault(vaultOwner, depositToken, creator, salt) to deploy their vault proxy.
 *    depositToken and creator are fixed at creation and cannot be changed afterwards.
 */
contract StrategyBuilderVaultFactory is Ownable, IVaultRegistry {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @dev Implementation address used when creating new vaults.
    address private _vaultImplementation;

    /// @dev Optional FeeRegistry forwarded to every new vault at creation.
    address public feeRegistry;

    /// @dev Optional PriceOracle forwarded to every new vault at creation.
    address public priceOracle;

    address[] private _vaults;

    /// @dev O(1) lookup: true when the address was created by this factory.
    mapping(address => bool) private _vaultSet;

    // ─── Events ───────────────────────────────────────────────────────────────

    event VaultCreated(
        address indexed vault,
        address indexed vaultOwner,
        uint256 vaultIndex
    );
    event VaultImplementationUpdated(address indexed newImplementation);
    event FeeRegistryUpdated(address indexed newFeeRegistry);
    event PriceOracleUpdated(address indexed newPriceOracle);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAddress();
    /// @dev Thrown when createVault is called before setVaultImplementation.
    error ImplementationNotSet();
    /// @dev Thrown when setVaultImplementation receives an EOA (no bytecode).
    error InvalidImplementation();
    /// @dev Thrown when depositToken_ is not accepted by the configured FeeRegistry.
    error FeeTokenNotAccepted();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Vault creation ───────────────────────────────────────────────────────

    /**
     * @notice Deploy a new StrategyBuilderVault proxy owned by vaultOwner.
     *
     * @dev CREATE2 address derivation: the effective salt is
     *      keccak256(abi.encode(msg.sender, salt)), so the same user-supplied salt
     *      from different callers never collides, preventing front-running griefing.
     *
     * @param vaultOwner  Address that will own and control the new vault.
     * @param depositToken_   ERC-20 token used to pay fees (must be accepted by the FeeRegistry).
     *                    Pass address(0) to disable fee settlement.
     * @param creator_      Strategy creator that receives the creator fee share.
     *                      Pass address(0) to route that share to the protocol vault.
     * @param feeChainEid_  LayerZero Endpoint ID of the chain where fees are settled.
     *                      0 = local chain only (no cross-chain settlement).
     * @param salt          Per-caller entropy for CREATE2 address derivation.
     * @return vault        Address of the newly deployed ERC1967Proxy.
     */
    function createVault(
        address vaultOwner,
        address depositToken_,
        address creator_,
        uint32  feeChainEid_,
        bytes32 salt
    ) external returns (address vault) {
        if (vaultOwner == address(0)) revert ZeroAddress();
        if (_vaultImplementation == address(0)) revert ImplementationNotSet();

        // If a FeeRegistry is configured and a depositToken is supplied, verify the token
        // is accepted — a vault with an unaccepted fee token can never pay fees.
        address reg = feeRegistry;
        if (reg != address(0) && depositToken_ != address(0)) {
            if (!IFeeRegistry(reg).isAcceptedToken(depositToken_)) revert FeeTokenNotAccepted();
        }

        bytes memory initData = abi.encodeCall(
            StrategyBuilderVault.initialize,
            (vaultOwner, feeRegistry, depositToken_, creator_, priceOracle, feeChainEid_)
        );

        // Mix msg.sender into the salt to prevent front-running griefing.
        // abi.encodePacked is safe here: address (20 bytes) + bytes32 (32 bytes) = 52 bytes,
        // no collision risk since both fields are fixed-size.
        bytes32 effectiveSalt = keccak256(abi.encodePacked(msg.sender, salt));

        vault = address(
            new ERC1967Proxy{salt: effectiveSalt}(
                _vaultImplementation,
                initData
            )
        );
        uint256 index = _vaults.length;
        _vaults.push(vault);
        _vaultSet[vault] = true;

        emit VaultCreated(vault, vaultOwner, index);
    }

    // ─── Factory owner: configuration ─────────────────────────────────────────

    /**
     * @notice Update the vault implementation used for newly created vaults.
     *         Does NOT affect existing vault proxies.
     * @param newImplementation  Must be a deployed contract (not an EOA).
     */
    function setVaultImplementation(
        address newImplementation
    ) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        if (newImplementation.code.length == 0) revert InvalidImplementation();
        _vaultImplementation = newImplementation;
        emit VaultImplementationUpdated(newImplementation);
    }

    /**
     * @notice Update the FeeRegistry forwarded to newly created vaults.
     *         Pass address(0) to create vaults without fee tracking.
     *         Does NOT affect existing vault proxies.
     */
    function setFeeRegistry(address newFeeRegistry) external onlyOwner {
        feeRegistry = newFeeRegistry;
        emit FeeRegistryUpdated(newFeeRegistry);
    }

    /**
     * @notice Update the PriceOracle forwarded to newly created vaults.
     *         Pass address(0) to create vaults without per-step fee accrual.
     *         Does NOT affect existing vault proxies.
     */
    function setPriceOracle(address newPriceOracle) external onlyOwner {
        priceOracle = newPriceOracle;
        emit PriceOracleUpdated(newPriceOracle);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /** @notice Implementation address used when creating new vaults. */
    function vaultImplementation() external view returns (address) {
        return _vaultImplementation;
    }

    /** @notice Address of a vault by its creation index. */
    function getVault(uint256 index) external view returns (address) {
        return _vaults[index];
    }

    /** @notice Total number of vaults ever created by this factory. */
    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    /// @inheritdoc IVaultRegistry
    function isRegisteredVault(address vault) external view returns (bool) {
        return _vaultSet[vault];
    }
}
