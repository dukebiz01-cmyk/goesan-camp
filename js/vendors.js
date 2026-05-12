// js/vendors.js — 행사업체 디렉토리
// 업체별 카드 (이름·회사·담당 행사·다음 출장·전화)
import { db } from "./supabase.js";
import { state, EVENT_META, INSTRUCTOR_INFO } from "./config.js";
import { $, esc, toast, won, fmtWeekday } from "./utils.js";
import { loadEvents, getEventsByProvider } from "./events.js";

export async function loadVendorsPage() {
  const box = $("page-vendors");
  box.innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">행사업체</div>
        <div class="page-sub">담당 업체 정보와 연락처를 확인합니다</div>
      </div>
    </div>
    <div id="vendors-content">
      <div class="card"><p class="muted">불러오는 중...</p></div>
    </div>
  `;
  try {
    await loadEvents();
    renderVendors();
  } catch (e) {
    $("vendors-content").innerHTML = `<div class="status err">불러오기 실패: ${esc(e.message)}</div>`;
  }
}

function renderVendors() {
  const groups = getEventsByProvider();
  if (groups.length === 0) {
    $("vendors-content").innerHTML = `<div class="card"><p class="muted">등록된 행사업체가 없습니다.</p></div>`;
    return;
  }

  // 다음 출장일 계산
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const enriched = groups.map((g) => {
    const upcoming = g.events
      .filter((e) => e.event_date && new Date(e.event_date) >= today)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    const next = upcoming[0];
    const totalUpcoming = upcoming.length;
    return { ...g, next, totalUpcoming };
  });

  // 다음 출장 빠른 순으로 정렬
  enriched.sort((a, b) => {
    if (!a.next && !b.next) return 0;
    if (!a.next) return 1;
    if (!b.next) return -1;
    return a.next.event_date.localeCompare(b.next.event_date);
  });

  $("vendors-content").innerHTML = `
    <div class="card">
      <p class="muted">총 <b>${enriched.length}곳</b>의 업체가 등록되어 있습니다. 카드를 누르면 출장 일정을 볼 수 있습니다.</p>
    </div>
    <div class="list">
      ${enriched.map((g) => renderVendorCard(g)).join("")}
    </div>
  `;

  // 카드 클릭 → 상세
  document.querySelectorAll("[data-vendor-key]").forEach((el) => {
    el.addEventListener("click", () => openVendorDetail(el.dataset.vendorKey));
  });
}

function renderVendorCard(g) {
  const nextStr = g.next
    ? `${parseInt(g.next.event_date.slice(5,7))}월 ${parseInt(g.next.event_date.slice(8,10))}일 (${fmtWeekday(g.next.event_date)})`
    : "예정된 출장 없음";
  const totalLabel = g.totalUpcoming > 0 ? `· 다가오는 출장 ${g.totalUpcoming}건` : "";

  return `
    <div class="item" style="cursor:pointer" data-vendor-key="${esc(g.provider)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1">
          <div class="item-title" style="font-size:18px">${esc(g.provider)}</div>
          ${g.company ? `<div style="font-size:14px;color:var(--ink-2);font-weight:600;margin-top:4px">${esc(g.company)}</div>` : ""}
        </div>
        <div style="text-align:right;font-size:13px;font-weight:700;color:var(--green)">
          ${esc(g.cat || "")}
        </div>
      </div>

      <div style="margin-top:12px;padding:12px;background:#f8faf8;border-radius:12px;border-left:4px solid var(--green)">
        <div style="font-size:13px;color:var(--muted);font-weight:700">다음 출장</div>
        <div style="font-size:16px;font-weight:800;color:var(--green-dark);margin-top:2px">
          ${nextStr}
        </div>
        ${g.next ? `<div style="font-size:14px;color:var(--ink-2);margin-top:4px">${esc(g.next.program_name)} · ${esc(g.next.camp_name || "")}</div>` : ""}
        ${totalLabel ? `<div style="font-size:13px;color:var(--muted);margin-top:6px">${totalLabel}</div>` : ""}
      </div>

      <div class="chips" style="margin-top:10px">
        ${g.programs.slice(0, 4).map((p) => `<span class="chip">${esc(p)}</span>`).join("")}
        ${g.programs.length > 4 ? `<span class="chip gray">+${g.programs.length - 4}개</span>` : ""}
      </div>
    </div>
  `;
}

// ============================================================
// 업체 상세 (모달)
// ============================================================
function openVendorDetail(provider) {
  const g = getEventsByProvider().find((x) => x.provider === provider);
  if (!g) { toast("업체 정보를 찾을 수 없습니다"); return; }

  // 날짜순 정렬
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = g.events
    .filter((e) => e.event_date && new Date(e.event_date) >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  const past = g.events
    .filter((e) => e.event_date && new Date(e.event_date) < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  // 모달 import
  import("./router.js").then(({ openModal }) => {
    const html = `
      <div style="padding:14px;background:#f8faf8;border-radius:12px;border-left:4px solid var(--green);margin-bottom:14px">
        <div style="font-size:14px;color:var(--muted);font-weight:700">업체</div>
        <div style="font-size:20px;font-weight:900;color:var(--green-dark);margin-top:4px">${esc(g.provider)}</div>
        ${g.company ? `<div style="font-size:15px;color:var(--ink-2);margin-top:4px">${esc(g.company)}</div>` : ""}
      </div>

      <div class="card" style="margin:0 0 14px 0;padding:14px">
        <div style="font-size:14px;color:var(--muted);font-weight:700;margin-bottom:6px">담당 행사 (${g.programs.length}건)</div>
        <div class="chips">${g.programs.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
      </div>

      ${upcoming.length > 0 ? `
        <h4 style="font-size:16px;margin:14px 0 8px;font-weight:900">📅 다가오는 출장 (${upcoming.length}건)</h4>
        <div class="list">${upcoming.map((e) => renderVendorEventRow(e)).join("")}</div>
      ` : `
        <p class="muted" style="text-align:center;padding:14px">다가오는 출장이 없습니다.</p>
      `}

      ${past.length > 0 ? `
        <h4 style="font-size:16px;margin:18px 0 8px;font-weight:900;color:var(--muted)">📜 지난 출장 (${past.length}건)</h4>
        <div class="list">${past.slice(0, 10).map((e) => renderVendorEventRow(e, true)).join("")}</div>
      ` : ""}
    `;
    openModal(`${g.provider}`, html);
  });
}

function renderVendorEventRow(e, past = false) {
  const dStr = e.event_date
    ? `${parseInt(e.event_date.slice(5,7))}월 ${parseInt(e.event_date.slice(8,10))}일 (${fmtWeekday(e.event_date)})`
    : "수시";
  return `
    <div class="item" style="${past ? "opacity:0.7" : ""}">
      <div class="item-title">${dStr}</div>
      <div class="item-meta">
        ${esc(e.program_name)} · 🏕 ${esc(e.camp_name || "-")}
      </div>
    </div>
  `;
}
