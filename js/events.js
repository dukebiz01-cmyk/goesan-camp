// js/events.js — 행사 박제·예산·묶음 핵심 로직
// v5.2: getEventsByProvider vendor DB 우선 + vendors 캐시 무효화
import { db } from "./supabase.js";
import {
  state,
  PROGRAMS,
  EVENT_META,
  CATEGORY_LABEL,
  CAMP_BUDGET,
  FORFEITED_CAMP_NAMES,
  ALL_CAMPS_DEFAULT,
} from "./config.js";
import { normalizeKey } from "./utils.js";

// ============================================================
// 프로그램 검색
// ============================================================
export function findProgram(name) {
  for (const catKey of ["A", "B", "C", "D"]) {
    for (const p of PROGRAMS[catKey]) {
      if (p.n === name) return { ...p, cat: catKey };
    }
  }
  return null;
}

// ============================================================
// 캠프 매칭 (정규화)
// ============================================================
export function isForfeitedCampName(name) {
  const n = normalizeKey(name);
  return FORFEITED_CAMP_NAMES.some((x) => normalizeKey(x) === n);
}

export function campBudget(campName) {
  return isForfeitedCampName(campName) ? 0 : CAMP_BUDGET;
}

export function eligibleCamps() {
  return state.camps.filter((c) => !isForfeitedCampName(c.name || c.camp_name));
}

export function totalBudgetLimit() {
  return state.camps.reduce((sum, c) => sum + campBudget(c.name || c.camp_name), 0);
}

export function getCampGroup(name) {
  const c = state.camps.find((x) => (x.name || x.camp_name) === name);
  if (!c) return "";
  return c.group_name || c.group || "";
}

// ============================================================
// 묶음(bundle) 로직 — events.html에서 흡수
// ============================================================
export function bundleCapacity(programName) {
  const p = findProgram(programName);
  if (!p) return 1;
  if (p.p.bundle3) return 3;
  if (p.p.bundle2) return 2;
  return 1;
}

// 같은 날·행사 일정을 신청 순서대로 정렬해서 묶음 단위로 분할
export function getBundles(date, programName) {
  const events = state.events
    .filter((e) => e.event_date === date && e.program_name === programName && e.bundle_type !== "ticket")
    .sort((a, b) => {
      if (a.bundle_seq != null && b.bundle_seq != null) return a.bundle_seq - b.bundle_seq;
      if (a.bundle_seq != null) return -1;
      if (b.bundle_seq != null) return 1;
      const ca = a.created_at || "";
      const cb = b.created_at || "";
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.id || 0) - (b.id || 0);
    });

  if (events.length === 0) return [];
  const cap = bundleCapacity(programName);
  const bundles = [];
  for (let i = 0; i < events.length; i += cap) {
    const chunk = events.slice(i, i + cap);
    const lockedFromChunk = chunk.find((e) => e.locked_price)?.locked_price;
    bundles.push({
      seq: bundles.length + 1,
      events: chunk,
      capacity: cap,
      count: chunk.length,
      complete: chunk.length === cap,
      finalized: chunk.some((e) => e.finalized),
      lockedPrice: lockedFromChunk,
    });
  }
  return bundles;
}

export function findBundleForEvent(event) {
  if (event.bundle_type === "ticket") return null;
  const bundles = getBundles(event.event_date, event.program_name);
  for (const b of bundles) {
    if (b.events.some((e) => e.id === event.id)) return b;
  }
  return null;
}

// ============================================================
// 가격 계산
// ============================================================
export function autoPrice(name, count) {
  const p = findProgram(name);
  if (!p) return { price: 0, bundle: "none" };
  const pr = p.p;
  if (count >= 3 && pr.bundle3) return { price: pr.bundle3, bundle: "bundle3" };
  if (count === 2 && pr.bundle2) return { price: pr.bundle2, bundle: "bundle2" };
  if (count === 2 && pr.bundle3) return { price: pr.bundle3, bundle: "bundle3-partial", warn: "3업체 묶음 단가 받으려면 1곳 더 필요" };
  if (pr.single) return { price: pr.single, bundle: "single" };
  if (pr.bundle3) return { price: pr.bundle3, bundle: "single-as-bundle3", warn: "단독은 단가 협상 필요" };
  return { price: 0, bundle: "none" };
}

