// app.js — Info Saver client-ledger logic

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
  arrayRemove,
  Timestamp,
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
const sharedMembersSection = document.getElementById("shared-members-section");
const sharedMembersList = document.getElementById("shared-members-list");
const leaveSharedField = document.getElementById("leave-shared-field");
const leaveSharedBtn = document.getElementById("leave-shared-btn");

const fIdInput = document.getElementById("client-id");
const fProjectStart = document.getElementById("f-project-start");
const fLastProject = document.getElementById("f-last-project");
const fClientName = document.getElementById("f-client-name");
const fBrandName = document.getElementById("f-brand-name");
const fBrandLogoInput = document.getElementById("f-brand-logo");
const brandLogoPreview = document.getElementById("brand-logo-preview");
const logoUploadIcon = document.getElementById("logo-upload-icon");
const removeLogoBtn = document.getElementById("remove-logo-btn");
const fFoundFrom = document.getElementById("f-found-from");
const fFoundFromCustom = document.getElementById("f-found-from-custom");
const fPhone = document.getElementById("f-phone");
const fWhatsappAvailable = document.getElementById("f-whatsapp-available");
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

/* ---------------- DOM refs: share modal ---------------- */
const shareOverlay = document.getElementById("share-overlay");
const shareForm = document.getElementById("share-form");
const shareClientSelect = document.getElementById("share-client-select");
const shareUserSelect = document.getElementById("share-user-select");
const shareExpirySelect = document.getElementById("share-expiry-select");
const shareFormHint = document.getElementById("share-form-hint");
const closeShareBtn = document.getElementById("close-share-btn");
const cancelShareBtn = document.getElementById("cancel-share-btn");

/* ---------------- State ---------------- */
let currentUser = null;
let activeTab = "mine";
let currentBrandLogo = ""; // data URL or ""

let unsubClients = null;
let unsubUsers = null;
let unsubIncoming = null;
let unsubSent = null;
let unsubOwnUser = null;
let suppressToggleEvent = false;

let allClients = [];
let allUsers = [];
let incomingRequests = [];
let sentRequests = [];

const PIN_KEY = "infosaver-pinned";
let pinnedIds = new Set(JSON.parse(localStorage.getItem(PIN_KEY) || "[]"));

/* ---------------- Date helpers (dd/mm/yyyy <-> yyyy-mm-dd) ---------------- */
function attachDateMask(input) {
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(digits.slice(2, 4));
    if (digits.length > 4) parts.push(digits.slice(4, 8));
    input.value = parts.join("/");
  });
}

function dmyToIso(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((str || "").trim());
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  const d = Number(dd),
    mo = Number(mm);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return "";
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDmy(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function minDateIso(yearsBack = 5) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsBack);
  return d.toISOString().slice(0, 10);
}

attachDateMask(fProjectStart);

/* Project 1 auto-fills its Delivery Date from Project Start (convenience default) */
fProjectStart.addEventListener("input", () => {
  if (fProjectStart.value.length === 10) {
    const firstBlock = projectList.querySelector(".project-block");
    if (firstBlock) {
      const deliveryInput = firstBlock.querySelector(".p-delivery");
      if (deliveryInput && !deliveryInput.value) {
        deliveryInput.value = fProjectStart.value;
        updateLastProjectDisplay();
      }
    }
  }
});

/* ---------------- Last Project (auto-computed, read-only) ---------------- */
function updateLastProjectDisplay() {
  const blocks = projectList.querySelectorAll(".project-block");
  if (blocks.length === 0) {
    fLastProject.value = "";
    return;
  }
  const last = blocks[blocks.length - 1];
  const dmy = last.querySelector(".p-delivery").value;
  fLastProject.value = dmy || "";
}

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
      renderSharedMembers();
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

/* ---------------- Periodic refresh (Users & Shared tabs) + expiry sweep ---------------- */
setInterval(() => {
  if (!currentUser) return;
  sweepExpiredRequests();
  renderUsers();
  renderIncoming();
  renderSent();
}, 3000);

