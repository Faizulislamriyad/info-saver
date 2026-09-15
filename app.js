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
const checkWhatsappBtn = document.getElementById("check-whatsapp-btn");
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

  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-name">${escapeHtml(c.clientName || "Unnamed")}</div>
        <div class="card-brand">${escapeHtml(c.brandName || "—")}</div>
        ${sharedByLine}
      </div>
      <span class="status-pill status-${c.status || "new"}">${statusLabel}</span>
    </div>
    <div class="card-meta">
      <div><span>Found From</span><span>${escapeHtml(c.foundFrom || "—")}</span></div>
      <div><span>Phone</span><span>${escapeHtml(c.phone || "—")}</span></div>
      <div><span>Delivery</span><span>${escapeHtml(c.deliveryTime || "—")}</span></div>
      <div><span>Projects</span><span>${projects.length}</span></div>
      <div><span>Income</span><span>${projectIncome.toLocaleString("en-US")}</span></div>
    </div>
  `;
  return card;
}

function statusLabelOf(status) {
  const map = { new: "New", ongoing: "Ongoing", queued: "Queued", delivered: "Delivered" };
  return map[status] || "New";
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
  block.querySelector(".p-start").value = project.startDate || "";
  block.querySelector(".p-end").value = project.endDate || "";
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
addProjectBtn.addEventListener("click", () => addProjectRow());

function getProjects() {
  return Array.from(projectList.querySelectorAll(".project-block")).map((block) => ({
    payment: Number(block.querySelector(".p-payment").value) || 0,
    correction: Number(block.querySelector(".p-correction").value) || 0,
    startDate: block.querySelector(".p-start").value,
    endDate: block.querySelector(".p-end").value,
    status: block.querySelector(".p-status").value,
    note: block.querySelector(".p-note").value.trim(),
  }));
}

/* ---------------- WhatsApp check (best-effort) ---------------- */
checkWhatsappBtn.addEventListener("click", () => {
  const raw = fPhone.value.trim();
  if (!raw) {
    showToast("Enter a phone number first.");
    return;
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    showToast("Enter a valid phone number.");
    return;
  }
  // Opens the number on WhatsApp so you can see whether it has an account.
  // There is no public API for this — it's a manual, one-click check.
  window.open(`https://wa.me/${digits}`, "_blank", "noopener");
});

/* ---------------- Client form open/close ---------------- */
function resetForm() {
  clientForm.reset();
  fIdInput.value = "";
  fbPageList.innerHTML = "";
  addFbPageRow();
  projectList.innerHTML = "";
  addProjectRow();
  fFoundFromCustom.classList.add("hidden");
  fPaymentMethodCustom.classList.add("hidden");
  deleteClientBtn.classList.add("hidden");
  shareFromFormField.classList.add("hidden");
  formSharedNote.classList.add("hidden");
  formTitle.textContent = "Add New Client";
}

function openForm(client = null) {
  resetForm();
  if (client) {
    const isOwner = client.ownerUid === currentUser.uid;
    formTitle.textContent = "Edit Client";
    fIdInput.value = client.id;
    fProjectStart.value = client.projectStart || "";
    fDeliveryTime.value = client.deliveryTime || "";
    fClientName.value = client.clientName || "";
    fBrandName.value = client.brandName || "";

    const knownSources = ["Facebook", "Self Message", "WhatsApp", "Instagram", "Fiverr", "Upwork"];
    if (client.foundFrom && !knownSources.includes(client.foundFrom)) {
      fFoundFrom.value = "custom";
      fFoundFromCustom.value = client.foundFrom;
      fFoundFromCustom.classList.remove("hidden");
    } else {
      fFoundFrom.value = client.foundFrom || "Facebook";
    }

    fPhone.value = client.phone || "";

    fbPageList.innerHTML = "";
    const pages = client.facebookPages && client.facebookPages.length ? client.facebookPages : [""];
    pages.forEach((p) => addFbPageRow(p));

    fWebsite.value = client.website || "";

    projectList.innerHTML = "";
    const projects = client.projects && client.projects.length ? client.projects : [{}];
    projects.forEach((p) => addProjectRow(p));

    const knownMethods = ["Bkash", "Nagad", "Bank", "PayPal", "Payoneer", "Cash"];
    if (client.paymentMethod && !knownMethods.includes(client.paymentMethod)) {
      fPaymentMethod.value = "custom";
      fPaymentMethodCustom.value = client.paymentMethod;
      fPaymentMethodCustom.classList.remove("hidden");
    } else {
      fPaymentMethod.value = client.paymentMethod || "Bkash";
    }

    fStatus.value = client.status || "new";
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

/* ---------------- Save / Delete ---------------- */
clientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const foundFrom = fFoundFrom.value === "custom" ? fFoundFromCustom.value.trim() : fFoundFrom.value;
  const paymentMethod =
    fPaymentMethod.value === "custom" ? fPaymentMethodCustom.value.trim() : fPaymentMethod.value;

  const data = {
    projectStart: fProjectStart.value,
    deliveryTime: fDeliveryTime.value,
    clientName: fClientName.value.trim(),
    brandName: fBrandName.value.trim(),
    foundFrom,
    phone: fPhone.value.trim(),
    facebookPages: getFbPages(),
    website: fWebsite.value.trim(),
    projects: getProjects(),
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