export function ticketPrice(name, qty) {
  const p = findProgram(name);
  return (p && p.p.ticket || 0) * (qty || 1);
}

// 일정의 실제 가격 (박제됐으면 locked_price, 아니면 현재 묶음 상태로 동적 계산)
export function getEventPrice(event) {
  if (event.bundle_type === "ticket") return ticketPrice(event.program_name, event.qty);
  if (event.locked_price) return event.locked_price;
  const b = findBundleForEvent(event);
  if (!b) return autoPrice(event.program_name, 1).price;
  return autoPrice(event.program_name, b.count).price;
}

export function campSpent(camp) {
  let total = 0;
  for (const e of state.events) {
    if ((e.camp_name) !== camp) continue;
    total += getEventPrice(e);
  }
  return total;
}

// ============================================================
// 검증 (충돌·예산 초과)
// ============================================================
export function getIssues() {
  const issues = [];
  const groups = {};
  for (const e of state.events) {
    if (e.bundle_type === "ticket") continue;
    const k = `${e.event_date}|${e.program_name}`;
    if (!groups[k]) groups[k] = { date: e.event_date, name: e.program_name, cat: e.category, camps: [] };
    groups[k].camps.push(e.camp_name);
  }
  for (const g of Object.values(groups)) {
    const n = g.camps.length;
    const p = findProgram(g.name);
    if (!p) continue;
    if (n === 1 && p.p.bundle3) {
      issues.push({ type: "warn", date: g.date, title: `${g.date} ${g.name} - 1곳만 (단독)`, detail: `bundle3 단가(${p.p.bundle3.toLocaleString()}원) 받으려면 2곳 더 필요`, camps: g.camps });
    }
    if (n === 2 && !p.p.bundle2 && p.p.bundle3) {
      issues.push({ type: "warn", date: g.date, title: `${g.date} ${g.name} - 2곳`, detail: `bundle3 단가 받으려면 1곳 더 필요`, camps: g.camps });
    }
    if (n === 4 || n === 5) {
      issues.push({ type: "warn", date: g.date, title: `${g.date} ${g.name} - ${n}곳 (애매)`, detail: `bundle3는 3곳 단위. 1곳 빼거나 ${6 - n}곳 더 추가 권장`, camps: g.camps });
    }
  }
  // 강사 충돌
  const slots = {};
  for (const e of state.events) {
    if (e.bundle_type === "ticket") continue;
    const p = findProgram(e.program_name);
    if (!p) continue;
    if (p.i.startsWith("D_보트") || p.i.startsWith("D_유람선") || p.i.startsWith("D_자체")) continue;
    const k = `${e.event_date}|${p.i}`;
    if (!slots[k]) slots[k] = { date: e.event_date, inst: p.i, events: {} };
    if (!slots[k].events[e.program_name]) slots[k].events[e.program_name] = [];
    slots[k].events[e.program_name].push(e.camp_name);
  }
  for (const s of Object.values(slots)) {
    const total = Object.values(s.events).reduce((a, b) => a + b.length, 0);
    if (total > 3) {
      const detail = Object.entries(s.events).map(([n, cs]) => `${n}: ${cs.length}곳`).join(", ");
      issues.push({
        type: total >= 6 ? "danger" : "warn",
        date: s.date,
        title: `${s.date} ${s.inst.split("_")[1] || s.inst} 강사 ${total}곳 ${total >= 6 ? "불가능" : "과부하"}`,
        detail,
      });
    }
  }
  // 예산 초과
  for (const c of state.camps.map((x) => x.name || x.camp_name)) {
    const limit = campBudget(c);
    const t = campSpent(c);
    if (t > limit) {
      issues.push({ type: "danger", date: "", title: `${c} 예산 초과`, detail: `사용 ${t.toLocaleString()}원 / 한도 ${limit.toLocaleString()}원 (${(t - limit).toLocaleString()}원 초과)` });
    }
  }
  issues.sort((a, b) => (a.date || "zzz").localeCompare(b.date || "zzz"));
  return issues;
}

