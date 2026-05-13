import { APP_VERSION, state } from "./config.js?v=20260513m";
import { $, toast } from "./utils.js?v=20260513m";
import { bootAuth, bindAuthUI } from "./auth.js?v=20260513m";
import { loadMyPage } from "./home.js?v=20260513m";
import { loadVendorsPage } from "./vendors.js?v=20260513m";
import { loadNoticesPage } from "./notices.js?v=20260513m";
import { loadMorePage } from "./more.js?v=20260513m";
import { loadAdminPage } from "./admin.js?v=20260513m";

const loaders = {
  my: loadMyPage,
  vendors: loadVendorsPage,
  notices: loadNoticesPage,
  more: loadMorePage,
  admin: loadAdminPage,
};

const titles = { my: "일정", vendors: "행사업체", notices: "소식", more: "더보기", admin: "관리" };

export function allowedPages() {
  const role = state.role || "member";
  if (role === "admin") return ["my", "vendors", "notices", "more", "admin"];
  return ["my", "vendors", "notices", "more"];
}

export function defaultPage() { return "my"; }

export function navigate(page, push = true) {
  const pages = allowedPages();
  if (!pages.includes(page)) page = defaultPage();
  state.page = page;
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("#bottom-nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === page)
  );
  const pageEl = $(`page-${page}`);
  if (pageEl) pageEl.classList.add("active");
  if ($("top-title")) $("top-title").textContent = titles[page] || "괴산캠핑장협회";
  loaders[page]?.();
  if (push && location.hash !== "#" + page) {
    history.pushState({ page }, "", "#" + page);
  }
}

export function applyRoute() {
  const hash = location.hash.replace("#", "");
  navigate(hash || defaultPage(), false);
}

window.addEventListener("popstate", () => applyRoute());

document.addEventListener("DOMContentLoaded", async () => {
  if ($("version-mark")) $("version-mark").textContent = APP_VERSION;
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
