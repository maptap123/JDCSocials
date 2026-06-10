// Injected into platform tabs during setup recording.
// Guides user through clicking: compose trigger → text editor → post button.
// Communicates back via chrome.runtime.sendMessage.

(function () {
  if (window.__jdcRecorderActive) return;
  window.__jdcRecorderActive = true;

  const platform =
    window.location.hostname.includes("facebook") ? "facebook" :
    window.location.hostname.includes("linkedin") ? "linkedin" : "unknown";

  const steps = [
    { key: "composeTrigger", label: "Click the button that opens the post composer (e.g. \"What's on your mind?\" or \"Start a post\")" },
    { key: "textEditor",     label: "Click inside the text area where you type your post" },
    { key: "postButton",     label: "Click the Post / Share button to submit (you can type something first so it becomes active)" },
  ];

  let currentStep = 0;
  let highlighted = null;

  // ── Banner ────────────────────────────────────────────────────────────────

  const banner = document.createElement("div");
  banner.id = "__jdc_recorder_banner";
  banner.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
    "background:#4f46e5", "color:white", "padding:12px 16px",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:14px", "display:flex", "align-items:center", "gap:12px",
    "box-shadow:0 2px 12px rgba(0,0,0,0.25)",
  ].join(";");
  document.documentElement.appendChild(banner);

  function renderBanner() {
    if (currentStep >= steps.length) {
      banner.innerHTML = "<span>✓ Recording complete — you can close this tab.</span>";
      banner.style.background = "#16a34a";
      cleanup();
      return;
    }
    const s = steps[currentStep];
    banner.innerHTML = `
      <span style="background:rgba(255,255,255,0.25);padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px;white-space:nowrap">
        Step ${currentStep + 1} / ${steps.length}
      </span>
      <span style="flex:1">${s.label}</span>
      <button id="__jdc_cancel_btn" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap">
        Cancel
      </button>
    `;
    document.getElementById("__jdc_cancel_btn").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "RECORDER_CANCELLED", platform });
      cleanup();
    });
  }

  // ── Hover highlight ───────────────────────────────────────────────────────

  function onMouseOver(e) {
    if (banner.contains(e.target)) return;
    if (highlighted && highlighted !== e.target) {
      highlighted.style.outline = highlighted.__jdcOldOutline || "";
    }
    highlighted = e.target;
    highlighted.__jdcOldOutline = highlighted.style.outline;
    highlighted.style.outline = "2px solid #6366f1";
  }

  function onMouseOut(e) {
    if (highlighted && !banner.contains(e.target)) {
      highlighted.style.outline = highlighted.__jdcOldOutline || "";
      highlighted = null;
    }
  }

  // ── Selector generator ────────────────────────────────────────────────────

  function getBestSelector(el) {
    // Prefer stable semantic attributes
    const label = el.getAttribute("aria-label");
    if (label) return `[aria-label="${label.replace(/"/g, '\\"')}"]`;

    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${testId}"]`;

    if (el.id && !/^\d/.test(el.id)) return `#${CSS.escape(el.id)}`;

    const role = el.getAttribute("role");
    const contenteditable = el.getAttribute("contenteditable");
    if (contenteditable === "true") {
      return role ? `[role="${role}"][contenteditable="true"]` : `[contenteditable="true"]`;
    }
    if (role) return `[role="${role}"]`;

    // Tag + class fallback (fragile but last resort)
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList).slice(0, 2).join(".");
    return cls ? `${tag}.${cls}` : tag;
  }

  // ── Click capture ─────────────────────────────────────────────────────────

  function onClick(e) {
    if (banner.contains(e.target)) return;

    // Don't preventDefault on step 0 (compose trigger) — let the click open the composer
    // Don't preventDefault on step 2 (post button) — let the post actually submit
    if (currentStep === 1) e.preventDefault();

    const sel = getBestSelector(e.target);
    const key = steps[currentStep].key;

    chrome.runtime.sendMessage({ type: "RECORDER_STEP", platform, key, selector: sel });

    if (highlighted) {
      highlighted.style.outline = highlighted.__jdcOldOutline || "";
      highlighted = null;
    }

    currentStep++;
    renderBanner();
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  function cleanup() {
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    if (highlighted) highlighted.style.outline = highlighted.__jdcOldOutline || "";
    setTimeout(() => banner.remove(), currentStep >= steps.length ? 2000 : 0);
    window.__jdcRecorderActive = false;
  }

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);

  renderBanner();
})();
