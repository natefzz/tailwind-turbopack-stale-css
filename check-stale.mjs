import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROUNDS = Number(process.argv[2] ?? 10);
const TIMEOUT_MS = 8000;
const CSS_FILE = ["src/app/globals.css", "app/globals.css"].find((file) =>
  existsSync(file),
);
const TOKEN_LINE = /\n?:root \{ --repro-token: "[^"]*"; \}\n?/;

if (!CSS_FILE)
  throw new Error("globals.css not found (run from the project root)");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function servedToken() {
  const html = await (await fetch(BASE_URL)).text();
  const urls = new Set(html.match(/\/_next\/static\/[^"]+\.css/g) ?? []);
  for (const url of urls) {
    const css = await (await fetch(BASE_URL + url)).text();
    const match = css.match(/--repro-token:\s*"([^"]*)"/);
    if (match) return match[1];
  }
  return null;
}

const original = (await readFile(CSS_FILE, "utf8")).replace(TOKEN_LINE, "\n");
let stale = 0;

try {
  for (let round = 1; round <= ROUNDS; round++) {
    const token = `r${round}-${Date.now()}`;
    await writeFile(
      CSS_FILE,
      `${original.trimEnd()}\n:root { --repro-token: "${token}"; }\n`,
    );

    const deadline = Date.now() + TIMEOUT_MS;
    let served = null;
    while (Date.now() < deadline) {
      await sleep(300);
      served = await servedToken();
      if (served === token) break;
    }

    const ok = served === token;
    if (!ok) stale++;
    console.log(
      `round ${round}: ${ok ? "ok   " : "STALE"} expected=${token} served=${served}`,
    );
    await sleep(1000);
  }
} finally {
  await writeFile(CSS_FILE, original);
}

console.log(`\n${stale}/${ROUNDS} edits served stale CSS`);
process.exitCode = stale > 0 ? 1 : 0;
