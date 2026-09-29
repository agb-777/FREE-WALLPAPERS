/* FREE-WALLPAPERS — app.js
   Bagian: 1 Pengaturan · 2 State · 3 URL · 4 Data · 5 Grid · 6 Lightbox · 7 Render · 8 Event · 9 Start */
"use strict";

/* 1. Pengaturan */
const CONFIG = {
  dataFile: "wallpapers.json", // daftar URL wallpaper
  perPage: 12,                 // jumlah wallpaper per halaman
  swipeDistance: 50,           // jarak swipe (px) buat pindah wallpaper di layar sentuh
};

const $ = (id) => document.getElementById(id);
const el = {
  grid: $("grid"), count: $("count"), pager: $("pager"), year: $("year"),
  lightbox: $("lightbox"), stage: $("stage"), image: $("image"),
  download: $("download"), close: $("close"), prev: $("prev"), next: $("next"),
};

/* 2. State */
const state = { wallpapers: [], page: 1, id: "" };
let shownPage = 0;      // halaman yang sedang tergambar di grid (0 = belum ada)
let shownId = "";       // wallpaper yang sedang tampil di lightbox
let lastFocus = null;   // elemen yang difokus sebelum lightbox dibuka

/* 3. URL: #/?page=2&w=id-wallpaper */
function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#\/?\??/, ""));
  state.page = Math.max(1, parseInt(params.get("page"), 10) || 1);
  state.id = params.get("w") || "";
}

function buildHash({ page, id }) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", page);
  if (id) params.set("w", id);
  const query = params.toString();
  return "#/" + (query ? "?" + query : "");
}

// Ubah state tanpa nambah riwayat browser (dipakai lightbox: tutup, next, prev)
function goTo(patch) {
  Object.assign(state, patch);
  history.replaceState(null, "", buildHash(state));
  render();
}

