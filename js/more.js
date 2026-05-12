// js/more.js — 더보기 페이지
// 지도 + 협회 자료실 + e나라도움 + 관리자 진입 + 로그아웃
import { db } from "./supabase.js";
import { ENARA_URL, state } from "./config.js";
import { $, esc, showLoader, toast, fileSize, fmtDate } from "./utils.js";
import { uploadFiles, signedUrl } from "./uploads.js";
import { loadMap } from "./map.js";
import { logout } from "./auth.js";
import { navigate } from "./router.js";

export async function loadMorePage() {
  const box = $("page-more");
  const role = state.role || "member";
  const isAdmin = role === "admin";
  const isCounty = role === "county";

  box.innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">더보기</div>
        <div class="page-sub">지도 · 자료 · 설정</div>
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
      <h3>📍 캠핑장·관광지 지도</h3>
      <div id="map" class="map"></div>
      <div id="map-list"></div>
    </div>

    <div class="card">
      <h3>📚 협회 자료실</h3>
      ${isAdmin ? infoUploadBox() : ""}
      <div id="more-library-list" class="list" style="margin-top:10px"></div>
    </div>

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

  // 지도 로드
  await loadMap();
  // 자료실 로드
  await loadLibrary();

  // 이벤트
  $("btn-go-admin")?.addEventListener("click", () => navigate("admin"));
  $("btn-more-logout")?.addEventListener("click", logout);
  $("btn-info-upload")?.addEventListener("click", uploadAssociationFile);
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
