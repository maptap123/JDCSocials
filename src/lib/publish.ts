import type { SupabaseClient } from "@supabase/supabase-js";
import { publishToPlatforms, type PlatformPublishResult } from "@/lib/zapier";
import { PLATFORM_CONFIG } from "@/lib/platforms";
import type { Platform, PostRow } from "@/types/database";

export interface PublishOutcome {
  results: PlatformPublishResult[];
  anySuccess: boolean;
  errors: string[];
}

// Publishes a post through Zapier and records the outcome on the row.
// `supabase` may be the service-role client (cron) or the user's session client
// (publish-now route) — both can update the posts table for their scope.
export async function publishPostNow(supabase: SupabaseClient, post: PostRow): Promise<PublishOutcome> {
  const alreadyPosted: Record<string, string> = post.platform_post_ids ?? {};
  // Skip platforms that already have a post id so retries never double-post.
  const pending = (post.platforms as Platform[]).filter((p) => !alreadyPosted[p]);

  const results = pending.length > 0 ? await publishToPlatforms(pending, post.content, post.media_urls ?? []) : [];

  const platformPostIds: Record<string, string> = { ...alreadyPosted };
  const errors: string[] = [];
  for (const result of results) {
    if (result.success && result.id) {
      platformPostIds[result.platform] = result.id;
    } else if (!result.success) {
      errors.push(`${PLATFORM_CONFIG[result.platform].label}: ${result.error}`);
    }
  }

  const anySuccess = Object.keys(platformPostIds).length > 0;

  await supabase
    .from("posts")
    .update({
      status: anySuccess ? "published" : "failed",
      published_at: anySuccess ? post.published_at ?? new Date().toISOString() : null,
      platform_post_ids: platformPostIds,
      error_message: errors.length > 0 ? errors.join("; ") : null,
    })
    .eq("id", post.id);

  return { results, anySuccess, errors };
}
