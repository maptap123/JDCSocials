import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZapierStatus, isZapierConfigured } from "@/lib/zapier";

export const maxDuration = 60;

const EMPTY_COVERAGE = { facebook: null, instagram: null, linkedin: null };

// Reports whether the Zapier MCP server is reachable and which platforms have
// a posting tool configured. Drives the Settings page status card.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isZapierConfigured()) {
    return NextResponse.json({ configured: false, connected: false, toolCount: 0, coverage: EMPTY_COVERAGE });
  }

  try {
    const status = await getZapierStatus();
    return NextResponse.json({
      configured: true,
      connected: true,
      mode: status.mode,
      toolCount: status.toolCount,
      coverage: status.coverage,
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message : "Could not reach Zapier",
      toolCount: 0,
      coverage: EMPTY_COVERAGE,
    });
  }
}
