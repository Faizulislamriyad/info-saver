// app.js — Info Saver client-ledger logic (clients, sharing, users directory)

import { auth, googleProvider, db } from "./firebase-config.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/* ---------------- DOM refs: shell ---------------- */
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");
const toast = document.getElementById("toast");

const themeToggleBtns = [
  document.getElementById("theme-toggle"),
  document.getElementById("theme-toggle-login"),
].filter(Boolean);

/* ---------------- DOM refs: tabs ---------------- */
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = {
  mine: document.getElementById("tab-mine"),
  shared: document.getElementById("tab-shared"),
  users: document.getElementById("tab-users"),
};
const incomingBadge = document.getElementById("incoming-badge");
const allowShareToggle = document.getElementById("allow-share-toggle");

/* ---------------- DOM refs: My Client tab ---------------- */
const statClients = document.getElementById("stat-clients");
const statProjects = document.getElementById("stat-projects");
const statIncome = document.getElementById("stat-income");
const clientGrid = document.getElementById("client-grid");
const emptyState = document.getElementById("empty-state");
const clientCount = document.getElementById("client-count");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const addClientBtn = document.getElementById("add-client-btn");

/* ---------------- DOM refs: Shared tab ---------------- */
const incomingRequestsList = document.getElementById("incoming-requests-list");
const incomingEmpty = document.getElementById("incoming-empty");
const sentRequestsList = document.getElementById("sent-requests-list");
const sentEmpty = document.getElementById("sent-empty");
const sharedGrid = document.getElementById("shared-grid");
const sharedEmptyState = document.getElementById("shared-empty-state");
const sharedCount = document.getElementById("shared-count");
const sharedSearchInput = document.getElementById("shared-search-input");
const sharedStatusFilter = document.getElementById("shared-status-filter");

/* ---------------- DOM refs: Users tab ---------------- */
const usersList = document.getElementById("users-list");
const usersEmptyState = document.getElementById("users-empty-state");
const usersCount = document.getElementById("users-count");
const usersSearchInput = document.getElementById("users-search-input");

/* ---------------- DOM refs: client form ---------------- */
const formOverlay = document.getElementById("form-overlay");
const clientForm = document.getElementById("client-form");
const formTitle = document.getElementById("form-title");
const formSharedNote = document.getElementById("form-shared-note");
const closeFormBtn = document.getElementById("close-form-btn");
const cancelFormBtn = document.getElementById("cancel-form-btn");
const deleteClientBtn = document.getElementById("delete-client-btn");
const shareFromFormField = document.getElementById("share-from-form-field");
const shareFromFormBtn = document.getElementById("share-from-form-btn");

const fIdInput = document.getElementById("client-id");
const fProjectStart = document.getElementById("f-project-start");
const fDeliveryTime = document.getElementById("f-delivery-time");
const fClientName = document.getElementById("f-client-name");
const fBrandName = document.getElementById("f-brand-name");
const fFoundFrom = document.getElementById("f-found-from");
const fFoundFromCustom = document.getElementById("f-found-from-custom");
const fPhone = document.getElementById("f-phone");
const fWhatsapp = document.getElementById("f-whatsapp");
const fbPageList = document.getElementById("fb-page-list");
const addFbPageBtn = document.getElementById("add-fb-page-btn");
const fWebsite = document.getElementById("f-website");
const projectList = document.getElementById("project-list");
const addProjectBtn = document.getElementById("add-project-btn");
const projectBlockTemplate = document.getElementById("project-block-template");
const fPaymentMethod = document.getElementById("f-payment-method");
const fPaymentMethodCustom = document.getElementById("f-payment-method-custom");
const fStatus = document.getElementById("f-status");
const fNote = document.getElementById("f-note");

/* ---------------- DOM refs: brand logo ---------------- */
const brandLogoBtn = document.getElementById("brand-logo-btn");
const brandLogoImg = document.getElementById("brand-logo-img");
const brandLogoPlus = document.getElementById("brand-logo-plus");
const brandLogoClear = document.getElementById("brand-logo-clear");
const fBrandLogo = document.getElementById("f-brand-logo");

/* ---------------- DOM refs: share modal ---------------- */
const shareOverlay = document.getElementById("share-overlay");
const shareForm = document.getElementById("share-form");
const shareClientSelect = document.getElementById("share-client-select");
const shareUserSelect = document.getElementById("share-user-select");
const shareFormHint = document.getElementById("share-form-hint");
const closeShareBtn = document.getElementById("close-share-btn");
const cancelShareBtn = document.getElementById("cancel-share-btn");