// ============================================================
// 합류 기회 (내 캠프가 합류 가능한 미완성 묶음)
// ============================================================
export function getMyJoinOpportunities(myCamp) {
  const opps = [];
  const seenKeys = new Set();

  for (const e of state.events) {
    if (e.bundle_type === "ticket") continue;
    if (e.camp_name === myCamp) continue;
    const key = `${e.event_date}|${e.program_name}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const myAlready = state.events.some(
      (me) =>
        me.camp_name === myCamp &&
        me.event_date === e.event_date &&
        me.program_name === e.program_name &&
        me.bundle_type !== "ticket"
    );
    if (myAlready) continue;

    const bundles = getBundles(e.event_date, e.program_name);
    const openBundle = bundles.find((b) => !b.complete && !b.finalized);
    if (!openBundle) continue;

    const p = findProgram(e.program_name);
    if (!p) continue;

    const newCount = openBundle.count + 1;
    const newAp = autoPrice(e.program_name, newCount);
    const currentSingle = autoPrice(e.program_name, 1).price;
    const savings = currentSingle - newAp.price;
    if (savings <= 0) continue;

    const eventDate = new Date(e.event_date);
    const today = new Date();
    const daysLeft = Math.floor((eventDate - today) / (1000 * 60 * 60 * 24));

    opps.push({
      date: e.event_date,
      name: e.program_name,
      cat: e.category,
      camps: openBundle.events.map((ev) => ev.camp_name),
      newPrice: newAp.price,
      savings,
      need: openBundle.capacity - openBundle.count,
      newCount,
      daysLeft,
    });
  }

  return opps.sort((a, b) => {
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    return b.savings - a.savings;
  });
}

// 전체 모집 중 묶음 (관리자용)
export function getOpenBundles() {
  const result = [];
  const seenKeys = new Set();

  for (const e of state.events) {
    if (e.bundle_type === "ticket") continue;
    if (!e.event_date) continue;
    const key = `${e.event_date}|${e.program_name}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const bundles = getBundles(e.event_date, e.program_name);
    for (const b of bundles) {
      if (b.complete || b.finalized) continue;
      const p = findProgram(e.program_name);
      if (!p) continue;
      const currentPrice = autoPrice(e.program_name, b.count).price;
      const fullPrice = autoPrice(e.program_name, b.capacity).price;
      const savings = currentPrice - fullPrice;
      if (savings <= 0) continue;
      const eventDate = new Date(e.event_date);
      const today = new Date();
      const daysLeft = Math.floor((eventDate - today) / (1000 * 60 * 60 * 24));

      result.push({
        date: e.event_date,
        name: e.program_name,
        cat: e.category,
        bundleSeq: b.seq,
        camps: b.events.map((ev) => ev.camp_name),
        count: b.count,
        capacity: b.capacity,
        need: b.capacity - b.count,
        currentPrice,
        fullPrice,
        savings,
        daysLeft,
      });
    }
  }
  return result.sort((a, b) => {
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    return b.savings - a.savings;
  });
}

// ============================================================
// DB I/O — events.html에서 흡수
// ============================================================
// vendors 캐시 + 프로그램→vendor 매핑
async function ensureVendorsLoaded() {
  if (state.vendors && state.programToVendor) return;
  try {
    const { data, error } = await db
      .from("vendors")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) throw error;
    state.vendors = data || [];
    state.programToVendor = {};
    for (const v of state.vendors) {
      for (const p of v.programs || []) {
        state.programToVendor[p] = v;
      }
    }
  } catch (e) {
    console.warn("vendors load failed:", e);
    state.vendors = state.vendors || [];
    state.programToVendor = state.programToVendor || {};
  }
}

export async function loadEvents() {
  state.eventsError = null;
  // ★ FIX: vendors 캐시 무효화 후 재로딩 — 관리자 vendor 수정 후 즉시 반영
  state.vendors = null;
  state.programToVendor = null;
  await ensureVendorsLoaded();
  const { data, error } = await db
    .from("camp_events")
    .select("*")
    .order("event_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("camp_events load error:", error);
    state.eventsError = error.message || "camp_events 조회 오류";
    state.events = [];
    return [];
  }

  // 포기 캠프 제외 + vendors DB로 보강 (DB가 진실)
  state.events = (data || [])
    .filter((e) => !isForfeitedCampName(e.camp_name))
    .map((e) => {
      const program = e.program_name || e.title || "미지정";
      const vendor = state.programToVendor[program];
      const meta = EVENT_META[program] || {};
      return {
        ...e,
        _program: program,
        _catName: meta.cat || CATEGORY_LABEL[e.category] || e.category || "기타",
        _provider: vendor?.representative || meta.provider || "(미지정)",
        _company: vendor?.name || meta.company || "",
        _vendor: vendor || null,
        _phone: vendor?.phone || null,
        _instructorId: meta.instructorId || vendor?.id || null,
      };
    });
  return state.events;
}

