export const PancakeSwapV3SwapActionAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "registry_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "received",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "minOut",
        "type": "uint256"
      }
    ],
    "name": "InsufficientOutput",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint24",
        "name": "fee",
        "type": "uint24"
      }
    ],
    "name": "InvalidPoolFee",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PoolNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReferencePriceUnavailable",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SameToken",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "slot",
        "type": "uint32"
      }
    ],
    "name": "SlotOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TickOutOfRange",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "toleranceBps",
        "type": "uint16"
      }
    ],
    "name": "ToleranceOutOfRange",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "twapWindow",
        "type": "uint32"
      }
    ],
    "name": "TwapWindowOutOfRange",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroTokenIn",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroTokenOut",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "pool",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "minOut",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "effectiveToleranceBps",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "spotFallback",
        "type": "bool"
      }
    ],
    "name": "SwapMinOutEnforced",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "params",
        "type": "bytes"
      },
      {
        "internalType": "bytes[]",
        "name": "ctx",
        "type": "bytes[]"
      }
    ],
    "name": "execute",
    "outputs": [
      {
        "internalType": "uint32[]",
        "name": "updatedSlots",
        "type": "uint32[]"
      },
      {
        "internalType": "bytes[]",
        "name": "updatedValues",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "registry",
    "outputs": [
      {
        "internalType": "contract PancakeSwapV3Registry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
