// js/notices.js — 공지 + 투표 통합
import { db } from "./supabase.js";
import { state } from "./config.js";
import { $, esc, fmtDate, showLoader, toast, val } from "./utils.js";
import { openModal, closeModal } from "./router.js";
import { uploadFiles } from "./uploads.js";

export async function loadNoticesPage() {
  const box = $("page-notices");
  box.innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">소식</div>
        <div class="page-sub">협회 공지사항과 안건</div>
      </div>
      ${state.role === "admin" ? `<button class="primary" id="btn-notice-new">+ 공지</button>` : ""}
    </div>

    <div class="card">
      <h3>📢 공지사항</h3>
      <div id="notice-list" class="list" style="margin-top:10px">
        <div class="item"><p class="muted">불러오는 중...</p></div>
      </div>
    </div>

    <div class="card">
      <h3>🗳 안건 / 투표</h3>
      ${state.role === "admin" ? `<button class="secondary" id="btn-vote-new" style="margin-bottom:10px">+ 안건 등록</button>` : ""}
      <div id="vote-list" class="list">
        <div class="item"><p class="muted">불러오는 중...</p></div>
      </div>
    </div>
  `;

  $("btn-notice-new")?.addEventListener("click", openNoticeForm);
  $("btn-vote-new")?.addEventListener("click", openAgendaForm);

  await Promise.all([loadNotices(), loadVotes()]);
}

// ============================================================
// 공지
// ============================================================
async function loadNotices() {
  const { data, error } = await db
    .from("notices")
    .select("*, members(name)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  const list = $("notice-list");
  if (!list) return;
  if (error) {
    list.innerHTML = `<div class="item">공지 로딩 오류: ${esc(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = `<div class="item"><div class="item-title">등록된 공지가 없습니다</div></div>`;
    return;
  }
  list.innerHTML = data.map((n) => `
    <div class="item">
      <div class="item-title">
        ${n.is_pinned ? "📌 " : ""}${esc(n.title || "-")}
      </div>
      <div class="item-meta">${fmtDate(n.created_at)} · ${esc(n.members?.name || "관리자")}</div>
      ${n.content ? `<p>${esc(n.content).slice(0, 200)}</p>` : ""}
      ${state.role === "admin" ? `<div class="chips"><button class="secondary small" data-del-notice="${n.id}">삭제</button></div>` : ""}
    </div>
  `).join("");
}

function openNoticeForm() {
  openModal("공지 작성", `
    <label class="field">제목<input id="notice-title"></label>
    <label class="field">내용<textarea id="notice-content"></textarea></label>
    <label class="field">첨부 파일 (선택)<input id="notice-files" type="file" multiple></label>
    <button class="primary full" id="notice-save" style="margin-top:14px">공지 등록</button>
  `);
  $("notice-save").addEventListener("click", createNotice);
}

async function createNotice() {
  const title = val("notice-title");
  const content = val("notice-content");
  if (!title || !content) { toast("제목과 내용을 입력하세요"); return; }
  if (!state.member?.id) { toast("회원 정보가 없습니다"); return; }

  showLoader(true);
  try {
    const { data, error } = await db
      .from("notices")
      .insert({
        title,
        content,
        created_by: state.member.id,
      })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data?.id && $("notice-files")?.files?.length) {
      try {
        await uploadFiles($("notice-files").files, {
          targetType: "notice",
          targetId: data.id,
          docType: "공지첨부",
        });
      } catch (uperr) {
        console.warn("notice attachment upload failed:", uperr);
      }
    }
    closeModal();
    toast("공지 등록 완료");
    loadNoticesPage();
  } catch (err) {
    console.error("공지 작성 오류:", err);
    alert("공지 작성 오류: " + (err.message || err));
  } finally {
    showLoader(false);
  }
}

