import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publishPostNow } from "@/lib/publish";
import { isZapierConfigured } from "@/lib/zapier";
import type { PostRow } from "@/types/database";

// Zapier actions can take several seconds each; allow time for a batch.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isZapierConfigured()) {
    // Leave due posts scheduled instead of failing them before Zapier is set up.
    return NextResponse.json({ published: 0, warning: "ZAPIER_MCP_URL is not set — skipping publish run" });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const now = new Date().toISOString();
  const { data: postsData, error } = await supabase
    .from("posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const duePosts = (postsData ?? []) as PostRow[];
  if (duePosts.length === 0) return NextResponse.json({ published: 0 });

  let published = 0;
  let failed = 0;
  let retried = 0;

  for (const post of duePosts) {
    try {
      const outcome = await publishPostNow(supabase, post);
      if (outcome.anySuccess) published++;
      else failed++;
    } catch {
      // Zapier was unreachable — keep the post scheduled and retry next run.
      retried++;
    }
  }

  return NextResponse.json({ published, failed, retrying: retried, total: duePosts.length });
}
