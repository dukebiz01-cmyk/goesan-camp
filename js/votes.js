import { db } from "./supabase.js";
import { state } from "./config.js";
import { $, esc, fmtDate, showLoader, toast, val } from "./utils.js";
import { openModal, closeModal } from "./router.js";

export async function loadVotesPage() {
  const box = $("page-votes");
  box.innerHTML = `<div class="page-head"><div><div class="page-title">투표</div><div class="page-sub">협회 안건과 의사결정</div></div>${state.role === "admin" ? `<button class="primary" id="btn-vote-new">+ 안건</button>` : ""}</div><div id="vote-list" class="list"><div class="card">불러오는 중...</div></div>`;
  $("btn-vote-new")?.addEventListener("click", openAgendaForm);
  await loadVotes();
}

async function loadVotes() {
  const { data, error } = await db.from("budget_proposals").select("*").order("created_at", { ascending: false }).limit(80);
  const list = $("vote-list");
  if (error) { list.innerHTML = `<div class="card">안건 로딩 오류: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { list.innerHTML = `<div class="card">등록된 안건이 없습니다.</div>`; return; }
  list.innerHTML = data.map((p) => `<div class="item"><div class="item-title">${esc(p.title || "-")}</div><div class="item-meta">${esc(p.status || "draft")} · ${fmtDate(p.created_at)}</div><p>${esc(p.description || p.content || "").slice(0, 160)}</p><div class="chips">${p.status === "voting" ? `<button class="primary small" data-vote-yes="${p.id}">찬성</button><button class="secondary small" data-vote-no="${p.id}">반대</button>` : ""}${state.role === "admin" ? `<button class="secondary small" data-del-proposal="${p.id}">삭제</button>` : ""}</div></div>`).join("");
}

function openAgendaForm() {
  openModal("안건 등록", `<label class="field">안건명<input id="agenda-title"></label><label class="field">내용<textarea id="agenda-content"></textarea></label><button class="primary full" id="agenda-save">등록</button>`);
  $("agenda-save").addEventListener("click", createAgenda);
}

async function createAgenda() {
  showLoader(true);
  const { error } = await db.from("budget_proposals").insert({ title: val("agenda-title"), description: val("agenda-content"), status: "draft", created_by: state.member.id });
  showLoader(false);
  if (error) { alert("안건 등록 오류: " + error.message); return; }
  closeModal(); toast("안건 등록 완료"); loadVotesPage();
}

document.addEventListener("click", async (e) => {
  const yes = e.target.closest("[data-vote-yes]")?.dataset.voteYes;
  const no = e.target.closest("[data-vote-no]")?.dataset.voteNo;
  const del = e.target.closest("[data-del-proposal]")?.dataset.delProposal;
  if (yes || no) {
    const proposal_id = yes || no;
    showLoader(true);
    const { error } = await db.from("budget_votes").upsert({ proposal_id, member_id: state.member.id, vote: yes ? "yes" : "no" }, { onConflict: "proposal_id,member_id" });
    showLoader(false);
    if (error) { alert("투표 오류: " + error.message); return; }
    toast("투표 완료"); loadVotesPage();
  }
  if (del) {
    if (!confirm("안건 삭제 처리하시겠습니까?")) return;
    showLoader(true);
    const res = await db.rpc("delete_budget_proposal_admin_v4_15", { p_proposal_id: del });
    showLoader(false);
    if (res.error) { alert("삭제 오류: " + res.error.message); return; }
    toast("삭제 완료"); loadVotesPage();
  }
});
