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
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/* ---------------- DOM refs ---------------- */
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");

const clientGrid = document.getElementById("client-grid");
const emptyState = document.getElementById("empty-state");
const clientCount = document.getElementById("client-count");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const addClientBtn = document.getElementById("add-client-btn");

const formOverlay = document.getElementById("form-overlay");
const clientForm = document.getElementById("client-form");
const formTitle = document.getElementById("form-title");
const closeFormBtn = document.getElementById("close-form-btn");
const cancelFormBtn = document.getElementById("cancel-form-btn");
const deleteClientBtn = document.getElementById("delete-client-btn");

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
const fPayment = document.getElementById("f-payment");
const fPaymentMethod = document.getElementById("f-payment-method");
const fPaymentMethodCustom = document.getElementById("f-payment-method-custom");
const fCorrections = document.getElementById("f-corrections");
const fStatus = document.getElementById("f-status");
const fNote = document.getElementById("f-note");

const toast = document.getElementById("toast");

/* ---------------- State ---------------- */
let currentUser = null;
let unsubscribeClients = null;
let allClients = []; // cached array of {id, ...data}

/* ---------------- Auth ---------------- */
googleLoginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    showToast("লগইন ব্যর্থ হয়েছে: " + err.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    userName.textContent = user.displayName || user.email || "User";
    userPhoto.src = user.photoURL || "";
    subscribeToClients(user.uid);
  } else {
    loginScreen.classList.remove("hidden");
    appShell.classList.add("hidden");
    if (unsubscribeClients) unsubscribeClients();
    allClients = [];
    renderClients();
  }
});

/* ---------------- Firestore subscription ---------------- */
function subscribeToClients(uid) {
  if (unsubscribeClients) unsubscribeClients();
  const q = query(collection(db, "clients"), where("ownerUid", "==", uid));
  unsubscribeClients = onSnapshot(
    q,
    (snapshot) => {
      allClients = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // newest project-start first
      allClients.sort((a, b) => (b.projectStart || "").localeCompare(a.projectStart || ""));
      renderClients();
    },
    (err) => {
      showToast("ডেটা লোড করতে সমস্যা হয়েছে: " + err.message);
    }
  );
}

/* ---------------- Rendering ---------------- */
function renderClients() {
  const term = searchInput.value.trim().toLowerCase();
  const statusVal = statusFilter.value;

  const filtered = allClients.filter((c) => {
    const matchesTerm =
      !term ||
      (c.clientName || "").toLowerCase().includes(term) ||
      (c.brandName || "").toLowerCase().includes(term) ||
      (c.phone || "").toLowerCase().includes(term);
    const matchesStatus = statusVal === "all" || c.status === statusVal;
    return matchesTerm && matchesStatus;
  });

  clientCount.textContent = `${allClients.length} এন্ট্রি`;
  clientGrid.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  for (const c of filtered) {
    clientGrid.appendChild(buildClientCard(c));
  }
}

function buildClientCard(c) {
  const card = document.createElement("div");
  card.className = "client-card";
  card.addEventListener("click", () => openForm(c));

  const statusLabel = statusLabelOf(c.status);

  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-name">${escapeHtml(c.clientName || "নাম নেই")}</div>
        <div class="card-brand">${escapeHtml(c.brandName || "—")}</div>
      </div>
      <span class="status-pill status-${c.status || "new"}">${statusLabel}</span>
    </div>
    <div class="card-meta">
      <div><span>Found From</span><span>${escapeHtml(c.foundFrom || "—")}</span></div>
      <div><span>Phone</span><span>${escapeHtml(c.phone || "—")}</span></div>
      <div><span>Payment</span><span>${escapeHtml(c.payment || "—")}${c.paymentMethod ? " · " + escapeHtml(c.paymentMethod) : ""}</span></div>
      <div><span>Delivery</span><span>${escapeHtml(c.deliveryTime || "—")}</span></div>
      <div><span>Corrections</span><span>${c.corrections ?? 0}</span></div>
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

searchInput.addEventListener("input", renderClients);
statusFilter.addEventListener("change", renderClients);

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

/* ---------------- WhatsApp check (best-effort) ---------------- */
checkWhatsappBtn.addEventListener("click", () => {
  const raw = fPhone.value.trim();
  if (!raw) {
    showToast("আগে একটা ফোন নম্বর লেখো।");
    return;
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    showToast("নম্বরটা ঠিকভাবে লেখো।");
    return;
  }
  // Opens the number on WhatsApp so you can see whether it has an account.
  // There is no public API for this — it's a manual, one-click check.
  window.open(`https://wa.me/${digits}`, "_blank", "noopener");
});

/* ---------------- Form open/close ---------------- */
function resetForm() {
  clientForm.reset();
  fIdInput.value = "";
  fbPageList.innerHTML = "";
  addFbPageRow();
  fFoundFromCustom.classList.add("hidden");
  fPaymentMethodCustom.classList.add("hidden");
  deleteClientBtn.classList.add("hidden");
  formTitle.textContent = "নতুন ক্লায়েন্ট যোগ করো";
}

function openForm(client = null) {
  resetForm();
  if (client) {
    formTitle.textContent = "ক্লায়েন্ট এডিট করো";
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
    fPayment.value = client.payment || "";

    const knownMethods = ["Bkash", "Nagad", "Bank", "PayPal", "Payoneer", "Cash"];
    if (client.paymentMethod && !knownMethods.includes(client.paymentMethod)) {
      fPaymentMethod.value = "custom";
      fPaymentMethodCustom.value = client.paymentMethod;
      fPaymentMethodCustom.classList.remove("hidden");
    } else {
      fPaymentMethod.value = client.paymentMethod || "Bkash";
    }

    fCorrections.value = client.corrections ?? 0;
    fStatus.value = client.status || "new";
    fNote.value = client.note || "";

    deleteClientBtn.classList.remove("hidden");
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
    ownerUid: currentUser.uid,
    projectStart: fProjectStart.value,
    deliveryTime: fDeliveryTime.value,
    clientName: fClientName.value.trim(),
    brandName: fBrandName.value.trim(),
    foundFrom,
    phone: fPhone.value.trim(),
    facebookPages: getFbPages(),
    website: fWebsite.value.trim(),
    payment: fPayment.value.trim(),
    paymentMethod,
    corrections: Number(fCorrections.value) || 0,
    status: fStatus.value,
    note: fNote.value.trim(),
    updatedAt: serverTimestamp(),
  };

  try {
    const id = fIdInput.value;
    if (id) {
      await updateDoc(doc(db, "clients", id), data);
      showToast("এন্ট্রি আপডেট হয়েছে।");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "clients"), data);
      showToast("নতুন এন্ট্রি সেভ হয়েছে।");
    }
    closeForm();
  } catch (err) {
    showToast("সেভ করতে সমস্যা হয়েছে: " + err.message);
  }
});

deleteClientBtn.addEventListener("click", async () => {
  const id = fIdInput.value;
  if (!id) return;
  if (!confirm("এই এন্ট্রিটা ডিলিট করতে চাও? এটা ফেরানো যাবে না।")) return;
  try {
    await deleteDoc(doc(db, "clients", id));
    showToast("এন্ট্রি ডিলিট হয়েছে।");
    closeForm();
  } catch (err) {
    showToast("ডিলিট করতে সমস্যা হয়েছে: " + err.message);
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
