import { PLATFORM_CONFIG } from "@/lib/platforms";
import type { Platform } from "@/types/database";

// Minimal MCP client for the user's Zapier MCP server (Streamable HTTP).
// Zapier servers expose actions in one of two shapes:
//  - static: each action is its own tool (e.g. "facebook_pages_create_page_post")
//  - dynamic: meta-tools ("list_enabled_zapier_actions" + "execute_zapier_write_action")
// We discover at runtime and support both, so the Zapier-side config can change
// without touching this app.

const MCP_PROTOCOL_VERSION = "2025-03-26";
const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;

const DYNAMIC_LIST_TOOL = "list_enabled_zapier_actions";
const DYNAMIC_EXECUTE_TOOL = "execute_zapier_write_action";

export type ZapierPlatform = Exclude<Platform, "houzz">;
export const ZAPIER_PLATFORMS: ZapierPlatform[] = ["facebook", "instagram", "linkedin"];

export type MediaKind = "image" | "video" | null;

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

export interface ZapierStatusInfo {
  mode: "static" | "dynamic";
  toolCount: number;
  coverage: Record<ZapierPlatform, string | null>;
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

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|wmv|flv|mkv|3gp|3g2|asf)(\?|#|$)/i;

export function mediaKindOf(mediaUrls: string[]): MediaKind {
  if (mediaUrls.length === 0) return null;
  return VIDEO_EXT.test(mediaUrls[0]) ? "video" : "image";
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

// ---------------------------------------------------------------------------
// Tool/action matching
// ---------------------------------------------------------------------------

// Excludes read-only, analytics, and account-management actions (e.g.
// "page_post_insights", "change_page_profile_photo") from publish candidates.
const EXCLUDED_TOOL = /(find|search|get|list|retrieve|delete|remove|lookup|insight|metric|analytic|report|profile)/;

const CONTENT_FIELD_PRIORITY = ["message", "caption", "commentary", "comment", "text", "content", "body", "status", "description"];
const MEDIA_FIELD_PRIORITY = ["photo", "image", "picture", "media", "video", "file"];

function scoreCandidate(haystack: string, platform: ZapierPlatform, kind: MediaKind): number {
  let score = 0;
  if (/(create|publish|post|share|add)/.test(haystack)) score += 2;

  const isPhoto = /(photo|image|picture)/.test(haystack);
  const isVideo = /(video|reel)/.test(haystack);
  const isGenericMedia = /media/.test(haystack);
  if (kind === null && (isPhoto || isVideo || isGenericMedia)) score -= 2;
  if (kind === "image") score += isPhoto ? 3 : isGenericMedia ? 2 : isVideo ? -3 : 0;
  if (kind === "video") score += isVideo ? 3 : isGenericMedia ? 2 : isPhoto ? -3 : 0;

  if (platform === "facebook" && haystack.includes("page")) score += 1;
  if (platform === "linkedin") {
    // Prefer the company-page action over the personal-profile share.
    if (/(company|organization)/.test(haystack)) score += 2;
    else if (/(share|update)/.test(haystack)) score += 1;
  }
  return score;
}

export function pickToolForPlatform(tools: ZapierTool[], platform: ZapierPlatform, kind: MediaKind): ZapierTool | null {
  const candidates = tools.filter((t) => {
    const haystack = `${t.name} ${t.description ?? ""}`.toLowerCase();
    return haystack.includes(platform) && !EXCLUDED_TOOL.test(t.name.toLowerCase());
  });
  candidates.sort(
    (a, b) => scoreCandidate(b.name.toLowerCase(), platform, kind) - scoreCandidate(a.name.toLowerCase(), platform, kind)
  );
  return candidates[0] ?? null;
}

function matchKey(keys: string[], candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const key = keys.find((k) => k.toLowerCase().includes(candidate));
    if (key) return key;
  }
  return undefined;
}

function buildInstructions(platform: ZapierPlatform, content: string, mediaUrls: string[]): string {
  const lines = [
    `Publish a new ${PLATFORM_CONFIG[platform].label} post with exactly this text (do not rewrite or shorten it):`,
    content,
  ];
  if (mediaUrls.length > 0) lines.push(`Attach this media (public URL): ${mediaUrls.join(", ")}`);
  return lines.join("\n\n");
}

export function buildToolArguments(
  tool: ZapierTool,
  platform: ZapierPlatform,
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

// ---------------------------------------------------------------------------
// Dynamic mode (meta-tools): list_enabled_zapier_actions + execute_zapier_write_action
// ---------------------------------------------------------------------------

interface DynamicApp {
  app: string;
  selectedApi: string;
  actionCount: number;
}

interface DynamicAction {
  key: string;
  name: string;
  toolName: string;
  readOnly: boolean;
}

export interface DynamicTarget {
  selectedApi: string;
  actionKey: string;
  label: string;
  params: Array<{ key: string; isList: boolean }>;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function collectApps(parsed: unknown): DynamicApp[] {
  const rec = asRecord(parsed);
  const list = Array.isArray(rec?.apps) ? rec!.apps : Array.isArray(parsed) ? parsed : [];
  const apps: DynamicApp[] = [];
  for (const item of list) {
    const r = asRecord(item);
    if (r && typeof r.app === "string" && typeof r.selected_api === "string") {
      apps.push({ app: r.app, selectedApi: r.selected_api, actionCount: typeof r.action_count === "number" ? r.action_count : 0 });
    }
  }
  return apps;
}

function collectActions(parsed: unknown): DynamicAction[] {
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  const actions: DynamicAction[] = [];
  for (const root of roots) {
    const r = asRecord(root);
    const list = Array.isArray(r?.actions) ? r!.actions : [];
    for (const item of list) {
      const a = asRecord(item);
      if (a && typeof a.key === "string") {
        actions.push({
          key: a.key,
          name: typeof a.name === "string" ? a.name : "",
          toolName: typeof a.tool_name === "string" ? a.tool_name : "",
          readOnly: a.tool === "execute_zapier_read_action",
        });
      }
    }
  }
  return actions;
}

// Finds the first "params"/"parameters" array of {key} objects anywhere in the
// drill-down response, since the exact nesting isn't contractual.
function collectParams(node: unknown, depth = 0): Array<{ key: string; isList: boolean }> {
  if (!node || depth > 5) return [];
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = collectParams(item, depth + 1);
      if (found.length > 0) return found;
    }
    return [];
  }
  const rec = asRecord(node);
  if (!rec) return [];
  for (const key of ["params", "parameters"]) {
    const candidate = rec[key];
    if (Array.isArray(candidate)) {
      const params = candidate
        .map((p) => asRecord(p))
        .filter((p): p is Record<string, unknown> => Boolean(p && typeof p.key === "string"))
        .map((p) => ({ key: p.key as string, isList: p.list === true }));
      if (params.length > 0) return params;
    }
  }
  for (const value of Object.values(rec)) {
    const found = collectParams(value, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

// Caches the apps/actions lookups for the duration of one publish run.
class DynamicCatalog {
  private apps: DynamicApp[] | null = null;
  private actionsByApi = new Map<string, DynamicAction[]>();

  constructor(private client: ZapierClient) {}

  async getApps(): Promise<DynamicApp[]> {
    if (!this.apps) {
      const res = await this.client.callTool(DYNAMIC_LIST_TOOL, {});
      this.apps = collectApps(safeParse(res.text));
    }
    return this.apps;
  }

  async getActions(selectedApi: string): Promise<DynamicAction[]> {
    let actions = this.actionsByApi.get(selectedApi);
    if (!actions) {
      const res = await this.client.callTool(DYNAMIC_LIST_TOOL, { selected_api: selectedApi });
      actions = collectActions(safeParse(res.text));
      this.actionsByApi.set(selectedApi, actions);
    }
    return actions;
  }

  async totalActionCount(): Promise<number> {
    const apps = await this.getApps();
    return apps.reduce((sum, app) => sum + app.actionCount, 0);
  }

  async findTarget(platform: ZapierPlatform, kind: MediaKind): Promise<DynamicTarget | null> {
    const apps = await this.getApps();
    const app = apps.find((a) => a.app.toLowerCase().includes(platform));
    if (!app) return null;

    const actions = await this.getActions(app.selectedApi);
    const candidates = actions.filter(
      (a) => !a.readOnly && !EXCLUDED_TOOL.test(`${a.key} ${a.toolName}`.toLowerCase())
    );
    const haystackOf = (a: DynamicAction) => `${a.key} ${a.name} ${a.toolName}`.toLowerCase();
    candidates.sort((a, b) => scoreCandidate(haystackOf(b), platform, kind) - scoreCandidate(haystackOf(a), platform, kind));
    const best = candidates[0];
    if (!best) return null;

    const drill = await this.client.callTool(DYNAMIC_LIST_TOOL, { selected_api: app.selectedApi, action: best.key });
    return {
      selectedApi: app.selectedApi,
      actionKey: best.key,
      label: best.toolName || best.name || best.key,
      params: collectParams(safeParse(drill.text)),
    };
  }
}

async function executeDynamic(
  client: ZapierClient,
  target: DynamicTarget,
  platform: ZapierPlatform,
  content: string,
  mediaUrls: string[]
): Promise<{ ok: boolean; text: string }> {
  const keys = target.params.map((p) => p.key);
  const params: Record<string, unknown> = {};

  const contentKey = matchKey(keys, CONTENT_FIELD_PRIORITY);
  if (contentKey) params[contentKey] = content;

  if (mediaUrls.length > 0) {
    const mediaKey = matchKey(keys, MEDIA_FIELD_PRIORITY);
    if (mediaKey) {
      const isList = target.params.find((p) => p.key === mediaKey)?.isList ?? false;
      params[mediaKey] = isList ? mediaUrls : mediaUrls[0];
    }
  }

  return client.callTool(DYNAMIC_EXECUTE_TOOL, {
    selected_api: target.selectedApi,
    action: target.actionKey,
    instructions: buildInstructions(platform, content, mediaUrls),
    params,
    output: "The id, permalink or url of the newly created post.",
  });
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

const ID_KEYS = ["id", "post_id", "postid", "urn", "activity", "permalink_url", "permalink", "shortcode"];

function extractPostId(text: string): string | null {
  const parsed = safeParse(text);
  if (!parsed) return null;
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
  const hasDynamic = tools.some((t) => t.name === DYNAMIC_EXECUTE_TOOL);
  const catalog = hasDynamic ? new DynamicCatalog(client) : null;
  const kind = mediaKindOf(mediaUrls);

  for (const platform of platforms) {
    if (platform === "houzz") {
      results.push({ platform, success: false, error: "Houzz has no posting API — publish manually" });
      continue;
    }
    if (platform === "instagram" && mediaUrls.length === 0) {
      results.push({ platform, success: false, error: "Instagram requires at least one image or video" });
      continue;
    }

    try {
      const staticTool = pickToolForPlatform(tools, platform, kind);
      let call: { ok: boolean; text: string } | null = null;

      if (staticTool) {
        const args = buildToolArguments(staticTool, platform, content, mediaUrls);
        call = await client.callTool(staticTool.name, args);
      } else if (catalog) {
        const target = await catalog.findTarget(platform, kind);
        if (target) call = await executeDynamic(client, target, platform, content, mediaUrls);
      }

      if (!call) {
        results.push({
          platform,
          success: false,
          error: `No ${PLATFORM_CONFIG[platform].label} posting tool on your Zapier MCP server — add one at mcp.zapier.com`,
        });
      } else if (call.ok) {
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

// Connection + per-platform coverage check for the Settings page.
export async function getZapierStatus(): Promise<ZapierStatusInfo> {
  const client = new ZapierClient();
  await client.connect();
  const tools = await client.listTools();
  const hasDynamic = tools.some((t) => t.name === DYNAMIC_EXECUTE_TOOL);
  const catalog = hasDynamic ? new DynamicCatalog(client) : null;

  const coverage: Record<ZapierPlatform, string | null> = { facebook: null, instagram: null, linkedin: null };
  for (const platform of ZAPIER_PLATFORMS) {
    const kind: MediaKind = platform === "instagram" ? "image" : null;
    const staticTool = pickToolForPlatform(tools, platform, kind);
    if (staticTool) {
      coverage[platform] = staticTool.name;
    } else if (catalog) {
      coverage[platform] = (await catalog.findTarget(platform, kind))?.label ?? null;
    }
  }

  const toolCount = catalog ? await catalog.totalActionCount() : tools.length;
  return { mode: catalog ? "dynamic" : "static", toolCount, coverage };
}
