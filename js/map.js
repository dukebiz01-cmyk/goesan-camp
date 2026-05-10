import { db } from "./supabase.js";
import { state, DEFAULT_TRAVEL } from "./config.js";
import { $, esc, normalizeKey } from "./utils.js";

let map, campLayer, placeLayer;

export async function loadCamps() {
  const { data, error } = await db.from("camps").select("*").order("camp_name", { ascending: true });
  if (error) { console.warn(error); state.camps = []; return []; }
  state.camps = (data || []).map((c) => ({
    name: c.camp_name || c.name || "",
    lat: Number(c.lat ?? c.latitude),
    lng: Number(c.lng ?? c.longitude),
    address: c.address || "",
    region: c.region || "",
    phone: c.phone || "",
    email: c.email || "",
    is_member: c.is_member !== false && !["non_member", "general", "비회원"].includes(String(c.membership_status || "").toLowerCase()),
  })).filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng));
  return state.camps;
}

export async function loadMap() {
  const el = $("map");
  if (!el) return;
  await loadCamps();

  if (typeof L === "undefined") {
    el.innerHTML = `<div class="map-fallback">Leaflet 지도 로딩 실패</div>`;
    return;
  }

  if (map) { map.remove(); map = null; }
  map = L.map(el).setView([36.76, 127.83], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(map);
  campLayer = L.layerGroup().addTo(map);
  placeLayer = L.layerGroup().addTo(map);

  renderCamps();
  renderPlaces();

  const points = [
    ...state.camps.map((c) => [c.lat, c.lng]),
    ...(state.travel?.length ? state.travel : DEFAULT_TRAVEL).filter((t) => t.lat && t.lng).map((t) => [t.lat, t.lng]),
  ];
  if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  setTimeout(() => map.invalidateSize(), 250);
}

function renderCamps() {
  campLayer.clearLayers();
  state.camps.forEach((c) => {
    const color = c.is_member ? "#185c42" : "#9ca3af";
    const icon = L.divIcon({
      className: "camp-marker",
      html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:10px;font-weight:900">${c.is_member ? "회" : "일"}</span></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    });
    L.marker([c.lat, c.lng], { icon }).addTo(campLayer).bindPopup(`<b>${esc(c.name)}</b><br>${c.is_member ? "협회 회원" : "일반 등록 야영장"}<br>📍 ${esc(c.address)}`);
  });
}

function renderPlaces() {
  placeLayer.clearLayers();
  const places = state.travel?.length ? state.travel : DEFAULT_TRAVEL;
  places.filter((p) => p.lat && p.lng).forEach((p) => {
    const icon = L.divIcon({ className: "place-marker", html: `<div style="width:28px;height:28px;border-radius:50%;background:#f59e0b;border:2px solid #fff;display:grid;place-items:center;color:white;font-weight:900">★</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker([p.lat, p.lng], { icon }).addTo(placeLayer).bindPopup(`<b>${esc(p.title)}</b><br>${esc(p.category || "관광지")}<br>📍 ${esc(p.address || "")}`);
  });
}
