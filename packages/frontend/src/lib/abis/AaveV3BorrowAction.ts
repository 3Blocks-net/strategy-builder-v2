export const AaveV3BorrowActionAbi = [
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
        "internalType": "uint32",
        "name": "slot",
        "type": "uint32"
      }
    ],
    "name": "SlotOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "mode",
        "type": "uint8"
      }
    ],
    "name": "UnsupportedMode",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAsset",
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
        "internalType": "contract AaveV3Registry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
