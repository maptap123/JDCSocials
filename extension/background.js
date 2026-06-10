const SUPABASE_URL = "https://hdebklbhscvmdnatngkp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZWJrbGJoc2N2bWRuYXRuZ2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDgwMjAsImV4cCI6MjA5NDI4NDAyMH0.d1Xomhn9GXQt4qKpq2_9npL_eGyDyofpMXQtPdm0D7w";

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function getAccessToken() {
  const { session } = await chrome.storage.local.get("session");
  if (!session) return null;
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

// Fetch page URLs saved in Settings — falls back to personal feed if not set
async function getPageUrls() {
  try {
    const res = await supabaseFetch(
      `/rest/v1/social_settings?select=facebook_page_url,linkedin_company_url&limit=1`,
      { headers: { Prefer: "return=representation" } }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    return rows[0] ?? {};
  } catch {
    return {};
  }
}

// ── Platform tab posting ─────────────────────────────────────────────────────

const DEFAULT_URLS = {
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  linkedin: "https://www.linkedin.com/feed/",
  houzz: "https://www.houzz.com/",
};

function buildPlatformUrls(pageSettings) {
  return {
    facebook: pageSettings.facebook_page_url || DEFAULT_URLS.facebook,
    instagram: DEFAULT_URLS.instagram,
    // LinkedIn company admin post page
    linkedin: pageSettings.linkedin_company_url
      ? `${pageSettings.linkedin_company_url.replace(/\/$/, "")}/admin/`
      : DEFAULT_URLS.linkedin,
    houzz: DEFAULT_URLS.houzz,
  };
}

async function postToPlatform(platform, content, mediaUrls, platformUrls) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: platformUrls[platform], active: false }, (tab) => {
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

            setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 3000);
            resolve(result);
          } catch (err) {
            clearTimeout(timeout);
            done = true;
            chrome.tabs.remove(tabId).catch(() => {});
            resolve({ success: false, error: err.message });
          }
        }, 2500);
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// ── Injected function (runs inside the platform tab) ─────────────────────────

function injectPoster(platform, content, mediaUrls) {
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function pasteText(el, text) {
    el.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
    if (!el.textContent && !el.value) {
      document.execCommand("insertText", false, text);
    }
  }

  function findElement(selectors, root) {
    const ctx = root || document;
    for (const sel of selectors) {
      try {
        const el = ctx.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  async function waitForElement(selectors, maxMs, root) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const el = findElement(selectors, root);
      if (el) return el;
      await sleep(300);
    }
    return null;
  }

  async function postFacebook() {
    // Try to find and click the "What's on your mind" composer trigger
    const prompt = findElement([
      '[aria-label*="mind"]',
      '[aria-label*="Write something"]',
      '[aria-label*="on your mind"]',
      '[placeholder*="mind"]',
      '[role="button"][tabindex="0"]',
      '.x1i10hfl[role="button"]',
    ]);
    if (!prompt) return { success: false, error: "Could not find Facebook post prompt" };
    prompt.click();

    // Wait up to 6s for a Lexical editor to appear anywhere on the page
    // (don't restrict to modal — it may be inline on business pages)
    const box = await waitForElement([
      'div[data-lexical-editor="true"]',
      'div[contenteditable="true"][data-lexical-editor]',
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"]',
    ], 6000);
    if (!box) return { success: false, error: "Could not find Facebook text box" };

    box.click();
    await sleep(400);
    pasteText(box, content);
    await sleep(1200);

    // Post button — search whole document in case it's outside the modal
    const postBtn = await waitForElement([
      '[aria-label="Post"]',
      'div[aria-label="Post"]',
      'span[aria-label="Post"]',
      'div[role="button"][aria-label="Post"]',
    ], 5000);
    if (!postBtn) return { success: false, error: "Could not find Facebook Post button" };
    postBtn.click();
    await sleep(2000);
    return { success: true };
  }

  async function postInstagram() {
    const newPostBtn = findElement([
      'svg[aria-label="New post"]',
      '[aria-label="New post"]',
      'a[href="/create/style/"]',
    ]);

    if (mediaUrls && mediaUrls.length > 0) {
      if (newPostBtn) {
        newPostBtn.closest("a, button, div[role='button']")?.click();
        await sleep(1500);
      }
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
    const startPost = await waitForElement([
      'button[aria-label="Start a post"]',
      '[aria-label="Start a post"]',
      '[aria-label="Create a post"]',
      ".share-box-feed-entry__trigger",
      ".share-box-feed-entry__trigger-kicker",
      "button.share-creation-state__placeholder",
      ".artdeco-button--muted",
    ], 6000);
    if (!startPost) return { success: false, error: "Could not find LinkedIn start post button" };
    startPost.click();

    // Poll for editor anywhere on the page — don't restrict to modal root
    const editor = await waitForElement([
      '.ql-editor[contenteditable="true"]',
      '.ql-editor',
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"]',
    ], 6000);
    if (!editor) return { success: false, error: "Could not find LinkedIn editor" };

    editor.click();
    await sleep(400);
    pasteText(editor, content);
    await sleep(1200);

    const postBtn = await waitForElement([
      ".share-actions__primary-action",
      'button[aria-label="Post"]',
      'button.share-actions__primary-action',
      ".artdeco-button--primary[aria-label='Post']",
      ".artdeco-button--primary",
    ], 5000);
    if (!postBtn) return { success: false, error: "Could not find LinkedIn Post button" };
    postBtn.click();
    await sleep(2000);
    return { success: true };
  }

  async function postHouzz() {
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
  if (!token) return;

  let posts;
  try {
    posts = await getDuePosts();
  } catch {
    return;
  }

  if (!posts || posts.length === 0) return;

  const pageSettings = await getPageUrls();
  const platformUrls = buildPlatformUrls(pageSettings);

  chrome.action.setBadgeText({ text: String(posts.length) });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });

  for (const post of posts) {
    await updatePost(post.id, { status: "published", published_at: new Date().toISOString() });

    const platformPostIds = {};
    const errors = [];

    for (const platform of post.platforms) {
      const result = await postToPlatform(platform, post.content, post.media_urls, platformUrls);
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

chrome.runtime.onInstalled.addListener(() => processScheduledPosts());
chrome.runtime.onStartup.addListener(() => processScheduledPosts());

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
