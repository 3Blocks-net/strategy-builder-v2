export const StrategyBuilderVaultAbi = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "stepIndex",
        "type": "uint32"
      }
    ],
    "name": "ActionExecutionFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AutomationDoesNotExist",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AutomationNotActive",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CallerNotOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "stepIndex",
        "type": "uint32"
      }
    ],
    "name": "ConditionCallFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ContextDiffLengthMismatch",
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
    "name": "ContextSlotOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ETHTransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FirstStepMustBeCondition",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidInitialization",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "stepIndex",
        "type": "uint32"
      }
    ],
    "name": "InvalidStepReference",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MaxStepsExceeded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoSteps",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotInitializing",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
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
    "name": "TriggerNotMet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroRecipient",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "stepIndex",
        "type": "uint32"
      }
    ],
    "name": "ZeroSelector",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "stepIndex",
        "type": "uint32"
      }
    ],
    "name": "ZeroTargetAddress",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "name": "AutomationActiveChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stepCount",
        "type": "uint256"
      }
    ],
    "name": "AutomationCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "executor",
        "type": "address"
      }
    ],
    "name": "AutomationExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stepCount",
        "type": "uint256"
      }
    ],
    "name": "AutomationStepsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "slot",
        "type": "uint32"
      }
    ],
    "name": "ContextSlotSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Deposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "executor",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gasCompTokens",
        "type": "uint256"
      }
    ],
    "name": "GasCompSettled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "version",
        "type": "uint64"
      }
    ],
    "name": "Initialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newMinFeeDeposit",
        "type": "uint256"
      }
    ],
    "name": "MinFeeDepositUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fee",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "Withdrawn",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "DONE",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_STEPS",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "automationCount",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "enum StrategyBuilderVault.StepType",
            "name": "stepType",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bytes4",
            "name": "selector",
            "type": "bytes4"
          },
          {
            "internalType": "uint32",
            "name": "nextOnTrue",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "nextOnFalse",
            "type": "uint32"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct StrategyBuilderVault.Step[]",
        "name": "steps",
        "type": "tuple[]"
      }
    ],
    "name": "createAutomation",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "enum StrategyBuilderVault.StepType",
            "name": "stepType",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bytes4",
            "name": "selector",
            "type": "bytes4"
          },
          {
            "internalType": "uint32",
            "name": "nextOnTrue",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "nextOnFalse",
            "type": "uint32"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct StrategyBuilderVault.Step[]",
        "name": "steps",
        "type": "tuple[]"
      }
    ],
    "name": "createOwnerAutomation",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "decodeContextDiff",
    "outputs": [
      {
        "internalType": "uint32[]",
        "name": "slots",
        "type": "uint32[]"
      },
      {
        "internalType": "bytes[]",
        "name": "values",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "depositFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "depositToken",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      }
    ],
    "name": "executeAutomation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeRegistry",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      }
    ],
    "name": "getAutomation",
    "outputs": [
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "ownerOnly",
        "type": "bool"
      },
      {
        "components": [
          {
            "internalType": "enum StrategyBuilderVault.StepType",
            "name": "stepType",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bytes4",
            "name": "selector",
            "type": "bytes4"
          },
          {
            "internalType": "uint32",
            "name": "nextOnTrue",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "nextOnFalse",
            "type": "uint32"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct StrategyBuilderVault.Step[]",
        "name": "steps",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContext",
    "outputs": [
      {
        "internalType": "bytes[]",
        "name": "",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "initialOwner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "feeRegistry_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "depositToken_",
        "type": "address"
      }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      }
    ],
    "name": "isTriggerMet",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minFeeDeposit",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "name": "setAutomationActive",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes[]",
        "name": "ctx",
        "type": "bytes[]"
      }
    ],
    "name": "setContext",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "slot",
        "type": "uint32"
      },
      {
        "internalType": "bytes",
        "name": "value",
        "type": "bytes"
      }
    ],
    "name": "setContextSlot",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "minAmount",
        "type": "uint256"
      }
    ],
    "name": "setMinFeeDeposit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "automationId",
        "type": "uint32"
      },
      {
        "components": [
          {
            "internalType": "enum StrategyBuilderVault.StepType",
            "name": "stepType",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bytes4",
            "name": "selector",
            "type": "bytes4"
          },
          {
            "internalType": "uint32",
            "name": "nextOnTrue",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "nextOnFalse",
            "type": "uint32"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct StrategyBuilderVault.Step[]",
        "name": "steps",
        "type": "tuple[]"
      }
    ],
    "name": "updateAutomationSteps",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "withdrawETH",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
] as const;