// ============================================================
// 투표 / 안건
// ============================================================
async function loadVotes() {
  const { data, error } = await db
    .from("budget_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);
  const list = $("vote-list");
  if (!list) return;
  if (error) {
    list.innerHTML = `<div class="item">안건 로딩 오류: ${esc(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = `<div class="item"><div class="item-title">등록된 안건이 없습니다</div></div>`;
    return;
  }
  list.innerHTML = data.map((p) => {
    const statusLabel = ({
      draft: "초안",
      voting: "투표 중",
      closed: "마감",
    })[p.status] || p.status || "초안";
    const statusChip = `<span class="chip ${p.status === 'voting' ? 'amber' : p.status === 'closed' ? 'gray' : ''}">${statusLabel}</span>`;
    return `
      <div class="item">
        <div class="item-title">${esc(p.title || "-")}</div>
        <div class="item-meta">${fmtDate(p.created_at)} ${statusChip}</div>
        ${p.description || p.content ? `<p>${esc((p.description || p.content)).slice(0, 200)}</p>` : ""}
        <div class="chips" style="margin-top:10px">
          ${p.status === "voting" ? `
            <button class="primary small" data-vote-yes="${p.id}">👍 찬성</button>
            <button class="secondary small" data-vote-no="${p.id}">👎 반대</button>
          ` : ""}
          ${state.role === "admin" ? `<button class="secondary small" data-del-proposal="${p.id}">삭제</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function openAgendaForm() {
  openModal("안건 등록", `
    <label class="field">안건명<input id="agenda-title"></label>
    <label class="field">내용<textarea id="agenda-content"></textarea></label>
    <button class="primary full" id="agenda-save" style="margin-top:14px">안건 등록</button>
  `);
  $("agenda-save").addEventListener("click", createAgenda);
}

async function createAgenda() {
  const title = val("agenda-title");
  const content = val("agenda-content");
  if (!title) { toast("안건명을 입력하세요"); return; }
  if (!state.member?.id) { toast("회원 정보가 없습니다"); return; }

  showLoader(true);
  try {
    const { error } = await db.from("budget_proposals").insert({
      title,
      description: content,
      status: "draft",
      created_by: state.member.id,
    });
    if (error) throw error;
    closeModal();
    toast("안건 등록 완료");
    loadNoticesPage();
  } catch (err) {
    console.error("안건 등록 오류:", err);
    alert("안건 등록 오류: " + (err.message || err));
  } finally {
    showLoader(false);
  }
}

// ============================================================
// 글로벌 클릭 핸들러
// ============================================================
let _bound = false;
function bindOnce() {
  if (_bound) return;
  _bound = true;

  document.addEventListener("click", async (e) => {
    const noticeDel = e.target.closest("[data-del-notice]")?.dataset.delNotice;
    if (noticeDel) {
      if (!confirm("공지를 삭제하시겠습니까?")) return;
      showLoader(true);
      const res = await db.rpc("delete_notice_admin_v4_15", { p_notice_id: noticeDel });
      showLoader(false);
      if (res.error) { alert("삭제 오류: " + res.error.message); return; }
      toast("삭제 완료");
      loadNoticesPage();
      return;
    }
    const yes = e.target.closest("[data-vote-yes]")?.dataset.voteYes;
    const no = e.target.closest("[data-vote-no]")?.dataset.voteNo;
    if (yes || no) {
      const proposal_id = yes || no;
      showLoader(true);
      const { error } = await db.from("budget_votes").upsert(
        { proposal_id, member_id: state.member.id, vote: yes ? "yes" : "no" },
        { onConflict: "proposal_id,member_id" }
      );
      showLoader(false);
      if (error) { alert("투표 오류: " + error.message); return; }
      toast("투표 완료");
      loadNoticesPage();
      return;
    }
    const del = e.target.closest("[data-del-proposal]")?.dataset.delProposal;
    if (del) {
      if (!confirm("안건을 삭제하시겠습니까?")) return;
      showLoader(true);
      const res = await db.rpc("delete_budget_proposal_admin_v4_15", { p_proposal_id: del });
      showLoader(false);
      if (res.error) { alert("삭제 오류: " + res.error.message); return; }
      toast("삭제 완료");
      loadNoticesPage();
      return;
    }
  });
}
bindOnce();
