// js/my.js — v5.1.0 events 통합
// role 기반 분기: admin / provider / member / county
// events.html 박제·예산·합류기회·모달 흡수 + v5 보조사업 서류함 유지

import { db } from "./supabase.js";
import {
  ENARA_URL, EVENT_META, CAMP_BUDGET, BUDGET_BREAKDOWN,
  CATEGORY_LABEL, PROGRAMS, state,
} from "./config.js";
import {
  $, esc, fmtDate, todayKey, fileSize, showLoader, toast,
  normalizeKey, won, fmtDateShort, fmtWeekday,
} from "./utils.js";
import { uploadFiles, signedUrl } from "./uploads.js";
import { openProviderInfo } from "./info.js";
import { openModal, closeModal } from "./router.js";
import {
  loadEvents, loadCamps, findProgram, isForfeitedCampName,
  campBudget, campSpent, getEventPrice, getBundles, findBundleForEvent,
  bundleCapacity, autoPrice, ticketPrice, getMyJoinOpportunities,
  createEvent, deleteEvent, getCampGroup,
} from "./events.js";

// ============================================================
// 모듈 상태
// ============================================================
let selectedDocSource = null;
let modalForm = { cat: "" };

const myCampName = () => state.member?.camp_name || "";
const myProviderName = () =>
  state.member?.provider_name || state.member?.provider || state.member?.name || "";

function effectiveCamp() {
  if (state.role === "admin") return state.selectedCamp || (state.camps[0]?.name) || null;
  return myCampName();
}

