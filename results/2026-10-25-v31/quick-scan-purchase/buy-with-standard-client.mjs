#!/usr/bin/env node
// x402-scan-koopproef.mjs — koopt de betaalde scan (https://x402.tokenizen.nl/api/bug-intel) met een STANDAARD x402-client (@x402/fetch),
// zoals een vreemde agent dat zou doen, en bewaart het antwoord als bewijs. Echt geld op Base mainnet (5 USDC), met een wegwerpadres.
//
// De koper is een apart wegwerpadres met alleen deze 5 USDC erop (sleutelbestand buiten de repository). Geen ETH nodig: bij het exact-schema
// betaalt de afrekenroute het gas. De betaling gaat naar ons eigen ontvangstadres, dus het is een eigen test en nooit een klant.
//
// Gebruik:
//   node scripts/x402-scan-koopproef.mjs <sleutelbestand.json> <bewijs-uit.json> [owner/repo] [--droog] [--ja-echt-geld]
// Zonder --ja-echt-geld wordt er niet betaald: het script haalt het voorstel op en toetst het aan de poort hieronder.

import { readFileSync, writeFileSync } from "node:fs";

const [sleutelPad, bewijsPad, repoArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ECHT = process.argv.includes("--ja-echt-geld");
const SNEL = process.argv.includes("--snel");
const DOEL = SNEL ? "https://x402.tokenizen.nl/api/bug-intel-quick" : "https://x402.tokenizen.nl/api/bug-intel";
const REPO = repoArg ?? "sherlock-audit/2025-03-symm-io-stacking";
const TOEGESTAAN_PAYTO = "0x015eb036560216b3051339061ff68a207e0fe88f";
const MAX_BEDRAG = SNEL ? 1_000_000n : 5_000_000n;
const MAX_GELDIG_SECONDEN = 900;
const CHAIN = "eip155:8453";

const { x402Client } = await import("@x402/core/client");
const { registerExactEvmScheme } = await import("@x402/evm/exact/client");
const { wrapFetchWithPayment } = await import("@x402/fetch");
const { privateKeyToAccount } = await import("viem/accounts");

// Bindende poort: de bibliotheek betaalt precies wat deze functie teruggeeft.
function kiesVoorstel(_versie, voorstellen) {
  const lijst = Array.isArray(voorstellen) ? voorstellen : [];
  const redenen = [];
  for (const v of lijst) {
    const bedrag = BigInt(String(v.amount ?? v.maxAmountRequired ?? "0"));
    if (v.network !== CHAIN) { redenen.push("netwerk " + v.network); continue; }
    if (v.scheme !== "exact") { redenen.push("schema " + v.scheme); continue; }
    if (String(v.payTo).toLowerCase() !== TOEGESTAAN_PAYTO) { redenen.push("payTo " + v.payTo); continue; }
    if (bedrag > MAX_BEDRAG) { redenen.push("bedrag " + bedrag); continue; }
    if (Number(v.maxTimeoutSeconds ?? 0) > MAX_GELDIG_SECONDEN) { redenen.push("geldigheid " + v.maxTimeoutSeconds); continue; }
    console.log(`voorstel: ${bedrag} op ${v.network} naar ${v.payTo}, geldig ${v.maxTimeoutSeconds}s`);
    return v;
  }
  throw new Error("geen voorstel kwam door de poort, er is NIET betaald: " + redenen.join("; "));
}

const sleutel = JSON.parse(readFileSync(sleutelPad, "utf8"));
const account = privateKeyToAccount(sleutel.sleutel);
console.log("koper:", account.address);

const client = new x402Client(kiesVoorstel);
registerExactEvmScheme(client, { signer: account, networks: [CHAIN] });
// De standaardclient weigert betalingen boven 1 dollar tenzij je dat zelf toestaat (gemeten 25 okt 2026): de scan kost 5 dollar.
if (!process.argv.includes("--standaard-limiet")) client.setSpendControls({ maxAmountPerPayment: "$5" });
else console.log("standaardlimiet van de client blijft staan (1 dollar)");
const lichaam = JSON.stringify({ repo: REPO, contact: "eigen koopproef met een standaard x402-client" });
const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: lichaam };

if (!ECHT) {
  const r = await fetch(DOEL, init);
  const j = await r.json();
  console.log("zonder betaling:", r.status, "aanbiedingen:", j.accepts?.length);
  kiesVoorstel(2, j.accepts);
  console.log("droog: het voorstel komt door de poort. Voeg --ja-echt-geld toe om te betalen.");
  process.exit(0);
}

const betaalFetch = wrapFetchWithPayment(globalThis.fetch, client);
const res = await betaalFetch(DOEL, init);
const tekst = await res.text();
let antwoord; try { antwoord = JSON.parse(tekst); } catch { antwoord = { onleesbaar: tekst.slice(0, 300) }; }
const kop = res.headers.get("payment-response");
let kopUitgepakt = null; try { kopUitgepakt = kop ? JSON.parse(Buffer.from(kop, "base64").toString("utf8")) : null; } catch {}
console.log("status:", res.status);
console.log("PAYMENT-RESPONSE:", kopUitgepakt ? JSON.stringify(kopUitgepakt).slice(0, 400) : "(geen)");
console.log("job:", antwoord.jobId, "bonnetje in body:", !!antwoord.receipt);
const tx = kopUitgepakt?.transaction ?? antwoord.receipt?.payload?.transaction ?? "";
writeFileSync(bewijsPad, JSON.stringify({ gemeten: new Date().toISOString(), soort: "koopproef met een standaard x402-client (@x402/fetch)", transactie: tx, antwoord, paymentResponseHeader: kopUitgepakt }, null, 2));
console.log("bewijs bewaard:", bewijsPad);
