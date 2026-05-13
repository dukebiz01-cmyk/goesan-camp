// js/notices.js — v5.1.0 voting system
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
      ${state.role === "admin" ? `<button class="secondary" id="btn-agenda-new" style="margin-bottom:10px">+ 안건 등록</button>` : ""}
      <div id="vote-list" class="list">
        <div class="item"><p class="muted">불러오는 중...</p></div>
      </div>
    </div>
  `;

  $("btn-notice-new")?.addEventListener("click", openNoticeForm);
  $("btn-agenda-new")?.addEventListener("click", openAgendaForm);

  await Promise.all([loadNotices(), loadVotes()]);
}

async function loadNotices() {
  const { data, error } = await db
    .from("notices").select("*, members(name)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false }).limit(60);
  const list = $("notice-list");
  if (!list) return;
  if (error) { list.innerHTML = `<div class="item">공지 로딩 오류: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { list.innerHTML = `<div class="item"><div class="item-title">등록된 공지가 없습니다</div></div>`; return; }
  list.innerHTML = data.map((n) => `
    <div class="item">
      <div class="item-title">${n.is_pinned ? "📌 " : ""}${esc(n.title || "-")}</div>
      <div class="item-meta">${fmtDate(n.created_at)} · ${esc(n.members?.name || "관리자")}</div>
      ${n.content ? `<p>${esc(n.content).slice(0, 200)}</p>` : ""}
      ${state.role === "admin" ? `<div class="chips" style="margin-top:10px"><button class="secondary small" data-del-notice="${n.id}">삭제</button></div>` : ""}
    </div>
  `).join("");
}