/* ---------------- State ---------------- */
let currentUser = null;
let activeTab = "mine";

let unsubClients = null;
let unsubUsers = null;
let unsubIncoming = null;
let unsubSent = null;
let unsubOwnUser = null;
let suppressToggleEvent = false;

let allClients = []; // clients where I'm a member (owner or accepted collaborator)
let allUsers = []; // every other user who has signed in
let incomingRequests = []; // pending requests sent to me
let sentRequests = []; // requests I've sent (any status)

let brandLogoData = ""; // data URL of the current form's brand logo ("" = none)
let lastAutoProjectStart = ""; // last value we auto-pushed into Project 1's start date

/* ---------------- Theme (day / night) ---------------- */
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("infosaver-theme", theme);
}

themeToggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    applyTheme(isLight ? "dark" : "light");
  });
});

/* =========================================================
   DATE HELPERS — store ISO (yyyy-mm-dd), show dd/mm/yyyy
   ========================================================= */
const DATE_MAX_YEARS_PAST = 5;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** ISO (yyyy-mm-dd) → display (dd/mm/yyyy). Returns "" if not an ISO date. */
function isoToDisplay(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** display (dd/mm/yyyy) → ISO (yyyy-mm-dd). Returns null when invalid. */
function displayToIso(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** The oldest date the user is allowed to pick (5 years back). */
function earliestAllowedIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - DATE_MAX_YEARS_PAST);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Returns an error message if the ISO date is out of the allowed range. */
function dateRangeError(iso) {
  const min = earliestAllowedIso();
  if (iso < min) {
    return `Dates can't be older than ${DATE_MAX_YEARS_PAST} years (earliest ${isoToDisplay(min)}).`;
  }
  return "";
}

/** Adds dd/mm/yyyy auto-slashing + blur validation to a text date input. */
function wireDateInput(input) {
  if (!input || input.dataset.dateWired === "1") return;
  input.dataset.dateWired = "1";
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("autocomplete", "off");

  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    let out = digits.slice(0, 2);
    if (digits.length > 2) out += "/" + digits.slice(2, 4);
    if (digits.length > 4) out += "/" + digits.slice(4, 8);
    input.value = out;
  });

  input.addEventListener("blur", () => {
    const raw = input.value.trim();
    if (!raw) return;
    const iso = displayToIso(raw);
    if (!iso) {
      showToast("Use dd/mm/yyyy for dates.");
      return;
    }
    const err = dateRangeError(iso);
    if (err) showToast(err);
    input.value = isoToDisplay(iso);
  });
}

/**
 * Reads + validates a date input, returning ISO (or "" when empty).
 * Throws a friendly Error when the value is invalid.
 */
function readDateInput(input, label, { required = false } = {}) {
  const raw = input.value.trim();
  if (!raw) {
    if (required) throw new Error(`${label} is required.`);
    return "";
  }
  const iso = displayToIso(raw);
  if (!iso) throw new Error(`Use dd/mm/yyyy for ${label}.`);
  const err = dateRangeError(iso);
  if (err) throw new Error(err);
  input.value = isoToDisplay(iso);
  return iso;
}

// The two top-level date fields live outside the project blocks.
wireDateInput(fProjectStart);
wireDateInput(fDeliveryTime);

/* ---------------- Auth ---------------- */
googleLoginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    showToast("Sign-in failed: " + err.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    userName.textContent = user.displayName || user.email || "User";
    userPhoto.src = user.photoURL || "";

    await ensureUserProfile(user);
    subscribeToOwnUser(user.uid);
    subscribeToClients(user.uid);
    subscribeToUsers(user.uid);
    subscribeToIncoming(user.uid);
    subscribeToSent(user.uid);
  } else {
    loginScreen.classList.remove("hidden");
    appShell.classList.add("hidden");
    [unsubClients, unsubUsers, unsubIncoming, unsubSent, unsubOwnUser].forEach((fn) => fn && fn());
    allClients = [];
    allUsers = [];
    incomingRequests = [];
    sentRequests = [];
    renderMine();
    renderShared();
    renderUsers();
    renderIncoming();
    renderSent();
  }
});

