// js/auth.js — v5.2.1 (정적 캠프 배열 fallback)
import { db, withTimeout, rpc } from "./supabase.js?v=20260513m";
import { state, ROLE_LABEL, KAKAO_OPENCHAT_URL, KAKAO_CHANNEL_URL } from "./config.js?v=20260513m";
import { $, val, setLoginError, showLoader, toast } from "./utils.js?v=20260513m";
import { applyRoute, navigate, allowedPages, defaultPage } from "./router.js?v=20260513m";

// 정적 캠프 목록 (RPC 실패 시 fallback) — DB에 있는 18개
const STATIC_CAMPS = [
  '가자우리집', '그린비', '도명산', '따봄스테이',
  '루파니캠핑장', '모래재캠핑장', '솔베이', '숲속의하모니',
  '시냇가', '아빠의나무 야영장', '아이뜰캠핑장', '운교랜드캠핑장',
  '원탑', '자연애캠핑장', '즐거운녀석들', '해밀터',
  '화양숲노리', '후평숲'
];

export async function loadMember(user) {
  state.user = user;
  const email = String(user.email || "").toLowerCase();
  let res = await withTimeout(
    db.from("members").select("*").eq("user_id", user.id).eq("is_active", true).is("deleted_at", null).maybeSingle(),
    "회원 조회"
  );
  let member = res.data || null;
  if (!member && email) {
    res = await withTimeout(
      db.from("members").select("*").ilike("email", email).eq("is_active", true).is("deleted_at", null).maybeSingle(),
      "이메일 회원 조회"
    );
    member = res.data || null;
    if (member && !member.user_id) {
      const up = await withTimeout(
        db.from("members").update({ user_id: user.id }).eq("id", member.id).select("*").maybeSingle(),
        "회원 연결"
      );
      if (!up.error && up.data) member = up.data;
    }
  }
  if (!member) {
    setLoginError("계정이 승인되지 않았습니다. 운영팀에 문의하세요.");
    return false;
  }
  state.member = member;
  state.role = member.role || "member";
  return true;
}

export async function bootAuth() {
  showLoader(true);
  try {
    const { data } = await db.auth.getSession();
    if (data?.session?.user && await loadMember(data.session.user)) {
      showApp();
    } else {
      showLogin();
      loadCampDropdown();
    }
  } catch (e) {
    console.error(e);
    showLogin();
    loadCampDropdown();
  } finally {
    showLoader(false);
  }
  db.auth.onAuthStateChange(async (event, session) => {
    if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event) && session?.user) {
      if (await loadMember(session.user)) showApp();
    }
    if (event === "SIGNED_OUT") {
      showLogin();
      loadCampDropdown();
    }
  });
}

