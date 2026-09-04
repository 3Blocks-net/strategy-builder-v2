import type { Translation } from './en';

/**
 * Recursively optional shape of the source catalog: a language may translate
 * part of the UI and inherit the rest from English, but it can never invent a
 * key the source catalog does not have.
 */
type PartialTranslation<T> = {
  [K in keyof T]?: T[K] extends string ? string : PartialTranslation<T[K]>;
};

/**
 * German catalog.
 *
 * The rule that is easiest to break here: finance and DeFi terms keep their
 * established English form in German too — Vault, Deposit Fee, Performance Fee,
 * Health Factor, Stop-Loss, Swap, Range, Yield, Keeper. Only ordinary words are
 * translated ("Your vaults" → "Deine Vaults"). The list lives in `CLAUDE.md`,
 * "Konventionen / Finanzbegriffe"; `../forbidden-terms.ts` turns its negative
 * half into a test that reads every string below.
 */
export const de: PartialTranslation<Translation> = {
  language: {
    switcherLabel: 'Sprache',
  },
  common: {
    back: 'Zurück',
    next: 'Weiter',
    retry: 'Erneut versuchen',
    refresh: 'Aktualisieren',
    refreshing: 'Wird aktualisiert…',
    max: 'Max',
    skip: 'Überspringen',
    processing: 'Wird verarbeitet…',
    notAvailable: 'k. A.',
    selectToken: 'Token wählen',
  },
  shell: {
    nav: {
      dashboard: 'Dashboard',
    },
    copyAddress: 'Wallet-Adresse kopieren',
    disconnect: 'Trennen',
    signIn: 'Anmelden',
    launchApp: 'App starten',
    documentation: 'Dokumentation',
    contact: 'Kontakt',
  },
  discovery: {
    nav: {
      strategies: 'Strategien',
      markets: 'Märkte',
      how: 'So funktioniert es',
    },
    hero: {
      headline: 'DeFi, das sich anfühlt wie ein Broker.',
      subline:
        'Portfolio, Strategien und Automation an einem Ort — laufend aus einem Vault, den nur du kontrollierst.',
      seeStrategies: 'Strategien ansehen',
      trustFunds: 'Dein Kapital verlässt deinen eigenen Vault nie',
      trustSignature: 'Jede Aktion braucht deine Signatur',
      trustAutomation: 'Automation führt nur Regeln aus, die du deployed hast',
    },
    strategies: {
      heading: 'Strategien',
      source: 'Gebaut aus dem Live-Step-Catalog von Pecunity',
      noPromises:
        'Hier stehen keine Yield-Versprechen: Performance-Zahlen erscheinen erst, wenn Strategien produktiv laufen und ihr Track Record on-chain nachprüfbar ist.',
      flowLabel: 'Ablauf der Strategie',
      protocols: 'Protokolle',
      assets: 'Assets',
    },
    risk: {
      lower: 'Geringeres Risiko',
      medium: 'Mittleres Risiko',
      higher: 'Höheres Risiko',
    },
    examples: {
      'wick-wait-rebalance': {
        // Strategy names are proper nouns and stay the same in both languages.
        name: 'Wick-Wait Range Rebalance',
        summary:
          'Hält eine konzentrierte Liquidity-Position im Fee-Ertrag: Verlässt der Preis deine Range und bleibt dort, wird die Position neu gesetzt — kurze Wicks werden bewusst ausgesessen.',
        assets: 'CAKE / WBNB',
      },
      'compound-fees': {
        name: 'Fee Auto-Compound',
        summary:
          'Sammelt die Trading Fees deiner Liquidity-Position nach Zeitplan ein und investiert sie in dieselbe Position zurück — so verdient der Ertrag selbst mit.',
        assets: 'Beliebige V3-Position',
      },
      'scheduled-dca': {
        name: 'Scheduled Accumulation',
        summary:
          'Swapt einen festen Betrag Stablecoins nach festem Zeitplan in ein Ziel-Asset — DCA, ausgeführt aus deinem eigenen Vault.',
        assets: 'USDT → WBNB',
      },
    },
    stepLabels: {
      'price-leaves-range': 'Preis verlässt die Range',
      'swap-to-range-ratio': 'Swap auf Range-Ratio',
      'reposition-liquidity': 'Liquidity neu positionieren',
      'every-7-days': 'Alle 7 Tage',
      'collect-fees': 'Verdiente Fees einsammeln',
      'reinvest': 'In die Position reinvestieren',
      'on-schedule': 'Nach Zeitplan',
      'swap-usdt': 'Swap USDT → Asset',
    },
    markets: {
      heading: 'Märkte',
      sampleBadge: 'Beispielhafte Auswahl',
      asset: 'Asset',
      venue: 'Venue',
      type: 'Typ',
      yieldSource: 'Yield-Quelle',
      footnote:
        'Live-Kurse und Pool-Daten kommen mit dem öffentlichen Start — wie die Kursliste beim Broker, nur für Pools und Lending-Märkte auf BSC.',
      kind: {
        // Domain terms: stay English in German text too.
        liquidityPool: 'Liquidity Pool',
        lending: 'Lending',
      },
      yieldNote: {
        tradingFees: 'Trading Fees',
        supplyInterest: 'Supply Interest',
      },
    },
    how: {
      heading: 'So funktioniert es',
      connectTitle: 'Wallet verbinden',
      connectText:
        'Die Anmeldung ist eine kostenlose Wallet-Signatur — keine Allowance, keine Verwahrung durch uns. Deine Keys bleiben deine.',
      composeTitle: 'Strategie wählen oder selbst bauen',
      composeText:
        'Starte mit einem fertigen Strategie-Setup oder baue deins aus Bausteinen im Graph-Editor — mit einer Prüfung, die On-chain-Fehler abfängt, bevor sie dich Geld kosten.',
      runsTitle: 'Sie läuft nach deinen Regeln',
      runsText:
        'Deine Strategie wird in deinen eigenen Vault-Contract deployed. Keeper können nur ausführen, was du deployed hast, und jede Allowance bestätigst du selbst — eine Signatur nach der anderen.',
    },
  },
  connect: {
    bandText:
      'Deine DeFi-Strategien an einem Ort — selbst verwahrt, von Haus aus abgesichert, laufend ohne dich.',
    heading: 'Anmelden',
    intro:
      'Die Anmeldung ist eine kostenlose Wallet-Signatur. Sie erteilt keine Allowance und gibt niemandem Zugriff auf dein Kapital.',
    noWalletTitle: 'MetaMask ist nicht installiert.',
    noWalletBody: 'Für Pecunity brauchst du eine Wallet.',
    installMetaMask: 'MetaMask installieren',
    connectWallet: 'Wallet verbinden',
    connecting: 'Verbindung läuft…',
    pendingHint:
      'Sieh in deine Wallet — bestätige die Verbindung und signiere dann die Anmelde-Nachricht.',
    errorRejected: 'Verbindung abgelehnt. Bitte versuche es erneut.',
    errorPopup: 'Bitte lass das MetaMask-Fenster zu und versuche es erneut.',
    errorGeneric: 'Verbindung fehlgeschlagen. Bitte versuche es erneut.',
    errorSignatureRejected: 'Signatur abgelehnt. Bitte versuche es erneut.',
    errorSignInFailed: 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.',
    trustCustody:
      'Dein Kapital bleibt in einem Vault-Contract, den nur du kontrollierst — wir halten es nie.',
    trustSignature:
      'Jede Aktion, die Kapital bewegt, braucht deine ausdrückliche Signatur, eine nach der anderen.',
  },
  dashboard: {
    portfolioValue: 'Portfolio-Wert',
    portfolioUnavailable: 'Portfolio-Wert derzeit nicht verfügbar',
    loadingVaults: 'Deine Vaults werden geladen…',
    noVaultsYet: 'Noch keine Vaults · BSC',
    acrossVaults_one: 'Verteilt auf {{count}} Vault · BSC',
    acrossVaults_other: 'Verteilt auf {{count}} Vaults · BSC',
    heading: 'Deine Vaults',
    createVault: 'Vault erstellen',
    loadFailedTitle: 'Deine Vaults konnten nicht geladen werden',
    loadFailedBody:
      'Der Server war nicht erreichbar. Deine Vaults und dein Kapital sind davon nicht betroffen — sie liegen on-chain, nicht bei uns.',
    retry: 'Erneut versuchen',
    emptyTitle: 'Du hast noch keine Vaults.',
    emptyBody:
      'Ein Vault ist ein Smart Contract, den nur du kontrollierst — deine Strategien und dein Kapital liegen dort, niemals bei uns.',
    createFirstVault: 'Ersten Vault erstellen',
    table: {
      label: 'Label',
      depositToken: 'Deposit Token',
      totalValueUsd: 'Gesamtwert (USD)',
      created: 'Erstellt',
    },
  },
  vaultCreate: {
    heading: 'Vault erstellen',
    intro:
      'Ein Vault ist ein Smart Contract, den nur du kontrollierst. Wir bekommen keinen Admin-Zugriff darauf, und jede spätere Allowance bestätigst du selbst, eine nach der anderen.',
    labelStep: {
      label: 'Vault-Label (optional)',
      placeholder: 'z. B. Mein DCA Vault',
      hint: 'Leer lassen für automatische Benennung (Vault #1, #2, …)',
      next: 'Weiter: Token wählen',
    },
    tokenStep: {
      heading: 'Deposit Token wählen',
      loading: 'Token werden geladen…',
    },
    feeStep: {
      heading: 'Fee-Vorschau',
      token: 'Token: {{symbol}} ({{name}})',
      depositFee: 'Deposit Fee',
      withdrawFee: 'Withdraw Fee',
      loading: 'Fees werden geladen…',
      next: 'Weiter: Vault erstellen',
    },
    createStep: {
      label: 'Label',
      autoAssigned: 'Automatisch vergeben',
      token: 'Token',
      wantDeposit: 'Nach dem Erstellen gleich ein Deposit machen',
      balance: 'Balance: {{amount}} {{symbol}}',
      confirming: 'Bitte bestätige die Transaktion in deiner Wallet…',
      waiting: 'Warten auf die Bestätigung der Transaktion…',
      registering: 'Vault wird registriert…',
      vaultAddress: 'Vault-Adresse: {{address}}',
      submit: 'Vault erstellen',
      submitting: 'Wird erstellt…',
    },
    depositStep: {
      heading: 'Erstes Deposit',
      submit: 'Deposit',
    },
    doneStep: {
      heading: 'Vault erstellt!',
      goToDashboard: 'Zum Dashboard',
    },
  },
  vaultDetail: {
    backToDashboard: 'Dashboard',
    editLabel: 'Zum Bearbeiten klicken',
    fallbackLabel: 'Vault',
    copyAddress: 'Vault-Adresse kopieren',
    totalValue: 'Gesamtwert',
    labelInUse: 'Label ist schon vergeben',
    labelUpdateFailed: 'Label konnte nicht geändert werden',
    loadFailed: 'Portfolio konnte nicht geladen werden',
    balancesHeading: 'Token-Balances',
    balancesEmpty: 'Keine Token-Positionen in diesem Vault.',
    table: {
      token: 'Token',
      balance: 'Balance',
      price: 'Preis',
      value: 'Wert',
    },
  },
  txError: {
    'factory-missing':
      'Die Adresse der Vault-Factory ist für dieses Netzwerk nicht konfiguriert.',
    'transaction-failed': 'Die Transaktion ist fehlgeschlagen.',
    'vault-address-unparsable':
      'Die Transaktion lief durch, aber die Adresse des neuen Vaults ließ sich daraus nicht lesen.',
  },
  deposit: {
    heading: 'Deposit',
    token: 'Token',
    amount: 'Betrag',
    wallet: 'Wallet: {{amount}} {{symbol}}',
    feeLine: 'Deposit Fee: {{percent}} — Fee: {{amount}} {{symbol}}',
    step: 'Schritt {{current}}/{{total}}: {{action}}',
    approving: 'Approve läuft…',
    depositing: 'Deposit läuft…',
    success: 'Deposit erfolgreich!',
    submit: 'Deposit',
  },
  withdraw: {
    heading: 'Withdraw',
    token: 'Token',
    amount: 'Betrag (brutto)',
    vaultBalance: 'Vault-Balance: {{amount}} {{symbol}}',
    receiveLine:
      'Du erhältst: {{net}} {{symbol}} (Fee: {{fee}} {{symbol}}, {{percent}})',
    rejected: 'Transaktion in der Wallet abgelehnt.',
    success: 'Withdraw erfolgreich!',
    submit: 'Withdraw',
  },
  positions: {
    heading: 'Positionen nach Protokoll',
    asOf: 'aktualisiert {{age}}',
    asOfLive: 'Live · aktualisiert {{age}}',
    loading: 'Positionen werden geladen…',
    loadFailed: 'Positionen konnten nicht geladen werden',
    empty:
      'Noch keine Positionen. Zahle Kapital ein oder deploye eine Automation, um zu starten.',
    protocol: {
      idle: 'Idle / nicht allokiert',
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
    heading: 'Wertverlauf',
    chartTitle: 'Chart des Wertverlaufs',
    loading: 'Verlauf wird geladen…',
    loadFailed: 'Wertverlauf konnte nicht geladen werden',
    empty: 'Noch zu wenig Verlauf — es werden weiter Snapshots gesammelt.',
    legendDeposit: 'Deposit',
    legendWithdraw: 'Withdraw',
    since: 'Verlauf seit {{date}}',
    marker: '{{type}} {{amount}} @ {{date}}',
  },
  performance: {
    heading: 'Performance',
    loading: 'Performance wird geladen…',
    loadFailed: 'Performance konnte nicht geladen werden',
    pnl: 'PnL',
    currentValue: 'Aktueller Wert',
    netDeposits: 'Netto-Deposits',
    costs: 'Kosten (Fees + Gas)',
  },
  ranges: {
    '24h': '24 Std.',
    '7d': '7 Tage',
    '30d': '30 Tage',
    all: 'Seit Erstellung',
  },
  history: {
    heading: 'Ausführungs-Historie',
    allActivity: 'Alle Aktivitäten',
    loadFailed: 'Ausführungs-Historie konnte nicht geladen werden',
    empty: 'Noch keine Aktivität.',
    table: {
      type: 'Typ',
      detail: 'Detail',
      cost: 'Kosten',
      usd: 'USD',
      txHash: 'TX-Hash',
      date: 'Datum',
    },
    automation: 'Automation #{{id}}',
    attempts: '{{times}}× fehlgeschlagen',
    deposit: 'Deposit',
    withdrawal: 'Withdraw',
    previous: 'Zurück',
    next: 'Weiter',
    page: 'Seite {{page}} von {{total}}',
  },
  executionStatus: {
    success: 'Erfolgreich',
    failed: 'Fehlgeschlagen',
    resolved: 'Behoben',
  },
  freshness: {
    live: 'Live',
    reconnecting: 'Verbindung wird wiederhergestellt',
    reconnectingHint:
      'Verbindung wird wiederhergestellt — es wird zwischenzeitlich abgefragt',
    updated: '· aktualisiert {{age}}',
  },
  gasReserve: {
    heading: 'Gas Reserve',
    loading: 'Gas Reserve wird geladen…',
    loadFailed: 'Gas Reserve konnte nicht geladen werden',
    disabled:
      'Gas-Kompensation ist für diesen Vault deaktiviert (kein Deposit Token).',
    warning:
      'Zu wenig Gas Reserve hinterlegt — externe Executor werden nicht kompensiert und führen deine öffentlichen Automations daher voraussichtlich nicht aus.',
    deposited: 'Hinterlegte Reserve',
    target: 'Ziel (minFeeDeposit)',
    minLabel: 'Mindest-Reserve (minFeeDeposit)',
    minHint:
      'Auffüllziel der FeeDepositAction. Bei 0 füllt sie die Reserve nicht automatisch auf. Aktuell:',
    setMin: 'Setzen',
    settingMin: 'Wird gesetzt…',
    setMinFailed: 'Minimum konnte nicht gesetzt werden',
    depositLabel: 'Fees einzahlen',
    depositHint: 'Wird aus der Token-Balance des Vaults entnommen.',
    depositSubmit: 'Einzahlen',
    depositing: 'Wird eingezahlt…',
    depositFailed: 'Einzahlung fehlgeschlagen',
  },
  context: {
    heading: 'Context',
    loading: 'Context wird geladen…',
    loadFailed: 'Context konnte nicht geladen werden',
    emptyTitle: 'Dieser Vault hat keine Context Slots.',
    emptyBody:
      'Context Slots entstehen durch Automations, die gemeinsame Variablen lesen oder schreiben.',
    outOfSync:
      'Nicht synchron: der On-chain-Context hält {{onChain}} Slots, im Editor sind {{inEditor}} definiert.',
    table: {
      slot: 'Slot',
      name: 'Name',
      type: 'Typ',
      value: 'On-chain-Wert',
    },
    unnamed: 'unbenannt',
    emptyValue: '∅ leer',
  },
};
