const SUPABASE_URL = "https://hdebklbhscvmdnatngkp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZWJrbGJoc2N2bWRuYXRuZ2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDgwMjAsImV4cCI6MjA5NDI4NDAyMH0.d1Xomhn9GXQt4qKpq2_9npL_eGyDyofpMXQtPdm0D7w";

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function getAccessToken() {
  const { session } = await chrome.storage.local.get("session");
  if (!session) return null;
  // Refresh if within 5 minutes of expiry
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 300) {
    return await refreshSession(session.refresh_token);
  }
  return session.access_token;
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (data.access_token) {
    await chrome.storage.local.set({ session: data });
    return data.access_token;
  }
  return null;
}

async function supabaseFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not logged in");
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(options.headers || {}),
    },
  });
}

async function getDuePosts() {
  const now = new Date().toISOString();
  const res = await supabaseFetch(
    `/rest/v1/posts?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(now)}&select=*`
  );
  if (!res.ok) return [];
  return res.json();
}

async function updatePost(id, updates) {
  await supabaseFetch(`/rest/v1/posts?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

// ── Platform tab posting ─────────────────────────────────────────────────────

const PLATFORM_URLS = {
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  linkedin: "https://www.linkedin.com/feed/",
  houzz: "https://www.houzz.com/",
};

async function postToPlatform(platform, content, mediaUrls) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: PLATFORM_URLS[platform], active: false }, (tab) => {
      const tabId = tab.id;
      let done = false;

      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          chrome.tabs.remove(tabId).catch(() => {});
          resolve({ success: false, error: "Timed out waiting for page" });
        }
      }, 30000);

      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        setTimeout(async () => {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId },
              func: injectPoster,
              args: [platform, content, mediaUrls],
            });

            clearTimeout(timeout);
            done = true;
            const result = results?.[0]?.result ?? { success: false, error: "No result" };

            // Leave tab open for a moment so user can see it, then close
            setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 3000);
            resolve(result);
          } catch (err) {
            clearTimeout(timeout);
            done = true;
            chrome.tabs.remove(tabId).catch(() => {});
            resolve({ success: false, error: err.message });
          }
        }, 2500); // wait for JS frameworks to hydrate
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// ── Injected function (runs inside the platform tab) ─────────────────────────
// This function is serialised and sent to the page — no closure access.

function injectPoster(platform, content, mediaUrls) {
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function pasteText(el, text) {
    el.focus();
    // Try clipboard event first (works in React apps)
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
    // Fallback: execCommand
    if (!el.textContent && !el.value) {
      document.execCommand("insertText", false, text);
    }
  }

  function findElement(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  async function postFacebook() {
    // Click the "What's on your mind" prompt
    const prompt = findElement([
      '[aria-label*="mind"]',
      '[aria-label*="post"]',
      'div[role="button"][tabindex="0"] span',
      '.x1i10hfl[role="button"]',
    ]);
    if (!prompt) return { success: false, error: "Could not find Facebook post prompt" };
    prompt.click();
    await sleep(1500);

    const box = findElement([
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"]',
    ]);
    if (!box) return { success: false, error: "Could not find Facebook text box" };
    pasteText(box, content);
    await sleep(800);

    const postBtn = findElement([
      '[aria-label="Post"]',
      'div[aria-label="Post"]',
      'span[aria-label="Post"]',
    ]);
    if (!postBtn) return { success: false, error: "Could not find Facebook Post button" };
    postBtn.click();
    await sleep(1000);
    return { success: true };
  }

  async function postInstagram() {
    // Instagram requires images for feed posts — copy to clipboard and guide user
    const newPostBtn = findElement([
      'svg[aria-label="New post"]',
      '[aria-label="New post"]',
      'a[href="/create/style/"]',
    ]);

    if (mediaUrls && mediaUrls.length > 0) {
      // Try to open new post dialog
      if (newPostBtn) {
        newPostBtn.closest("a, button, div[role='button']")?.click();
        await sleep(1500);
      }
      // Copy caption to clipboard for user to paste
      await navigator.clipboard.writeText(content).catch(() => {});
      return {
        success: false,
        error: "Instagram requires manual upload. Caption copied to clipboard — paste it after selecting your image.",
        manual: true,
      };
    }
    await navigator.clipboard.writeText(content).catch(() => {});
    return {
      success: false,
      error: "Instagram requires an image. Caption copied to clipboard.",
      manual: true,
    };
  }

  async function postLinkedIn() {
    const startPost = findElement([
      '[aria-label="Start a post"]',
      ".share-box-feed-entry__trigger",
      'button[aria-label*="post"]',
      ".artdeco-button--muted",
    ]);
    if (!startPost) return { success: false, error: "Could not find LinkedIn start post button" };
    startPost.click();
    await sleep(1500);

    const editor = findElement([
      ".ql-editor",
      'div[role="textbox"][contenteditable="true"]',
      'div[data-placeholder*="talk about"]',
      ".share-creation-state__text-editor div[contenteditable]",
    ]);
    if (!editor) return { success: false, error: "Could not find LinkedIn editor" };
    pasteText(editor, content);
    await sleep(800);

    const postBtn = findElement([
      ".share-actions__primary-action",
      'button[aria-label="Post"]',
      ".artdeco-button--primary",
    ]);
    if (!postBtn) return { success: false, error: "Could not find LinkedIn Post button" };
    postBtn.click();
    await sleep(1000);
    return { success: true };
  }

  async function postHouzz() {
    // Houzz community post — navigate to discussion board
    const newPost = findElement([
      'a[href*="/discussions/new"]',
      '[aria-label*="post"]',
      'button[data-component*="post"]',
    ]);
    if (newPost) {
      newPost.click();
      await sleep(1500);
      const textarea = findElement(["textarea", 'div[contenteditable="true"]', ".ql-editor"]);
      if (textarea) {
        pasteText(textarea, content);
        await sleep(500);
        const submit = findElement(['button[type="submit"]', 'button.hz-btn--primary']);
        if (submit) {
          submit.click();
          return { success: true };
        }
      }
    }
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(content).catch(() => {});
    return {
      success: false,
      error: "Houzz post area not found. Content copied to clipboard.",
      manual: true,
    };
  }

  const handlers = { facebook: postFacebook, instagram: postInstagram, linkedin: postLinkedIn, houzz: postHouzz };
  const handler = handlers[platform];
  if (!handler) return Promise.resolve({ success: false, error: `Unknown platform: ${platform}` });
  return handler();
}

// ── Main publish loop ─────────────────────────────────────────────────────────

async function processScheduledPosts() {
  const token = await getAccessToken();
  if (!token) return; // Not logged in — silently skip

  let posts;
  try {
    posts = await getDuePosts();
  } catch {
    return;
  }

  if (!posts || posts.length === 0) return;

  // Update badge
  chrome.action.setBadgeText({ text: String(posts.length) });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });

  for (const post of posts) {
    // Mark as processing immediately to avoid double-publishing
    await updatePost(post.id, { status: "published", published_at: new Date().toISOString() });

    const platformPostIds = {};
    const errors = [];

    for (const platform of post.platforms) {
      const result = await postToPlatform(platform, post.content, post.media_urls);
      if (result.success) {
        platformPostIds[platform] = "browser-posted";
      } else if (result.manual) {
        platformPostIds[platform] = "manual-required";
        errors.push(`${platform}: ${result.error}`);
      } else {
        errors.push(`${platform}: ${result.error}`);
      }
    }

    const finalStatus = errors.length === post.platforms.length ? "failed" : "published";
    await updatePost(post.id, {
      status: finalStatus,
      platform_post_ids: platformPostIds,
      error_message: errors.length > 0 ? errors.join("; ") : null,
    });

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: finalStatus === "published" ? "Post published!" : "Post partially published",
      message: errors.length > 0 ? errors[0] : `Published to ${post.platforms.join(", ")}`,
    });
  }

  chrome.action.setBadgeText({ text: "" });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.alarms.create("checkPosts", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkPosts") processScheduledPosts();
});

// Also check on install/startup
chrome.runtime.onInstalled.addListener(() => processScheduledPosts());
chrome.runtime.onStartup.addListener(() => processScheduledPosts());

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "CHECK_NOW") {
    processScheduledPosts().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "LOGIN") {
    loginUser(msg.email, msg.password).then(sendResponse);
    return true;
  }
  if (msg.type === "LOGOUT") {
    chrome.storage.local.remove("session");
    sendResponse({ ok: true });
  }
  if (msg.type === "GET_STATUS") {
    getStatus().then(sendResponse);
    return true;
  }
});

async function loginUser(email, password) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.access_token) {
      await chrome.storage.local.set({ session: data });
      return { ok: true, email: data.user?.email };
    }
    return { ok: false, error: data.error_description || "Login failed" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getStatus() {
  const { session } = await chrome.storage.local.get("session");
  if (!session) return { loggedIn: false };
  try {
    const posts = await getDuePosts();
    return { loggedIn: true, email: session.user?.email, pendingCount: posts.length };
  } catch {
    return { loggedIn: true, email: session.user?.email, pendingCount: 0 };
  }
}
