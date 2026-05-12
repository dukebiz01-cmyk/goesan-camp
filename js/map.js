import { db } from "./supabase.js";
import { state, DEFAULT_TRAVEL } from "./config.js";
import { $, esc } from "./utils.js";

let map, campLayer, placeLayer;

export async function loadCamps() {
  let res = await db.from("camps").select("*").order("camp_name", { ascending: true });
  if (res.error) {
    console.warn("camps by camp_name failed:", res.error.message);
    res = await db.from("camps").select("*").order("name", { ascending: true });
  }

  if (res.error) {
    console.warn("camps load error:", res.error.message);
    state.camps = [];
    return [];
  }

  state.camps = (res.data || []).map((c) => ({
    name: c.camp_name || c.name || c.n || "",
    lat: Number(c.lat ?? c.latitude),
    lng: Number(c.lng ?? c.lon ?? c.longitude),
    address: c.address || c.addr || "",
    region: c.region || c.area || "",
    phone: c.phone || c.tel || "",
    email: c.email || "",
    is_member: c.is_member !== false && !["non_member", "general", "비회원"].includes(String(c.membership_status || c.member_status || "").toLowerCase()),
  })).filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng));

  const countEl = $("info-camp-count");
  if (countEl) countEl.textContent = state.camps.length;

  return state.camps;
}

export async function loadMap() {
  const el = $("map");
  if (!el) return;

  el.innerHTML = `<div class="map-status">지도 데이터 불러오는 중...</div>`;
  await loadCamps();

  if (typeof window.L === "undefined") {
    el.innerHTML = `<div class="map-error">Leaflet 지도 라이브러리를 불러오지 못했습니다.<br>index.html에 leaflet.js 스크립트가 있는지 확인하세요.</div>`;
    renderMapList();
    return;
  }

  try {
    if (map) { map.remove(); map = null; }
    map = window.L.map(el).setView([36.76, 127.83], 11);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);

    campLayer = window.L.layerGroup().addTo(map);
    placeLayer = window.L.layerGroup().addTo(map);

    renderCamps();
    renderPlaces();

    const places = state.travel?.length ? state.travel : DEFAULT_TRAVEL;
    const points = [
      ...state.camps.map((c) => [c.lat, c.lng]),
      ...places.filter((t) => t.lat && t.lng).map((t) => [Number(t.lat), Number(t.lng)]),
    ].filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));

    if (points.length) map.fitBounds(window.L.latLngBounds(points), { padding: [40, 40] });
    setTimeout(() => map.invalidateSize(), 250);
  } catch (e) {
    console.error("map init error:", e);
    el.innerHTML = `<div class="map-error">지도 초기화 오류: ${esc(e.message || e)}</div>`;
    renderMapList();
  }
}

function renderCamps() {
  campLayer.clearLayers();
  state.camps.forEach((c) => {
    const color = c.is_member ? "#185c42" : "#9ca3af";
    const label = c.is_member ? "회" : "일";
    const icon = window.L.divIcon({
      className: "camp-marker",
      html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:10px;font-weight:900">${label}</span></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    });
    window.L.marker([c.lat, c.lng], { icon })
      .addTo(campLayer)
      .bindPopup(`<b>${esc(c.name)}</b><br>${c.is_member ? "협회 회원" : "일반 등록 야영장"}<br>📍 ${esc(c.address)}`);
  });
}

function renderPlaces() {
  placeLayer.clearLayers();
  const places = state.travel?.length ? state.travel : DEFAULT_TRAVEL;
  places.filter((p) => p.lat && p.lng).forEach((p) => {
    const icon = window.L.divIcon({
      className: "place-marker",
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#f59e0b;border:2px solid #fff;display:grid;place-items:center;color:white;font-weight:900">★</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    window.L.marker([Number(p.lat), Number(p.lng)], { icon })
      .addTo(placeLayer)
      .bindPopup(`<b>${esc(p.title)}</b><br>${esc(p.category || "관광지")}<br>📍 ${esc(p.address || "")}`);
  });
}

function renderMapList() {
  const list = $("map-list");
  if (!list) return;
  const places = state.travel?.length ? state.travel : DEFAULT_TRAVEL;
  const campRows = state.camps.map((c) => `<div class="map-list-card"><b>${esc(c.name)}</b><span class="${c.is_member ? "" : "non"}">${c.is_member ? "협회 회원" : "비회원/일반"}</span><br>${esc(c.address || "")}</div>`).join("");
  const placeRows = places.map((p) => `<div class="map-list-card"><b>${esc(p.title)}</b><span>${esc(p.category || "관광지")}</span><br>${esc(p.address || "")}</div>`).join("");
  list.innerHTML = `<div class="map-list-grid">${campRows}${placeRows}</div>`;
}
