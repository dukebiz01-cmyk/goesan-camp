// js/my.js — v5.1.0 minimal
import { db } from "./supabase.js?v=20260513c";
import { state, EVENT_META, CATEGORY_LABEL } from "./config.js?v=20260513c";
import { $, esc, fmtDate, todayKey, normalizeKey, fmtWeekday } from "./utils.js?v=20260513c";
import { loadEvents, loadCamps, isForfeitedCampName } from "./schedule.js?v=20260513c";

const myCampName = () => state.member?.camp_name || "";
const myProviderName = () =>
  state.member?.provider_name || state.member?.provider || state.member?.name || "";

function effectiveCamp() {
  if (state.role === "admin") return state.selectedCamp || (state.camps[0]?.name) || null;
  return myCampName();
}

function campMatches(rowCamp, memberCamp) {
  const a = normalizeKey(rowCamp);
  const b = normalizeKey(memberCamp);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function providerMatches(rowProvider, memberProvider) {
  const a = normalizeKey(rowProvider);
  const b = normalizeKey(memberProvider);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export async function loadDashboardPage() {
  const box = $("page-my");
  box.innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">일정</div>
        <div class="page-sub">불러오는 중...</div>
      </div>
    </div>
    <div id="my-content"><div class="card"><p class="muted">잠시만요...</p></div></div>
  `;
  try {
    await Promise.all([loadCamps(), loadEvents()]);
  } catch (e) {
    console.error("loadMyPage error:", e);
  }
  await renderMy();
}

async function renderMy() {
  const role = state.role || "member";
  const camp = effectiveCamp();
  const camps = state.camps || [];

  let title, sub;
  if (role === "admin") {
    title = "관리자 화면";
    sub = "전체 캠핑장 행사 일정";
  } else if (["provider", "vendor", "instructor"].includes(role)) {
    title = `${myProviderName() || "업체"} 일정`;
    sub = "출장 캠핑장 일정";
  } else if (role === "county") {
    title = "전체 행사";
    sub = "보기 전용";
  } else {
    title = `${myCampName() || "내 캠핑장"}`;
    sub = `행사 일정과 담당 업체`;
  }

  $("page-my").innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">${esc(title)}</div>
        <div class="page-sub">${esc(sub)}</div>
      </div>
    </div>
    <div id="my-content"></div>
  `;

  const content = $("my-content");

  if (state.eventsError) {
    content.innerHTML = `<div class="status err">행사 데이터 조회 오류: ${esc(state.eventsError)}</div>`;
    return;
  }

  let visibleEvents = [];
  if (role === "admin") {
    visibleEvents = state.events;
  } else if (["provider", "vendor", "instructor"].includes(role)) {
    const provider = myProviderName();
    visibleEvents = state.events.filter((e) => providerMatches(e._provider, provider));
  } else if (role === "county") {
    visibleEvents = state.events;
  } else {
    visibleEvents = state.events.filter((e) => campMatches(e.camp_name, camp));
  }

  const upcoming = visibleEvents.filter(
    (e) => !e.event_date || fmtDate(e.event_date) >= todayKey()
  );

  let html = "";

  if (role !== "admin" && role !== "county" && visibleEvents.length === 0) {
    if (["provider", "vendor", "instructor"].includes(role)) {
      html += `<div class="status warn">담당 행사가 0건입니다.<br>현재 업체명: <b>${esc(myProviderName() || "-")}</b></div>`;
    } else {
      html += `<div class="status warn">우리 캠핑장 행사가 없습니다.<br>등록된 캠핑장명: <b>${esc(myCampName() || "-")}</b></div>`;
    }
  }

  if (role === "admin" && camps.length > 0) {
    html += `
      <div class="card">
        <h3>캠핑장 선택</h3>
        <select id="my-camp-picker" style="width:100%;padding:14px;border:2px solid var(--line-strong);border-radius:14px;font-size:17px;font-weight:700">
          ${camps.map((c) => `
            <option value="${esc(c.name)}" ${c.name === camp ? "selected" : ""}>${esc(c.name)}</option>
          `).join("")}
        </select>
      </div>
    `;
  }

  html += renderUpcomingSchedule(upcoming.length ? upcoming : visibleEvents, camp, role);

  content.innerHTML = html;

  $("my-camp-picker")?.addEventListener("change", async (e) => {
    state.selectedCamp = e.target.value;
    await renderMy();
  });
}

function renderUpcomingSchedule(rows, currentCamp, role) {
  if (!rows.length) {
    return `<div class="card"><h3>다가오는 행사</h3><p class="muted">표시할 행사가 없습니다.</p></div>`;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = {
    "🔴 임박 (7일 이내)": [],
    "🟡 다음 (8~30일)": [],
    "📅 이번 분기 (31~90일)": [],
    "🗓 그 이후": [],
    "📦 수시 (날짜 없음)": [],
  };
  for (const e of rows) {
    if (!e.event_date) {
      groups["📦 수시 (날짜 없음)"].push(e);
      continue;
    }
    const d = new Date(e.event_date);
    const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) continue;
    if (diff <= 7) groups["🔴 임박 (7일 이내)"].push(e);
    else if (diff <= 30) groups["🟡 다음 (8~30일)"].push(e);
    else if (diff <= 90) groups["📅 이번 분기 (31~90일)"].push(e);
    else groups["🗓 그 이후"].push(e);
  }

  let html = "";
  for (const [label, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    html += `
      <div class="card">
        <h3>${label} (${items.length}건)</h3>
        <div class="list">${items.map((e) => renderEventCard(e, currentCamp, role)).join("")}</div>
      </div>
    `;
  }
  if (!html) {
    return `<div class="card"><h3>다가오는 행사</h3><p class="muted">예정된 행사가 없습니다.</p></div>`;
  }
  return html;
}

function renderEventCard(e, currentCamp, role) {
  const isTicket = e.bundle_type === "ticket";
  const dStr = e.event_date
    ? `${parseInt(e.event_date.slice(5, 7))}월 ${parseInt(e.event_date.slice(8, 10))}일`
    : "수시 사용";
  const wk = e.event_date ? fmtWeekday(e.event_date) : "";

  let dayBadge = "";
  if (e.event_date) {
    const d = new Date(e.event_date);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = Math.floor((d - today) / (1000*60*60*24));
    if (diff === 0) dayBadge = `<span class="chip red">오늘</span>`;
    else if (diff === 1) dayBadge = `<span class="chip red">내일</span>`;
    else if (diff <= 7) dayBadge = `<span class="chip red">${diff}일 남음</span>`;
    else if (diff <= 14) dayBadge = `<span class="chip amber">${diff}일 남음</span>`;
    else if (diff > 0) dayBadge = `<span class="chip gray">${diff}일 남음</span>`;
  }

  const provider = e._provider || "미지정";
  const company = e._company || "";

  const showCampName = role === "admin" || role === "county" || ["provider","vendor","instructor"].includes(role);
  const campLine = showCampName
    ? `<div style="font-size:14px;color:var(--green-dark);font-weight:800;margin-bottom:6px">🏕 ${esc(e.camp_name || "-")}</div>`
    : "";

  const ticketChip = isTicket ? `<div style="margin-top:10px"><span class="chip blue">매수권 ${e.qty}매</span></div>` : "";

  return `
    <div class="item">
      ${campLine}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px">
        <div style="flex:1">
          <div class="item-title" style="font-size:18px">
            ${dStr}${wk ? ` (${wk})` : ""}
          </div>
          <div style="font-weight:800;font-size:17px;color:var(--ink);margin-top:4px">
            ${esc(e._program || e.program_name)}
          </div>
        </div>
        <div style="text-align:right">${dayBadge}</div>
      </div>

      <div style="padding:12px;background:#f8faf8;border-radius:12px;border-left:4px solid var(--green)">
        <div style="font-size:13px;color:var(--muted);font-weight:700;margin-bottom:4px">담당 업체</div>
        <div style="font-size:16px;font-weight:800;color:var(--green-dark)">${esc(provider)}</div>
        ${company ? `<div style="font-size:14px;color:var(--ink-2);margin-top:2px">${esc(company)}</div>` : ""}
        ${e._phone ? `
          <a href="tel:${esc(e._phone.replace(/[^0-9+]/g, ""))}" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;margin-top:10px;padding:10px 14px;background:var(--green);color:#fff;border-radius:12px;font-size:15px;font-weight:800">📞 ${esc(e._phone)}</a>
        ` : ""}
      </div>

      ${ticketChip}
    </div>
  `;
}