async function sweepExpiredRequests() {
  const now = Date.now();
  const expired = [...incomingRequests, ...sentRequests].filter(
    (r) => r.status === "pending" && r.expiresAt && r.expiresAt.toMillis?.() < now
  );
  const seen = new Set();
  for (const req of expired) {
    if (seen.has(req.id)) continue;
    seen.add(req.id);
    try {
      await updateDoc(doc(db, "shareRequests", req.id), { status: "expired" });
    } catch (err) {
      /* best-effort; ignore permission races */
    }
  }
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

/* ---------------- Sorting: pinned first, then latest Project Start ---------------- */
function sortClients(list) {
  return [...list].sort((a, b) => {
    const pinDiff = (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    return (b.projectStart || "").localeCompare(a.projectStart || "");
  });
}

function togglePin(clientId) {
  if (pinnedIds.has(clientId)) pinnedIds.delete(clientId);
  else pinnedIds.add(clientId);
  localStorage.setItem(PIN_KEY, JSON.stringify([...pinnedIds]));
  renderMine();
  renderShared();
}

/* ---------------- Rendering: My Client ---------------- */
function renderMine() {
  if (!currentUser) {
    clientGrid.innerHTML = "";
    emptyState.classList.add("hidden");
    updateStats([]);
    return;
  }
  const mine = sortClients(allClients.filter((c) => c.ownerUid === currentUser.uid));
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
  const shared = sortClients(allClients.filter((c) => c.ownerUid !== currentUser.uid));

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

function statusLabelOf(status) {
  const map = { regular: "Regular", not_regular: "Not Regular", not_in_touch: "Not In Touch" };
  return map[status] || "Regular";
}

function buildClientCard(c, isShared) {
  const card = document.createElement("div");
  card.className = "client-card";
  card.dataset.status = c.status || "regular";
  card.addEventListener("click", () => openForm(c));

  const statusLabel = statusLabelOf(c.status);
  const projects = c.projects || [];
  const projectIncome = projects.reduce((sum, p) => sum + (Number(p.payment) || 0), 0);
  const sharedByLine = isShared
    ? `<div class="card-shared-by">Shared by ${escapeHtml(c.ownerName || "another user")}</div>`
    : "";
  const logoImg = c.brandLogo ? `<img class="card-logo" src="${c.brandLogo}" alt="" />` : "";
  const pinned = pinnedIds.has(c.id);
  const lastProjectDmy = isoToDmy(c.lastProject) || "—";

  card.innerHTML = `
    <div class="card-top">
      <div class="card-name-group">
        ${logoImg}
        <div>
          <div class="card-name">${escapeHtml(c.clientName || "Unnamed")}</div>
          <div class="card-brand">${escapeHtml(c.brandName || "—")}</div>
          ${sharedByLine}
        </div>
      </div>
      <div class="card-top-right">
        <button type="button" class="pin-btn ${pinned ? "pinned" : ""}" aria-label="Pin">📌</button>
        <span class="status-pill status-${c.status || "regular"}">${statusLabel}</span>
      </div>
    </div>
    <div class="card-meta">
      <div><span>Found From</span><span>${escapeHtml(c.foundFrom || "—")}</span></div>
      <div><span>Phone</span><span>${escapeHtml(c.phone || "—")}${c.whatsappAvailable ? " (WA)" : ""}</span></div>
      <div><span>Last Project</span><span>${lastProjectDmy}</span></div>
      <div><span>Projects</span><span>${projects.length}</span></div>
      <div><span>Income</span><span>${projectIncome.toLocaleString("en-US")}</span></div>
    </div>
  `;

  card.querySelector(".pin-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    togglePin(c.id);
  });

  return card;
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

  shareFormHint.textContent = eligible.length === 0 ? "No eligible users to share this client with right now." : "";

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
  shareExpirySelect.value = "7d";
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

function computeExpiryTimestamp(option) {
  if (option === "none") return null;
  const d = new Date();
  if (option === "3d") d.setDate(d.getDate() + 3);
  else if (option === "7d") d.setDate(d.getDate() + 7);
  else if (option === "1m") d.setMonth(d.getMonth() + 1);
  return Timestamp.fromDate(d);
}

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
  const expiresAt = computeExpiryTimestamp(shareExpirySelect.value);

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
      expiresAt,
      createdAt: serverTimestamp(),
    });
    showToast("Share request sent.");
    closeShareModal();
  } catch (err) {
    showToast("Couldn't send the request: " + err.message);
  }
});

