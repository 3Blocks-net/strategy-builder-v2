// SPDX-License-Identifier:MIT
pragma solidity ^0.8.26;

/// @title IPriceOracle
/// @notice Interface for a price oracle used to fetch token prices via oracle IDs.
/// @dev Defines functions and events for managing and accessing token price data.
interface IPriceOracle {
    // ┏━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃        Errors        ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━┛

    /// @notice Thrown when no oracle is set for the given token address.
    /// @param token Address of the token without an assigned oracle ID.
    error OracleNotExist(address token);

    /// @notice Thrown when a negative price is returned by the oracle, which is invalid.
    error NegativePriceNotAllowed();

    // ┏━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃        Events        ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━┛

    /// @notice Emitted when a new oracle ID is set for a token.
    /// @param token Address of the token for which the oracle ID was set.
    /// @param oracleID The oracle feed ID associated with the token.
    event OracleSet(address indexed token, bytes32 oracleID);

    event CustomOracleSet(address indexed token, address indexed oracle);

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃        External Functions        ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    /// @notice Sets the oracle ID for a specific token.
    /// @dev Can only be called by authorized roles (owner).
    /// @param _token Address of the token.
    /// @param _oracleID Oracle feed ID from the price oracle provider.
    function setOracleID(address _token, bytes32 _oracleID) external;

    /// @notice Returns the oracle ID for a given token.
    /// @param _token Address of the token.
    /// @return The oracle feed ID assigned to the token.
    function oracleID(address _token) external view returns (bytes32);

    /// @notice Returns the current price of the token from the oracle.
    /// @dev Price is usually returned in 18 decimals for consistency.
    /// @param _token Address of the token.
    /// @return The latest price of the token.
    function getTokenPrice(address _token) external view returns (uint256);

    /// @notice Returns the number of decimals used for the scaled price.
    /// @dev This value is fixed to match the output of `_scalePythPrice`, which normalizes prices to 18 decimals.
    /// @return The number of decimals (always 18).
    function PRICE_DECIMALS() external view returns (uint8);
}