export async function loadCamps() {
  let res = await db.from("camps").select("*").order("group_name").order("id");
  if (res.error) {
    console.warn("camps load failed, using default:", res.error.message);
    state.camps = ALL_CAMPS_DEFAULT.map((c, i) => ({ ...c, id: i + 1, budget: campBudget(c.name) }));
    return state.camps;
  }
  // 각 캠프 owner 이메일 매핑
  const data = res.data || [];
  const userIds = data.filter((c) => c.member_id).map((c) => c.member_id);
  if (userIds.length > 0) {
    const m = await db.from("members").select("user_id, email, name").in("user_id", userIds);
    if (m.data) {
      const map = {};
      m.data.forEach((row) => { map[row.user_id] = row; });
      data.forEach((c) => {
        const r = map[c.member_id];
        c.member_email = r?.email || null;
        c.member_name = r?.name || null;
      });
    }
  }
  state.camps = data;
  return state.camps;
}

export async function loadAnnouncements() {
  const { data, error } = await db
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("announcements load:", error.message);
    state.announcements = [];
    return [];
  }
  const now = new Date();
  state.announcements = (data || []).filter((a) => !a.expires_at || new Date(a.expires_at) > now);
  return state.announcements;
}

// ============================================================
// 행사 추가 (insert + 묶음 lock)
// ============================================================
function omitKeys(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

async function insertCampEvent(payload) {
  // 컬럼이 일부 없을 수 있어 단계적으로 시도
  const attempts = [
    payload,
    omitKeys(payload, ["locked_price", "finalized"]),
    omitKeys(payload, ["bundle_seq", "locked_price", "finalized"]),
    omitKeys(payload, ["created_by", "bundle_seq", "locked_price", "finalized"]),
  ];
  let lastError = null;
  const used = new Set();
  for (const body of attempts) {
    const key = JSON.stringify(body);
    if (used.has(key)) continue;
    used.add(key);
    const { data, error } = await db.from("camp_events").insert(body).select("*").maybeSingle();
    if (!error) return data;
    lastError = error;
    console.warn("insert attempt failed:", error.message);
  }
  throw lastError || new Error("행사 등록 실패");
}

export async function finalizeCompleteBundlesFor(date, programName) {
  try {
    await loadEvents();
    const bundles = getBundles(date, programName);
    for (const b of bundles) {
      if (!b.complete || b.finalized || b.lockedPrice) continue;
      const ids = b.events.map((e) => e.id).filter(Boolean);
      if (ids.length === 0) continue;
      const lockedPrice = autoPrice(programName, b.count).price;
      const { error } = await db.from("camp_events").update({ locked_price: lockedPrice, finalized: true }).in("id", ids);
      if (error) console.warn("bundle finalize skipped:", error.message);
    }
  } catch (err) {
    console.warn("bundle finalize failed:", err);
  }
}

export async function recomputeBundlesAfterDelete(date, programName) {
  try {
    const { data: rows, error } = await db
      .from("camp_events")
      .select("id,event_date,program_name,bundle_type,bundle_seq,locked_price,finalized,created_at")
      .eq("event_date", date)
      .eq("program_name", programName)
      .neq("bundle_type", "ticket")
      .order("created_at", { ascending: true });
    if (error) { console.error("recompute load:", error); return; }
    const items = rows || [];
    const cap = bundleCapacity(programName);
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const seq = i + 1;
      const bundleIndex = Math.floor(i / cap);
      const start = bundleIndex * cap;
      const end = start + cap;
      const bundleItems = items.slice(start, end);
      let lockedPrice = null;
      let finalized = false;
      if (bundleItems.length === cap) {
        lockedPrice = autoPrice(programName, cap).price;
        finalized = true;
      }
      await db.from("camp_events").update({ bundle_seq: seq, locked_price: lockedPrice, finalized }).eq("id", row.id);
    }
  } catch (err) {
    console.error("recomputeBundlesAfterDelete failed:", err);
  }
}

