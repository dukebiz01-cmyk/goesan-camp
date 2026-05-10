import { APP_VERSION, state } from "./config.js";
import { $, toast } from "./utils.js";
import { bootAuth, bindAuthUI } from "./auth.js";
import { loadMyPage } from "./my.js";
import { loadNoticesPage } from "./notices.js";
import { loadVotesPage } from "./votes.js";
import { loadInfoPage } from "./info.js";
import { loadAdminPage } from "./admin.js";

const loaders = {
  my: loadMyPage,
  notices: loadNoticesPage,
  votes: loadVotesPage,
  info: loadInfoPage,
  admin: loadAdminPage,
};

const titles = { my: "MY", notices: "공지", votes: "투표", info: "정보", admin: "관리" };

export function allowedPages() {
  const role = state.role || "member";
  if (role === "admin") return ["my", "notices", "votes", "info", "admin"];
  if (["provider", "vendor", "instructor"].includes(role)) return ["my", "notices", "info"];
  if (role === "county") return ["notices", "info"];
  return ["my", "notices", "votes", "info"];
}

export function defaultPage() {
  const pages = allowedPages();
  return pages.includes("my") ? "my" : pages[0] || "notices";
}

export function navigate(page, push = true) {
  const pages = allowedPages();
  if (!pages.includes(page)) page = defaultPage();

  state.page = page;
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("#bottom-nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === page));

  const pageEl = $(`page-${page}`);
  if (pageEl) pageEl.classList.add("active");

  $("top-title").textContent = titles[page] || "괴산캠핑장협회";
  loaders[page]?.();

  if (push && location.hash !== "#" + page) history.pushState({ page }, "", "#" + page);
}

export function applyRoute() {
  const hash = location.hash.replace("#", "");
  navigate(hash || defaultPage(), false);
}

window.addEventListener("popstate", () => applyRoute());

document.addEventListener("DOMContentLoaded", async () => {
  $("version-mark").textContent = APP_VERSION;
  bindAuthUI();
  document.querySelectorAll("#bottom-nav [data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });
  $("modal-close")?.addEventListener("click", closeModal);
  $("modal-backdrop")?.addEventListener("click", closeModal);
  await bootAuth();
});

export function openModal(title, bodyHtml) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = bodyHtml;
  $("modal").classList.add("show");
  $("modal-backdrop").classList.add("show");
}

export function closeModal() {
  $("modal").classList.remove("show");
  $("modal-backdrop").classList.remove("show");
}
