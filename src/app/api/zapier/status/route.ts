import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isZapierConfigured, pickToolForPlatform, ZapierClient } from "@/lib/zapier";

export const maxDuration = 60;

const EMPTY_COVERAGE = { facebook: null, instagram: null, linkedin: null };

// Reports whether the Zapier MCP server is reachable and which platforms have
// a posting tool configured. Drives the Settings page status card.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isZapierConfigured()) {
    return NextResponse.json({ configured: false, connected: false, tools: [], coverage: EMPTY_COVERAGE });
  }

  try {
    const client = new ZapierClient();
    await client.connect();
    const tools = await client.listTools();
    const coverage = {
      facebook:
        pickToolForPlatform(tools, "facebook", false)?.name ??
        pickToolForPlatform(tools, "facebook", true)?.name ??
        null,
      instagram: pickToolForPlatform(tools, "instagram", true)?.name ?? null,
      linkedin: pickToolForPlatform(tools, "linkedin", false)?.name ?? null,
    };
    return NextResponse.json({
      configured: true,
      connected: true,
      tools: tools.map((t) => t.name),
      coverage,
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message : "Could not reach Zapier",
      tools: [],
      coverage: EMPTY_COVERAGE,
    });
  }
}
