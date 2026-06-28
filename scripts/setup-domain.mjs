#!/usr/bin/env node
/**
 * One-time setup: register demo.teampulse.cz on Cloudflare Pages project.
 * Uses wrangler OAuth credentials (same as `wrangler whoami`).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "4b2de46fe56832fbf0b7d175e875ff15";
const PROJECT = "teampulse-demo-v2";
const DOMAIN = "demo.teampulse.cz";
const ZONE_ID = "5ab7d6ffb2a78ff167374da8674b205c";

function getWranglerToken() {
  const configPath = join(homedir(), "Library/Preferences/.wrangler/config/default.toml");
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/oauth_token = "([^"]+)"/);
  if (!match) throw new Error("Wrangler OAuth token not found. Run: npx wrangler login");
  return match[1];
}

async function cfFetch(path, options = {}) {
  const token = getWranglerToken();
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(JSON.stringify(data.errors ?? data, null, 2));
  }
  return data;
}

async function main() {
  console.log(`Adding Pages domain ${DOMAIN} to project ${PROJECT}…`);
  try {
    const add = await cfFetch(
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`,
      { method: "POST", body: JSON.stringify({ name: DOMAIN }) },
    );
    console.log("Domain registered:", add.result?.status ?? add.result);
  } catch (err) {
    const msg = String(err.message ?? err);
    if (msg.includes("already exists") || msg.includes("8000018")) {
      console.log("Domain already registered on project.");
    } else {
      throw err;
    }
  }

  const list = await cfFetch(
    `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`,
  );
  const domain = list.result?.find((d) => d.name === DOMAIN);
  console.log("Domain status:", domain?.status ?? "unknown");

  const zones = await cfFetch(`/zones/${ZONE_ID}`);
  const zone = zones.result;
  if (!zone) throw new Error("Zone teampulse.cz not found on this Cloudflare account");

  const records = await cfFetch(
    `/zones/${ZONE_ID}/dns_records?name=${DOMAIN}`,
  );
  const existing = records.result?.[0];
  const target = `${PROJECT}.pages.dev`;

  if (existing) {
    console.log(`DNS record exists: ${existing.type} → ${existing.content}`);
  } else {
    console.log(`Creating CNAME demo → ${target}…`);
    const created = await cfFetch(`/zones/${ZONE_ID}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: "demo",
        content: target,
        proxied: true,
        ttl: 1,
      }),
    });
    console.log("DNS record created:", created.result?.name);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
