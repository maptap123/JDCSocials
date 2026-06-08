import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { postToFacebook } from "@/lib/platforms/facebook";
import { postToInstagram } from "@/lib/platforms/instagram";
import { postToLinkedIn } from "@/lib/platforms/linkedin";
import type { PostRow, ConnectedAccountRow, Platform } from "@/types/database";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  for (const post of duePosts) {
    const platformPostIds: Record<string, string> = {};
    const errors: string[] = [];

    for (const platform of post.platforms as Platform[]) {
      const { data: accData } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", post.user_id)
        .eq("platform", platform)
        .eq("is_active", true)
        .single();
      const acc = accData as ConnectedAccountRow | null;

      if (!acc) {
        errors.push(`No connected ${platform} account`);
        continue;
      }

      if (platform === "facebook") {
        const result = await postToFacebook(acc.page_id ?? acc.account_id, acc.access_token, post.content, post.media_urls);
        if (result.success) platformPostIds[platform] = result.id;
        else errors.push(`Facebook: ${result.error}`);
      } else if (platform === "instagram") {
        const result = await postToInstagram(acc.account_id, acc.access_token, post.content, post.media_urls);
        if (result.success) platformPostIds[platform] = result.id;
        else errors.push(`Instagram: ${result.error}`);
      } else if (platform === "linkedin") {
        const orgUrn = acc.page_id ?? `urn:li:person:${acc.account_id}`;
        const result = await postToLinkedIn(orgUrn, acc.access_token, post.content);
        if (result.success) platformPostIds[platform] = result.id;
        else errors.push(`LinkedIn: ${result.error}`);
      }
    }

    const hasSuccess = Object.keys(platformPostIds).length > 0;
    await supabase
      .from("posts")
      .update({
        status: errors.length > 0 && !hasSuccess ? "failed" : "published",
        published_at: new Date().toISOString(),
        platform_post_ids: platformPostIds,
        error_message: errors.length > 0 ? errors.join("; ") : null,
      })
      .eq("id", post.id);

    if (hasSuccess) published++;
  }

  return NextResponse.json({ published, total: duePosts.length });
}
