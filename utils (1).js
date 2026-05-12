// js/utils.js — 공통 헬퍼
// 다른 모듈들이 import하는 함수 시그니처 기반으로 재구성

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function val(id) {
  const el = $(id);
  if (!el) return "";
  return String(el.value || "").trim();
}

export function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtDate(v) {
  if (!v) return "수시";
  const s = String(v);
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(v);
  if (isNaN(d)) return "수시";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtDateShort(v) {
  if (!v) return "수시";
  const s = String(v);
  if (s.length >= 10) return `${parseInt(s.slice(5, 7))}/${parseInt(s.slice(8, 10))}`;
  return "수시";
}

export function fmtWeekday(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return "";
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
}

export function fileSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function won(n) {
  return `${Number(n || 0).toLocaleString()}원`;
}

export function normalizeKey(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/캠핑장|야영장/g, "")
    .trim()
    .toLowerCase();
}

export function showLoader(on) {
  const el = $("loader");
  if (!el) return;
  el.classList.toggle("show", !!on);
}

export function toast(msg) {
  const el = $("toast");
  if (!el) {
    // 폴백: 새 토스트 생성
    const t = document.createElement("div");
    t.className = "toast show";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
    return;
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2500);
}

export function setLoginError(msg) {
  const el = $("login-error");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("show", !!msg);
}

export function copyToClipboard(text, msg = "복사됨") {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast(msg);
    } catch (e) {
      toast("복사 실패");
    }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(msg)).catch(fallback);
  } else {
    fallback();
  }
}
