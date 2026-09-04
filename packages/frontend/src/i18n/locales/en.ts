/**
 * English catalog — the source of truth.
 *
 * Every phrase the UI can show exists here; other languages are overlays that
 * may be incomplete (a missing entry falls back to the English text, never to
 * a raw key). Adding a key here is what makes it available to `t()`.
 *
 * Finance and DeFi terms stay in their established English form in every
 * language (see `CLAUDE.md`, "Finanzbegriffe"). `forbidden-terms.ts` guards
 * the German catalog against the invented translations of exactly those terms.
 */
export const en = {
  language: {
    switcherLabel: 'Language',
  },
  common: {
    back: 'Back',
    next: 'Next',
    retry: 'Retry',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    max: 'Max',
    skip: 'Skip',
    processing: 'Processing…',
    notAvailable: 'N/A',
    selectToken: 'Select token',
  },
  shell: {
    nav: {
      dashboard: 'Dashboard',
    },
    copyAddress: 'Copy wallet address',
    disconnect: 'Disconnect',
    signIn: 'Sign in',
    launchApp: 'Launch App',
    documentation: 'Documentation',
    contact: 'Contact',
  },
  discovery: {
    nav: {
      strategies: 'Strategies',
      markets: 'Markets',
      how: 'How it works',
    },
    hero: {
      headline: 'DeFi that feels like a broker.',
      subline:
        'Portfolio, strategies, and automation in one place — running from a vault only you control.',
      seeStrategies: 'See strategies',
      trustFunds: 'Funds never leave your own vault',
      trustSignature: 'Every action needs your signature',
      trustAutomation: 'Automation executes only rules you deployed',
    },
    strategies: {
      heading: 'Strategies',
      source: "Built from Pecunity's live step catalog",
      noPromises:
        "You'll see no yield promises here: performance figures appear only once strategies run in production and their track record is verifiable on-chain.",
      flowLabel: 'Strategy flow',
      protocols: 'Protocols',
      assets: 'Assets',
    },
    risk: {
      lower: 'Lower risk',
      medium: 'Medium risk',
      higher: 'Higher risk',
    },
    /** One entry per fixture in `lib/discovery-fixtures.ts`, keyed by its id. */
    examples: {
      'wick-wait-rebalance': {
        name: 'Wick-Wait Range Rebalance',
        summary:
          'Keeps a concentrated liquidity position earning fees: when the price leaves your range and holds there, the position is repositioned — brief wicks are deliberately sat out.',
        assets: 'CAKE / WBNB',
      },
      'compound-fees': {
        name: 'Fee Auto-Compound',
        summary:
          'Collects the trading fees your liquidity position earns on a schedule and reinvests them into the same position, so earnings start earning.',
        assets: 'Any V3 position',
      },
      'scheduled-dca': {
        name: 'Scheduled Accumulation',
        summary:
          'Swaps a fixed amount of stablecoins into a target asset on a fixed schedule — dollar-cost averaging that runs from your own vault.',
        assets: 'USDT → WBNB',
      },
    },
    /** Step labels are shared across strategies, keyed by the fixture's step id. */
    stepLabels: {
      'price-leaves-range': 'Price leaves range',
      'swap-to-range-ratio': 'Swap to range ratio',
      'reposition-liquidity': 'Reposition liquidity',
      'every-7-days': 'Every 7 days',
      'collect-fees': 'Collect earned fees',
      'reinvest': 'Reinvest into position',
      'on-schedule': 'On schedule',
      'swap-usdt': 'Swap USDT → asset',
    },
    markets: {
      heading: 'Markets',
      sampleBadge: 'Illustrative sample',
      asset: 'Asset',
      venue: 'Venue',
      type: 'Type',
      yieldSource: 'Yield source',
      footnote:
        'Live rates and pool data land with the public launch — like price lists at a broker, but for pools and lending markets on BSC.',
      kind: {
        liquidityPool: 'Liquidity Pool',
        lending: 'Lending',
      },
      yieldNote: {
        tradingFees: 'Trading Fees',
        supplyInterest: 'Supply Interest',
      },
    },
    how: {
      heading: 'How it works',
      connectTitle: 'Connect a wallet',
      connectText:
        'Signing in is a free wallet signature — no allowance, no custody. Your keys stay yours, always.',
      composeTitle: 'Pick or compose a strategy',
      composeText:
        'Start from a strategy setup, or compose your own from building blocks in the graph editor — with validation that catches on-chain errors before they cost you.',
      runsTitle: 'It runs by your rules',
      runsText:
        'Your strategy deploys into your own vault contract. Keepers can only execute what you deployed, and every allowance is confirmed by you — one signature at a time.',
    },
  },
  connect: {
    bandText:
      'Your DeFi strategies in one place — self-custodied, protected by default, running on their own.',
    heading: 'Sign in',
    intro:
      'Signing in is a free wallet signature. It grants no allowance and gives no one access to your funds.',
    noWalletTitle: 'MetaMask is not installed.',
    noWalletBody: 'You need a wallet to use Pecunity.',
    installMetaMask: 'Install MetaMask',
    connectWallet: 'Connect Wallet',
    connecting: 'Connecting…',
    pendingHint:
      'Check your wallet — confirm the connection, then sign the sign-in message.',
    errorRejected: 'Connection rejected. Please try again.',
    errorPopup: 'Please allow the MetaMask popup and try again.',
    errorGeneric: 'Connection failed. Please try again.',
    errorSignatureRejected: 'Signature rejected. Please try again.',
    errorSignInFailed: 'Sign-in failed. Please try again.',
    trustCustody:
      'Your funds stay in a vault contract only you control — we never hold them.',
    trustSignature:
      'Every action that moves funds needs your explicit signature, one by one.',
  },
  dashboard: {
    portfolioValue: 'Portfolio value',
    portfolioUnavailable: 'Portfolio value unavailable right now',
    loadingVaults: 'Loading your vaults…',
    noVaultsYet: 'No vaults yet · BSC',
    acrossVaults_one: 'Across {{count}} vault · BSC',
    acrossVaults_other: 'Across {{count}} vaults · BSC',
    heading: 'Your Vaults',
    createVault: 'Create Vault',
    loadFailedTitle: 'Failed to load your vaults',
    loadFailedBody:
      'We could not reach the server. Your vaults and funds are unaffected — they live on-chain, not with us.',
    retry: 'Retry',
    emptyTitle: "You don't have any vaults yet.",
    emptyBody:
      'A vault is a smart contract only you control — your strategies and funds live there, never with us.',
    createFirstVault: 'Create Your First Vault',
    table: {
      label: 'Label',
      depositToken: 'Deposit Token',
      totalValueUsd: 'Total Value (USD)',
      created: 'Created',
    },
  },
  vaultCreate: {
    heading: 'Create Vault',
    intro:
      'A vault is a smart contract only you control. We get no admin access to it, and every later allowance is confirmed by you, one by one.',
    labelStep: {
      label: 'Vault Label (optional)',
      placeholder: 'e.g. My DCA Vault',
      hint: 'Leave empty for automatic naming (Vault #1, #2, …)',
      next: 'Next: Select Token',
    },
    tokenStep: {
      heading: 'Select Deposit Token',
      loading: 'Loading tokens…',
    },
    feeStep: {
      heading: 'Fee Preview',
      token: 'Token: {{symbol}} ({{name}})',
      depositFee: 'Deposit Fee',
      withdrawFee: 'Withdraw Fee',
      loading: 'Loading fees…',
      next: 'Next: Create Vault',
    },
    createStep: {
      label: 'Label',
      autoAssigned: 'Auto-assigned',
      token: 'Token',
      wantDeposit: 'Make initial deposit after creation',
      balance: 'Balance: {{amount}} {{symbol}}',
      confirming: 'Please confirm the transaction in your wallet…',
      waiting: 'Waiting for transaction confirmation…',
      registering: 'Registering vault…',
      vaultAddress: 'Vault address: {{address}}',
      submit: 'Create Vault',
      submitting: 'Creating…',
    },
    depositStep: {
      heading: 'Initial Deposit',
      submit: 'Deposit',
    },
    doneStep: {
      heading: 'Vault Created!',
      goToDashboard: 'Go to Dashboard',
    },
  },
  vaultDetail: {
    backToDashboard: 'Dashboard',
    editLabel: 'Click to edit',
    fallbackLabel: 'Vault',
    copyAddress: 'Copy vault address',
    totalValue: 'Total value',
    labelInUse: 'Label already in use',
    labelUpdateFailed: 'Failed to update label',
    loadFailed: 'Failed to load portfolio',
    balancesHeading: 'Token Balances',
    balancesEmpty: 'No token positions found in this vault.',
    table: {
      token: 'Token',
      balance: 'Balance',
      price: 'Price',
      value: 'Value',
    },
  },
  txError: {
    'factory-missing':
      'The vault factory address is not configured for this network.',
    'transaction-failed': 'The transaction failed.',
    'vault-address-unparsable':
      'The transaction went through, but the address of the new vault could not be read from it.',
  },
  deposit: {
    heading: 'Deposit',
    token: 'Token',
    amount: 'Amount',
    wallet: 'Wallet: {{amount}} {{symbol}}',
    feeLine: 'Deposit Fee: {{percent}} — Fee: {{amount}} {{symbol}}',
    step: 'Step {{current}}/{{total}}: {{action}}',
    approving: 'Approving…',
    depositing: 'Depositing…',
    success: 'Deposit successful!',
    submit: 'Deposit',
  },
  withdraw: {
    heading: 'Withdraw',
    token: 'Token',
    amount: 'Amount (gross)',
    vaultBalance: 'Vault balance: {{amount}} {{symbol}}',
    receiveLine:
      'You receive: {{net}} {{symbol}} (Fee: {{fee}} {{symbol}}, {{percent}})',
    rejected: 'Transaction rejected by user.',
    success: 'Withdrawal successful!',
    submit: 'Withdraw',
  },
  positions: {
    heading: 'Protocol Positions',
    asOf: 'updated {{age}}',
    asOfLive: 'Live · updated {{age}}',
    loading: 'Loading positions…',
    loadFailed: 'Failed to load positions',
    empty: 'No positions yet. Deposit funds or deploy an automation to get started.',
    protocol: {
      idle: 'Idle / unallocated',
      'gas-reserve': 'Gas Reserve',
    },
    debtSuffix: '(Debt)',
    metrics: {
      healthFactor: 'Health Factor {{value}}',
      supplyApy: 'APY {{value}}',
      borrowApy: 'Borrow APY {{value}}',
      inRange: 'In Range',
      outOfRange: 'Out of Range',
      feeTier: '{{value}} Pool',
      uncollected: 'Unclaimed Fees {{value}}',
      earnings: 'Earnings {{value}}',
      range: 'Range {{low}}–{{high}} {{quote}}/{{base}} · Ticks [{{tickLower}}, {{tickUpper}}]',
    },
  },
  valueHistory: {
    heading: 'Value history',
    chartTitle: 'Value history chart',
    loading: 'Loading history…',
    loadFailed: 'Failed to load value history',
    empty: 'Not enough history yet — snapshots are still being collected.',
    legendDeposit: 'Deposit',
    legendWithdraw: 'Withdraw',
    since: 'History since {{date}}',
    marker: '{{type}} {{amount}} @ {{date}}',
  },
  performance: {
    heading: 'Performance',
    loading: 'Loading performance…',
    loadFailed: 'Failed to load performance',
    pnl: 'PnL',
    currentValue: 'Current value',
    netDeposits: 'Net Deposits',
    costs: 'Costs (Fees + Gas)',
  },
  ranges: {
    '24h': '24h',
    '7d': '7d',
    '30d': '30d',
    all: 'Since creation',
  },
  history: {
    heading: 'Execution History',
    allActivity: 'All activity',
    loadFailed: 'Failed to load execution history',
    empty: 'No activity yet.',
    table: {
      type: 'Type',
      detail: 'Detail',
      cost: 'Cost',
      usd: 'USD',
      txHash: 'TX Hash',
      date: 'Date',
    },
    automation: 'Automation #{{id}}',
    attempts: '{{times}}× failed',
    deposit: 'Deposit',
    withdrawal: 'Withdraw',
    previous: 'Previous',
    next: 'Next',
    page: 'Page {{page}} of {{total}}',
  },
  executionStatus: {
    success: 'Success',
    failed: 'Failed',
    resolved: 'Resolved',
  },
  freshness: {
    live: 'Live',
    reconnecting: 'Reconnecting',
    reconnectingHint: 'Reconnecting — polling for updates',
    updated: '· updated {{age}}',
  },
  gasReserve: {
    heading: 'Gas Reserve',
    loading: 'Loading gas reserve…',
    loadFailed: 'Failed to load gas reserve',
    disabled: 'Gas compensation is disabled for this vault (no deposit token).',
    warning:
      'The gas reserve is too low — external executors are not compensated and will most likely not run your public automations.',
    deposited: 'Reserve on deposit',
    target: 'Target (minFeeDeposit)',
    minLabel: 'Minimum reserve (minFeeDeposit)',
    minHint:
      'Top-up target of the FeeDepositAction. At 0 it does not refill the reserve automatically. Currently:',
    setMin: 'Set',
    settingMin: 'Setting…',
    setMinFailed: 'Failed to set minimum',
    depositLabel: 'Deposit fees',
    depositHint: "Taken from the vault's token balance.",
    depositSubmit: 'Deposit',
    depositing: 'Depositing…',
    depositFailed: 'Deposit failed',
  },
  context: {
    heading: 'Context',
    loading: 'Loading context…',
    loadFailed: 'Failed to load context',
    emptyTitle: 'This vault has no context slots.',
    emptyBody:
      'Context slots are defined by automations that read or write shared variables.',
    outOfSync:
      'Out of sync: the on-chain context holds {{onChain}} slots, the editor defines {{inEditor}}.',
    table: {
      slot: 'Slot',
      name: 'Name',
      type: 'Type',
      value: 'On-chain value',
    },
    unnamed: 'unnamed',
    emptyValue: '∅ empty',
  },
} as const;

export type Translation = typeof en;