// ★ 캠프 드롭다운 — RPC 시도 후 실패하면 정적 배열 fallback
export async function loadCampDropdown() {
  const select = $("login-camp");
  if (!select) return;

  // 일단 정적 배열 즉시 표시 (UX 우선)
  renderCamps(STATIC_CAMPS);

  // RPC도 시도 (성공하면 동적 데이터로 갱신)
  try {
    const res = await rpc("get_active_camps", {}, "캠프 목록", 5000);
    if (!res.error && res.data && res.data.length > 0) {
      const dynamicCamps = res.data.map(r => r.camp_name).filter(Boolean);
      renderCamps(dynamicCamps);
      console.log("✅ RPC 캠프 로드:", dynamicCamps.length);
    } else {
      console.warn("⚠️ RPC 결과 비어있음, 정적 배열 사용");
    }
  } catch (e) {
    console.warn("⚠️ RPC 실패, 정적 배열 유지:", e.message);
  }

  function renderCamps(camps) {
    select.innerHTML = '<option value="">캠프명 선택</option>' +
      camps.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

export function showLogin() {
  document.body.classList.add("login-mode");
  document.body.classList.remove("app-mode");
  $("login-screen").style.display = "flex";
  $("app").style.display = "none";
}

async function loadMemberSummary() {
  const countEl = document.getElementById("member-count");
  const breakdownEl = document.getElementById("member-breakdown");
  if (countEl) countEl.textContent = "-";
  if (breakdownEl) breakdownEl.textContent = "회원 현황 확인 중";
  try {
    const res = await rpc("gca_member_summary_v5", {}, "회원 현황", 9000);
    if (!res.error && res.data) {
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      const voters = Number(data.voters ?? data.active_voters ?? data.member_count ?? 0);
      const active = Number(data.active_members ?? data.total_active ?? 0);
      const providers = Number(data.providers ?? 0);
      if (countEl) countEl.textContent = voters || active || 0;
      if (breakdownEl) breakdownEl.textContent = `활성 ${active || 0}명 · 업체 ${providers || 0}곳`;
      return;
    }
    const q = await withTimeout(db.from("members").select("id,role,is_voter,is_active", { count: "exact" }).eq("is_active", true), "회원수 조회", 9000);
    const rows = q.data || [];
    const voters = rows.filter((m) => m.is_voter).length || q.count || 0;
    const providers = rows.filter((m) => ["provider","vendor","instructor"].includes(m.role)).length;
    if (countEl) countEl.textContent = voters;
    if (breakdownEl) breakdownEl.textContent = `활성 ${rows.length || q.count || 0}명 · 업체 ${providers}곳`;
  } catch (e) {
    if (countEl) countEl.textContent = "-";
    if (breakdownEl) breakdownEl.textContent = "회원수 조회 권한 확인 필요";
  }
}

export function showApp() {
  document.body.classList.add("app-mode");
  document.body.classList.remove("login-mode");
  $("login-screen").style.display = "none";
  $("app").style.display = "block";
  $("user-chip").textContent = `${state.member?.camp_name || state.member?.provider_name || state.member?.name || "사용자"} · ${ROLE_LABEL[state.role] || state.role}`;
  const topSub = $("top-sub");
  if (topSub) topSub.textContent = KAKAO_OPENCHAT_URL && KAKAO_CHANNEL_URL ? "협회 운영 시스템" : "괴산캠핑장협회";
  applyRoleMenus();
  loadMemberSummary();
  const hash = location.hash.replace("#", "");
  navigate(allowedPages().includes(hash) ? hash : defaultPage(), false);
}

export function applyRoleMenus() {
  const pages = allowedPages();
  document.querySelectorAll("#bottom-nav [data-page]").forEach((btn) => {
    btn.style.display = pages.includes(btn.dataset.page) ? "" : "none";
  });
}

export async function loginPhone() {
  const phone = val("login-phone").trim();
  const camp = val("login-camp").trim();
  const password = $("login-password")?.value || "";
  if (!phone) { setLoginError("휴대폰 번호를 입력하세요."); return; }
  if (!camp) { setLoginError("캠프명을 선택하세요."); return; }
  if (!/^\d{6}$/.test(password)) { setLoginError("비밀번호는 숫자 6자리입니다."); return; }
  showLoader(true);
  try {
    const emailRes = await rpc("find_member_email", { p_phone: phone, p_camp: camp }, "회원 조회", 8000);
    if (emailRes.error) { setLoginError("조회 오류: " + emailRes.error.message); return; }
    if (!emailRes.data) { setLoginError("등록된 회원이 아닙니다. 운영팀에 문의하세요."); return; }
    const email = String(emailRes.data).toLowerCase();
    const res = await withTimeout(db.auth.signInWithPassword({ email, password }), "로그인", 15000);
    if (res.error) { setLoginError("비밀번호가 일치하지 않습니다."); return; }
    const user = res.data?.user || res.data?.session?.user;
    if (user && await loadMember(user)) showApp();
  } catch (e) {
    setLoginError("오류: " + e.message);
  } finally {
    showLoader(false);
  }
}

export async function loginEmail() {
  const email = val("login-email").toLowerCase();
  const password = $("login-admin-password")?.value || "";
  if (!email || !password) { setLoginError("이메일과 비밀번호를 입력하세요."); return; }
  showLoader(true);
  try {
    const res = await withTimeout(db.auth.signInWithPassword({ email, password }), "관리자 로그인", 15000);
    if (res.error) { setLoginError(`로그인 실패: ${res.error.message}`); return; }
    const user = res.data?.user || res.data?.session?.user;
    if (user && await loadMember(user)) showApp();
  } catch (e) {
    setLoginError(`오류: ${e.message}`);
  } finally {
    showLoader(false);
  }
}

export async function loginKakao() {
  showLoader(true);
  const { error } = await db.auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: location.origin + location.pathname } });
  if (error) { setLoginError(error.message); showLoader(false); }
}

export async function logout() {
  if (!confirm("로그아웃 하시겠습니까?")) return;
  showLoader(true);
  try {
    await Promise.race([db.auth.signOut({ scope: "local" }), new Promise((r) => setTimeout(r, 2000))]);
  } catch (e) { console.warn("signOut:", e); }
  state.user = null; state.member = null; state.role = null;
  location.href = location.pathname + "?v=" + Date.now();
}

export async function requestSignup() {
  const payload = {
    p_name: val("signup-name"),
    p_email: (val("signup-email") || "").toLowerCase() || null,
    p_phone: val("signup-phone") || null,
    p_camp_name: val("signup-camp") || null,
    p_role_requested: val("signup-role") || "member",
    p_provider_name: val("signup-provider") || null,
    p_company_name: null,
    p_request_memo: val("signup-memo") || null,
  };
  if (!payload.p_name || !payload.p_phone) { toast("이름과 휴대폰 번호는 필수입니다."); return; }
  showLoader(true);
  const res = await rpc("request_signup_v5", payload, "가입신청");
  showLoader(false);
  if (res.error) { alert("가입신청 오류: " + res.error.message); return; }
  toast("가입신청이 접수되었습니다.");
}

export function bindAuthUI() {
  $("btn-login-phone")?.addEventListener("click", loginPhone);
  $("login-phone")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("login-camp")?.focus(); });
  $("login-camp")?.addEventListener("change", () => { $("login-password")?.focus(); });
  $("login-password")?.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPhone(); });
  $("login-password")?.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });
  $("btn-login")?.addEventListener("click", loginEmail);
  $("login-admin-password")?.addEventListener("keydown", (e) => { if (e.key === "Enter") loginEmail(); });
  $("btn-kakao")?.addEventListener("click", loginKakao);
  $("btn-logout")?.addEventListener("click", logout);
  $("btn-signup")?.addEventListener("click", requestSignup);
}
