// js/vendors.js — v5.1.0 vendors 테이블 직접 사용
import { db } from "./supabase.js?v=20260513c";
import { state } from "./config.js?v=20260513c";
import { $, esc, toast, fmtWeekday } from "./utils.js?v=20260513c";
import { loadEvents } from "./events.js?v=20260513c";
import { openModal } from "./router.js?v=20260513c";

export async function loadContactsPage() {
  const box = $("page-vendors");
  box.innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">행사업체</div>
        <div class="page-sub">담당 업체와 연락처</div>
      </div>
    </div>
    <div id="vendors-content"><div class="card"><p class="muted">불러오는 중...</p></div></div>
  `;
  try {
    const [vendorsRes] = await Promise.all([
      db.from("vendors").select("*").eq("is_active", true).order("display_order", { ascending: true }),
      loadEvents(),
    ]);
    if (vendorsRes.error) throw vendorsRes.error;
    renderVendors(vendorsRes.data || []);
  } catch (e) {
    $("vendors-content").innerHTML = `<div class="status err">불러오기 실패: ${esc(e.message)}</div>`;
  }
}

function renderVendors(vendors) {
  if (!vendors.length) {
    $("vendors-content").innerHTML = `<div class="card"><p class="muted">등록된 업체가 없습니다.</p></div>`;
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 각 업체에 camp_events 매칭 (programs 배열 기준)
  const enriched = vendors.map((v) => {
    const matched = (state.events || []).filter((e) =>
      v.programs && v.programs.includes(e.program_name)
    );
    const upcoming = matched
      .filter((e) => e.event_date && new Date(e.event_date) >= today)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    return { ...v, events: matched, upcoming, next: upcoming[0], totalUpcoming: upcoming.length };
  });

  // 다음 출장 빠른 순
  enriched.sort((a, b) => {
    if (!a.next && !b.next) return 0;
    if (!a.next) return 1;
    if (!b.next) return -1;
    return a.next.event_date.localeCompare(b.next.event_date);
  });

  // 카테고리 라벨
  const catLabel = { A: "🎭 공연", B: "🍳 먹거리", C: "🎨 체험", D: "🏃 활동" };

  $("vendors-content").innerHTML = `
    <div class="card">
      <p class="muted">총 <b>${enriched.length}곳</b>의 업체. 전화 버튼을 누르면 바로 통화할 수 있어요.</p>
    </div>
    <div class="list">
      ${enriched.map((v) => renderVendorCard(v, catLabel)).join("")}
    </div>
  `;

  document.querySelectorAll("[data-vendor-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      // 전화 버튼 클릭은 제외
      if (e.target.closest("[data-phone-btn]")) return;
      openVendorDetail(el.dataset.vendorId, enriched);
    });
  });
}

function renderVendorCard(v, catLabel) {
  const nextStr = v.next
    ? `${parseInt(v.next.event_date.slice(5,7))}월 ${parseInt(v.next.event_date.slice(8,10))}일 (${fmtWeekday(v.next.event_date)})`
    : "예정된 출장 없음";

  const programs = v.programs || [];
  const progPreview = programs.slice(0, 4).map((p) => `<span class="chip">${esc(p)}</span>`).join("");
  const progMore = programs.length > 4 ? `<span class="chip gray">+${programs.length - 4}개</span>` : "";

  const catBadge = v.category && catLabel[v.category]
    ? `<span class="chip">${catLabel[v.category]}</span>`
    : "";

  // 전화 버튼 (큰 사이즈, 어르신 친화)
  const phoneBtn = v.phone
    ? `<a href="tel:${esc(v.phone.replace(/[^0-9+]/g, ""))}" data-phone-btn class="primary" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;padding:14px 18px;min-height:52px;font-size:16px;font-weight:800;border-radius:14px">📞 ${esc(v.phone)}</a>`
    : `<span class="muted">전화번호 없음</span>`;

  return `
    <div class="item" style="cursor:pointer" data-vendor-id="${v.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
        <div style="flex:1">
          <div class="item-title" style="font-size:18px">${esc(v.name)}</div>
          ${v.representative ? `<div style="font-size:15px;color:var(--ink-2);font-weight:700;margin-top:4px">대표: ${esc(v.representative)}</div>` : ""}
        </div>
        ${catBadge}
      </div>

      <div style="margin:12px 0">
        ${phoneBtn}
      </div>

      ${v.next ? `
        <div style="padding:12px;background:#f8faf8;border-radius:12px;border-left:4px solid var(--green);margin-bottom:10px">
          <div style="font-size:13px;color:var(--muted);font-weight:700">다음 출장</div>
          <div style="font-size:16px;font-weight:800;color:var(--green-dark);margin-top:2px">
            ${nextStr}
          </div>
          <div style="font-size:14px;color:var(--ink-2);margin-top:4px">
            ${esc(v.next.program_name)} · 🏕 ${esc(v.next.camp_name || "")}
          </div>
          ${v.totalUpcoming > 1 ? `<div style="font-size:13px;color:var(--muted);margin-top:6px">다가오는 출장 총 ${v.totalUpcoming}건</div>` : ""}
        </div>
      ` : ""}

      ${v.notes ? `<div style="font-size:13px;color:var(--muted);font-style:italic;margin-bottom:8px;padding:8px;background:#fef9e7;border-radius:8px">💡 ${esc(v.notes)}</div>` : ""}

      <div class="chips">
        ${progPreview}${progMore}
      </div>
    </div>
  `;
}