function canEdit(campName) {
  if (state.role === "admin") return true;
  if (!campName) return false;
  return normalizeKey(campName) === normalizeKey(myCampName());
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

// ============================================================
// 진입점
// ============================================================
export async function loadMyPage() {
  const box = $("page-my");
  box.innerHTML = `
    <div class="page-head"><div>
      <div class="page-title">MY</div>
      <div class="page-sub">데이터 불러오는 중...</div>
    </div></div>
    <div class="card">잠시만요...</div>
  `;
  try {
    await Promise.all([loadCamps(), loadEvents()]);
  } catch (e) {
    console.error("loadMyPage error:", e);
  }
  await renderMy();
}

// ============================================================
// 메인 렌더
// ============================================================
async function renderMy() {
  const role = state.role || "member";
  const camp = effectiveCamp();
  const camps = state.camps || [];

  // 헤더 카피 — 어르신 친화 (쉬운 말)
  let title, sub;
  if (role === "admin") {
    title = "관리자 화면";
    sub = "전체 캠핑장 행사·예산을 확인하고 관리합니다";
  } else if (["provider", "vendor", "instructor"].includes(role)) {
    title = `${myProviderName() || "업체"} 일정`;
    sub = "출장가실 캠핑장과 행사 일정";
  } else if (role === "county") {
    title = "군청·확인용";
    sub = "전체 행사 현황 (보기 전용)";
  } else {
    title = `${myCampName() || "내 캠핑장"}`;
    sub = `예산 한도 ${won(CAMP_BUDGET)} · 함께 신청하면 가격이 더 내려갑니다`;
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

  // 데이터 오류
  if (state.eventsError) {
    content.innerHTML = `<div class="status err">행사 데이터 조회 오류: ${esc(state.eventsError)}<br>RLS 정책 또는 권한을 확인하세요.</div>`;
    return;
  }

  // 권한별 표시 사항 결정
  let visibleEvents = [];
  let showBudget = false;
  let showAddBtn = false;
  let showJoinOpps = false;
  let showCampPicker = role === "admin";

  if (role === "admin") {
    visibleEvents = state.events;
    showBudget = !!camp;
    showAddBtn = !!camp && !isForfeitedCampName(camp);
  } else if (["provider", "vendor", "instructor"].includes(role)) {
    const provider = myProviderName();
    visibleEvents = state.events.filter((e) => providerMatches(e._provider, provider));
  } else if (role === "county") {
    visibleEvents = state.events;
  } else {
    visibleEvents = state.events.filter((e) => campMatches(e.camp_name, camp));
    showBudget = !!camp && !isForfeitedCampName(camp);
    showAddBtn = !!camp && !isForfeitedCampName(camp);
    showJoinOpps = !!camp && !isForfeitedCampName(camp);
  }

  // 다가오는 행사
  const upcoming = visibleEvents.filter(
    (e) => !e.event_date || fmtDate(e.event_date) >= todayKey()
  );

  // 매칭 헬프 박스 (회원/업체 0건일 때)
  let matchHelp = "";
  if (role !== "admin" && role !== "county" && visibleEvents.length === 0) {
    if (["provider", "vendor", "instructor"].includes(role)) {
      matchHelp = `<div class="status warn">담당 행사가 0건입니다.<br>업체명 등록 정보가 행사 자료와 다를 수 있어요. 협회 사무국에 확인 요청하세요.<br>현재 업체명: <b>${esc(myProviderName() || "-")}</b></div>`;
    } else {
      matchHelp = `<div class="status warn">우리 캠핑장 행사가 아직 없어요.<br>"+ 새 행사 신청하기" 버튼으로 시작해보세요.<br>등록된 캠핑장명: <b>${esc(myCampName() || "-")}</b></div>`;
    }
  }

  // 카드 HTML
  let html = "";

  // 1. 캠프 셀렉터 (admin)
  if (showCampPicker && camps.length > 0) {
    html += `
      <div class="card">
        <h3>캠프 선택</h3>
        <select id="my-camp-picker" style="width:100%;padding:11px;border:1.5px solid var(--line);border-radius:13px;font-size:14px">
          ${camps.map((c) => `
            <option value="${esc(c.name)}" ${c.name === camp ? "selected" : ""}>
              ${esc(c.name)} ${c.group_name ? `· ${esc(c.group_name)}` : ""}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  // 2. 예산 카드
  if (showBudget) {
    html += renderBudgetCard(camp);
  }

  // 3. 매칭 헬프 박스
  if (matchHelp) html += matchHelp;

  // 4. 합류 기회 (member only)
  if (showJoinOpps) {
    const opps = getMyJoinOpportunities(camp);
    if (opps.length > 0) {
      html += renderJoinOpportunitiesCard(opps);
    }
  }

  // 5. 행사 추가 버튼
  if (showAddBtn) {
    html += `
      <div class="card">
        <button class="primary full" id="btn-add-event">＋ 새 행사 신청하기</button>
      </div>
    `;
  }

  // 6. 다가오는 행사 카드
  html += `
    <div class="card">
      <h3>다가오는 행사 (${upcoming.length}건)</h3>
      <div class="list">${renderEventList(upcoming.length ? upcoming : visibleEvents, camp, role)}</div>
    </div>
  `;

  // 7. e나라도움 + 서류함 (member·admin·provider만)
  if (role !== "county") {
    html += `
      <div class="card">
        <h3>e나라도움 등록 도우미</h3>
        <p class="muted">자동 등록이 아닙니다. 서류를 준비해두면 e나라도움 사이트에 직접 등록할 수 있도록 도와드립니다.</p>
        <p style="margin-top:14px"><a class="primary" href="${ENARA_URL}" target="_blank">e나라도움 사이트 열기</a></p>
        <div class="chips" style="margin-top:14px">
          <span class="chip">사업계획서</span><span class="chip">견적서</span><span class="chip">업체자료</span>
          <span class="chip">행사사진</span><span class="chip">지출증빙</span><span class="chip">정산자료</span>
        </div>
      </div>
      <div class="card">
        <h3>보조사업 서류 보관함</h3>
        <p class="muted">사진을 찍거나 파일을 올려두면 나중에 사용할 수 있어요.</p>
        ${docUploadBoxHtml()}
        <div id="my-doc-list" class="list" style="margin-top:14px"></div>
      </div>
    `;
  }

  content.innerHTML = html;

  // 이벤트 바인딩
  bindMyEvents();

  // 서류 목록 비동기 로드
  if (role !== "county") {
    const docs = await loadMyDocs();
    renderDocList(docs);
  }
}

// ============================================================
// 예산 카드
// ============================================================
function renderBudgetCard(camp) {
  const forfeited = isForfeitedCampName(camp);
  if (forfeited) {
    return `
      <div class="card">
        <h3>${esc(camp)} · 예산 미사용</h3>
        <p class="muted">이 캠핑장은 예산 신청을 하지 않습니다.</p>
      </div>
    `;
  }
  const spent = campSpent(camp);
  const limit = campBudget(camp);
  const remain = limit - spent;
  const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  const remainCls = remain < 0 ? "err" : pct >= 90 ? "warn" : "ok";
  return `
    <div class="card">
      <h3>${esc(camp)} · 예산 현황</h3>
      <div class="grid three">
        <div class="metric"><b>${won(spent)}</b><span>지금까지 쓴 금액</span></div>
        <div class="metric"><b>${won(Math.abs(remain))}</b><span>${remain < 0 ? "초과 사용" : "남은 금액"}</span></div>
        <div class="metric"><b>${pct}%</b><span>사용 비율</span></div>
      </div>
      <div style="height:14px;background:#f1f5f9;border-radius:7px;overflow:hidden;margin:14px 0">
        <div style="height:100%;width:${pct}%;background:${remain<0?'var(--red)':pct>=90?'var(--amber)':'var(--green)'};transition:width .4s"></div>
      </div>
      <div class="status ${remainCls}" style="margin:0">
        예산 한도 ${won(limit)}<br>
        <span style="font-weight:600;font-size:14px">= 기본 ${won(BUDGET_BREAKDOWN.base)} + 포기분 추가 ${won(BUDGET_BREAKDOWN.forfeit_extra)} + 해밀턴 차액 ${won(BUDGET_BREAKDOWN.hamilton_extra)}</span>
      </div>
    </div>
  `;
}

// ============================================================
// 합류 기회 카드
// ============================================================
function renderJoinOpportunitiesCard(opps) {
  const total = opps.reduce((s, o) => s + o.savings, 0);
  return `
    <div class="card" style="border:2px solid #f59e0b;background:#fffbeb">
      <h3>🎁 함께 신청하면 할인 ${opps.length}건</h3>
      <p class="muted" style="margin-bottom:14px">
        다른 캠핑장이 신청한 행사에 같이 신청하면<br>
        <b style="color:#92400e;font-size:17px">최대 ${won(total)}</b> 아낄 수 있어요
      </p>
      <div class="list">
        ${opps.slice(0, 8).map((o) => {
          const dStr = o.date ? `${parseInt(o.date.slice(5, 7))}월 ${parseInt(o.date.slice(8, 10))}일` : "수시";
          const urgent = o.daysLeft >= 0 && o.daysLeft <= 14;
          const dayBadge = o.daysLeft < 0 ? "" :
            o.daysLeft <= 7 ? `<span class="chip red">${o.daysLeft}일 남음</span>` :
            o.daysLeft <= 14 ? `<span class="chip amber">${o.daysLeft}일 남음</span>` :
            `<span class="chip gray">${o.daysLeft}일 남음</span>`;
          return `
            <div class="item" style="cursor:pointer;${urgent?'border-color:#dc2626;border-width:2px':''}" data-join-program="${esc(o.name)}" data-join-date="${esc(o.date)}" data-join-cat="${esc(o.cat)}">
              <div class="item-title">${dStr} · ${esc(o.name)}</div>
              <div class="item-meta">
                ${dayBadge}<br>
                지금 ${o.camps.length}곳 신청함: ${esc(o.camps.join(", "))}<br>
                <b style="color:var(--green-dark);font-size:15px">함께 신청 시 ${won(o.newPrice)} (${won(o.savings)} 절약)</b>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// ============================================================
// 행사 리스트
// ============================================================
function renderEventList(rows, currentCamp, role) {
  if (!rows.length) return `<div class="item"><div class="item-title">아직 신청한 행사가 없습니다</div></div>`;
  return rows.slice(0, 60).map((e) => {
    const provider = e._provider || "미지정";
    const dStr = e.event_date ? `${parseInt(e.event_date.slice(5, 7))}월 ${parseInt(e.event_date.slice(8, 10))}일` : "수시";
    const wk = e.event_date ? fmtWeekday(e.event_date) : "";
    const editable = canEdit(e.camp_name);
    const price = getEventPrice(e);
    const isLocked = !!e.locked_price;
    const isTicket = e.bundle_type === "ticket";
    const bundle = findBundleForEvent(e);
    const cap = bundleCapacity(e.program_name);

    // 상태 chip — 쉬운 말로
    let stChip = "";
    if (isTicket) {
      stChip = `<span class="chip blue">매수권 ${e.qty}매</span>`;
    } else if (isLocked) {
      stChip = `<span class="chip">✅ 확정 (${bundle?.count || 1}곳)</span>`;
    } else if (bundle && bundle.complete) {
      stChip = `<span class="chip">✅ 인원 다 모임 (${bundle.count}곳)</span>`;
    } else if (bundle) {
      stChip = `<span class="chip amber">🔍 함께할 캠프 모집 중 (${bundle.count}/${cap})</span>`;
    }

    const showCampPrefix = role === "admin" || role === "county" || ["provider","vendor","instructor"].includes(role);
    const campPrefix = showCampPrefix ? `<b>${esc(e.camp_name || "-")}</b> · ` : "";

    return `
      <div class="item">
        <div class="item-title">
          ${dStr}${wk ? ` (${wk})` : ""} · ${esc(e._program || e.program_name)}
        </div>
        <div class="item-meta">
          ${campPrefix}${esc(e._catName || CATEGORY_LABEL[e.category] || e.category || "기타")}<br>
          <b style="color:var(--ink);font-size:16px">${won(price)}</b>
        </div>
        <div class="chips">
          ${stChip}
          <button class="secondary small" data-provider="${esc(provider)}">업체 ${esc(provider)}</button>
          ${editable ? `<button class="secondary small" data-del-event="${e.id}" style="color:var(--red);border-color:#fca5a5">삭제</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ============================================================
// 보조사업 서류함 (v5 유지)
// ============================================================
function docUploadBoxHtml() {
  return `
    <div class="file-box">
      <label class="field">서류 종류
        <select id="my-doc-type">
          <option>사업계획서</option><option>견적서</option><option>업체자료</option>
          <option>행사사진</option><option>지출증빙</option><option>정산자료</option><option>기타</option>
        </select>
      </label>
      <input id="my-doc-camera" type="file" accept="image/*" capture="environment" hidden />
      <input id="my-doc-file" type="file" multiple accept="image/*,.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" hidden />
      <div class="file-actions">
        <button class="camera" id="btn-doc-camera">📷 사진 찍기</button>
        <button class="file" id="btn-doc-file">📎 파일 고르기</button>
        <button class="primary" id="btn-doc-upload">저장하기</button>
      </div>
      <div class="item-meta" id="my-doc-selected" style="margin-top:10px">선택된 파일 없음</div>
    </div>
  `;
}

async function loadMyDocs() {
  if (!state.member?.id) return [];
  const { data, error } = await db.from("attachments").select("*").eq("target_type", "library").order("created_at", { ascending: false }).limit(50);
  if (error) return [];
  return (data || []).filter((f) =>
    f.uploaded_by === state.member.id || String(f.target_id) === String(state.member.id)
  );
}

async function renderDocList(docs) {
  const target = $("my-doc-list");
  if (!target) return;
  if (!docs.length) {
    target.innerHTML = `<div class="item">업로드한 서류가 없습니다.</div>`;
    return;
  }
  const rows = await Promise.all(docs.map(async (f) => {
    const url = await signedUrl(f);
    return `
      <div class="item">
        <div class="item-title">${esc(f.file_name || "-")}</div>
        <div class="item-meta">${fileSize(f.file_size)} · ${fmtDate(f.created_at)}</div>
        <a class="secondary small" href="${esc(url)}" target="_blank">열기</a>
      </div>
    `;
  }));
  target.innerHTML = rows.join("");
}

function selectedFiles() {
  const cam = $("my-doc-camera")?.files || [];
  const file = $("my-doc-file")?.files || [];
  return cam.length ? cam : file;
}

function updateSelected(type) {
  const files = [...selectedFiles()];
  const el = $("my-doc-selected");
  if (!el) return;
  el.innerHTML = files.length
    ? `<b>${type === "camera" ? "사진" : "파일"} ${files.length}개</b><br>${files.slice(0, 4).map((f) => esc(f.name)).join("<br>")}`
    : "선택된 파일 없음";
}

async function uploadMyDocs() {
  const files = selectedFiles();
  if (!files.length) { toast("파일을 선택하세요"); return; }
  showLoader(true);
  try {
    await uploadFiles(files, {
      targetType: "library",
      targetId: state.member.id,
      docType: $("my-doc-type").value,
    });
    toast("업로드 완료");
    const docs = await loadMyDocs();
    renderDocList(docs);
  } catch (e) {
    alert("업로드 오류: " + e.message);
  } finally {
    showLoader(false);
  }
}

// ============================================================
// 행사 추가 모달
// ============================================================
function openAddEventModal(prefill = {}) {
  const camp = effectiveCamp();
  if (!camp) { toast("캠핑장을 먼저 선택하세요"); return; }
  if (isForfeitedCampName(camp)) { toast("이 캠핑장은 예산 신청을 하지 않습니다"); return; }
  if (!canEdit(camp)) { toast("우리 캠핑장만 신청할 수 있어요"); return; }

  modalForm = { cat: prefill.cat || "" };

  const html = `
    <div class="status warn" style="margin-bottom:14px">
      <b>대상 캠핑장:</b> ${esc(camp)} (${esc(getCampGroup(camp) || "조 미지정")})
    </div>
    <label class="field">📅 행사 날짜
      <input type="date" id="m-date" min="2026-04-01" max="2026-12-31" value="${esc(prefill.date || "")}">
    </label>
    <label class="field" style="margin-bottom:8px">🎨 분류 선택</label>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px" id="m-cat-pills">
      ${["A","B","C","D"].map((c)=>`
        <button class="secondary" data-cat="${c}" style="padding:16px 8px;min-height:64px;font-size:16px">
          <div><b>${c}</b> ${CATEGORY_LABEL[c]}</div>
        </button>
      `).join("")}
    </div>
    <label class="field">🎯 행사 선택
      <select id="m-program"><option value="">먼저 분류를 선택하세요</option></select>
    </label>
    <div id="m-qty-row" style="display:none">
      <label class="field">수량 (매)<input type="number" id="m-qty" value="1" min="1"></label>
    </div>
    <div id="m-preview"></div>
    <button class="primary full" id="m-save" disabled style="margin-top:16px">행사 신청하기</button>
  `;
  openModal("새 행사 신청", html);
  bindModalEvents(camp, prefill);
  renderCategoryPills();
  renderProgramOptions(prefill.programName || "");
  updateEventPreview(camp);
}

function bindModalEvents(camp, prefill) {
  document.querySelectorAll("#m-cat-pills [data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalForm.cat = btn.dataset.cat;
      renderCategoryPills();
      renderProgramOptions();
      updateEventPreview(camp);
    });
  });
  $("m-program")?.addEventListener("change", () => updateEventPreview(camp));
  $("m-date")?.addEventListener("change", () => updateEventPreview(camp));
  $("m-qty")?.addEventListener("input", () => updateEventPreview(camp));
  $("m-save")?.addEventListener("click", () => saveNewEvent(camp));
}

function renderCategoryPills() {
  document.querySelectorAll("#m-cat-pills [data-cat]").forEach((btn) => {
    if (btn.dataset.cat === modalForm.cat) {
      btn.style.background = "var(--green)";
      btn.style.color = "#fff";
    } else {
      btn.style.background = "#fff";
      btn.style.color = "var(--green)";
    }
  });
}

function renderProgramOptions(selectedName = "") {
  const sel = $("m-program");
  if (!sel) return;
  if (!modalForm.cat) {
    sel.innerHTML = `<option value="">먼저 분류를 선택하세요</option>`;
    return;
  }
  const opts = PROGRAMS[modalForm.cat] || [];
  sel.innerHTML = `<option value="">행사를 선택하세요</option>` +
    opts.map((p) => `<option value="${esc(p.n)}" ${selectedName === p.n ? "selected" : ""}>${esc(p.n)}</option>`).join("");
}

function getSelectedProgram() {
  const name = $("m-program")?.value;
  if (!name) return null;
  return findProgram(name);
}

function updateEventPreview(camp) {
  const pv = $("m-preview");
  const saveBtn = $("m-save");
  if (!pv || !saveBtn) return;

  const p = getSelectedProgram();
  const date = $("m-date")?.value;
  const qty = Math.max(1, parseInt($("m-qty")?.value || "1", 10));

  // 매수권 토글
  const isTicket = !!(p && p.p && p.p.ticket);
  const qtyRow = $("m-qty-row");
  if (qtyRow) qtyRow.style.display = isTicket ? "block" : "none";

  if (!modalForm.cat || !p) {
    pv.innerHTML = `<div class="status">분류와 행사를 선택해주세요</div>`;
    saveBtn.disabled = true;
    return;
  }
  if (!isTicket && !date) {
    pv.innerHTML = `<div class="status warn">행사 날짜를 선택해주세요</div>`;
    saveBtn.disabled = true;
    return;
  }
  // 중복 체크
  const dup = !isTicket && state.events.some((e) =>
    e.camp_name === camp && e.event_date === date && e.program_name === p.n && e.bundle_type !== "ticket"
  );
  if (dup) {
    pv.innerHTML = `<div class="status err">이미 같은 날짜에 같은 행사가 신청되어 있어요</div>`;
    saveBtn.disabled = true;
    return;
  }

  let price = 0;
  let details = "";
  if (isTicket) {
    price = ticketPrice(p.n, qty);
    details = `매수권 · 수량 <b>${qty}매</b> · 단가 <b>${won(p.p.ticket)}</b>`;
  } else {
    const bundles = getBundles(date, p.n);
    const open = bundles.find((b) => !b.complete && !b.finalized);
    const cap = bundleCapacity(p.n);
    const nextCount = open ? open.count + 1 : 1;
    const ap = autoPrice(p.n, nextCount);
    price = ap.price;
    const currentCamps = open ? open.events.map((e) => e.camp_name) : [];
    details = `
      날짜: <b>${esc(date)}</b><br>
      함께 신청한 캠핑장: <b>${currentCamps.length}곳</b>${currentCamps.length ? ` (${esc(currentCamps.join(", "))})` : ""}<br>
      추가 후: <b>${nextCount}/${cap}곳</b>${ap.warn ? `<br>${esc(ap.warn)}` : ""}<br>
      업체: <b>${esc(p.i.split("_")[1] || p.i)}</b>
    `;
  }

  const limit = campBudget(camp);
  const remainAfter = limit - campSpent(camp) - price;
  const cls = remainAfter < 0 ? "err" : remainAfter < 300000 ? "warn" : "ok";

  pv.innerHTML = `
    <div class="status ${cls}">
      <b>${remainAfter < 0 ? "⚠️ 예산 초과 주의" : "✅ 신청 가능"}</b><br><br>
      ${details}<br><br>
      <b style="font-size:18px">예상 금액 ${won(price)}</b><br>
      신청 후 남은 금액: <b>${won(remainAfter)}</b>
    </div>
  `;

  saveBtn.disabled = remainAfter < 0 && state.role !== "admin";
}

async function saveNewEvent(camp) {
  const p = getSelectedProgram();
  if (!p) { toast("프로그램을 선택하세요"); return; }
  const isTicket = !!p.p.ticket;
  const date = isTicket ? null : $("m-date").value;
  const qty = isTicket ? Math.max(1, parseInt($("m-qty").value || "1", 10)) : 1;

  const btn = $("m-save");
  btn.disabled = true;
  btn.textContent = "저장 중...";

  try {
    await createEvent({
      campName: camp,
      programName: p.n,
      date,
      qty,
      userId: state.user?.id || null,
    });
    closeModal();
    toast(isTicket ? "✅ 매수권 등록 완료" : "✅ 행사 신청 완료");
    await renderMy();
  } catch (e) {
    toast("저장 실패: " + e.message);
    btn.textContent = "행사 신청하기";
    btn.disabled = false;
  }
}

// ============================================================
// 이벤트 바인딩
// ============================================================
function bindMyEvents() {
  $("my-camp-picker")?.addEventListener("change", async (e) => {
    state.selectedCamp = e.target.value;
    await renderMy();
  });
  $("btn-add-event")?.addEventListener("click", () => openAddEventModal());
  $("my-doc-camera")?.addEventListener("change", () => updateSelected("camera"));
  $("my-doc-file")?.addEventListener("change", () => updateSelected("file"));
  $("btn-doc-camera")?.addEventListener("click", () => {
    selectedDocSource = "camera";
    if ($("my-doc-file")) $("my-doc-file").value = "";
    $("my-doc-camera")?.click();
  });
  $("btn-doc-file")?.addEventListener("click", () => {
    selectedDocSource = "file";
    if ($("my-doc-camera")) $("my-doc-camera").value = "";
    $("my-doc-file")?.click();
  });
  $("btn-doc-upload")?.addEventListener("click", uploadMyDocs);
}

// 글로벌 이벤트 위임 (한 번만 등록)
let _delegationBound = false;
function bindDelegationOnce() {
  if (_delegationBound) return;
  _delegationBound = true;
  document.addEventListener("click", async (e) => {
    const providerBtn = e.target.closest("[data-provider]");
    if (providerBtn) {
      openProviderInfo(providerBtn.dataset.provider);
      return;
    }
    const delBtn = e.target.closest("[data-del-event]");
    if (delBtn) {
      const id = delBtn.dataset.delEvent;
      const ev = state.events.find((x) => String(x.id) === String(id));
      if (!ev) return;
      if (!canEdit(ev.camp_name)) { toast("본인 캠프만 삭제 가능"); return; }
      if (!confirm(`${ev.camp_name} / ${ev.program_name} 일정 삭제할까요?`)) return;
      showLoader(true);
      try {
        await deleteEvent(id);
        toast("삭제 완료");
        await renderMy();
      } catch (err) {
        toast("❌ " + err.message);
      } finally {
        showLoader(false);
      }
      return;
    }
    const joinCard = e.target.closest("[data-join-program]");
    if (joinCard) {
      openAddEventModal({
        programName: joinCard.dataset.joinProgram,
        date: joinCard.dataset.joinDate,
        cat: joinCard.dataset.joinCat,
      });
      return;
    }
  });
}
bindDelegationOnce();
