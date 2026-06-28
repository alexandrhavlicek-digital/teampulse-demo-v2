#!/usr/bin/env node
/**
 * Fix DNS for demo.teampulse.cz → teampulse-demo-v2.pages.dev
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZONE_ID = "5ab7d6ffb2a78ff167374da8674b205c";
const TARGET = "teampulse-demo-v2.pages.dev";
const RECORD_NAME = "demo.teampulse.cz";

function getWranglerToken() {
  const configPath = join(homedir(), "Library/Preferences/.wrangler/config/default.toml");
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/oauth_token = "([^"]+)"/);
  if (!match) throw new Error("Wrangler OAuth token not found");
  return match[1];
}

async function cf(path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getWranglerToken()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json();
  return data;
}

async function main() {
  const list = await cf(`/zones/${ZONE_ID}/dns_records?name=${RECORD_NAME}`);
  if (!list.success) throw new Error(JSON.stringify(list.errors));
  console.log("Existing records:", JSON.stringify(list.result?.map(r => ({ id: r.id, type: r.type, content: r.content, proxied: r.proxied })), null, 2));

  for (const record of list.result ?? []) {
    if (record.type === "A" || record.type === "AAAA") {
      console.log("Deleting", record.type, "record", record.id);
      const del = await cf(`/zones/${ZONE_ID}/dns_records/${record.id}`, { method: "DELETE" });
      if (!del.success) throw new Error(JSON.stringify(del.errors));
    }
  }

  const refreshed = await cf(`/zones/${ZONE_ID}/dns_records?name=${RECORD_NAME}`);
  const cname = refreshed.result?.find((r) => r.type === "CNAME");

  if (cname?.content === TARGET && cname.proxied) {
    console.log("DNS already correct.");
    return;
  }

  if (cname) {
    console.log("Updating CNAME", cname.id);
    const updated = await cf(`/zones/${ZONE_ID}/dns_records/${cname.id}`, {
      method: "PATCH",
      body: JSON.stringify({ type: "CNAME", name: "demo", content: TARGET, proxied: true, ttl: 1 }),
    });
    if (!updated.success) throw new Error(JSON.stringify(updated.errors));
    console.log("Updated:", updated.result?.content);
    return;
  }

  console.log("Creating CNAME…");
  const created = await cf(`/zones/${ZONE_ID}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "CNAME", name: "demo", content: TARGET, proxied: true, ttl: 1 }),
  });
  if (!created.success) throw new Error(JSON.stringify(created.errors));
  console.log("Created:", created.result?.content);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