/* ---------------- User profile (users/{uid}) ---------------- */
async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      name: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      allowShareRequests: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      ref,
      {
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

function subscribeToOwnUser(uid) {
  if (unsubOwnUser) unsubOwnUser();
  unsubOwnUser = onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    suppressToggleEvent = true;
    allowShareToggle.checked = snap.data().allowShareRequests !== false;
    suppressToggleEvent = false;
  });
}

allowShareToggle.addEventListener("change", async () => {
  if (suppressToggleEvent || !currentUser) return;
  try {
    await setDoc(
      doc(db, "users", currentUser.uid),
      { allowShareRequests: allowShareToggle.checked, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    showToast("Couldn't update your setting: " + err.message);
  }
});

/* ---------------- Tabs ---------------- */
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

function setActiveTab(tab) {
  activeTab = tab;
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  Object.entries(tabPanels).forEach(([key, panel]) => panel.classList.toggle("hidden", key !== tab));
}

/* ---------------- Firestore subscriptions ---------------- */
function subscribeToClients(uid) {
  if (unsubClients) unsubClients();
  const q = query(collection(db, "clients"), where("members", "array-contains", uid));
  unsubClients = onSnapshot(
    q,
    (snapshot) => {
      allClients = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      allClients.sort((a, b) => (b.projectStart || "").localeCompare(a.projectStart || ""));
      renderMine();
      renderShared();
      refreshShareClientOptions();
    },
    (err) => showToast("Couldn't load clients: " + err.message)
  );
}

function subscribeToUsers(uid) {
  if (unsubUsers) unsubUsers();
  const q = query(collection(db, "users"));
  unsubUsers = onSnapshot(
    q,
    (snapshot) => {
      allUsers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.id !== uid);
      renderUsers();
      refreshShareUserOptions();
    },
    (err) => showToast("Couldn't load users: " + err.message)
  );
}

function subscribeToIncoming(uid) {
  if (unsubIncoming) unsubIncoming();
  const q = query(collection(db, "shareRequests"), where("toUid", "==", uid), where("status", "==", "pending"));
  unsubIncoming = onSnapshot(
    q,
    (snapshot) => {
      incomingRequests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderIncoming();
    },
    (err) => showToast("Couldn't load requests: " + err.message)
  );
}

function subscribeToSent(uid) {
  if (unsubSent) unsubSent();
  const q = query(collection(db, "shareRequests"), where("fromUid", "==", uid));
  unsubSent = onSnapshot(
    q,
    (snapshot) => {
      sentRequests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      sentRequests.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderSent();
    },
    (err) => showToast("Couldn't load sent requests: " + err.message)
  );
}

/* ---------------- Dashboard stats (My Client) ---------------- */
function updateStats(mineClients) {
  let totalProjects = 0;
  let totalIncome = 0;
  for (const c of mineClients) {
    const projects = c.projects || [];
    totalProjects += projects.length;
    for (const p of projects) totalIncome += Number(p.payment) || 0;
  }
  statClients.textContent = mineClients.length.toLocaleString("en-US");
  statProjects.textContent = totalProjects.toLocaleString("en-US");
  statIncome.textContent = totalIncome.toLocaleString("en-US");
}

/* ---------------- Rendering: My Client ---------------- */
function renderMine() {
  if (!currentUser) {
    clientGrid.innerHTML = "";
    emptyState.classList.add("hidden");
    updateStats([]);
    return;
  }
  const mine = allClients.filter((c) => c.ownerUid === currentUser.uid);
  updateStats(mine);

  const term = searchInput.value.trim().toLowerCase();
  const statusVal = statusFilter.value;
  const filtered = filterClients(mine, term, statusVal);

  clientCount.textContent = `${mine.length} entries`;
  clientGrid.innerHTML = "";
  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  for (const c of filtered) clientGrid.appendChild(buildClientCard(c, false));
}
searchInput.addEventListener("input", renderMine);
statusFilter.addEventListener("change", renderMine);

/* ---------------- Rendering: Shared ---------------- */
function renderShared() {
  if (!currentUser) {
    sharedGrid.innerHTML = "";
    sharedEmptyState.classList.add("hidden");
    sharedCount.textContent = "0 entries";
    return;
  }
  const shared = allClients.filter((c) => c.ownerUid !== currentUser.uid);

  const term = sharedSearchInput.value.trim().toLowerCase();
  const statusVal = sharedStatusFilter.value;
  const filtered = filterClients(shared, term, statusVal);

  sharedCount.textContent = `${shared.length} entries`;
  sharedGrid.innerHTML = "";
  if (filtered.length === 0) {
    sharedEmptyState.classList.remove("hidden");
    return;
  }
  sharedEmptyState.classList.add("hidden");
  for (const c of filtered) sharedGrid.appendChild(buildClientCard(c, true));
}
sharedSearchInput.addEventListener("input", renderShared);
sharedStatusFilter.addEventListener("change", renderShared);

function filterClients(list, term, statusVal) {
  return list.filter((c) => {
    const matchesTerm =
      !term ||
      (c.clientName || "").toLowerCase().includes(term) ||
      (c.brandName || "").toLowerCase().includes(term) ||
      (c.phone || "").toLowerCase().includes(term);
    const matchesStatus = statusVal === "all" || c.status === statusVal;
    return matchesTerm && matchesStatus;
  });
}

function buildClientCard(c, isShared) {
  const card = document.createElement("div");
  card.className = "client-card";
  card.addEventListener("click", () => openForm(c));

  const statusLabel = statusLabelOf(c.status);
  const projects = c.projects || [];
  const projectIncome = projects.reduce((sum, p) => sum + (Number(p.payment) || 0), 0);
  const sharedByLine = isShared
    ? `<div class="card-shared-by">Shared by ${escapeHtml(c.ownerName || "another user")}</div>`
    : "";
  const logoHtml = c.brandLogo
    ? `<img class="card-logo" src="${escapeHtml(c.brandLogo)}" alt="" />`
    : "";

  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-name-row">
          ${logoHtml}
          <div>
            <div class="card-name">${escapeHtml(c.clientName || "Unnamed")}</div>
            <div class="card-brand">${escapeHtml(c.brandName || "—")}</div>
          </div>
        </div>
        ${sharedByLine}
      </div>
      <span class="status-pill status-${c.status || "regular"}">${statusLabel}</span>
    </div>
    <div class="card-meta">
      <div><span>Found From</span><span>${escapeHtml(c.foundFrom || "—")}</span></div>
      <div><span>Phone</span><span>${escapeHtml(c.phone || "—")}</span></div>
      <div><span>WhatsApp</span><span>${c.whatsapp ? "Available" : "Not available"}</span></div>
      <div><span>Delivery</span><span>${escapeHtml(isoToDisplay(c.deliveryTime) || "—")}</span></div>
      <div><span>Projects</span><span>${projects.length}</span></div>
      <div><span>Income</span><span>${projectIncome.toLocaleString("en-US")}</span></div>
    </div>
  `;
  return card;
}

function statusLabelOf(status) {
  const map = {
    regular: "Regular",
    "not-in-touch": "Not In Touch",
    // legacy values kept readable for older entries
    new: "New",
    ongoing: "Ongoing",
    queued: "Queued",
    delivered: "Delivered",
  };
  return map[status] || "Regular";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ---------------- Rendering: Users tab ---------------- */
function renderUsers() {
  const term = usersSearchInput.value.trim().toLowerCase();
  const filtered = allUsers.filter(
    (u) => !term || (u.name || "").toLowerCase().includes(term) || (u.email || "").toLowerCase().includes(term)
  );

  usersCount.textContent = `${allUsers.length} users`;
  usersList.innerHTML = "";
  if (filtered.length === 0) {
    usersEmptyState.classList.remove("hidden");
    return;
  }
  usersEmptyState.classList.add("hidden");

  for (const u of filtered) {
    const accepts = u.allowShareRequests !== false;
    const card = document.createElement("div");
    card.className = "user-card";
    card.innerHTML = `
      <div class="user-card-top">
        <img src="${escapeHtml(u.photoURL || "")}" alt="" onerror="this.style.visibility='hidden'" />
        <div>
          <div class="user-card-name">${escapeHtml(u.name || "Unnamed user")}</div>
          <div class="user-card-email">${escapeHtml(u.email || "")}</div>
        </div>
      </div>
      <span class="user-card-badge ${accepts ? "badge-open" : "badge-closed"}">
        ${accepts ? "Accepts requests" : "Not accepting requests"}
      </span>
      <button type="button" class="btn btn-outline btn-sm share-with-user-btn" ${accepts ? "" : "disabled"}>
        Share a client
      </button>
    `;
    card.querySelector(".share-with-user-btn").addEventListener("click", () => {
      openShareModal({ userId: u.id });
    });
    usersList.appendChild(card);
  }
}
usersSearchInput.addEventListener("input", renderUsers);

/* ---------------- Rendering: Requests (Shared tab) ---------------- */
function renderIncoming() {
  incomingRequestsList.innerHTML = "";
  if (incomingRequests.length === 0) {
    incomingEmpty.classList.remove("hidden");
  } else {
    incomingEmpty.classList.add("hidden");
    for (const req of incomingRequests) {
      const row = document.createElement("div");
      row.className = "request-row";
      row.innerHTML = `
        <div class="request-info">
          <img src="${escapeHtml(req.fromPhoto || "")}" alt="" onerror="this.style.visibility='hidden'" />
          <div class="request-text">
            <div><b>${escapeHtml(req.fromName || "Someone")}</b> wants to share a client with you</div>
            <div class="request-sub">${escapeHtml(req.clientName || "Untitled")}${req.clientBrand ? " — " + escapeHtml(req.clientBrand) : ""}</div>
          </div>
        </div>
        <div class="request-actions">
          <button type="button" class="btn btn-outline btn-sm decline-btn">Decline</button>
          <button type="button" class="btn btn-primary btn-sm accept-btn">Accept</button>
        </div>
      `;
      row.querySelector(".accept-btn").addEventListener("click", () => acceptRequest(req));
      row.querySelector(".decline-btn").addEventListener("click", () => declineRequest(req));
      incomingRequestsList.appendChild(row);
    }
  }

  incomingBadge.textContent = incomingRequests.length;
  incomingBadge.classList.toggle("hidden", incomingRequests.length === 0);
}

function renderSent() {
  sentRequestsList.innerHTML = "";
  if (sentRequests.length === 0) {
    sentEmpty.classList.remove("hidden");
    return;
  }
  sentEmpty.classList.add("hidden");
  for (const req of sentRequests) {
    const row = document.createElement("div");
    row.className = "request-row";
    row.innerHTML = `
      <div class="request-info">
        <img src="${escapeHtml(req.toPhoto || "")}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="request-text">
          <div>Shared with <b>${escapeHtml(req.toName || "someone")}</b></div>
          <div class="request-sub">${escapeHtml(req.clientName || "Untitled")}${req.clientBrand ? " — " + escapeHtml(req.clientBrand) : ""}</div>
        </div>
      </div>
      <span class="status-tag status-tag-${req.status}">${req.status}</span>
    `;
    sentRequestsList.appendChild(row);
  }
}

async function acceptRequest(req) {
  try {
    await updateDoc(doc(db, "shareRequests", req.id), { status: "accepted", respondedAt: serverTimestamp() });
    await updateDoc(doc(db, "clients", req.clientId), { members: arrayUnion(currentUser.uid) });
    showToast("Request accepted — client added to Shared.");
  } catch (err) {
    showToast("Couldn't accept the request: " + err.message);
  }
}

async function declineRequest(req) {
  try {
    await updateDoc(doc(db, "shareRequests", req.id), { status: "declined", respondedAt: serverTimestamp() });
    showToast("Request declined.");
  } catch (err) {
    showToast("Couldn't decline the request: " + err.message);
  }
}

/* ---------------- Share modal ---------------- */
function refreshShareClientOptions(preselectId) {
  if (!currentUser) return;
  const mine = allClients.filter((c) => c.ownerUid === currentUser.uid);
  const current = preselectId || shareClientSelect.value;
  shareClientSelect.innerHTML = mine
    .map(
      (c) =>
        `<option value="${c.id}">${escapeHtml(c.clientName || "Unnamed")}${c.brandName ? " — " + escapeHtml(c.brandName) : ""}</option>`
    )
    .join("");
  if (current && mine.some((c) => c.id === current)) shareClientSelect.value = current;
  refreshShareUserOptions();
}

function refreshShareUserOptions(preselectId) {
  const selectedClientId = shareClientSelect.value;
  const client = allClients.find((c) => c.id === selectedClientId);
  const members = client?.members || [];

  const eligible = allUsers.filter((u) => u.allowShareRequests !== false && !members.includes(u.id));
  const current = preselectId || shareUserSelect.value;

  shareUserSelect.innerHTML = eligible
    .map((u) => `<option value="${u.id}">${escapeHtml(u.name || u.email || "Unnamed user")}</option>`)
    .join("");

  if (eligible.length === 0) {
    shareFormHint.textContent = "No eligible users to share this client with right now.";
  } else {
    shareFormHint.textContent = "";
  }

  if (current && eligible.some((u) => u.id === current)) shareUserSelect.value = current;
}

shareClientSelect.addEventListener("change", () => refreshShareUserOptions());

function openShareModal({ clientId, userId } = {}) {
  if (!currentUser) return;
  const mine = allClients.filter((c) => c.ownerUid === currentUser.uid);
  if (mine.length === 0) {
    showToast("Add a client of your own before sharing one.");
    return;
  }
  refreshShareClientOptions(clientId);
  refreshShareUserOptions(userId);
  shareOverlay.classList.remove("hidden");
}

function closeShareModal() {
  shareOverlay.classList.add("hidden");
}
closeShareBtn.addEventListener("click", closeShareModal);
cancelShareBtn.addEventListener("click", closeShareModal);
shareOverlay.addEventListener("click", (e) => {
  if (e.target === shareOverlay) closeShareModal();
});
shareFromFormBtn.addEventListener("click", () => {
  const id = fIdInput.value;
  if (!id) return;
  closeForm();
  openShareModal({ clientId: id });
});

shareForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  const clientId = shareClientSelect.value;
  const toUid = shareUserSelect.value;
  if (!clientId || !toUid) {
    showToast("Choose a client and a user first.");
    return;
  }

  const alreadyPending = sentRequests.some(
    (r) => r.clientId === clientId && r.toUid === toUid && r.status === "pending"
  );
  if (alreadyPending) {
    showToast("You already have a pending request for this client with that user.");
    return;
  }

  const client = allClients.find((c) => c.id === clientId);
  const toUser = allUsers.find((u) => u.id === toUid);

  try {
    await addDoc(collection(db, "shareRequests"), {
      clientId,
      clientName: client?.clientName || "",
      clientBrand: client?.brandName || "",
      fromUid: currentUser.uid,
      fromName: currentUser.displayName || currentUser.email || "",
      fromPhoto: currentUser.photoURL || "",
      toUid,
      toName: toUser?.name || "",
      toPhoto: toUser?.photoURL || "",
      status: "pending",
      createdAt: serverTimestamp(),
    });
    showToast("Share request sent.");
    closeShareModal();
  } catch (err) {
    showToast("Couldn't send the request: " + err.message);
  }
});

/* ---------------- Found From / Payment Method custom toggles ---------------- */
fFoundFrom.addEventListener("change", () => {
  fFoundFromCustom.classList.toggle("hidden", fFoundFrom.value !== "custom");
});
fPaymentMethod.addEventListener("change", () => {
  fPaymentMethodCustom.classList.toggle("hidden", fPaymentMethod.value !== "custom");
});

/* =========================================================
   BRAND LOGO (resized in-browser, stored as a data URL)
   ========================================================= */
function setBrandLogo(dataUrl) {
  brandLogoData = dataUrl || "";
  if (brandLogoData) {
    brandLogoImg.src = brandLogoData;
    brandLogoImg.classList.remove("hidden");
    brandLogoPlus.classList.add("hidden");
    brandLogoClear.classList.remove("hidden");
  } else {
    brandLogoImg.removeAttribute("src");
    brandLogoImg.classList.add("hidden");
    brandLogoPlus.classList.remove("hidden");
    brandLogoClear.classList.add("hidden");
  }
}

brandLogoBtn.addEventListener("click", () => fBrandLogo.click());
brandLogoClear.addEventListener("click", () => setBrandLogo(""));

fBrandLogo.addEventListener("change", async () => {
  const file = fBrandLogo.files && fBrandLogo.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file.");
    fBrandLogo.value = "";
    return;
  }
  try {
    const dataUrl = await resizeImageFile(file, 128);
    setBrandLogo(dataUrl);
  } catch (err) {
    showToast("Couldn't read that image: " + err.message);
  }
  fBrandLogo.value = "";
});

/** Reads an image file and returns a small data URL (max `maxSize` px on the long side). */
function resizeImageFile(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file could not be read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("that file isn't a valid image"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const isPng = file.type === "image/png";
        let out = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.85);
        // Keep the Firestore document small — fall back to a lighter JPEG.
        if (out.length > 120000) out = canvas.toDataURL("image/jpeg", 0.6);
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- Facebook pages (unlimited, repeatable) ---------------- */
function addFbPageRow(value = "") {
  const row = document.createElement("div");
  row.className = "repeatable-row";
  row.innerHTML = `
    <input type="url" placeholder="https://facebook.com/yourpage" value="${escapeHtml(value)}" />
    <button type="button" aria-label="Remove">✕</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  fbPageList.appendChild(row);
}
addFbPageBtn.addEventListener("click", () => addFbPageRow());

function getFbPages() {
  return Array.from(fbPageList.querySelectorAll("input"))
    .map((i) => i.value.trim())
    .filter(Boolean);
}

/* =========================================================
   PROJECTS (unlimited, each with its own details)
   ========================================================= */
function renumberProjects() {
  projectList.querySelectorAll(".project-block").forEach((block, i) => {
    block.querySelector(".project-title").textContent = `Project ${i + 1}`;
  });
}

/** Copies the client's Project Start into Project 1 (only while it's untouched). */
function prefillFirstProjectStart(force = false) {
  const firstStart = projectList.querySelector(".project-block .p-start");
  if (!firstStart) return;
  const incoming = fProjectStart.value.trim();
  const current = firstStart.value.trim();
  if (force || current === "" || current === lastAutoProjectStart) {
    firstStart.value = incoming;
    lastAutoProjectStart = incoming;
  }
}

function addProjectRow(project = {}) {
  const fragment = projectBlockTemplate.content.cloneNode(true);
  const block = fragment.querySelector(".project-block");

  const status = project.status || "new";
  block.dataset.status = status;

  block.querySelector(".p-payment").value = project.payment ?? "";
  block.querySelector(".p-correction").value = project.correction ?? 0;

  const startInput = block.querySelector(".p-start");
  const endInput = block.querySelector(".p-end");
  startInput.value = isoToDisplay(project.startDate || "");
  endInput.value = isoToDisplay(project.endDate || "");
  wireDateInput(startInput);
  wireDateInput(endInput);

  block.querySelector(".p-status").value = status;
  block.querySelector(".p-note").value = project.note || "";

  block.querySelector(".p-status").addEventListener("change", (e) => {
    block.dataset.status = e.target.value;
  });
  block.querySelector(".project-remove-btn").addEventListener("click", () => {
    block.remove();
    renumberProjects();
  });

  projectList.appendChild(block);
  renumberProjects();
}

addProjectBtn.addEventListener("click", () => {
  const wasEmpty = projectList.querySelectorAll(".project-block").length === 0;
  addProjectRow();
  if (wasEmpty) prefillFirstProjectStart(true);
});

// Project Start → Project 1's start date (auto, still editable afterwards).
function syncProjectStartToFirstProject() {
  prefillFirstProjectStart(false);
}
fProjectStart.addEventListener("input", syncProjectStartToFirstProject);
fProjectStart.addEventListener("change", syncProjectStartToFirstProject);

function getProjects() {
  return Array.from(projectList.querySelectorAll(".project-block")).map((block, i) => ({
    payment: Number(block.querySelector(".p-payment").value) || 0,
    correction: Number(block.querySelector(".p-correction").value) || 0,
    startDate: readDateInput(block.querySelector(".p-start"), `Project ${i + 1} start date`),
    endDate: readDateInput(block.querySelector(".p-end"), `Project ${i + 1} end date`),
    status: block.querySelector(".p-status").value,
    note: block.querySelector(".p-note").value.trim(),
  }));
}

/* ---------------- Client form open/close ---------------- */
function resetForm() {
  clientForm.reset();
  fIdInput.value = "";
  fbPageList.innerHTML = "";
  addFbPageRow();
  projectList.innerHTML = "";
  addProjectRow();
  setBrandLogo("");
  lastAutoProjectStart = "";
  fFoundFromCustom.classList.add("hidden");
  fPaymentMethodCustom.classList.add("hidden");
  deleteClientBtn.classList.add("hidden");
  shareFromFormField.classList.add("hidden");
  formSharedNote.classList.add("hidden");
  formTitle.textContent = "Add New Client";
  fWhatsapp.checked = false;
}

function openForm(client = null) {
  resetForm();
  if (client) {
    const isOwner = client.ownerUid === currentUser.uid;
    formTitle.textContent = "Edit Client";
    fIdInput.value = client.id;
    fProjectStart.value = isoToDisplay(client.projectStart || "");
    fDeliveryTime.value = isoToDisplay(client.deliveryTime || "");
    fClientName.value = client.clientName || "";
    fBrandName.value = client.brandName || "";
    setBrandLogo(client.brandLogo || "");

    const knownSources = ["Facebook", "Self Message", "WhatsApp", "Instagram", "Fiverr", "Upwork"];
    if (client.foundFrom && !knownSources.includes(client.foundFrom)) {
      fFoundFrom.value = "custom";
      fFoundFromCustom.value = client.foundFrom;
      fFoundFromCustom.classList.remove("hidden");
    } else {
      fFoundFrom.value = client.foundFrom || "Facebook";
    }

    fPhone.value = client.phone || "";
    fWhatsapp.checked = client.whatsapp === true;

    fbPageList.innerHTML = "";
    const pages = client.facebookPages && client.facebookPages.length ? client.facebookPages : [""];
    pages.forEach((p) => addFbPageRow(p));

    fWebsite.value = client.website || "";

    projectList.innerHTML = "";
    const projects = client.projects && client.projects.length ? client.projects : [{}];
    projects.forEach((p) => addProjectRow(p));
    lastAutoProjectStart = "";

    const knownMethods = ["Bkash", "Nagad", "Bank", "PayPal", "Payoneer", "Cash"];
    if (client.paymentMethod && !knownMethods.includes(client.paymentMethod)) {
      fPaymentMethod.value = "custom";
      fPaymentMethodCustom.value = client.paymentMethod;
      fPaymentMethodCustom.classList.remove("hidden");
    } else {
      fPaymentMethod.value = client.paymentMethod || "Bkash";
    }

    fStatus.value = client.status || "regular";
    fNote.value = client.note || "";

    if (isOwner) {
      deleteClientBtn.classList.remove("hidden");
      shareFromFormField.classList.remove("hidden");
    } else {
      formSharedNote.classList.remove("hidden");
    }
  }
  formOverlay.classList.remove("hidden");
}

function closeForm() {
  formOverlay.classList.add("hidden");
}

addClientBtn.addEventListener("click", () => openForm());
closeFormBtn.addEventListener("click", closeForm);
cancelFormBtn.addEventListener("click", closeForm);
formOverlay.addEventListener("click", (e) => {
  if (e.target === formOverlay) closeForm();
});

/* ---------------- Collect + validate the form ---------------- */
function collectFormData() {
  const foundFrom = fFoundFrom.value === "custom" ? fFoundFromCustom.value.trim() : fFoundFrom.value;
  const paymentMethod =
    fPaymentMethod.value === "custom" ? fPaymentMethodCustom.value.trim() : fPaymentMethod.value;

  const projectStart = readDateInput(fProjectStart, "Project Start", { required: true });
  const deliveryTime = readDateInput(fDeliveryTime, "Delivery Time");

  return {
    projectStart,
    deliveryTime,
    clientName: fClientName.value.trim(),
    brandName: fBrandName.value.trim(),
    brandLogo: brandLogoData,
    foundFrom,
    phone: fPhone.value.trim(),
    whatsapp: fWhatsapp.checked,
    facebookPages: getFbPages(),
    website: fWebsite.value.trim(),
    projects: getProjects(),
    paymentMethod,
    status: fStatus.value,
    note: fNote.value.trim(),
    updatedAt: serverTimestamp(),
  };
}

/* ---------------- Save / Delete ---------------- */
clientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  let data;
  try {
    data = collectFormData();
  } catch (err) {
    showToast(err.message);
    return;
  }

  try {
    const id = fIdInput.value;
    if (id) {
      await updateDoc(doc(db, "clients", id), data);
      showToast("Entry updated.");
    } else {
      data.ownerUid = currentUser.uid;
      data.ownerName = currentUser.displayName || currentUser.email || "";
      data.ownerPhoto = currentUser.photoURL || "";
      data.members = [currentUser.uid];
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "clients"), data);
      showToast("New entry saved.");
    }
    closeForm();
  } catch (err) {
    showToast("Couldn't save: " + err.message);
  }
});

deleteClientBtn.addEventListener("click", async () => {
  const id = fIdInput.value;
  if (!id) return;
  if (!confirm("Delete this entry? This can't be undone.")) return;
  try {
    await deleteDoc(doc(db, "clients", id));
    showToast("Entry deleted.");
    closeForm();
  } catch (err) {
    showToast("Couldn't delete: " + err.message);
  }
});

/* ---------------- Toast ---------------- */
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}