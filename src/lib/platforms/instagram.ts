export interface InstagramPostResult {
  id: string;
  success: boolean;
  error?: string;
}

export async function postToInstagram(
  igUserId: string,
  accessToken: string,
  content: string,
  mediaUrls: string[]
): Promise<InstagramPostResult> {
  try {
    if (mediaUrls.length === 0) {
      return { id: "", success: false, error: "Instagram requires at least one image or video." };
    }

    const mediaRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: mediaUrls[0],
          caption: content,
          access_token: accessToken,
        }),
      }
    );
    const mediaData = await mediaRes.json();
    if (mediaData.error) throw new Error(mediaData.error.message);

    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: mediaData.id,
          access_token: accessToken,
        }),
      }
    );
    const publishData = await publishRes.json();
    if (publishData.error) throw new Error(publishData.error.message);
    return { id: publishData.id, success: true };
  } catch (err) {
    return { id: "", success: false, error: (err as Error).message };
  }
}
