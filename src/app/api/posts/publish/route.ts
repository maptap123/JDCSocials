import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publishPostNow } from "@/lib/publish";
import { isZapierConfigured } from "@/lib/zapier";
import type { PostRow } from "@/types/database";

export const maxDuration = 120;

// Immediately publishes one of the signed-in user's posts via Zapier.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { postId?: unknown };
  const postId = typeof body.postId === "string" ? body.postId : null;
  if (!postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });

  if (!isZapierConfigured()) {
    return NextResponse.json(
      { error: "Zapier is not connected — finish setup in Settings" },
      { status: 503 }
    );
  }

  const { data: postData, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (error || !postData) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const post = postData as PostRow;
  if (post.status === "published") {
    return NextResponse.json({ error: "Post is already published" }, { status: 400 });
  }

  try {
    const outcome = await publishPostNow(supabase, post);
    return NextResponse.json(outcome);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publishing failed" },
      { status: 502 }
    );
  }
}
