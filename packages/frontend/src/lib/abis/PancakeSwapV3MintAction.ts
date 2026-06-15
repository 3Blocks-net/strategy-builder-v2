export const PancakeSwapV3MintActionAbi = [
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
    "inputs": [],
    "name": "InvalidTicks",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PoolNotFound",
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
    "inputs": [],
    "name": "ZeroToken",
    "type": "error"
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
