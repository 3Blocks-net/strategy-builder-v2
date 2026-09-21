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
  expertMode: {
    heading: 'Experten-Modus',
    reading: 'Der aktuelle Modus wird vom Vault gelesen…',
    standard: {
      title: 'Standard-Modus — nur kuratierte Steps',
      body: 'Dieser Vault akzeptiert nur Steps, deren Target-Adresse auf der kuratierten Liste geprüfter Actions und Conditions steht. Alles andere lehnt er beim Anlegen einer Automation ab.',
    },
    expert: {
      title: 'Experten-Modus — Kuratierung abgeschaltet',
      body: 'Dieser Vault akzeptiert jedes Step-Target, kuratiert oder nicht. Du prüfst jede Adresse, die du deployst, selbst.',
    },
    unknown: {
      title: 'Modus konnte nicht gelesen werden',
      body: 'Pecunity konnte den Modus nicht vom Vault lesen und behauptet hier deshalb keinen. Am Vault hat sich nichts geändert. Du kannst erneut lesen oder den Vault zurück auf den kuratierten Standard setzen — diese Richtung ist nie falsch.',
      detail: 'Details: {{reason}}',
    },
    readAgain: 'Erneut lesen',
    enable: 'Experten-Modus einschalten',
    disable: 'Zurück zum Standard-Modus',
    newDeploysOnly: 'Der Modus gilt für neue Deploys. Bereits laufende Automationen laufen unverändert weiter.',
    notOwner:
      'Nur der Owner dieses Vaults kann den Modus umschalten — deine verbundene Wallet ist es nicht. Du siehst den Modus hier, ändern kannst du ihn nicht.',
    noWalletConnected:
      'Verbinde eine Wallet, um den Modus zu wechseln. Ändern kann ihn nur der Owner des Vaults.',
    ownerUnknown:
      'Pecunity konnte nicht feststellen, wem dieser Vault gehört. Da nur der Owner den Modus umschalten darf, wird hier kein Schalter angeboten — ein Knopf, dessen Transaktion sicher fehlschlägt, kostet dich nur einen Wallet-Dialog und eine Gas-Schätzung.',
    awaitingWallet: 'Warten auf die Signatur in deiner Wallet…',
    confirmingOnChain: 'Warten auf die Bestätigung der Transaktion…',
    rejected: 'Du hast die Signatur in deiner Wallet abgelehnt. Der Modus ist unverändert.',
    failed: 'Der Modus wurde nicht geändert.',
    dialog: {
      heading: 'Die Kuratierung für diesen Vault abschalten?',
      lead: 'Der Experten-Modus entfernt den Schutz, mit dem dieser Vault standardmäßig läuft. Zwei Dinge ändern sich:',
      pointCurated:
        'Der Vault prüft Step-Targets nicht mehr gegen die kuratierte Liste. Er akzeptiert danach jede beliebige Contract-Adresse als Action oder Condition — auch eine, die niemand geprüft hat.',
      pointTakeover:
        'Steps laufen per delegatecall im Vault. Ein einziges bösartiges Target kann deshalb den gesamten Vault-Speicher überschreiben — einschließlich des Owner-Slots — und den Vault mitsamt allen Positionen und Token-Balances übernehmen.',
      scope: 'Die Änderung gilt für neue Deploys. Bereits laufende Automationen laufen unverändert weiter, und du kannst jederzeit zum kuratierten Standard zurück.',
      acknowledge:
        'Mir ist klar, dass dieser Vault danach unkuratierte Step-Targets akzeptiert und dass ein bösartiger Step den Vault mit allem darin übernehmen kann.',
      signHint: 'Die Umschaltung ist eine On-Chain-Änderung: Deine Wallet fragt dich nach der Signatur.',
      confirm: 'Experten-Modus einschalten',
      cancel: 'Abbrechen',
    },
  },
  deploymentConfig: {
    loading: {
      heading: 'Wird vorbereitet',
      body: 'Pecunity fragt beim Backend nach, mit welchen Contracts es arbeitet. Einen Moment.',
    },
    unavailable: {
      heading: 'Backend nicht erreichbar',
      body: 'Pecunity fragt beim Backend nach, mit welchen Contracts es arbeitet. Ohne diese Antwort kann es keinen Vault anlegen und hört deshalb hier auf, statt zu raten. Es wurde nichts gesendet und nichts verändert.',
      detail: 'Details: {{reason}}',
      backToDashboard: 'Zurück zum Dashboard',
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
  protection: {
    protected: 'Geschützt',
    expert: 'Experten-Modus',
    unknown: 'Schutz-Status unbekannt',
    checked: 'geprüft {{age}}',
    notChecked: 'nicht geprüft',
    protectedHint:
      'Direkt vom Vault gelesen: Er akzeptiert nur Steps, deren Target auf der kuratierten Liste steht.',
    expertHint:
      'Direkt vom Vault gelesen: Sein Owner hat die kuratierte Prüfung abgeschaltet, er akzeptiert also jedes Step-Target.',
    unknownHint:
      'Der Schutz-Status konnte nicht vom Vault gelesen werden — deshalb wird hier nichts behauptet. Lade die Positionen neu, um es erneut zu versuchen.',
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
  priceShock: {
    heading: 'Preis-Schock-Preview',
    intro:
      'Was diese Automation tut, wenn sich der Markt bewegt, bevor sie läuft. Jede Zahl ist aus deinen eigenen Vault-Daten gerechnet — nichts davon ist eine Prognose.',
    loading: 'Preview wird berechnet…',
    neverBlocks:
      'Eine fehlende Preview blockiert den Deploy nie — du kannst immer fortfahren.',
    emptyTitle: 'Keine Preis-Exposure',
    emptyBody:
      'Kein Step dieser Automation hängt an einem Marktpreis. Eine Preisbewegung ändert also nichts daran, wie sie läuft.',
    unavailableTitle: 'Preview nicht verfügbar',
    warningTitle: 'Zweiter Blick lohnt sich',
    swap: {
      label: 'Swap mit {{tolerance}} Slippage-Toleranz',
      executes: 'läuft',
      reverts: 'revertet',
      legend:
        'Gemeint ist eine Bewegung innerhalb des Referenz-Fensters von {{window}}: nur so schnell revertet der Swap jenseits seiner Toleranz, statt zu einem schlechten Preis auszuführen — die Automation stoppt, verkauft wird nichts. Zieht der Markt langsamer, wandert der Referenzpreis mit, und der Swap führt zum neuen, schlechteren Preis aus.',
      legendNoWindow:
        'Gemeint ist eine Bewegung innerhalb des Referenz-Fensters dieses Swaps: nur so schnell revertet er jenseits seiner Toleranz, statt zu einem schlechten Preis auszuführen — die Automation stoppt, verkauft wird nichts. Zieht der Markt langsamer, wandert der Referenzpreis mit, und der Swap führt zum neuen, schlechteren Preis aus.',
      fallback:
        'Deckt das Oracle des Pools das Fenster nicht ab, rechnet der Vault mit dem Spot-Preis und halbiert die Toleranz: dann revertet der Swap schon ab {{value}}.',
      share:
        'Dieser Swap nimmt {{value}} der Liquidity, die rund um den Pool-Preis aktiv ist.',
    },
    range: {
      label: 'Range +{{up}} / −{{down}} um den Pool-Preis',
      inRange: 'in Range',
      outOfRange: 'out of Range',
      legend:
        'Außerhalb ihrer Range verdient die Position keine Fees mehr und liegt vollständig in einem der beiden Token.',
    },
    health: {
      label: 'Health Factor {{value}} — Vault, so wie er jetzt steht',
      liquidation: '{{value}} · Liquidation',
      legend:
        'Diese Zahlen sind eine Messung der Aave-Position deines Vaults im Moment, bevor diese Automation gelaufen ist — nicht der Health Factor nach dem Deploy. Sie zeigen, wie die heutige Position auf eine Preisbewegung reagiert: Der Health Factor folgt dem Collateral-Preis, während die Debt bleibt, wo sie ist; unter 1,00 kann die Position liquidiert werden. Was dieser Step selbst mit dem Health Factor macht, wenn er auslöst, steckt hier nicht drin.',
      target:
        'Wenn er auslöst, steuert dieser Step den Health Factor auf {{value}}. Die Zahlen oben zeigen die Position davor.',
    },
    reason: {
      'no-tolerance':
        '{{step}}: Es ist noch keine Toleranz gesetzt, also gibt es nichts, wogegen gerechnet werden könnte.',
      'explicit-range':
        '{{step}}: Die Range steht als feste Preise fest. Ohne den aktuellen Pool-Preis wäre die Preview geraten.',
      'no-lending-data':
        '{{step}}: Deine Aave-Position ließ sich gerade nicht laden.',
      'no-lending-position':
        '{{step}}: Der Vault trägt noch keine Aave-Debt, es gibt also keinen Health Factor, der sich bewegen könnte.',
    },
    warning: {
      'high-tolerance':
        '{{step}}: Eine Toleranz von {{value}} lässt den Swap immer noch weit unter dem Referenzpreis ausführen.',
      'thin-pool':
        '{{step}}: Der Swap ist {{value}} der rund um den Pool-Preis aktiven Liquidity und bewegt diesen Preis selbst.',
    },
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
