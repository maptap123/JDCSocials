import { PLATFORM_CONFIG } from "@/lib/platforms";
import type { Platform } from "@/types/database";

// Minimal MCP client for the user's Zapier MCP server (Streamable HTTP).
// Zapier exposes each configured action (e.g. "Facebook Pages: Create Page Post")
// as an MCP tool; we discover tools at runtime so exact tool names/slugs in the
// user's Zapier config don't matter.

const MCP_PROTOCOL_VERSION = "2025-03-26";
const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;

export interface ZapierTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

export interface PlatformPublishResult {
  platform: Platform;
  success: boolean;
  id?: string;
  error?: string;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export function isZapierConfigured(): boolean {
  return Boolean(process.env.ZAPIER_MCP_URL);
}

function parseSse(text: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data) as JsonRpcMessage);
    } catch {
      // ignore non-JSON SSE events (keep-alives etc.)
    }
  }
  return messages;
}

export class ZapierClient {
  private url: string;
  private sessionId: string | null = null;
  private nextId = 1;

  constructor() {
    const url = process.env.ZAPIER_MCP_URL;
    if (!url) throw new Error("ZAPIER_MCP_URL is not set");
    this.url = url;
  }

  private async post(body: object, timeoutMs: number): Promise<JsonRpcMessage[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      if (process.env.ZAPIER_MCP_API_KEY) {
        headers.Authorization = `Bearer ${process.env.ZAPIER_MCP_API_KEY}`;
      }
      if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

      const res = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const session = res.headers.get("mcp-session-id");
      if (session) this.sessionId = session;

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Zapier MCP request failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) return parseSse(text);
      if (!text.trim()) return [];
      const parsed = JSON.parse(text) as JsonRpcMessage | JsonRpcMessage[];
      return Array.isArray(parsed) ? parsed : [parsed];
    } finally {
      clearTimeout(timer);
    }
  }

  private async request(method: string, params: unknown, timeoutMs = CALL_TIMEOUT_MS): Promise<unknown> {
    const id = this.nextId++;
    const messages = await this.post({ jsonrpc: "2.0", id, method, params }, timeoutMs);
    const reply =
      messages.find((m) => m.id === id && (m.result !== undefined || m.error !== undefined)) ??
      messages.find((m) => m.result !== undefined || m.error !== undefined);
    if (!reply) throw new Error(`Zapier MCP returned no response for ${method}`);
    if (reply.error) throw new Error(`Zapier MCP error (${method}): ${reply.error.message ?? "unknown error"}`);
    return reply.result;
  }

  async connect(): Promise<void> {
    await this.request(
      "initialize",
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "social-media-poster", version: "1.0.0" },
      },
      CONNECT_TIMEOUT_MS
    );
    try {
      // Spec-required readiness notification; harmless if the server ignores it.
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, CONNECT_TIMEOUT_MS);
    } catch {
      // non-fatal
    }
  }

  async listTools(): Promise<ZapierTool[]> {
    const result = (await this.request("tools/list", {})) as { tools?: ZapierTool[] } | undefined;
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
    const result = (await this.request("tools/call", { name, arguments: args })) as
      | { content?: Array<{ type?: string; text?: string }>; isError?: boolean }
      | undefined;
    const text = (result?.content ?? [])
      .map((c) => (typeof c?.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
    return { ok: !result?.isError, text };
  }
}

const NON_PUBLISH_TOOL = /(find|search|get|list|retrieve|delete|remove|lookup)/;
const CONTENT_FIELD_PRIORITY = ["message", "caption", "commentary", "comment", "text", "content", "body", "status", "description"];
const MEDIA_FIELD_PRIORITY = ["photo", "image", "picture", "media", "video", "file"];

export function pickToolForPlatform(tools: ZapierTool[], platform: Platform, wantsMedia: boolean): ZapierTool | null {
  const candidates = tools.filter((t) => {
    const haystack = `${t.name} ${t.description ?? ""}`.toLowerCase();
    return haystack.includes(platform) && !NON_PUBLISH_TOOL.test(t.name.toLowerCase());
  });

  const score = (t: ZapierTool): number => {
    const name = t.name.toLowerCase();
    let s = 0;
    if (/(create|publish|post|share|add)/.test(name)) s += 2;
    const isMediaTool = /(photo|image|picture|media|video|reel)/.test(name);
    if (isMediaTool) s += wantsMedia ? 3 : -2;
    if (platform === "facebook" && name.includes("page")) s += 1;
    if (platform === "linkedin" && /(company|organization|share|update)/.test(name)) s += 1;
    return s;
  };

  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] ?? null;
}