function openNoticeForm() {
  openModal("공지 작성", `
    <label class="field">제목<input id="notice-title"></label>
    <label class="field">내용<textarea id="notice-content" rows="5"></textarea></label>
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
    const { data, error } = await db.from("notices")
      .insert({ title, content, created_by: state.member.id })
      .select("*").maybeSingle();
    if (error) throw error;
    if (data?.id && $("notice-files")?.files?.length) {
      try { await uploadFiles($("notice-files").files, { targetType: "notice", targetId: data.id, docType: "공지첨부" }); }
      catch (e) { console.warn(e); }
    }
    closeModal(); toast("공지 등록 완료"); loadNoticesPage();
  } catch (err) { alert("공지 작성 오류: " + (err.message || err)); }
  finally { showLoader(false); }
}

// ============================================================
// 안건/투표
// ============================================================
async function loadVotes() {
  const [propRes, myVotesRes] = await Promise.all([
    db.from("budget_proposals").select("*").order("created_at", { ascending: false }).limit(80),
    state.member?.id
      ? db.from("budget_votes").select("proposal_id, vote, change_count").eq("member_id", state.member.id)
      : Promise.resolve({ data: [] }),
  ]);

  const list = $("vote-list");
  if (!list) return;
  if (propRes.error) { list.innerHTML = `<div class="item">안건 로딩 오류: ${esc(propRes.error.message)}</div>`; return; }
  const proposals = propRes.data || [];
  const myVotes = Object.fromEntries((myVotesRes.data || []).map((v) => [v.proposal_id, v]));
  if (!proposals.length) { list.innerHTML = `<div class="item"><div class="item-title">등록된 안건이 없습니다</div></div>`; return; }
  list.innerHTML = proposals.map((p) => renderProposalCard(p, myVotes[p.id])).join("");
}

function renderProposalCard(p, myVote) {
  const participated = (p.yes_count || 0) + (p.no_count || 0) + (p.abstain_count || 0);
  const total = p.total_voters || 0;
  const partPct = total > 0 ? Math.round((participated / total) * 100) : 0;
  const quorumOk = partPct >= (p.quorum_threshold || 50);
  const yesNoTotal = (p.yes_count || 0) + (p.no_count || 0);
  const yesPct = yesNoTotal > 0 ? Math.round(((p.yes_count || 0) / yesNoTotal) * 100) : 0;

  let statusBadge = "", statusClass = "";
  switch (p.status) {
    case "draft": statusBadge = "초안"; statusClass = "gray"; break;
    case "voting": statusBadge = "🔴 투표 중"; statusClass = "red"; break;
    case "passed": statusBadge = "✅ 가결"; statusClass = ""; break;
    case "rejected": statusBadge = "❌ 부결"; statusClass = "red"; break;
    case "quorum_failed": statusBadge = "⚠️ 정족수 미달"; statusClass = "amber"; break;
    default: statusBadge = p.status || "초안"; statusClass = "gray";
  }

  let dayBadge = "";
  if (p.status === "voting" && p.voting_ends_at) {
    const diff = Math.ceil((new Date(p.voting_ends_at) - new Date()) / (1000*60*60*24));
    if (diff < 0) dayBadge = `<span class="chip red">마감됨</span>`;
    else if (diff === 0) dayBadge = `<span class="chip red">오늘 마감</span>`;
    else if (diff <= 2) dayBadge = `<span class="chip red">${diff}일 남음</span>`;
    else if (diff <= 7) dayBadge = `<span class="chip amber">${diff}일 남음</span>`;
    else dayBadge = `<span class="chip gray">${diff}일 남음</span>`;
  }

  const typeBadge = p.proposal_type === 'special'
    ? `<span class="chip amber">특별 의결 ${p.pass_threshold || 67}%</span>`
    : p.proposal_type === 'notice' ? `<span class="chip">공시</span>`
    : `<span class="chip">일반 의결 ${p.pass_threshold || 50}%</span>`;

  const yesBarWidth = yesNoTotal > 0 ? Math.round(((p.yes_count || 0) / yesNoTotal) * 100) : 0;
  const noBarWidth = yesNoTotal > 0 ? Math.round(((p.no_count || 0) / yesNoTotal) * 100) : 0;

  let myVoteLabel = "";
  if (myVote) {
    const voteText = { yes: "👍 찬성", no: "👎 반대", abstain: "⚪ 기권" }[myVote.vote] || myVote.vote;
    const changeRemain = 3 - (myVote.change_count || 0);
    myVoteLabel = `
      <div style="margin-top:10px;padding:10px 12px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;font-size:14px;font-weight:700;color:var(--green-dark)">
        내 표: <b>${voteText}</b>${p.status === "voting" ? ` (변경 ${changeRemain}회 남음)` : ""}
      </div>`;
  } else if (p.status === "voting") {
    myVoteLabel = `<div style="margin-top:10px;padding:10px 12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;font-size:14px;font-weight:700;color:#92400e">⚠️ 아직 투표 안 함</div>`;
  }

  const canVote = p.status === "voting" && state.member?.is_voter === true;
  const voteButtons = canVote ? `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px">
      <button class="primary" data-vote-yes="${p.id}" style="min-height:56px;font-size:16px">👍 찬성</button>
      <button class="secondary" data-vote-no="${p.id}" style="min-height:56px;font-size:16px;color:var(--red);border-color:#fca5a5">👎 반대</button>
      <button class="ghost" data-vote-abstain="${p.id}" style="min-height:56px;font-size:16px">⚪ 기권</button>
    </div>` : "";

  let adminButtons = "";
  if (state.role === "admin") {
    const btns = [];
    if (p.status === "draft" || p.status === "extended") {
      btns.push(`<button class="primary small" data-start="${p.id}" data-type="general">일반 의결 시작</button>`);
      btns.push(`<button class="primary small" data-start="${p.id}" data-type="special">특별 의결 시작</button>`);
    }
    if (p.status === "voting") {
      btns.push(`<button class="secondary small" data-close="${p.id}">강제 마감</button>`);
      btns.push(`<button class="secondary small" data-extend="${p.id}">마감 연장</button>`);
    }
    if (p.status === "quorum_failed") {
      btns.push(`<button class="primary small" data-extend="${p.id}">재투표 연장</button>`);
    }
    btns.push(`<button class="secondary small" data-del-proposal="${p.id}" style="color:var(--red);border-color:#fca5a5">삭제</button>`);
    adminButtons = `<div class="chips" style="margin-top:14px;border-top:1px dashed var(--line);padding-top:12px">${btns.join("")}</div>`;
  }

  return `
    <div class="item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
        <div class="item-title" style="flex:1;font-size:18px">${esc(p.title || "-")}</div>
        <span class="chip ${statusClass}">${statusBadge}</span>
      </div>
      <div class="chips" style="margin-bottom:8px">${typeBadge}${dayBadge}</div>
      ${(p.description || p.content) ? `<p style="margin:8px 0;line-height:1.6">${esc(p.description || p.content)}</p>` : ""}
      ${p.status !== "draft" ? `
        <div style="margin-top:12px;padding:14px;background:#f8faf8;border-radius:12px">
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;margin-bottom:6px">
            <span>참여 ${participated}/${total}명 (${partPct}%)</span>
            <span style="color:${quorumOk?'var(--green)':'var(--amber)'};font-weight:800">${quorumOk ? "✅ 정족수 충족" : "⚠️ 정족수 미달"}</span>
          </div>
          <div style="height:12px;background:#e5ebe6;border-radius:6px;overflow:hidden;margin-bottom:14px">
            <div style="height:100%;width:${partPct}%;background:${quorumOk?'var(--green)':'var(--amber)'};transition:width .4s"></div>
          </div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">👍 찬성 ${p.yes_count || 0}명${yesNoTotal>0?` (${yesPct}%)`:""}</div>
          <div style="height:10px;background:#e5ebe6;border-radius:5px;overflow:hidden;margin-bottom:8px">
            <div style="height:100%;width:${yesBarWidth}%;background:var(--green)"></div>
          </div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">👎 반대 ${p.no_count || 0}명</div>
          <div style="height:10px;background:#e5ebe6;border-radius:5px;overflow:hidden;margin-bottom:8px">
            <div style="height:100%;width:${noBarWidth}%;background:var(--red)"></div>
          </div>
          <div style="font-size:13px;color:var(--muted);font-weight:700">⚪ 기권 ${p.abstain_count || 0}명</div>
          ${p.status === "passed" || p.status === "rejected" ? `
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:14px;font-weight:800">
              결과: ${p.status === "passed" ? "✅ 가결" : "❌ 부결"} (가결 기준 ${p.pass_threshold || 50}%, 실제 ${yesPct}%)
            </div>` : ""}
        </div>` : ""}
      ${myVoteLabel}${voteButtons}${adminButtons}
    </div>`;
}

function openAgendaForm() {
  openModal("안건 등록", `
    <label class="field">안건명<input id="agenda-title" placeholder="예: 2026 운영비 증액안"></label>
    <label class="field">설명<textarea id="agenda-content" rows="5" placeholder="안건 내용·배경·필요성"></textarea></label>
    <div class="status">초안으로 등록 후, 카드에서 <b>일반/특별 의결로 시작</b> 버튼으로 투표를 개시합니다.</div>
    <button class="primary full" id="agenda-save" style="margin-top:14px">초안 등록</button>
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
      title, description: content, status: "draft", proposal_type: "general",
      created_by: state.member.id,
    });
    if (error) throw error;
    closeModal(); toast("초안 등록 완료"); loadNoticesPage();
  } catch (err) { alert("안건 등록 오류: " + (err.message || err)); }
  finally { showLoader(false); }
}

