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

  // 헤더 카피
  let title, sub;
  if (role === "admin") {
    title = "관리자 MY";
    sub = "전체 행사·예산 현황 · 캠프 선택해서 박제·일정 관리";
  } else if (["provider", "vendor", "instructor"].includes(role)) {
    title = `${myProviderName() || "업체"} MY`;
    sub = "내가 출장 가야 할 캠핑장과 일정";
  } else if (role === "county") {
    title = "군청 / 확인 계정";
    sub = "보기 전용 · 전체 행사 현황 확인";
  } else {
    title = `${myCampName() || "내 캠핑장"} MY`;
    sub = `최종 한도 ${won(CAMP_BUDGET)} · 박제·묶음 할인·합류 기회`;
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
      matchHelp = `<div class="status warn">담당 행사 0건. members.provider_name/name 값이 행사 _provider 값과 매칭되는지 확인.<br>현재 업체명: <b>${esc(myProviderName() || "-")}</b></div>`;
    } else {
      matchHelp = `<div class="status warn">내 캠핑장 행사 0건. members.camp_name 값과 camp_events.camp_name 매칭 확인.<br>현재 캠프: <b>${esc(myCampName() || "-")}</b></div>`;
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
        <button class="primary full" id="btn-add-event">＋ 새 행사 추가</button>
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
        <h3>e나라도움 등록 지원</h3>
        <p class="muted">자동 등록이 아니라, 제출자료를 정리해서 e나라도움에 직접 등록할 수 있게 돕습니다.</p>
        <p><a class="primary" href="${ENARA_URL}" target="_blank">e나라도움 열기</a></p>
        <div class="chips">
          <span class="chip">사업계획서</span><span class="chip">견적서</span><span class="chip">업체자료</span>
          <span class="chip">행사사진</span><span class="chip">지출증빙</span><span class="chip">정산자료</span>
        </div>
      </div>
      <div class="card">
        <h3>보조사업 서류함</h3>
        ${docUploadBoxHtml()}
        <div id="my-doc-list" class="list"></div>
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
        <h3>${esc(camp)} · 예산권 포기</h3>
        <p class="muted">신청 불가 · 포기 업체</p>
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
        <div class="metric"><b>${won(spent)}</b><span>사용</span></div>
        <div class="metric"><b>${won(Math.abs(remain))}</b><span>${remain < 0 ? "초과" : "잔액"}</span></div>
        <div class="metric"><b>${pct}%</b><span>사용률</span></div>
      </div>
      <div style="height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden;margin:10px 0">
        <div style="height:100%;width:${pct}%;background:${remain<0?'var(--red)':pct>=90?'var(--amber)':'var(--green)'};transition:width .4s"></div>
      </div>
      <div class="status ${remainCls}" style="margin:0">
        최종 한도 ${won(limit)} = 기본 ${won(BUDGET_BREAKDOWN.base)} + 포기분 ${won(BUDGET_BREAKDOWN.forfeit_extra)} + 해밀턴 차액 ${won(BUDGET_BREAKDOWN.hamilton_extra)}
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
    <div class="card" style="border:1px solid #fbbf24;background:#fffbeb">
      <h3>🎁 합류 기회 ${opps.length}건 · 최대 ${won(total)} 절감 가능</h3>
      <div class="list">
        ${opps.slice(0, 8).map((o) => {
          const dStr = o.date ? `${parseInt(o.date.slice(5, 7))}/${parseInt(o.date.slice(8, 10))}` : "수시";
          const urgent = o.daysLeft >= 0 && o.daysLeft <= 14;
          const dayBadge = o.daysLeft < 0 ? "" :
            o.daysLeft <= 7 ? `<span class="chip red">D-${o.daysLeft}</span>` :
            o.daysLeft <= 14 ? `<span class="chip amber">D-${o.daysLeft}</span>` :
            `<span class="chip gray">D-${o.daysLeft}</span>`;
          return `
            <div class="item" style="cursor:pointer;${urgent?'border-color:#dc2626':''}" data-join-program="${esc(o.name)}" data-join-date="${esc(o.date)}" data-join-cat="${esc(o.cat)}">
              <div class="item-title">${dStr} · ${esc(o.name)} ${dayBadge}</div>
              <div class="item-meta">현재 ${o.camps.length}곳: ${esc(o.camps.join(", "))} · ${o.need}곳 더 필요</div>
              <div class="chips">
                <span class="chip">합류시 본인 ${won(o.newPrice)} (${won(o.savings)} 절감)</span>
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
  if (!rows.length) return `<div class="item">표시할 행사가 없습니다.</div>`;
  return rows.slice(0, 60).map((e) => {
    const provider = e._provider || "미지정";
    const dStr = e.event_date ? fmtDateShort(e.event_date) : "수시";
    const wk = e.event_date ? fmtWeekday(e.event_date) : "";
    const editable = canEdit(e.camp_name);
    const price = getEventPrice(e);
    const isLocked = !!e.locked_price;
    const isTicket = e.bundle_type === "ticket";
    const bundle = findBundleForEvent(e);
    const cap = bundleCapacity(e.program_name);

    // 상태 chip
    let stChip = "";
    if (isTicket) {
      stChip = `<span class="chip blue">매수권 ${e.qty}매</span>`;
    } else if (isLocked) {
      stChip = `<span class="chip">🔒 박제 ${bundle?.count || 1}/${cap}</span>`;
    } else if (bundle && bundle.complete) {
      stChip = `<span class="chip">✅ 완성 ${bundle.count}/${cap}</span>`;
    } else if (bundle) {
      stChip = `<span class="chip amber">🔍 모집 ${bundle.count}/${cap}</span>`;
    }

    const showCampPrefix = role === "admin" || role === "county" || ["provider","vendor","instructor"].includes(role);
    const campPrefix = showCampPrefix ? `🏕 ${esc(e.camp_name || "-")} · ` : "";

    return `
      <div class="item">
        <div class="item-title">
          ${dStr}${wk ? `(${wk})` : ""} · ${esc(e._program || e.program_name)}
        </div>
        <div class="item-meta">
          ${campPrefix}${esc(e._catName || CATEGORY_LABEL[e.category] || e.category || "기타")} · ${won(price)}
        </div>
        <div class="chips">
          ${stChip}
          <button class="secondary small" data-provider="${esc(provider)}">업체: ${esc(provider)}</button>
          ${editable ? `<button class="secondary small" data-del-event="${e.id}" style="color:#b91c1c">삭제</button>` : ""}
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
      <label class="field">서류종류
        <select id="my-doc-type">
          <option>사업계획서</option><option>견적서</option><option>업체자료</option>
          <option>행사사진</option><option>지출증빙</option><option>정산자료</option><option>기타</option>
        </select>
      </label>
      <input id="my-doc-camera" type="file" accept="image/*" capture="environment" hidden />
      <input id="my-doc-file" type="file" multiple accept="image/*,.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" hidden />
      <div class="file-actions">
        <button class="camera" id="btn-doc-camera">📷 사진</button>
        <button class="file" id="btn-doc-file">📎 파일</button>
        <button class="primary" id="btn-doc-upload">저장</button>
      </div>
      <div class="item-meta" id="my-doc-selected">선택된 파일 없음</div>
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
  if (!camp) { toast("캠프를 먼저 선택하세요"); return; }
  if (isForfeitedCampName(camp)) { toast("예산권 포기 캠프는 신청 불가"); return; }
  if (!canEdit(camp)) { toast("본인 캠프만 추가 가능"); return; }

  modalForm = { cat: prefill.cat || "" };

  const html = `
    <div class="status warn" style="margin-bottom:10px">
      <b>대상 캠프:</b> ${esc(camp)} (${esc(getCampGroup(camp) || "조 미지정")})
    </div>
    <label class="field">📅 날짜
      <input type="date" id="m-date" min="2026-04-01" max="2026-12-31" value="${esc(prefill.date || "")}">
    </label>
    <label class="field">🎨 카테고리</label>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px" id="m-cat-pills">
      ${["A","B","C","D"].map((c)=>`
        <button class="secondary small" data-cat="${c}" style="padding:11px 4px">${c} ${CATEGORY_LABEL[c]}</button>
      `).join("")}
    </div>
    <label class="field">🎯 프로그램
      <select id="m-program"><option value="">먼저 카테고리 선택</option></select>
    </label>
    <div id="m-qty-row" style="display:none">
      <label class="field">수량(매)<input type="number" id="m-qty" value="1" min="1"></label>
    </div>
    <div id="m-preview"></div>
    <button class="primary full" id="m-save" disabled style="margin-top:12px">행사 추가</button>
  `;
  openModal("＋ 새 행사 추가", html);
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
    sel.innerHTML = `<option value="">먼저 카테고리 선택</option>`;
    return;
  }
  const opts = PROGRAMS[modalForm.cat] || [];
  sel.innerHTML = `<option value="">프로그램 선택</option>` +
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
    pv.innerHTML = `<div class="status">카테고리와 프로그램을 선택하세요.</div>`;
    saveBtn.disabled = true;
    return;
  }
  if (!isTicket && !date) {
    pv.innerHTML = `<div class="status warn">행사 날짜를 선택하세요.</div>`;
    saveBtn.disabled = true;
    return;
  }
  // 중복 체크
  const dup = !isTicket && state.events.some((e) =>
    e.camp_name === camp && e.event_date === date && e.program_name === p.n && e.bundle_type !== "ticket"
  );
  if (dup) {
    pv.innerHTML = `<div class="status err">❌ 이미 같은 날짜에 같은 프로그램이 등록되어 있습니다.</div>`;
    saveBtn.disabled = true;
    return;
  }

  let price = 0;
  let details = "";
  if (isTicket) {
    price = ticketPrice(p.n, qty);
    details = `<b>매수권</b> · 수량 ${qty}매 · 단가 ${won(p.p.ticket)}`;
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
      같은 묶음: <b>${currentCamps.length}곳</b>${currentCamps.length ? ` (${esc(currentCamps.join(", "))})` : ""}<br>
      추가 후: <b>${nextCount}/${cap}곳</b>${ap.warn ? ` · ${esc(ap.warn)}` : ""}<br>
      강사/업체: <b>${esc(p.i || "-")}</b>
    `;
  }

  const limit = campBudget(camp);
  const remainAfter = limit - campSpent(camp) - price;
  const cls = remainAfter < 0 ? "err" : remainAfter < 300000 ? "warn" : "ok";

  pv.innerHTML = `
    <div class="status ${cls}">
      <b>${remainAfter < 0 ? "⚠️ 예산 초과" : "✅ 추가 전 확인"}</b><br>
      ${details}<br>
      예상 금액: <b>${won(price)}</b><br>
      추가 후 잔액: <b>${won(remainAfter)}</b>
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
    toast(isTicket ? "✅ 매수권 등록" : "✅ 행사 추가");
    await renderMy();
  } catch (e) {
    toast("❌ " + e.message);
    btn.textContent = "행사 추가";
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
