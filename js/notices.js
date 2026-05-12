import { db } from "./supabase.js";
import { state } from "./config.js";
import { $, esc, fmtDate, showLoader, toast, val } from "./utils.js";
import { openModal, closeModal } from "./router.js";
import { uploadFiles } from "./uploads.js";

export async function loadNoticesPage() {
  const box = $("page-notices");
  box.innerHTML = `<div class="page-head"><div><div class="page-title">공지</div><div class="page-sub">협회 공식 알림과 회의 안내</div></div>${state.role === "admin" ? `<button class="primary" id="btn-notice-new">+ 작성</button>` : ""}</div><div id="notice-list" class="list"><div class="card">불러오는 중...</div></div>`;
  $("btn-notice-new")?.addEventListener("click", openNoticeForm);
  await loadNotices();
}

async function loadNotices() {
  const { data, error } = await db.from("notices").select("*, members(name)").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(60);
  const list = $("notice-list");
  if (error) { list.innerHTML = `<div class="card">공지 로딩 오류: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { list.innerHTML = `<div class="card">등록된 공지가 없습니다.</div>`; return; }
  list.innerHTML = data.map((n) => `<div class="item">
    <div class="item-title">${n.is_pinned ? "📌 " : ""}${esc(n.title || "-")}</div>
    <div class="item-meta">${fmtDate(n.created_at)} · ${esc(n.members?.name || "관리자")}</div>
    <p>${esc(n.content || "").slice(0, 180)}</p>
    <div class="chips">${state.role === "admin" ? `<button class="secondary small" data-del-notice="${n.id}">삭제</button>` : ""}</div>
  </div>`).join("");
}

function openNoticeForm() {
  openModal("공지 작성", `<label class="field">제목<input id="notice-title"></label><label class="field">내용<textarea id="notice-content"></textarea></label><label class="field">첨부<input id="notice-files" type="file" multiple></label><button class="primary full" id="notice-save">공지 등록</button>`);
  $("notice-save").addEventListener("click", createNotice);
}

async function createNotice() {
  const title = val("notice-title");
  const content = val("notice-content");
  if (!title || !content) { toast("제목과 내용을 입력하세요."); return; }
  showLoader(true);
  const { data, error } = await db.from("notices").insert({ title, content, created_by: state.member.id }).select("*").maybeSingle();
  if (!error && $("notice-files")?.files?.length) await uploadFiles($("notice-files").files, { targetType: "notice", targetId: data.id, docType: "공지첨부" });
  showLoader(false);
  if (error) { alert("공지 작성 오류: " + error.message); return; }
  closeModal(); toast("공지 등록 완료"); loadNoticesPage();
}

document.addEventListener("click", async (e) => {
  const id = e.target.closest("[data-del-notice]")?.dataset.delNotice;
  if (!id) return;
  if (!confirm("공지 삭제 처리하시겠습니까?")) return;
  showLoader(true);
  const res = await db.rpc("delete_notice_admin_v4_15", { p_notice_id: id });
  showLoader(false);
  if (res.error) { alert("삭제 오류: " + res.error.message); return; }
  toast("삭제 완료"); loadNoticesPage();
});
