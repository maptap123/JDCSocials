const loginView = document.getElementById("view-login");
const statusView = document.getElementById("view-status");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

const statusEmail = document.getElementById("status-email");
const pendingNum = document.getElementById("pending-num");
const platformList = document.getElementById("platform-list");
const checkNowBtn = document.getElementById("check-now-btn");
const logoutBtn = document.getElementById("logout-btn");
const instagramNote = document.getElementById("instagram-note");

const PLATFORM_ICONS = {
  facebook: "🔵",
  instagram: "🟣",
  linkedin: "🔷",
  houzz: "🟢",
};

function showView(name) {
  loginView.classList.toggle("active", name === "login");
  statusView.classList.toggle("active", name === "status");
}

async function loadStatus() {
  const resp = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  if (!resp.loggedIn) {
    showView("login");
    return;
  }
  showView("status");
  statusEmail.textContent = resp.email || "—";
  pendingNum.textContent = resp.pendingCount ?? 0;

  // Show platform rows
  platformList.innerHTML = "";
  const platforms = ["facebook", "instagram", "linkedin", "houzz"];
  platforms.forEach((p) => {
    const row = document.createElement("div");
    row.className = "platform-row";
    const isInstagram = p === "instagram";
    row.innerHTML = `
      <span class="dot ${isInstagram ? "dot-warn" : "dot-ok"}"></span>
      <span>${PLATFORM_ICONS[p]} ${p.charAt(0).toUpperCase() + p.slice(1)}</span>
      <span style="margin-left:auto;font-size:11px;color:#6b7280">${isInstagram ? "clipboard" : "auto"}</span>
    `;
    platformList.appendChild(row);
  });

  instagramNote.style.display = "block";
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

// Init
loadStatus();
