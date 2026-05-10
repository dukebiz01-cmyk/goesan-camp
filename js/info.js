import { db } from "./supabase.js";
import { DEFAULT_TRAVEL, EVENT_META, state } from "./config.js";
import { $, esc, showLoader, toast, val, fileSize, fmtDate } from "./utils.js";
import { uploadFiles, signedUrl } from "./uploads.js";
import { loadMap } from "./map.js";

export async function loadInfoPage() {
  $("page-info").innerHTML = `
    <div class="page-head"><div><div class="page-title">정보</div><div class="page-sub">캠핑장 지도 · 행사업체 · 괴산여행 · 국가지원금 · 협회자료</div></div></div>
    <div class="grid three">
      <div class="metric"><b id="info-camp-count">-</b><span>캠핑장</span></div>
      <div class="metric"><b id="info-provider-count">-</b><span>업체/강사</span></div>
      <div class="metric"><b id="info-travel-count">-</b><span>괴산여행</span></div>
    </div>
    <div class="card"><h3>국가지원금 안내</h3><div class="grid three"><div class="metric"><b>40%</b><span>국비</span></div><div class="metric"><b>30%</b><span>군비</span></div><div class="metric"><b>30%</b><span>자부담</span></div></div></div>
    <div class="card"><h3>괴산여행 콘텐츠</h3>${state.role === "admin" ? travelForm() : ""}<div id="travel-list" class="grid two"></div></div>
    <div class="card"><h3>행사업체 정보</h3><div id="provider-list" class="grid two"></div></div>
    <div class="card"><h3>협회 자료</h3>${state.role === "admin" ? infoUploadBox() : ""}<div id="library-list" class="list"></div></div>
    <div class="card"><h3>캠핑장·관광지 지도</h3><div id="map" class="map"></div><div id="map-list"></div></div>
  `;
  await Promise.all([loadTravel(), renderProviders(), loadLibrary()]);
  await loadMap();
  bindInfoEvents();
}

function travelForm() {
  return `<div class="file-box"><div class="grid two"><label class="field">콘텐츠명<input id="travel-title"></label><label class="field">분류<select id="travel-cat"><option>축제</option><option>관광지</option><option>체험</option><option>맛집</option><option>카페</option><option>특산품</option><option>계곡·자연</option></select></label><label class="field">지역<input id="travel-region"></label><label class="field">주소<input id="travel-address"></label><label class="field">위도<input id="travel-lat"></label><label class="field">경도<input id="travel-lng"></label><label class="field wide">한줄소개<textarea id="travel-summary"></textarea></label><label class="field">링크<input id="travel-link"></label><label class="field">대표이미지<input id="travel-image" type="file" accept="image/*"></label></div><button class="primary" id="btn-travel-save">괴산여행 등록</button></div>`;
}

function infoUploadBox() {
  return `<div class="file-box"><label class="field">자료분류<select id="info-doc-type"><option>국가지원금</option><option>공문</option><option>행사업체</option><option>정산자료</option><option>회의자료</option><option>기타</option></select></label><label class="field">파일<input id="info-file" type="file" multiple></label><button class="primary" id="btn-info-upload">자료 업로드</button></div>`;
}

async function loadTravel() {
  const { data, error } = await db.from("travel_contents").select("*").eq("is_active", true).order("display_order", { ascending: true }).limit(100);
  state.travel = error || !data?.length ? DEFAULT_TRAVEL : data;
  $("info-travel-count").textContent = state.travel.length;
  $("travel-list").innerHTML = state.travel.map((t) => `<div class="item"><div class="item-title">${esc(t.title)}</div><div class="item-meta">${esc(t.category || "관광지")} · ${esc(t.region || "괴산")}<br>${esc(t.address || "")}</div><p>${esc(t.summary || "")}</p><div class="chips">${t.link_url ? `<a class="secondary small" href="${esc(t.link_url)}" target="_blank">링크</a>` : ""}${t.lat && t.lng ? `<a class="secondary small" href="https://map.kakao.com/link/map/${encodeURIComponent(t.title)},${t.lat},${t.lng}" target="_blank">지도</a>` : ""}</div></div>`).join("");
}