function openStartVotingModal(proposalId, proposalType) {
  const def = new Date(); def.setDate(def.getDate() + 7); def.setHours(18, 0, 0, 0);
  const isoLocal = (d) => new Date(d - d.getTimezoneOffset()*60000).toISOString().slice(0, 16);
  openModal("투표 시작", `
    <div class="status warn">
      <b>${proposalType === "special" ? "특별 의결" : "일반 의결"}</b><br>
      ${proposalType === "special" ? "정족수 67% + 가결 67%" : "정족수 50% + 가결 50%"}
    </div>
    <label class="field">마감 일시<input type="datetime-local" id="vote-ends-at" value="${isoLocal(def)}"></label>
    <button class="primary full" id="btn-confirm-start" style="margin-top:14px">투표 시작</button>
  `);
  $("btn-confirm-start").addEventListener("click", async () => {
    const ends = $("vote-ends-at")?.value;
    if (!ends) { toast("마감 일시를 입력하세요"); return; }
    showLoader(true);
    try {
      const { data, error } = await db.rpc("start_voting_v1", {
        p_proposal_id: proposalId,
        p_ends_at: new Date(ends).toISOString(),
        p_proposal_type: proposalType,
      });
      if (error) throw error;
      closeModal(); toast(`투표 시작 (정회원 ${data.total_voters}명)`); loadNoticesPage();
    } catch (e) { alert("시작 오류: " + (e.message || e)); }
    finally { showLoader(false); }
  });
}

