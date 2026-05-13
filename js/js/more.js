// js/more.js — v5.1.0 (지도 삭제·서류함 통합)
import { db } from "./supabase.js?v=20260513d";
import { ENARA_URL, state } from "./config.js?v=20260513d";
import { $, esc, showLoader, toast, fileSize, fmtDate } from "./utils.js?v=20260513d";
import { uploadFiles, signedUrl } from "./uploads.js?v=20260513d";
import { logout } from "./auth.js?v=20260513d";
import { navigate } from "./router.js?v=20260513d";

export async function loadMorePage() {
  const box = $("page-more");
  const role = state.role || "member";
  const isAdmin = role === "admin";
  const showMyDocs = role !== "county"; // 군청 제외 모두

  box.innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">더보기</div>
        <div class="page-sub">자료 · 서류 · 설정</div>
      </div>
    </div>

    ${isAdmin ? `
      <div class="card" style="background:#fffbeb;border:2px solid #fcd34d">
        <h3>⚙️ 관리자 메뉴</h3>
        <p class="muted">회원 관리·통계·공지 작성</p>
        <button class="primary full" id="btn-go-admin" style="margin-top:10px">관리자 화면 열기</button>
      </div>
    ` : ""}

    <div class="card">
      <h3>📚 협회 자료실</h3>
      ${isAdmin ? infoUploadBox() : ""}
      <div id="more-library-list" class="list" style="margin-top:10px"></div>
    </div>

    ${showMyDocs ? `
      <div class="card">
        <h3>📁 보조사업 서류 보관함</h3>
        <p class="muted">사진을 찍거나 파일을 올려두면 나중에 사용할 수 있어요.</p>
        ${docUploadBoxHtml()}
        <div id="more-doc-list" class="list" style="margin-top:14px"></div>
      </div>
    ` : ""}

    <div class="card">
      <h3>🔗 e나라도움</h3>
      <p class="muted">국가 보조사업 신청·정산 사이트</p>
      <p style="margin-top:14px">
        <a class="primary" href="${ENARA_URL}" target="_blank" rel="noopener">e나라도움 사이트 열기</a>
      </p>
    </div>

    ${state.member ? `
      <div class="card">
        <h3>👤 내 정보</h3>
        <p style="font-size:16px">
          이름: <b>${esc(state.member.name || "-")}</b><br>
          ${state.member.camp_name ? `캠핑장: <b>${esc(state.member.camp_name)}</b><br>` : ""}
          ${state.member.provider_name ? `업체: <b>${esc(state.member.provider_name)}</b><br>` : ""}
          역할: <b>${esc(roleLabel(role))}</b>
        </p>
      </div>
    ` : ""}

    <div class="card">
      <button class="secondary full" id="btn-more-logout">🚪 로그아웃</button>
    </div>
  `;

  // 자료실 + 내 서류 로드
  await Promise.all([
    loadLibrary(),
    showMyDocs ? loadMyDocs() : Promise.resolve(),
  ]);

  // 이벤트 바인딩
  $("btn-go-admin")?.addEventListener("click", () => navigate("admin"));
  $("btn-more-logout")?.addEventListener("click", logout);
  $("btn-info-upload")?.addEventListener("click", uploadAssociationFile);

  // 보조사업 서류 바인딩
  if (showMyDocs) {
    $("my-doc-camera")?.addEventListener("change", () => updateSelected("camera"));
    $("my-doc-file")?.addEventListener("change", () => updateSelected("file"));
    $("btn-doc-camera")?.addEventListener("click", () => {
      if ($("my-doc-file")) $("my-doc-file").value = "";
      $("my-doc-camera")?.click();
    });
    $("btn-doc-file")?.addEventListener("click", () => {
      if ($("my-doc-camera")) $("my-doc-camera").value = "";
      $("my-doc-file")?.click();
    });
    $("btn-doc-upload")?.addEventListener("click", uploadMyDocs);
  }
}

function roleLabel(role) {
  return ({
    admin: "협회임원",
    member: "회원",
    provider: "업체/강사",
    vendor: "업체/강사",
    instructor: "업체/강사",
    county: "군청",
  })[role] || role;
}

// ============================================================
// 협회 자료실 (admin 업로드 + 모두 열람)
// ============================================================
function infoUploadBox() {
  return `
    <div class="file-box">
      <label class="field">자료 분류
        <select id="info-doc-type">
          <option>국가지원금</option>
          <option>공문</option>
          <option>행사업체</option>
          <option>정산자료</option>
          <option>회의자료</option>
          <option>기타</option>
        </select>
      </label>
      <label class="field">파일 선택
        <input id="info-file" type="file" multiple />
      </label>
      <button class="primary full" id="btn-info-upload">자료 업로드</button>
    </div>
  `;
}

async function loadLibrary() {
  const target = $("more-library-list");
  if (!target) return;
  const { data, error } = await db
    .from("attachments")
    .select("*, members(name)")
    .eq("target_type", "library")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    target.innerHTML = `<div class="item">자료 로딩 오류: ${esc(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    target.innerHTML = `<div class="item"><div class="item-title">등록된 자료가 없습니다</div></div>`;
    return;
  }
  const rows = await Promise.all(
    data.map(async (f) => {
      const url = await signedUrl(f);
      return `
        <div class="item">
          <div class="item-title">${esc(f.file_name || "-")}</div>
          <div class="item-meta">${fmtDate(f.created_at)} · ${fileSize(f.file_size)}</div>
          <div class="chips" style="margin-top:8px">
            <a class="secondary small" href="${esc(url)}" target="_blank" rel="noopener">열기</a>
          </div>
        </div>
      `;
    })
  );
  target.innerHTML = rows.join("");
}

async function uploadAssociationFile() {
  const files = $("info-file")?.files;
  if (!files?.length) { toast("파일을 선택하세요"); return; }
  showLoader(true);
  try {
    await uploadFiles(files, {
      targetType: "library",
      targetId: "info:" + ($("info-doc-type")?.value || "기타"),
      docType: $("info-doc-type")?.value || "기타",
    });
    toast("자료 업로드 완료");
    await loadLibrary();
  } catch (e) {
    alert("업로드 오류: " + e.message);
  } finally {
    showLoader(false);
  }
}

// ============================================================
// 보조사업 서류 보관함 (회원 본인 파일)
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

async function loadMyDocs() {
  if (!state.member?.id) return;
  const target = $("more-doc-list");
  if (!target) return;
  const { data, error } = await db
    .from("attachments")
    .select("*")
    .eq("target_type", "library")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    target.innerHTML = `<div class="item">서류 로딩 오류: ${esc(error.message)}</div>`;
    return;
  }
  const mine = (data || []).filter((f) =>
    f.uploaded_by === state.member.id || String(f.target_id) === String(state.member.id)
  );
  if (!mine.length) {
    target.innerHTML = `<div class="item"><div class="item-title">업로드한 서류가 없습니다</div></div>`;
    return;
  }
  const rows = await Promise.all(mine.map(async (f) => {
    const url = await signedUrl(f);
    return `
      <div class="item">
        <div class="item-title">${esc(f.file_name || "-")}</div>
        <div class="item-meta">${fileSize(f.file_size)} · ${fmtDate(f.created_at)}</div>
        <a class="secondary small" href="${esc(url)}" target="_blank" rel="noopener">열기</a>
      </div>
    `;
  }));
  target.innerHTML = rows.join("");
}

async function uploadMyDocs() {
  const files = selectedFiles();
  if (!files.length) { toast("파일을 선택하세요"); return; }
  if (!state.member?.id) { toast("회원 정보가 없습니다"); return; }
  showLoader(true);
  try {
    await uploadFiles(files, {
      targetType: "library",
      targetId: state.member.id,
      docType: $("my-doc-type")?.value || "기타",
    });
    toast("업로드 완료");
    await loadMyDocs();
  } catch (e) {
    alert("업로드 오류: " + e.message);
  } finally {
    showLoader(false);
  }
}