async function renderProviders() {
  const byProvider = {};
  Object.entries(EVENT_META).forEach(([program, meta]) => {
    const p = meta.provider || "미지정";
    if (!byProvider[p]) byProvider[p] = { programs: [], cat: meta.cat };
    byProvider[p].programs.push(program);
  });
  state.providers = Object.entries(byProvider).map(([provider, v]) => ({ provider, ...v }));
  $("info-provider-count").textContent = state.providers.length;
  $("provider-list").innerHTML = state.providers.map((p) => `<div class="item"><div class="item-title">${esc(p.provider)}</div><div class="item-meta">${esc(p.cat || "")}</div><p>${esc(p.programs.join(", "))}</p><div class="chips"><button class="secondary small" data-open-provider="${esc(p.provider)}">상세</button></div></div>`).join("");
}

export async function openProviderInfo(provider) {
  if (state.page !== "info") {
    location.hash = "#info";
  }
  setTimeout(() => {
    const p = state.providers.find((x) => x.provider === provider);
    if (!p) { toast("업체 정보가 없습니다."); return; }
    alert(`${p.provider}\n\n담당 콘텐츠:\n${p.programs.join(", ")}\n\n연락처는 provider 계정의 phone/email 등록 후 표시됩니다.`);
  }, 250);
}

async function loadLibrary() {
  const { data, error } = await db.from("attachments").select("*, members(name)").eq("target_type", "library").order("created_at", { ascending: false }).limit(30);
  const list = $("library-list");
  if (error) { list.innerHTML = `<div class="item">자료 로딩 오류: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { list.innerHTML = `<div class="item">등록된 자료가 없습니다.</div>`; return; }
  const rows = await Promise.all(data.map(async (f) => {
    const url = await signedUrl(f);
    return `<div class="item"><div class="item-title">${esc(f.file_name || "-")}</div><div class="item-meta">${fmtDate(f.created_at)} · ${fileSize(f.file_size)}</div><a class="secondary small" href="${esc(url)}" target="_blank">열기</a></div>`;
  }));
  list.innerHTML = rows.join("");
}

function bindInfoEvents() {
  $("btn-info-upload")?.addEventListener("click", async () => {
    const files = $("info-file")?.files;
    if (!files?.length) { toast("파일을 선택하세요."); return; }
    showLoader(true);
    try {
      await uploadFiles(files, { targetType: "library", targetId: "info:" + $("info-doc-type").value, docType: $("info-doc-type").value });
      toast("자료 업로드 완료");
      loadLibrary();
    } catch (e) { alert("업로드 오류: " + e.message); }
    finally { showLoader(false); }
  });

  $("btn-travel-save")?.addEventListener("click", submitTravel);
}

async function submitTravel() {
  const title = val("travel-title");
  if (!title) { toast("콘텐츠명을 입력하세요."); return; }
  showLoader(true);
  try {
    let image_path = null;
    const file = $("travel-image")?.files?.[0];
    if (file) {
      const uploaded = await uploadFiles([file], { targetType: "library", targetId: "travel", docType: "대표이미지" });
      image_path = uploaded[0]?.file_path || null;
    }
    const payload = {
      title,
      category: val("travel-cat") || "관광지",
      region: val("travel-region") || null,
      address: val("travel-address") || null,
      lat: val("travel-lat") ? Number(val("travel-lat")) : null,
      lng: val("travel-lng") ? Number(val("travel-lng")) : null,
      summary: val("travel-summary") || null,
      link_url: val("travel-link") || null,
      image_bucket: image_path ? "association-files" : null,
      image_path,
      created_by: state.member.id,
    };
    const { error } = await db.from("travel_contents").insert(payload);
    if (error) throw error;
    toast("괴산여행 콘텐츠 등록 완료");
    loadInfoPage();
  } catch (e) { alert("등록 오류: " + e.message); }
  finally { showLoader(false); }
}