function matchKey(keys: string[], candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const key = keys.find((k) => k.toLowerCase().includes(candidate));
    if (key) return key;
  }
  return undefined;
}

function buildInstructions(platform: Platform, content: string, mediaUrls: string[]): string {
  const lines = [
    `Publish a new ${PLATFORM_CONFIG[platform].label} post with exactly this text (do not rewrite or shorten it):`,
    content,
  ];
  if (mediaUrls.length > 0) lines.push(`Attach this media (public URL): ${mediaUrls.join(", ")}`);
  return lines.join("\n\n");
}

export function buildToolArguments(
  tool: ZapierTool,
  platform: Platform,
  content: string,
  mediaUrls: string[]
): Record<string, unknown> {
  const props = tool.inputSchema?.properties ?? {};
  const keys = Object.keys(props);
  const args: Record<string, unknown> = {};

  // Zapier MCP tools take an `instructions` param that fills any fields left on
  // "Have AI guess values" — always send it alongside explicit field mappings.
  const instructionsKey = keys.find((k) => k.toLowerCase() === "instructions");
  if (instructionsKey) args[instructionsKey] = buildInstructions(platform, content, mediaUrls);

  const contentKey = matchKey(keys, CONTENT_FIELD_PRIORITY);
  if (contentKey) args[contentKey] = content;

  if (mediaUrls.length > 0) {
    const mediaKey = matchKey(keys, MEDIA_FIELD_PRIORITY);
    if (mediaKey) args[mediaKey] = props[mediaKey]?.type === "array" ? mediaUrls : mediaUrls[0];
  }

  return args;
}

const ID_KEYS = ["id", "post_id", "postid", "urn", "activity", "permalink_url", "permalink", "shortcode"];

function extractPostId(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const found = new Map<string, string>();
  const walk = (node: unknown, depth: number): void => {
    if (!node || depth > 4) return;
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const lk = key.toLowerCase();
        if ((typeof value === "string" || typeof value === "number") && value !== "" && !found.has(lk)) {
          found.set(lk, String(value));
        } else {
          walk(value, depth + 1);
        }
      }
    }
  };
  walk(parsed, 0);
  for (const key of ID_KEYS) {
    const value = found.get(key);
    if (value) return value;
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function publishToPlatforms(
  platforms: Platform[],
  content: string,
  mediaUrls: string[]
): Promise<PlatformPublishResult[]> {
  const results: PlatformPublishResult[] = [];
  if (platforms.length === 0) return results;

  const client = new ZapierClient();
  await client.connect();
  const tools = await client.listTools();

  for (const platform of platforms) {
    if (platform === "houzz") {
      results.push({ platform, success: false, error: "Houzz has no posting API — publish manually" });
      continue;
    }
    if (platform === "instagram" && mediaUrls.length === 0) {
      results.push({ platform, success: false, error: "Instagram requires at least one image" });
      continue;
    }

    const tool = pickToolForPlatform(tools, platform, mediaUrls.length > 0);
    if (!tool) {
      results.push({
        platform,
        success: false,
        error: `No ${PLATFORM_CONFIG[platform].label} posting tool on your Zapier MCP server — add one at mcp.zapier.com`,
      });
      continue;
    }

    try {
      const args = buildToolArguments(tool, platform, content, mediaUrls);
      const call = await client.callTool(tool.name, args);
      if (call.ok) {
        results.push({ platform, success: true, id: extractPostId(call.text) ?? "published" });
      } else {
        results.push({ platform, success: false, error: truncate(call.text || "Zapier returned an error", 300) });
      }
    } catch (err) {
      results.push({
        platform,
        success: false,
        error: truncate(err instanceof Error ? err.message : String(err), 300),
      });
    }
  }

  return results;
}