function openExtendModal(proposalId) {
  const def = new Date(); def.setDate(def.getDate() + 7); def.setHours(18, 0, 0, 0);
  const isoLocal = (d) => new Date(d - d.getTimezoneOffset()*60000).toISOString().slice(0, 16);
  openModal("마감 연장", `
    <label class="field">새 마감 일시<input type="datetime-local" id="ext-ends-at" value="${isoLocal(def)}"></label>
    <button class="primary full" id="btn-confirm-extend" style="margin-top:14px">연장</button>
  `);
  $("btn-confirm-extend").addEventListener("click", async () => {
    const ends = $("ext-ends-at")?.value;
    if (!ends) { toast("마감 일시를 입력하세요"); return; }
    showLoader(true);
    try {
      const { error } = await db.rpc("extend_voting_v1", {
        p_proposal_id: proposalId, p_new_ends_at: new Date(ends).toISOString(),
      });
      if (error) throw error;
      closeModal(); toast("마감 연장됨"); loadNoticesPage();
    } catch (e) { alert("연장 오류: " + (e.message || e)); }
    finally { showLoader(false); }
  });
}

let _bound = false;
function bindOnce() {
  if (_bound) return; _bound = true;
  document.addEventListener("click", async (e) => {
    const noticeDel = e.target.closest("[data-del-notice]")?.dataset.delNotice;
    if (noticeDel) {
      if (!confirm("공지를 삭제하시겠습니까?")) return;
      showLoader(true);
      const res = await db.rpc("delete_notice_admin_v4_15", { p_notice_id: noticeDel });
      showLoader(false);
      if (res.error) { alert("삭제 오류: " + res.error.message); return; }
      toast("삭제 완료"); loadNoticesPage(); return;
    }
    const del = e.target.closest("[data-del-proposal]")?.dataset.delProposal;
    if (del) {
      if (!confirm("안건을 삭제하시겠습니까?\n(투표 기록도 함께 삭제됩니다)")) return;
      showLoader(true);
      const res = await db.rpc("delete_budget_proposal_admin_v4_15", { p_proposal_id: del });
      showLoader(false);
      if (res.error) {
        const r2 = await db.from("budget_proposals").delete().eq("id", del);
        if (r2.error) { alert("삭제 오류: " + r2.error.message); return; }
      }
      toast("삭제 완료"); loadNoticesPage(); return;
    }
    const voteBtn = e.target.closest("[data-vote-yes],[data-vote-no],[data-vote-abstain]");
    if (voteBtn) {
      const vote = voteBtn.dataset.voteYes ? "yes" : voteBtn.dataset.voteNo ? "no" : "abstain";
      const proposal_id = voteBtn.dataset.voteYes || voteBtn.dataset.voteNo || voteBtn.dataset.voteAbstain;
      showLoader(true);
      try {
        const { error } = await db.rpc("cast_vote_v1", { p_proposal_id: proposal_id, p_vote: vote, p_comment: null });
        if (error) throw error;
        toast(`${vote === "yes" ? "찬성" : vote === "no" ? "반대" : "기권"} 등록`); loadNoticesPage();
      } catch (err) { alert("투표 오류: " + (err.message || err)); }
      finally { showLoader(false); }
      return;
    }
    const startBtn = e.target.closest("[data-start]");
    if (startBtn) { openStartVotingModal(startBtn.dataset.start, startBtn.dataset.type); return; }
    const closeBtn = e.target.closest("[data-close]")?.dataset.close;
    if (closeBtn) {
      if (!confirm("지금 투표를 마감합니까?\n(자동으로 가결/부결 판정)")) return;
      showLoader(true);
      try {
        const { data, error } = await db.rpc("close_voting_v1", { p_proposal_id: closeBtn });
        if (error) throw error;
        const r = data.result;
        toast(r === "passed" ? "✅ 가결" : r === "rejected" ? "❌ 부결" : "⚠️ 정족수 미달");
        loadNoticesPage();
      } catch (err) { alert("마감 오류: " + (err.message || err)); }
      finally { showLoader(false); }
      return;
    }
    const extBtn = e.target.closest("[data-extend]")?.dataset.extend;
    if (extBtn) { openExtendModal(extBtn); return; }
  });
}
bindOnce();
