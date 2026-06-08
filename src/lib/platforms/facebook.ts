export interface FacebookPostResult {
  id: string;
  success: boolean;
  error?: string;
}

export async function postToFacebook(
  pageId: string,
  accessToken: string,
  content: string,
  mediaUrls: string[]
): Promise<FacebookPostResult> {
  try {
    if (mediaUrls.length > 0 && mediaUrls.length === 1) {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption: content,
            url: mediaUrls[0],
            access_token: accessToken,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return { id: data.id, success: true };
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          access_token: accessToken,
        }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { id: data.id, success: true };
  } catch (err) {
    return { id: "", success: false, error: (err as Error).message };
  }
}

export async function getFacebookPages(accessToken: string) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
  );
  const data = await res.json();
  return data.data ?? [];
}
