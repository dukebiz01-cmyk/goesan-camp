import { db, rpc } from "./supabase.js";
import { state, ROLE_LABEL } from "./config.js";
import { $, esc, showLoader, toast, val } from "./utils.js";

export async function loadAdminPage() {
  if (state.role !== "admin") { $("page-admin").innerHTML = `<div class="card">관리자만 접근할 수 있습니다.</div>`; return; }
  $("page-admin").innerHTML = `
    <div class="page-head"><div><div class="page-title">관리</div><div class="page-sub">회원 · 가입 · 업체 · 이력</div></div></div>
    <div class="card"><h3>회원 등록</h3>${memberForm()}</div>
    <div class="card"><h3>가입신청</h3><div id="signup-list" class="list"></div></div>
    <div class="card"><h3>회원 목록</h3><div id="member-list" class="list"></div></div>
    <div class="card">
      <h3>업체 관리 <button class="primary small" id="btn-vendor-add" style="float:right;margin-top:-4px">+ 새 업체</button></h3>
      <div id="vendor-list" class="list"></div>
    </div>
    <div class="card"><h3>변경 이력 (최근 20건)</h3><div id="audit-list" class="list"></div></div>
  `;
  $("btn-member-save")?.addEventListener("click", createMember);
  $("btn-vendor-add")?.addEventListener("click", addVendorPrompt);
  await Promise.all([loadSignupRequests(), loadMembers(), loadVendors(), loadAuditLogs()]);
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

/* ============================================================
   업체 관리
   ============================================================ */
async function loadVendors() {
  const box = $("vendor-list");
  const { data: vendors, error } = await db.from("vendors").select("*").order("is_active", { ascending: false }).order("name", { ascending: true });
  if (error) { box.innerHTML = `<div class="item">업체 오류: ${esc(error.message)}</div>`; return; }
  if (!vendors?.length) { box.innerHTML = `<div class="item">등록된 업체가 없습니다.</div>`; return; }

  // 각 vendor의 활성 행사 수
  const { data: events } = await db.from("camp_events").select("vendor_id, status").not("vendor_id", "is", null);
  const countMap = {};
  (events || []).forEach((e) => {
    if (e.status === "cancelled") return;
    countMap[e.vendor_id] = (countMap[e.vendor_id] || 0) + 1;
  });

  box.innerHTML = vendors.map((v) => {
    const cnt = countMap[v.id] || 0;
    const programs = Array.isArray(v.programs) ? v.programs.join(", ") : "";
    return `<div class="item">
      <div class="item-title">${esc(v.name)} · ${esc(v.representative || "-")}</div>
      <div class="item-meta">📞 ${esc(v.phone || "-")}${v.business_number ? `<br>🏢 ${esc(v.business_number)}` : ""}${programs ? `<br>📋 ${esc(programs)}` : ""}<br>📅 활성 행사 ${cnt}건</div>
      <div class="chips">
        <span class="chip ${v.is_active ? "" : "red"}">${v.is_active ? "활성" : "비활성"}</span>
        <button class="secondary small" data-vendor-edit="${v.id}">수정</button>
        <button class="secondary small" data-vendor-toggle="${v.id}" data-on="${v.is_active ? "0" : "1"}">${v.is_active ? "비활성" : "활성화"}</button>
      </div>
    </div>`;
  }).join("");
}

async function addVendorPrompt() {
  const name = prompt("회사명 (예: 체험아트)");
  if (!name) return;
  const representative = prompt("대표/강사명 (선택, 비워둘 수 있음)", "") || null;
  const phone = prompt("전화번호 (예: 010-1234-5678)", "") || null;
  const programsRaw = prompt("프로그램 (콤마로 구분, 예: 페이스페인팅,헤나,캐리커쳐)", "") || "";
  const programs = programsRaw ? programsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const category = prompt("카테고리 (A/B/C, 선택)", "") || null;
  const business_number = prompt("사업자번호 (선택)", "") || null;
  const reason = prompt("등록 사유", "신규 업체 등록") || "신규 등록";

  showLoader(true);
  const res = await rpc("add_vendor", {
    p_name: name,
    p_representative: representative,
    p_phone: phone,
    p_programs: programs,
    p_category: category,
    p_business_number: business_number,
    p_reason: reason,
  }, "업체 추가");
  showLoader(false);
  if (res.error) { alert("등록 오류: " + res.error.message); return; }
  toast("업체 등록 완료"); loadVendors(); loadAuditLogs();
}

async function editVendorPrompt(id) {
  const { data: v, error } = await db.from("vendors").select("*").eq("id", id).single();
  if (error) { alert(error.message); return; }

  const name = prompt("회사명", v.name || "");
  if (name === null) return;
  const representative = prompt("대표/강사명", v.representative || "");
  if (representative === null) return;
  const phone = prompt("전화번호", v.phone || "");
  if (phone === null) return;
  const business_number = prompt("사업자번호", v.business_number || "");
  if (business_number === null) return;
  const bank_name = prompt("입금 은행 (예: 농협)", v.bank_name || "");
  if (bank_name === null) return;
  const bank_account = prompt("계좌번호", v.bank_account || "");
  if (bank_account === null) return;
  const bank_holder = prompt("예금주", v.bank_holder || "");
  if (bank_holder === null) return;
  const reason = prompt("변경 사유 (예: 강사 교체, 정보 갱신)", "");
  if (!reason) { alert("변경 사유는 필수입니다."); return; }

  showLoader(true);
  const res = await rpc("update_vendor", {
    p_id: id,
    p_name: name || null,
    p_representative: representative || null,
    p_phone: phone || null,
    p_business_number: business_number || null,
    p_bank_name: bank_name || null,
    p_bank_account: bank_account || null,
    p_bank_holder: bank_holder || null,
    p_reason: reason,
  }, "업체 수정");
  showLoader(false);
  if (res.error) { alert("수정 오류: " + res.error.message); return; }
  const affected = res.data?.affected_events ?? 0;
  toast(`변경 완료 · 영향 행사 ${affected}건`);
  loadVendors(); loadAuditLogs();
}

async function toggleVendorActive(id, newActive) {
  const action = newActive ? "활성화" : "비활성화";
  const reason = prompt(`업체를 ${action}하시겠습니까? 사유:`, action) || "";
  if (!reason) { alert("사유 필수"); return; }

  showLoader(true);
  // is_active는 update_vendor RPC가 처리 안 함 → 직접 UPDATE + audit 수동
  const { error: upErr } = await db.from("vendors").update({ is_active: newActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (!upErr) {
    await db.from("audit_logs").insert({
      action: newActive ? "activate" : "deactivate",
      target_table: "vendors",
      target_id: id,
      detail: reason,
      metadata: { change: "is_active", new_value: newActive },
    });
  }
  showLoader(false);
  if (upErr) { alert("상태 변경 오류: " + upErr.message); return; }
  toast(`${action} 완료`); loadVendors(); loadAuditLogs();
}

/* ============================================================
   변경 이력
   ============================================================ */
async function loadAuditLogs() {
  const box = $("audit-list");
  const { data, error } = await db.from("audit_logs")
    .select("*")
    .in("target_table", ["vendors", "camp_events"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) { box.innerHTML = `<div class="item">이력 오류: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { box.innerHTML = `<div class="item">변경 이력이 없습니다.</div>`; return; }

  box.innerHTML = data.map((log) => {
    const date = new Date(log.created_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const actor = log.actor_name || "-";
    const affected = log.metadata?.affected_events;
    const affectedTxt = affected ? ` · ${affected}건 영향` : "";
    const actionLabel = { update: "수정", insert: "등록", delete: "삭제", activate: "활성화", deactivate: "비활성화", cancel: "캔슬" }[log.action] || log.action;
    return `<div class="item">
      <div class="item-title">${esc(date)} · ${esc(actor)} · ${esc(actionLabel)}${esc(affectedTxt)}</div>
      <div class="item-meta">${esc(log.target_table)}<br>${esc(log.detail || "-")}</div>
    </div>`;
  }).join("");
}

/* ============================================================
   이벤트 위임
   ============================================================ */
document.addEventListener("click", async (e) => {
  const approve = e.target.closest("[data-approve]")?.dataset.approve;
  const reject = e.target.closest("[data-reject]")?.dataset.reject;
  const active = e.target.closest("[data-active]");
  const del = e.target.closest("[data-delete-member]")?.dataset.deleteMember;
  const vendorEdit = e.target.closest("[data-vendor-edit]")?.dataset.vendorEdit;
  const vendorToggle = e.target.closest("[data-vendor-toggle]");

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

  if (vendorEdit) await editVendorPrompt(vendorEdit);

  if (vendorToggle) {
    const id = vendorToggle.dataset.vendorToggle;
    const on = vendorToggle.dataset.on === "1";
    await toggleVendorActive(id, on);
  }
});