/* ---------------- Shared members: revoke (owner) / leave (member) ---------------- */
function getUserById(uid) {
  return allUsers.find((u) => u.id === uid);
}

function renderSharedMembers() {
  const id = fIdInput.value;
  if (!id) return;
  const client = allClients.find((c) => c.id === id);
  if (!client || client.ownerUid !== currentUser?.uid) return;

  const others = (client.members || []).filter((uid) => uid !== client.ownerUid);
  sharedMembersList.innerHTML = "";
  if (others.length === 0) {
    sharedMembersSection.classList.add("hidden");
    return;
  }
  sharedMembersSection.classList.remove("hidden");
  for (const uid of others) {
    const u = getUserById(uid);
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <div class="member-row-info">
        <img src="${escapeHtml(u?.photoURL || "")}" alt="" onerror="this.style.visibility='hidden'" />
        <span>${escapeHtml(u?.name || u?.email || "Unknown user")}</span>
      </div>
      <button type="button" class="btn btn-outline btn-sm revoke-member-btn">Remove</button>
    `;
    row.querySelector(".revoke-member-btn").addEventListener("click", () => revokeMember(client.id, uid));
    sharedMembersList.appendChild(row);
  }
}

async function revokeMember(clientId, uid) {
  if (!confirm("Remove this user's access to the client?")) return;
  try {
    await updateDoc(doc(db, "clients", clientId), { members: arrayRemove(uid) });
    showToast("Access removed.");
  } catch (err) {
    showToast("Couldn't remove access: " + err.message);
  }
}

leaveSharedBtn.addEventListener("click", async () => {
  const id = fIdInput.value;
  if (!id || !currentUser) return;
  if (!confirm("Leave this shared client? You'll lose access to it.")) return;
  try {
    await updateDoc(doc(db, "clients", id), { members: arrayRemove(currentUser.uid) });
    showToast("You left the shared client.");
    closeForm();
  } catch (err) {
    showToast("Couldn't leave: " + err.message);
  }
});

/* ---------------- Found From / Payment Method custom toggles ---------------- */
fFoundFrom.addEventListener("change", () => {
  fFoundFromCustom.classList.toggle("hidden", fFoundFrom.value !== "custom");
});
fPaymentMethod.addEventListener("change", () => {
  fPaymentMethodCustom.classList.toggle("hidden", fPaymentMethod.value !== "custom");
});

/* ---------------- Brand logo upload ---------------- */
function resizeImageToDataUrl(file, maxDim = 160, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setBrandLogo(dataUrl) {
  currentBrandLogo = dataUrl || "";
  if (currentBrandLogo) {
    brandLogoPreview.src = currentBrandLogo;
    brandLogoPreview.classList.remove("hidden");
    logoUploadIcon.classList.add("hidden");
    removeLogoBtn.classList.remove("hidden");
  } else {
    brandLogoPreview.classList.add("hidden");
    logoUploadIcon.classList.remove("hidden");
    removeLogoBtn.classList.add("hidden");
  }
}

fBrandLogoInput.addEventListener("change", async () => {
  const file = fBrandLogoInput.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageToDataUrl(file);
    setBrandLogo(dataUrl);
  } catch (err) {
    showToast("Couldn't process that image.");
  }
  fBrandLogoInput.value = "";
});

removeLogoBtn.addEventListener("click", (e) => {
  e.preventDefault();
  setBrandLogo("");
});

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

/* ---------------- Projects (unlimited, each with own details) ---------------- */
function renumberProjects() {
  projectList.querySelectorAll(".project-block").forEach((block, i) => {
    block.querySelector(".project-title").textContent = `Project ${i + 1}`;
  });
}

function addProjectRow(project = {}) {
  const fragment = projectBlockTemplate.content.cloneNode(true);
  const block = fragment.querySelector(".project-block");

  const status = project.status || "new";
  block.dataset.status = status;

  block.querySelector(".p-payment").value = project.payment ?? "";
  block.querySelector(".p-correction").value = project.correction ?? 0;
  const deliveryInput = block.querySelector(".p-delivery");
  deliveryInput.value = isoToDmy(project.deliveryDate);
  attachDateMask(deliveryInput);
  deliveryInput.addEventListener("input", updateLastProjectDisplay);
  block.querySelector(".p-status").value = status;
  block.querySelector(".p-note").value = project.note || "";

  block.querySelector(".p-correction").addEventListener("input", (e) => {
    if (Number(e.target.value) > 20) e.target.value = 20;
  });

  block.querySelector(".p-status").addEventListener("change", (e) => {
    block.dataset.status = e.target.value;
  });
  block.querySelector(".project-remove-btn").addEventListener("click", () => {
    block.remove();
    renumberProjects();
    updateLastProjectDisplay();
  });

  projectList.appendChild(block);
  renumberProjects();
  updateLastProjectDisplay();
}
addProjectBtn.addEventListener("click", () => addProjectRow());

function getProjects() {
  return Array.from(projectList.querySelectorAll(".project-block")).map((block) => ({
    payment: Number(block.querySelector(".p-payment").value) || 0,
    correction: Math.min(Number(block.querySelector(".p-correction").value) || 0, 20),
    deliveryDate: dmyToIso(block.querySelector(".p-delivery").value),
    status: block.querySelector(".p-status").value,
    note: block.querySelector(".p-note").value.trim(),
  }));
}

/* ---------------- Client form open/close ---------------- */
function resetForm() {
  clientForm.reset();
  fIdInput.value = "";
  setBrandLogo("");
  fbPageList.innerHTML = "";
  addFbPageRow();
  projectList.innerHTML = "";
  addProjectRow();
  fFoundFromCustom.classList.add("hidden");
  fPaymentMethodCustom.classList.add("hidden");
  deleteClientBtn.classList.add("hidden");
  shareFromFormField.classList.add("hidden");
  sharedMembersSection.classList.add("hidden");
  leaveSharedField.classList.add("hidden");
  formSharedNote.classList.add("hidden");
  formTitle.textContent = "Add New Client";
}

function openForm(client = null) {
  resetForm();
  if (client) {
    const isOwner = client.ownerUid === currentUser.uid;
    formTitle.textContent = "Edit Client";
    fIdInput.value = client.id;
    fProjectStart.value = isoToDmy(client.projectStart);
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
    fWhatsappAvailable.checked = !!client.whatsappAvailable;

    fbPageList.innerHTML = "";
    const pages = client.facebookPages && client.facebookPages.length ? client.facebookPages : [""];
    pages.forEach((p) => addFbPageRow(p));

    fWebsite.value = client.website || "";

    projectList.innerHTML = "";
    const projects = client.projects && client.projects.length ? client.projects : [{}];
    projects.forEach((p) => addProjectRow(p));
    updateLastProjectDisplay();

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
      renderSharedMembers();
    } else {
      formSharedNote.classList.remove("hidden");
      leaveSharedField.classList.remove("hidden");
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

/* ---------------- Save / Delete ---------------- */
clientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const projectStartIso = dmyToIso(fProjectStart.value);
  if (!projectStartIso) {
    showToast("Enter Project Start as dd/mm/yyyy.");
    return;
  }
  if (projectStartIso < minDateIso(5)) {
    showToast("Project Start can't be more than 5 years in the past.");
    return;
  }

  const projects = getProjects();
  for (const p of projects) {
    if (p.deliveryDate && p.deliveryDate < projectStartIso) {
      showToast("A project's Delivery Date can't be before Project Start.");
      return;
    }
  }

  const foundFrom = fFoundFrom.value === "custom" ? fFoundFromCustom.value.trim() : fFoundFrom.value;
  const paymentMethod =
    fPaymentMethod.value === "custom" ? fPaymentMethodCustom.value.trim() : fPaymentMethod.value;

  const lastProjectIso = projects.length ? projects[projects.length - 1].deliveryDate || "" : "";

  const data = {
    projectStart: projectStartIso,
    lastProject: lastProjectIso,
    clientName: fClientName.value.trim(),
    brandName: fBrandName.value.trim(),
    brandLogo: currentBrandLogo,
    foundFrom,
    phone: fPhone.value.trim(),
    whatsappAvailable: fWhatsappAvailable.checked,
    facebookPages: getFbPages(),
    website: fWebsite.value.trim(),
    projects,
    paymentMethod,
    status: fStatus.value,
    note: fNote.value.trim(),
    updatedAt: serverTimestamp(),
  };

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