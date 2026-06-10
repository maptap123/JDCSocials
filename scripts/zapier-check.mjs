// Diagnostic: connects to the Zapier MCP server in .env.local the same way
// src/lib/zapier.ts does, and reports tools/apps. Run: node scripts/zapier-check.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const URL_ = env.ZAPIER_MCP_URL;
if (!URL_) {
  console.error("ZAPIER_MCP_URL not set in .env.local");
  process.exit(1);
}

let sessionId = null;
let nextId = 1;

function parseSse(text) {
  const messages = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!data) continue;
    try { messages.push(JSON.parse(data)); } catch {}
  }
  return messages;
}

async function rpc(method, params, isNotification = false) {
  const id = isNotification ? undefined : nextId++;
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (env.ZAPIER_MCP_API_KEY) headers.Authorization = `Bearer ${env.ZAPIER_MCP_API_KEY}`;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(URL_, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined ? { id } : {}), method, ...(params !== undefined ? { params } : {}) }),
  });
  const session = res.headers.get("mcp-session-id");
  if (session) sessionId = session;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  if (isNotification) return null;
  const messages = (res.headers.get("content-type") ?? "").includes("event-stream")
    ? parseSse(text)
    : text.trim() ? [JSON.parse(text)].flat() : [];
  const reply = messages.find((m) => m.result !== undefined || m.error !== undefined);
  if (!reply) throw new Error(`no response for ${method}; raw: ${text.slice(0, 300)}`);
  if (reply.error) throw new Error(`${method} error: ${JSON.stringify(reply.error).slice(0, 400)}`);
  return reply.result;
}

const init = await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "zapier-check", version: "1.0.0" },
});
console.log("✓ initialize ok — server:", JSON.stringify(init?.serverInfo ?? {}));
await rpc("notifications/initialized", undefined, true).catch(() => {});

const { tools = [] } = (await rpc("tools/list", {})) ?? {};
console.log(`✓ tools/list ok — ${tools.length} tools:`);
for (const t of tools) console.log("   -", t.name);

const dynamic = tools.some((t) => t.name === "execute_zapier_write_action");
console.log(`mode: ${dynamic ? "dynamic (meta-tools)" : "static (one tool per action)"}`);

if (dynamic) {
  const res = await rpc("tools/call", { name: "list_enabled_zapier_actions", arguments: {} });
  const text = (res?.content ?? []).map((c) => c.text ?? "").join("\n");
  console.log("enabled apps/actions:", text.slice(0, 1500));
}
