const loginView = document.getElementById("view-login");
const statusView = document.getElementById("view-status");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

const statusEmail = document.getElementById("status-email");
const pendingNum = document.getElementById("pending-num");
const platformList = document.getElementById("platform-list");
const configureList = document.getElementById("configure-list");
const checkNowBtn = document.getElementById("check-now-btn");
const logoutBtn = document.getElementById("logout-btn");
const instagramNote = document.getElementById("instagram-note");

const RECORDABLE = ["facebook", "linkedin"];
const PLATFORM_LABELS = { facebook: "🔵 Facebook", instagram: "🟣 Instagram", linkedin: "🔷 LinkedIn", houzz: "🟢 Houzz" };
const PLATFORM_URLS = { facebook: "https://www.facebook.com/", linkedin: "https://www.linkedin.com/feed/" };

function showView(name) {
  loginView.classList.toggle("active", name === "login");
  statusView.classList.toggle("active", name === "status");
}

async function getRecorded() {
  const { recordedSelectors } = await chrome.storage.local.get("recordedSelectors");
  return recordedSelectors || {};
}

async function loadStatus() {
  const resp = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  if (!resp.loggedIn) { showView("login"); return; }

  showView("status");
  statusEmail.textContent = resp.email || "—";
  pendingNum.textContent = resp.pendingCount ?? 0;

  // Platform rows
  platformList.innerHTML = "";
  ["facebook", "instagram", "linkedin", "houzz"].forEach((p) => {
    const row = document.createElement("div");
    row.className = "platform-row";
    const isClipboard = p === "instagram" || p === "houzz";
    row.innerHTML = `
      <span class="dot ${isClipboard ? "dot-warn" : "dot-ok"}"></span>
      <span>${PLATFORM_LABELS[p]}</span>
      <span style="margin-left:auto;font-size:11px;color:#6b7280">${isClipboard ? "clipboard" : "auto"}</span>
    `;
    platformList.appendChild(row);
  });

  instagramNote.style.display = "block";

  // Configure rows
  const recorded = await getRecorded();
  configureList.innerHTML = "";
  RECORDABLE.forEach((p) => {
    const isConfigured = recorded[p]?.composeTrigger && recorded[p]?.textEditor;
    const row = document.createElement("div");
    row.className = "configure-row";
    row.innerHTML = `
      <div>
        <div class="plabel">${PLATFORM_LABELS[p]}</div>
        <div class="pstatus ${isConfigured ? "ok" : "warn"}">
          ${isConfigured ? "✓ Configured" : "⚠ Not configured — posts may fail"}
        </div>
      </div>
      <button class="btn-sm" data-platform="${p}">
        ${isConfigured ? "Re-record" : "Configure"}
      </button>
    `;
    row.querySelector("button").addEventListener("click", () => startRecording(p));
    configureList.appendChild(row);
  });
}

async function startRecording(platform) {
  const resp = await chrome.runtime.sendMessage({ type: "START_RECORDING", platform });
  if (resp?.ok) window.close(); // Close popup so tab is visible
}

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in…";
  loginError.style.display = "none";

  const resp = await chrome.runtime.sendMessage({ type: "LOGIN", email, password });
  loginBtn.disabled = false;
  loginBtn.textContent = "Sign in";

  if (resp.ok) {
    await loadStatus();
  } else {
    loginError.textContent = resp.error || "Login failed";
    loginError.style.display = "block";
  }
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

checkNowBtn.addEventListener("click", async () => {
  checkNowBtn.disabled = true;
  checkNowBtn.textContent = "Publishing…";
  await chrome.runtime.sendMessage({ type: "CHECK_NOW" });
  checkNowBtn.disabled = false;
  checkNowBtn.textContent = "Check & Publish Now";
  await loadStatus();
});

logoutBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  showView("login");
});

loadStatus();