export async function createEvent({ campName, programName, date, qty = 1, userId = null }) {
  const p = findProgram(programName);
  if (!p) throw new Error("등록되지 않은 프로그램입니다");
  if (isForfeitedCampName(campName)) throw new Error("예산권 포기 캠프는 신청할 수 없습니다");
  const isTicket = !!p.p.ticket;
  if (!isTicket && !date) throw new Error("날짜를 선택하세요");

  // 중복 체크
  if (!isTicket) {
    const dup = state.events.some(
      (e) =>
        e.camp_name === campName &&
        e.event_date === date &&
        e.program_name === programName &&
        e.bundle_type !== "ticket"
    );
    if (dup) throw new Error("이미 같은 날짜에 같은 프로그램이 등록되어 있습니다");
  }

  const existingCount = !isTicket
    ? state.events.filter((e) => e.event_date === date && e.program_name === programName && e.bundle_type !== "ticket").length
    : 0;

  const payload = {
    camp_name: campName,
    event_date: isTicket ? null : date,
    category: p.cat,
    program_name: programName,
    qty: isTicket ? Math.max(1, Number(qty)) : 1,
    bundle_type: isTicket ? "ticket" : "program",
    bundle_seq: isTicket ? null : existingCount + 1,
    locked_price: null,
    finalized: false,
    created_by: userId,
  };

  await insertCampEvent(payload);
  if (!isTicket) await finalizeCompleteBundlesFor(date, programName);
  await loadEvents();
  return true;
}

export async function deleteEvent(eventId) {
  const e = state.events.find((x) => String(x.id) === String(eventId));
  if (!e) throw new Error("일정을 찾을 수 없습니다");
  const { data, error } = await db.from("camp_events").delete().eq("id", eventId).select();
  if (error) {
    if (error.message?.includes("row-level security")) throw new Error("삭제 권한(RLS) 부족 — 정책 확인 필요");
    throw error;
  }
  if (!data || data.length === 0) throw new Error("삭제 실패 — 권한 또는 RLS 정책 문제");
  if (e.event_date && e.bundle_type !== "ticket") {
    await recomputeBundlesAfterDelete(e.event_date, e.program_name);
  }
  await loadEvents();
  return true;
}

// ============================================================
// 실시간 구독
// ============================================================
let _realtimeStarted = false;
export function subscribeRealtime(onChange) {
  if (_realtimeStarted) return;
  _realtimeStarted = true;
  db.channel("events-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "camp_events" }, (payload) => {
      console.log("실시간 변경", payload);
      loadEvents().then(() => onChange?.("events"));
    })
    .subscribe();
  db.channel("ann-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, (payload) => {
      console.log("공지 변경", payload);
      loadAnnouncements().then(() => onChange?.("announcements", payload));
    })
    .subscribe();
}

// ============================================================
// 강사별 일정 정리
// ============================================================
export function getInstructorsFromEvents() {
  const map = {};
  for (const e of state.events) {
    if (e.bundle_type === "ticket") continue;
    const p = findProgram(e.program_name);
    if (!p || !p.i || p.i === "D_자체") continue;
    if (!map[p.i]) {
      map[p.i] = { key: p.i, cat: p.i.charAt(0), name: p.i.split("_")[1] || p.i, count: 0, events: [] };
    }
    map[p.i].count++;
    map[p.i].events.push(e);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// 업체별 일정 (vendors 페이지용)
// ★ FIX v5.2: vendor DB 우선 — _provider/_company/_phone 사용
export function getEventsByProvider() {
  const map = {};
  for (const e of state.events) {
    // _provider는 loadEvents에서 vendor.representative 우선으로 채워짐
    const provider = e._provider || "(미지정)";
    if (provider === "(미지정)") continue;
    const program = e._program || e.program_name;
    const meta = EVENT_META[program] || {};
    if (!map[provider]) {
      map[provider] = {
        provider,                                       // vendor.representative (예: 이지윤)
        company: e._company || meta.company || "",     // vendor.name (예: 체험아트)
        phone: e._phone || "",                          // vendor.phone (예: 010-3118-2383)
        vendorId: e._vendor?.id || null,
        instructorId: meta.instructorId,
        cat: e._catName || meta.cat,
        programs: new Set(),
        events: [],
      };
    }
    map[provider].programs.add(program);
    map[provider].events.push(e);
  }
  return Object.values(map).map((v) => ({ ...v, programs: [...v.programs] }));
}
