export interface LinkedInPostResult {
  id: string;
  success: boolean;
  error?: string;
}

export async function postToLinkedIn(
  orgUrn: string,
  accessToken: string,
  content: string
): Promise<LinkedInPostResult> {
  try {
    const body = {
      author: orgUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? "LinkedIn API error");
    }
    const postId = res.headers.get("x-restli-id") ?? "";
    return { id: postId, success: true };
  } catch (err) {
    return { id: "", success: false, error: (err as Error).message };
  }
}
