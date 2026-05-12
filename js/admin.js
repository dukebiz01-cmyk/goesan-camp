import { db, rpc } from "./supabase.js";
import { state, ROLE_LABEL } from "./config.js";
import { $, esc, showLoader, toast, val } from "./utils.js";

export async function loadAdminPage() {
  if (state.role !== "admin") { $("page-admin").innerHTML = `<div class="card">관리자만 접근할 수 있습니다.</div>`; return; }
  $("page-admin").innerHTML = `
    <div class="page-head"><div><div class="page-title">관리</div><div class="page-sub">회원등록 · 가입승인 · 회원정지/삭제</div></div></div>
    <div class="card"><h3>회원 등록</h3>${memberForm()}</div>
    <div class="card"><h3>가입신청</h3><div id="signup-list" class="list"></div></div>
    <div class="card"><h3>회원 목록</h3><div id="member-list" class="list"></div></div>
  `;
  $("btn-member-save")?.addEventListener("click", createMember);
  await Promise.all([loadSignupRequests(), loadMembers()]);
}

function memberForm() {
  return `<div class="grid two"><label class="field">이름<input id="adm-name"></label><label class="field">이메일<input id="adm-email"></label><label class="field">연락처<input id="adm-phone"></label><label class="field">권한<select id="adm-role"><option value="member">회원</option><option value="provider">업체/강사</option><option value="admin">협회임원</option><option value="county">군청</option></select></label><label class="field">캠핑장명<input id="adm-camp"></label><label class="field">업체/강사명<input id="adm-provider"></label></div><button class="primary" id="btn-member-save">회원 등록</button>`;
}

async function createMember() {
  showLoader(true);
  const role = val("adm-role") || "member";
  const res = await db.rpc("create_member_admin_v4_30", {
    p_name: val("adm-name"),
    p_camp_name: val("adm-camp") || null,
    p_email: val("adm-email").toLowerCase(),
    p_phone: val("adm-phone") || null,
    p_role: role,
    p_is_voter: !["provider", "county"].includes(role),
    p_provider_name: val("adm-provider") || null,
    p_company_name: null,
  });
  showLoader(false);
  if (res.error) { alert("회원 등록 오류: " + res.error.message); return; }
  toast("회원 등록 완료"); loadAdminPage();
}

async function loadSignupRequests() {
  const { data, error } = await db.from("signup_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
  const box = $("signup-list");
  if (error) { box.innerHTML = `<div class="item">가입신청 오류: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { box.innerHTML = `<div class="item">대기 중인 가입신청이 없습니다.</div>`; return; }
  box.innerHTML = data.map((r) => `<div class="item"><div class="item-title">${esc(r.name)} · ${esc(r.role_requested)}</div><div class="item-meta">${esc(r.email)} · ${esc(r.camp_name || r.provider_name || "")}</div><div class="chips"><button class="primary small" data-approve="${r.id}">승인</button><button class="secondary small" data-reject="${r.id}">거절</button></div></div>`).join("");
}

async function loadMembers() {
  const { data, error } = await db.from("members").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  const box = $("member-list");
  if (error) { box.innerHTML = `<div class="item">회원 목록 오류: ${esc(error.message)}</div>`; return; }
  box.innerHTML = (data || []).map((m) => `<div class="item"><div class="item-title">${esc(m.name)} · ${esc(ROLE_LABEL[m.role] || m.role)}</div><div class="item-meta">${esc(m.email || "-")}<br>${esc(m.camp_name || m.provider_name || "")}</div><div class="chips"><span class="chip ${m.is_active ? "" : "red"}">${m.is_active ? "활성" : "정지"}</span><button class="secondary small" data-active="${m.id}" data-on="${m.is_active ? "0" : "1"}">${m.is_active ? "정지" : "해제"}</button><button class="secondary small" data-delete-member="${m.id}">삭제</button></div></div>`).join("");
}

document.addEventListener("click", async (e) => {
  const approve = e.target.closest("[data-approve]")?.dataset.approve;
  const reject = e.target.closest("[data-reject]")?.dataset.reject;
  const active = e.target.closest("[data-active]");
  const del = e.target.closest("[data-delete-member]")?.dataset.deleteMember;

  if (approve) {
    showLoader(true);
    const res = await rpc("approve_signup_request_v5", { p_request_id: approve, p_role: null, p_is_voter: true }, "가입승인");
    showLoader(false);
    if (res.error) alert(res.error.message); else { toast("승인 완료"); loadAdminPage(); }
  }

  if (reject) {
    const reason = prompt("거절 사유를 입력하세요") || "";
    showLoader(true);
    const res = await rpc("reject_signup_request_v5", { p_request_id: reject, p_reason: reason }, "가입거절");
    showLoader(false);
    if (res.error) alert(res.error.message); else { toast("거절 완료"); loadAdminPage(); }
  }

  if (active) {
    const id = active.dataset.active;
    const on = active.dataset.on === "1";
    showLoader(true);
    const res = await rpc("set_member_active_v5", { p_member_id: id, p_is_active: on }, "회원 상태 변경");
    showLoader(false);
    if (res.error) alert(res.error.message); else { toast("변경 완료"); loadMembers(); }
  }

  if (del) {
    if (!confirm("회원 삭제 처리하시겠습니까? 데이터 보호를 위해 soft delete 처리됩니다.")) return;
    showLoader(true);
    const res = await rpc("soft_delete_member_v5", { p_member_id: del }, "회원 삭제");
    showLoader(false);
    if (res.error) alert(res.error.message); else { toast("삭제 처리 완료"); loadMembers(); }
  }
});
