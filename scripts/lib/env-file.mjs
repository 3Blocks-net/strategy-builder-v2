// Reading single values out of a `.env` file, without a dotenv dependency.
//
// The dev startup and `pnpm dev:doctor` need a handful of values (RPC_URL, PORT,
// BSC_MAINNET_RPC_URL) *before* any application code runs, so they cannot ask
// the backend's ConfigService for them. Deliberately line-based: everything
// this repo writes into its `.env` files is a plain `KEY=value` line.

import { existsSync, readFileSync } from 'node:fs';

/**
 * Parses `.env` text into `{ KEY: { value, line } }` — the line number included
 * because a value that has to be corrected has to be found first. Blank lines
 * and `#` comments are skipped, an inline ` #` comment and surrounding quotes
 * are stripped, and an empty value counts as "not set" so a placeholder line
 * like `FACTORY_ADDRESS=` never masks a real value from the environment.
 */
export function parseEnvEntries(contents) {
  const entries = {};
  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    let value = line.slice(separatorIndex + 1).trim();
    const commentIndex = value.indexOf(' #');
    if (commentIndex !== -1) value = value.slice(0, commentIndex).trim();
    value = value.replace(/^["']|["']$/g, '');
    if (value) entries[key] = { value, line: index + 1 };
  }
  return entries;
}

/** The same, reduced to plain values for callers that do not need the line. */
export function parseEnvFile(contents) {
  const values = {};
  for (const [key, entry] of Object.entries(parseEnvEntries(contents))) {
    values[key] = entry.value;
  }
  return values;
}

/** Reads a `.env` file as entries; a missing or unreadable file is an empty set. */
export function readEnvEntries(filePath) {
  if (!filePath || !existsSync(filePath)) return {};
  try {
    return parseEnvEntries(readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/** Reads and parses a `.env` file; a missing or unreadable file is an empty set. */
export function readEnvFile(filePath) {
  const values = {};
  for (const [key, entry] of Object.entries(readEnvEntries(filePath))) {
    values[key] = entry.value;
  }
  return values;
}

/**
 * One value, with the process environment winning over the file — the same
 * precedence the backend applies, so a shell override behaves the same here.
 */
export function readEnvValue(filePath, key, env = process.env) {
  const fromProcess = env?.[key]?.trim();
  if (fromProcess) return fromProcess;
  return readEnvFile(filePath)[key];
}