function openVendorDetail(vendorId, enriched) {
  const v = enriched.find((x) => x.id === vendorId);
  if (!v) { toast("업체 정보를 찾을 수 없습니다"); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const past = (v.events || [])
    .filter((e) => e.event_date && new Date(e.event_date) < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  const phoneStr = v.phone
    ? `<a href="tel:${esc(v.phone.replace(/[^0-9+]/g, ""))}" class="primary" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;padding:14px 18px;min-height:56px;font-size:17px;font-weight:800;border-radius:14px;width:100%;justify-content:center">📞 ${esc(v.phone)}</a>`
    : `<span class="muted">전화번호 없음</span>`;

  const html = `
    <div style="padding:14px;background:#f8faf8;border-radius:12px;border-left:4px solid var(--green);margin-bottom:14px">
      <div style="font-size:14px;color:var(--muted);font-weight:700">업체</div>
      <div style="font-size:20px;font-weight:900;color:var(--green-dark);margin-top:4px">${esc(v.name)}</div>
      ${v.representative ? `<div style="font-size:16px;color:var(--ink-2);margin-top:4px">대표: ${esc(v.representative)}</div>` : ""}
    </div>

    <div style="margin-bottom:14px">${phoneStr}</div>

    ${v.notes ? `
      <div style="margin-bottom:14px;padding:12px;background:#fef9e7;border:1px solid #fcd34d;border-radius:12px;font-size:14px;line-height:1.6">
        💡 ${esc(v.notes)}
      </div>
    ` : ""}

    <div class="card" style="margin:0 0 14px 0;padding:14px">
      <div style="font-size:14px;color:var(--muted);font-weight:700;margin-bottom:6px">담당 행사 (${(v.programs || []).length}건)</div>
      <div class="chips">${(v.programs || []).map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
    </div>

    ${v.upcoming && v.upcoming.length > 0 ? `
      <h4 style="font-size:16px;margin:14px 0 8px;font-weight:900">📅 다가오는 출장 (${v.upcoming.length}건)</h4>
      <div class="list">${v.upcoming.map((e) => renderEventRow(e)).join("")}</div>
    ` : `
      <p class="muted" style="text-align:center;padding:14px">다가오는 출장이 없습니다.</p>
    `}

    ${past.length > 0 ? `
      <h4 style="font-size:16px;margin:18px 0 8px;font-weight:900;color:var(--muted)">📜 지난 출장 (${past.length}건)</h4>
      <div class="list">${past.slice(0, 10).map((e) => renderEventRow(e, true)).join("")}</div>
    ` : ""}
  `;
  openModal(v.name, html);
}

function renderEventRow(e, past = false) {
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
