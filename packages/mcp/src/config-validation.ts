const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Prüft schreib-relevante Config gegen den Katalog und liefert **Warnungen**
 * (kein harter Abbruch): konfigurierte sensible Step-Namen, die zu keinem
 * Katalog-Step passen (Tippfehler/Case → stiller Capability-Block beim Deploy),
 * und Allowlist-Einträge, die keine gültigen EVM-Adressen sind (matchen nie).
 */
export function validateRuntimeConfig(
  config: { enabledSensitiveSteps: Set<string>; addressAllowlist: Set<string> },
  catalogStepNames: Set<string>,
): string[] {
  const warnings: string[] = [];

  for (const name of config.enabledSensitiveSteps) {
    if (!catalogStepNames.has(name)) {
      warnings.push(
        `PECUNITY_ENABLED_SENSITIVE_STEPS: "${name}" passt zu keinem Katalog-Step (Tippfehler/Case?) — ` +
          'der zugehörige sensible Step bliebe stillschweigend gesperrt.',
      );
    }
  }

  for (const addr of config.addressAllowlist) {
    if (!EVM_ADDRESS.test(addr)) {
      warnings.push(
        `PECUNITY_ADDRESS_ALLOWLIST: "${addr}" ist keine gültige EVM-Adresse — dieser Eintrag matcht nie.`,
      );
    }
  }

  return warnings;
}
