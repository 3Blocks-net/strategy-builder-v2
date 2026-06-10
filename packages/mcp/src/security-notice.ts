/**
 * Deutlicher Sicherheitshinweis, der beim Start (Erst-Verbindung) auf stderr
 * ausgegeben wird. stdout ist dem MCP-stdio-Kanal vorbehalten.
 */
export const SECURITY_NOTICE = [
  '────────────────────────────────────────────────────────────',
  ' Pecunity MCP-Server — Sicherheitshinweis',
  '────────────────────────────────────────────────────────────',
  ' Dieser Server kann in DEINEM Namen Transaktionen SIGNIEREN.',
  ' Er operiert ausschließlich auf den Vaults der verbundenen',
  ' Wallet-Adresse. Geldbewegende Aktionen erfordern eine',
  ' explizite Bestätigung; der Zugang lässt sich jederzeit',
  ' entziehen:',
  '',
  '   • Zugang trennen/entfernen:  pecunity-mcp-init --remove',
  '     (löscht das Keystore-Passwort aus dem OS-Keychain)',
  '   • Server aus Claude Desktop entfernen: Eintrag aus',
  '     claude_desktop_config.json löschen.',
  '',
  ' Der Private Key verlässt nie diesen Rechner und wird nie',
  ' geloggt oder an das Sprachmodell weitergegeben.',
  '────────────────────────────────────────────────────────────',
].join('\n');
