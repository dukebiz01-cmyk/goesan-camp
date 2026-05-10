import { db } from "./supabase.js";
import { ENARA_URL, EVENT_META, state } from "./config.js";
import { $, esc, fmtDate, todayKey, fileSize, showLoader, toast } from "./utils.js";
import { uploadFiles, signedUrl } from "./uploads.js";
import { openProviderInfo } from "./info.js";

let selectedDocSource = null;

function metaFor(program) { return EVENT_META[program] || {}; }
function myCamp() { return state.member?.camp_name || ""; }
function myProvider() { return state.member?.provider_name || state.member?.provider || state.member?.name || ""; }

async function loadEvents() {
  const { data, error } = await db.from("camp_events").select("*").order("event_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
  if (error) { console.warn(error); return []; }
  state.events = (data || []).map((e) => ({ ...e, _program: e.program_name || e.title || "미지정", _meta: metaFor(e.program_name || e.title) }));
  return state.events;
}

export async function loadMyPage() {
  const box = $("page-my");
  box.innerHTML = `<div class="page-head"><div><div class="page-title">MY</div><div class="page-sub">내 행사 · 보조사업 서류함 · e나라도움 준비</div></div></div><div id="my-content"><div class="card">불러오는 중...</div></div>`;
  await loadEvents();
  await renderMy();
}

async function renderMy() {
  const role = state.role;
  const camp = myCamp();
  const provider = myProvider();

  let rows = [];
  let title = "내 보조사업 실행판";
  let sub = "내 행사와 보조사업 서류를 한 곳에서 관리합니다.";

  if (role === "admin") {
    rows = state.events;
    title = "관리자 MY";
    sub = "전체 행사와 업로드 현황을 확인합니다.";
  } else if (["provider", "vendor", "instructor"].includes(role)) {
    rows = state.events.filter((e) => String(e._meta.provider || "").trim() === String(provider).trim());
    title = `${provider || "업체"} MY`;
    sub = "내 담당 행사와 방문 캠핑장을 확인합니다.";
  } else {
    rows = state.events.filter((e) => (e.camp_name || "") === camp);
    title = `${camp || "내 캠핑장"} MY`;
  }

  const upcoming = rows.filter((e) => !e.event_date || fmtDate(e.event_date) >= todayKey());
  const docs = await myDocs();

  $("my-content").innerHTML = `
    <div class="grid three">
      <div class="metric"><b>${rows.length}</b><span>내 행사</span></div>
      <div class="metric"><b>${upcoming.length}</b><span>다가오는 행사</span></div>
      <div class="metric"><b>${docs.length}</b><span>업로드 서류</span></div>
    </div>
    <div class="card">
      <h3>${esc(title)}</h3>
      <p class="muted">${esc(sub)}</p>
    </div>
    <div class="card">
      <h3>다가오는 행사</h3>
      <div class="list">${eventRows(upcoming.length ? upcoming : rows)}</div>
    </div>
    <div class="card">
      <h3>e나라도움 등록 지원</h3>
      <p class="muted">자동 등록이 아니라, 제출자료를 정리해서 e나라도움에 직접 등록할 수 있게 돕습니다.</p>
      <p><a class="primary" href="${ENARA_URL}" target="_blank">e나라도움 열기</a></p>
      <div class="chips"><span class="chip">사업계획서</span><span class="chip">견적서</span><span class="chip">업체자료</span><span class="chip">행사사진</span><span class="chip">지출증빙</span><span class="chip">정산자료</span></div>
    </div>
    <div class="card">
      <h3>보조사업 서류함</h3>
      ${docUploadBox()}
      <div id="my-doc-list" class="list">${await docRows(docs)}</div>
    </div>
  `;

  $("my-doc-camera")?.addEventListener("change", () => updateSelected("camera"));
  $("my-doc-file")?.addEventListener("change", () => updateSelected("file"));
  $("btn-doc-camera")?.addEventListener("click", () => { selectedDocSource = "camera"; $("my-doc-file").value = ""; $("my-doc-camera").click(); });
  $("btn-doc-file")?.addEventListener("click", () => { selectedDocSource = "file"; $("my-doc-camera").value = ""; $("my-doc-file").click(); });
  $("btn-doc-upload")?.addEventListener("click", uploadMyDocs);
}

function eventRows(rows) {
  if (!rows.length) return `<div class="item">표시할 행사가 없습니다.</div>`;
  return rows.slice(0, 30).map((e) => {
    const provider = e._meta.provider || "미지정";
    return `<div class="item">
      <div class="item-title">${esc(fmtDate(e.event_date))} · ${esc(e._program)}</div>
      <div class="item-meta">🏕 ${esc(e.camp_name || "-")} · ${esc(e._meta.cat || e.category || "기타")}</div>
      <div class="chips"><button class="secondary small" data-provider="${esc(provider)}">업체정보: ${esc(provider)}</button></div>
    </div>`;
  }).join("");
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-provider]");
  if (btn) openProviderInfo(btn.dataset.provider);
});

function docUploadBox() {
  return `<div class="file-box">
    <label class="field">서류종류
      <select id="my-doc-type">
        <option>사업계획서</option><option>견적서</option><option>업체자료</option><option>행사사진</option><option>지출증빙</option><option>정산자료</option><option>기타</option>
      </select>
    </label>
    <input id="my-doc-camera" type="file" accept="image/*" capture="environment" hidden />
    <input id="my-doc-file" type="file" multiple accept="image/*,.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" hidden />
    <div class="file-actions"><button class="camera" id="btn-doc-camera">📷 사진 찍기</button><button class="file" id="btn-doc-file">📎 파일 업로드</button><button class="primary" id="btn-doc-upload">저장</button></div>
    <div class="item-meta" id="my-doc-selected">선택된 파일 없음</div>
  </div>`;
}

function selectedFiles() {
  const cam = $("my-doc-camera")?.files || [];
  const file = $("my-doc-file")?.files || [];
  return cam.length ? cam : file;
}

function updateSelected(type) {
  const files = [...selectedFiles()];
  $("my-doc-selected").innerHTML = files.length ? `<b>${type === "camera" ? "사진" : "파일"} ${files.length}개 선택</b><br>${files.slice(0, 4).map(f => esc(f.name)).join("<br>")}` : "선택된 파일 없음";
}

async function uploadMyDocs() {
  const files = selectedFiles();
  if (!files.length) { toast("사진 또는 파일을 선택하세요."); return; }
  showLoader(true);
  try {
    await uploadFiles(files, { targetType: "library", targetId: state.member.id, docType: $("my-doc-type").value });
    toast("서류 업로드 완료");
    await renderMy();
  } catch (e) {
    alert("업로드 오류: " + e.message);
  } finally {
    showLoader(false);
  }
}

async function myDocs() {
  if (!state.member?.id) return [];
  const { data, error } = await db.from("attachments").select("*").eq("target_type", "library").order("created_at", { ascending: false }).limit(50);
  if (error) return [];
  return (data || []).filter((f) => f.uploaded_by === state.member.id || String(f.target_id) === String(state.member.id));
}

async function docRows(docs) {
  if (!docs.length) return `<div class="item">아직 업로드한 서류가 없습니다.</div>`;
  const rows = await Promise.all(docs.map(async (f) => {
    const url = await signedUrl(f);
    return `<div class="item"><div class="item-title">${esc(f.file_name || "-")}</div><div class="item-meta">${fileSize(f.file_size)} · ${fmtDate(f.created_at)}</div><a class="secondary small" href="${esc(url)}" target="_blank">열기</a></div>`;
  }));
  return rows.join("");
}
