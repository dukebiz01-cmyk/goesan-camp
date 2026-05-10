export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
export const jsq = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
export const val = (id) => ($(id)?.value ?? "").trim();

export function showLoader(on) { $("loader")?.classList.toggle("show", !!on); }

export function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2300);
}

export function setLoginError(msg) {
  const el = $("login-error");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("show", !!msg);
}

export function setStatus(id, msg, type = "warn") {
  const el = $(id);
  if (!el) { toast(msg); return; }
  el.className = `status ${type}`;
  el.textContent = msg;
}

export function fmtDate(d) {
  if (!d) return "수시";
  const s = String(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "수시";
  return s;
}

export function monthKey(d) {
  if (!d) return "수시";
  return String(d).slice(0, 7);
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function fileSize(n) {
  const x = Number(n || 0);
  if (x > 1024 * 1024) return `${(x / 1024 / 1024).toFixed(1)}MB`;
  if (x > 1024) return `${Math.round(x / 1024)}KB`;
  return `${x}B`;
}

export function normalizeKey(s) {
  return String(s || "").replace(/\s+/g, "").replace(/캠핑장|야영장/g, "").trim().toLowerCase();
}
