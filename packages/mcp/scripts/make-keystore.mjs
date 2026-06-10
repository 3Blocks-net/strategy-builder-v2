#!/usr/bin/env node
// Dev-Helfer: erzeugt aus einem rohen Private Key einen verschlüsselten
// Web3-Secret-Storage-Keystore. NUR fürs lokale Ausprobieren — nicht der
// Standard-Weg und niemals für echtes Vermögen.
//
//   RAW_PRIVATE_KEY=0x... KEYSTORE_PASSWORD=geheim OUT=~/.pecunity/keystore.json \
//     node packages/mcp/scripts/make-keystore.mjs
import { Wallet } from "ethers";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

const pk = process.env.RAW_PRIVATE_KEY;
const pw = process.env.KEYSTORE_PASSWORD;
const outArg = process.env.OUT ?? "keystore.json";
const out = resolve(outArg.replace(/^~(?=$|\/)/, homedir()));
console.log(out);

if (!pk || !pw) {
  console.error("Bitte RAW_PRIVATE_KEY und KEYSTORE_PASSWORD setzen.");
  process.exit(1);
}

const wallet = new Wallet(pk);
const json = await wallet.encrypt(pw);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json, { mode: 0o600 });

console.log(`✓ Keystore geschrieben: ${out}`);
console.log(`  Adresse: ${wallet.address}`);
console.log(
  "  Nächster Schritt: `pecunity-mcp-init` und dasselbe Passwort eingeben.",
);
