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
 * Deployment sequence
 * ────────────────────
 * 1. Deploy StrategyBuilderVault implementation  (constructor disables initializers)
 * 2. Deploy StrategyBuilderVaultFactory
 * 3. Call setVaultImplementation(vaultImplAddress)
 * 4. (Optional) Call setFeeRegistry(feeRegistryAddress)
 * 5. Users call createVault(vaultOwner, depositToken, salt) to deploy their vault proxy.
 */
contract StrategyBuilderVaultFactory is Ownable, IVaultRegistry {
    // ─── State ────────────────────────────────────────────────────────────────

    address private _vaultImplementation;
    address public feeRegistry;

    address[] private _vaults;
    mapping(address => bool) private _vaultSet;

    // ─── Events ───────────────────────────────────────────────────────────────

    event VaultCreated(
        address indexed vault,
        address indexed vaultOwner,
        uint256 vaultIndex
    );
    event VaultImplementationUpdated(address indexed newImplementation);
    event FeeRegistryUpdated(address indexed newFeeRegistry);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAddress();
    error ImplementationNotSet();
    error InvalidImplementation();
    error FeeTokenNotAccepted();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Vault creation ───────────────────────────────────────────────────────

    /**
     * @notice Deploy a new StrategyBuilderVault proxy owned by vaultOwner.
     *
     * @param vaultOwner    Address that will own and control the new vault.
     * @param depositToken_ ERC-20 token used for gas compensation pre-funding.
     *                      Pass address(0) to disable gas compensation.
     * @param salt          Per-caller entropy for CREATE2 address derivation.
     * @return vault        Address of the newly deployed ERC1967Proxy.
     */
    function createVault(
        address vaultOwner,
        address depositToken_,
        bytes32 salt
    ) external returns (address vault) {
        if (vaultOwner == address(0)) revert ZeroAddress();
        if (_vaultImplementation == address(0)) revert ImplementationNotSet();

        address reg = feeRegistry;
        if (reg != address(0) && depositToken_ != address(0)) {
            if (!IFeeRegistry(reg).isAcceptedToken(depositToken_)) revert FeeTokenNotAccepted();
        }

        bytes memory initData = abi.encodeCall(
            StrategyBuilderVault.initialize,
            (vaultOwner, feeRegistry, depositToken_)
        );

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

    function setVaultImplementation(
        address newImplementation
    ) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        if (newImplementation.code.length == 0) revert InvalidImplementation();
        _vaultImplementation = newImplementation;
        emit VaultImplementationUpdated(newImplementation);
    }

    function setFeeRegistry(address newFeeRegistry) external onlyOwner {
        feeRegistry = newFeeRegistry;
        emit FeeRegistryUpdated(newFeeRegistry);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function vaultImplementation() external view returns (address) {
        return _vaultImplementation;
    }

    function getVault(uint256 index) external view returns (address) {
        return _vaults[index];
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    /// @inheritdoc IVaultRegistry
    function isRegisteredVault(address vault) external view returns (bool) {
        return _vaultSet[vault];
    }
}