/* 4. Data */
const toId = (url) => String(url)
  .replace(/^https?:\/\/[^/]+\//, "")
  .replace(/\.[a-z0-9]+$/i, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

// Lengkapi URL yang kosong dan bikin ID unik dari nama file original
function normalize(list) {
  const seen = new Set();
  return list.filter((w) => w && (w.thumb || w.preview || w.original)).map((w, i) => {
    const original = w.original || w.preview || w.thumb;
    const preview = w.preview || w.thumb || original;
    const thumb = w.thumb || preview;
    let id = toId(original) || "w" + (i + 1);
    while (seen.has(id)) id += "-" + (i + 1);
    seen.add(id);
    return { id, thumb, preview, original };
  });
}

async function loadData() {
  const res = await fetch(CONFIG.dataFile, { cache: "no-cache" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error("Isi JSON harus berupa array []");
  return normalize(list);
}

/* 5. Grid & pagination */
const pageCount = () => Math.max(1, Math.ceil(state.wallpapers.length / CONFIG.perPage));

function showMessage(text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  el.grid.replaceChildren(p);
}

function createCard(wallpaper, number) {
  const link = document.createElement("a");
  link.className = "card";
  link.href = buildHash({ page: state.page, id: wallpaper.id });
  link.setAttribute("aria-label", "Buka wallpaper " + number);

  const img = new Image();
  img.className = "fade";
  img.alt = "Wallpaper " + number;
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("load", () => img.classList.add("is-loaded"));
  img.src = wallpaper.thumb;

  link.append(img);
  return link;
}

function renderGrid() {
  const start = (state.page - 1) * CONFIG.perPage;
  const items = state.wallpapers.slice(start, start + CONFIG.perPage);
  const total = pageCount();
  el.count.textContent = state.wallpapers.length + " wallpaper" + (total > 1 ? ` • halaman ${state.page} dari ${total}` : "");
  if (!items.length) return showMessage("Belum ada wallpaper.");
  el.grid.replaceChildren(...items.map((w, i) => createCard(w, start + i + 1)));
}

function pagerItem(text, page, { current = false, disabled = false, label = "" } = {}) {
  const node = document.createElement(disabled ? "span" : "a");
  node.className = "pager__item";
  node.textContent = text;
  if (label) node.setAttribute("aria-label", label);
  if (disabled) node.setAttribute("aria-disabled", "true");
  else node.href = buildHash({ page, id: "" });
  if (current) node.setAttribute("aria-current", "page");
  return node;
}

function renderPager() {
  const total = pageCount();
  if (total < 2) return el.pager.replaceChildren();

  const numbers = [...new Set([1, total, state.page - 1, state.page, state.page + 1])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);

  const nodes = [pagerItem("‹", state.page - 1, { disabled: state.page === 1, label: "Sebelumnya" })];
  let last = 0;
  for (const n of numbers) {
    if (n - last > 1) {
      const gap = document.createElement("span");
      gap.className = "pager__gap";
      gap.textContent = "…";
      nodes.push(gap);
    }
    nodes.push(pagerItem(n, n, { current: n === state.page }));
    last = n;
  }
  nodes.push(pagerItem("›", state.page + 1, { disabled: state.page === total, label: "Berikutnya" }));
  el.pager.replaceChildren(...nodes);
}

/* 6. Lightbox */
// Halaman di belakang lightbox tidak boleh bisa difokus/di-Tab
function setBackgroundInert(value) {
  for (const tag of ["header", "main", "footer"]) document.querySelector(tag).inert = value;
}

function showLightbox(index) {
  const { wallpapers } = state;
  const wallpaper = wallpapers[index];

  if (el.lightbox.hidden) {
    lastFocus = document.activeElement;
    setBackgroundInert(true);
    el.lightbox.hidden = false;
    document.documentElement.classList.add("is-locked");
    el.close.focus();
  }

  if (shownId !== wallpaper.id) {
    shownId = wallpaper.id;
    el.image.classList.remove("is-loaded");
    el.image.onload = () => el.image.classList.add("is-loaded");
    el.image.src = wallpaper.preview;
    el.download.href = wallpaper.original;
    // siapkan wallpaper sebelum & sesudahnya biar pindahnya instan
    for (const d of [-1, 1]) new Image().src = wallpapers[(index + d + wallpapers.length) % wallpapers.length].preview;
  }
}

function hideLightbox() {
  if (el.lightbox.hidden) return;
  shownId = "";
  el.lightbox.hidden = true;
  document.documentElement.classList.remove("is-locked");
  setBackgroundInert(false);
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}

function step(direction) {
  const { wallpapers, id } = state;
  if (wallpapers.length < 2) return;
  const index = wallpapers.findIndex((w) => w.id === id);
  goTo({ id: wallpapers[(index + direction + wallpapers.length) % wallpapers.length].id });
}

/* 7. Render: satu fungsi yang menyamakan tampilan dengan state */
function render() {
  const index = state.wallpapers.findIndex((w) => w.id === state.id);
  if (index >= 0) state.page = Math.floor(index / CONFIG.perPage) + 1; // grid di belakang ikut halaman wallpaper
  state.page = Math.min(state.page, pageCount());

  if (state.page !== shownPage) {
    const isFirstRender = shownPage === 0;
    shownPage = state.page;
    renderGrid();
    renderPager();
    if (!isFirstRender) window.scrollTo(0, 0);
  }
  if (index >= 0) showLightbox(index);
  else hideLightbox();
}

/* 8. Event */
el.close.addEventListener("click", () => goTo({ id: "" }));
el.prev.addEventListener("click", () => step(-1));
el.next.addEventListener("click", () => step(1));
el.stage.addEventListener("click", (e) => { if (e.target === el.stage) goTo({ id: "" }); });

document.addEventListener("keydown", (e) => {
  if (el.lightbox.hidden) return;
  if (e.key === "Escape") goTo({ id: "" });
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});

let touchStartX = null;
el.stage.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
el.stage.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  touchStartX = null;
  if (Math.abs(dx) > CONFIG.swipeDistance) step(dx < 0 ? 1 : -1);
});

/* 9. Start */
async function init() {
  el.year.textContent = new Date().getFullYear();
  el.count.textContent = "Memuat...";
  try {
    state.wallpapers = await loadData();
  } catch (err) {
    console.error(err);
    el.count.textContent = "";
    showMessage("Gagal memuat wallpapers.json. Cek nama file dan format JSON-nya. Kalau dibuka langsung dari folder, jalankan lewat server lokal atau GitHub Pages.");
    return;
  }
  readHash();
  render();
  window.addEventListener("hashchange", () => { readHash(); render(); });
}
init();
