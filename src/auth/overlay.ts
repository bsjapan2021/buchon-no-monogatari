// 스플래시 + 로그인/가입/비번찾기 + 관리자 콘솔 오버레이.
import { AUTH_I18N, type AuthLang } from "./authI18n.js";
import { supabaseConfigured } from "./supabase.js";
import {
  signUp,
  signIn,
  signOut,
  resetPassword,
  updatePassword,
  myProfile,
  isAdminEmail,
  startSession,
  heartbeat,
  listMembers,
  setStatus,
  setBlocked,
  listActiveSessions,
  onAuthChange,
  type Profile,
  type SessionRow,
} from "./auth.js";
import { SplashFx } from "./splashFx.js";

type View = "login" | "signup" | "forgot" | "reset";

export function initGate(onApproved: (p: Profile) => void): void {
  let lang: AuthLang = (localStorage.getItem("lang") as AuthLang) || "ko";
  let view: View = "login";
  let fx: SplashFx | null = null;
  let polling = 0;

  const t = (k: string): string => AUTH_I18N[lang][k] ?? k;
  const root = document.createElement("div");
  root.id = "gate";
  root.innerHTML = `
    <canvas id="gate-bg"></canvas>
    <div class="gate-scrim"></div>
    <button class="gate-lang" id="gate-lang"></button>
    <div class="gate-card">
      <h1 class="gate-title"></h1>
      <p class="gate-sub"></p>
      <div class="gate-tabs">
        <button data-view="login"></button>
        <button data-view="signup"></button>
        <button data-view="forgot"></button>
      </div>
      <form class="gate-form" id="gate-form" autocomplete="on">
        <input id="f-name" type="text" />
        <input id="f-email" type="email" autocomplete="username" />
        <input id="f-pass" type="password" autocomplete="current-password" />
        <button type="submit" class="gate-submit" id="f-submit"></button>
        <button type="button" class="gate-link" id="f-back"></button>
      </form>
      <p class="gate-msg" id="gate-msg"></p>
    </div>
    <div class="gate-admin" id="gate-admin" hidden>
      <div class="ga-head">
        <b id="ga-title"></b>
        <div class="ga-actions">
          <button id="ga-refresh">↻</button>
          <button id="ga-logout"></button>
          <button id="ga-close"></button>
        </div>
      </div>
      <div class="ga-body">
        <section><h3 id="ga-members-h"></h3><div id="ga-members"></div></section>
        <section><h3 id="ga-online-h"></h3><div id="ga-online"></div></section>
      </div>
    </div>
    <button class="gate-adminbtn" id="gate-adminbtn" hidden>⚙</button>
  `;
  document.body.appendChild(root);

  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => root.querySelector(`#${id}`) as T;
  const nameEl = $<HTMLInputElement>("f-name");
  const emailEl = $<HTMLInputElement>("f-email");
  const passEl = $<HTMLInputElement>("f-pass");
  const submitEl = $<HTMLButtonElement>("f-submit");
  const backEl = $<HTMLButtonElement>("f-back");
  const msgEl = $("gate-msg");

  fx = new SplashFx($<HTMLCanvasElement>("gate-bg"));
  fx.start();

  function setMsg(s: string, kind: "info" | "err" | "ok" = "info"): void {
    msgEl.textContent = s;
    msgEl.className = `gate-msg ${kind}`;
  }

  function applyI18n(): void {
    $("gate-lang").textContent = t("lang_btn");
    root.querySelector(".gate-title")!.textContent = t("title");
    root.querySelector(".gate-sub")!.textContent = t("subtitle");
    const tabs = root.querySelectorAll<HTMLButtonElement>(".gate-tabs button");
    tabs[0]!.textContent = t("tab_login");
    tabs[1]!.textContent = t("tab_signup");
    tabs[2]!.textContent = t("tab_forgot");
    nameEl.placeholder = t("name");
    emailEl.placeholder = t("email");
    passEl.placeholder = t("password");
    $("ga-logout").textContent = t("logout");
    $("ga-close").textContent = t("close");
    $("ga-title").textContent = t("admin_console");
    $("ga-members-h").textContent = t("members");
    $("ga-online-h").textContent = t("online");
    renderView();
  }

  function renderView(): void {
    root.querySelectorAll<HTMLButtonElement>(".gate-tabs button").forEach((b) => {
      b.classList.toggle("on", b.dataset.view === view);
    });
    nameEl.hidden = view !== "signup";
    passEl.hidden = view === "forgot";
    backEl.hidden = view === "login";
    passEl.autocomplete = view === "signup" ? "new-password" : "current-password";
    if (view === "login") submitEl.textContent = t("login_btn");
    else if (view === "signup") submitEl.textContent = t("signup_btn");
    else if (view === "forgot") submitEl.textContent = t("forgot_btn");
    else submitEl.textContent = t("login_btn");
    backEl.textContent = t("to_login");
    if (view === "reset") {
      nameEl.hidden = true;
      emailEl.hidden = true;
      passEl.hidden = false;
      passEl.placeholder = t("password");
      submitEl.textContent = "OK";
    } else {
      emailEl.hidden = false;
    }
  }

  function showGate(): void {
    root.classList.remove("done");
    fx?.start();
  }
  function hideGate(): void {
    root.classList.add("done");
    fx?.stop();
  }

  async function evaluate(): Promise<void> {
    const p = await myProfile();
    if (!p) {
      setMsg("", "info");
      return;
    }
    if (p.blocked) {
      setMsg(t("msg_blocked"), "err");
      await signOut();
      return;
    }
    if (p.status === "rejected") {
      setMsg(t("msg_rejected"), "err");
      await signOut();
      return;
    }
    if (p.status !== "approved") {
      setMsg(t("msg_pending"), "info");
      return;
    }
    // 승인됨 → 입장.
    await startSession(p);
    startPolling();
    if (p.role === "admin" || isAdminEmail(p.email)) {
      $("gate-adminbtn").hidden = false;
    }
    hideGate();
    onApproved(p);
  }

  function startPolling(): void {
    clearInterval(polling);
    polling = window.setInterval(async () => {
      await heartbeat();
      const cur = await myProfile();
      if (!cur || cur.blocked || cur.status !== "approved") {
        clearInterval(polling);
        await signOut();
        location.reload(); // 차단/거부되면 강제 퇴장
      }
    }, 20000);
  }

  // ---- 폼 제출 ----
  $<HTMLFormElement>("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setMsg(t("msg_need_config"), "err");
      return;
    }
    const email = emailEl.value.trim();
    const pass = passEl.value;
    try {
      submitEl.disabled = true;
      if (view === "login") {
        await signIn(email, pass);
        await evaluate();
      } else if (view === "signup") {
        await signUp(email, pass, nameEl.value.trim() || email.split("@")[0]!);
        setMsg(t("msg_signup_ok"), "ok");
        view = "login";
        renderView();
      } else if (view === "forgot") {
        await resetPassword(email);
        setMsg(t("msg_forgot_ok"), "ok");
      } else if (view === "reset") {
        await updatePassword(pass);
        setMsg("OK", "ok");
        view = "login";
        renderView();
      }
    } catch (err) {
      setMsg(view === "login" ? t("msg_login_fail") : String((err as Error).message ?? err), "err");
    } finally {
      submitEl.disabled = false;
    }
  });

  root.querySelectorAll<HTMLButtonElement>(".gate-tabs button").forEach((b) => {
    b.addEventListener("click", () => {
      view = b.dataset.view as View;
      setMsg("", "info");
      renderView();
    });
  });
  backEl.addEventListener("click", () => {
    view = "login";
    setMsg("", "info");
    renderView();
  });
  $("gate-lang").addEventListener("click", () => {
    lang = lang === "ko" ? "ja" : "ko";
    localStorage.setItem("lang", lang);
    applyI18n();
    refreshAdmin();
  });

  // ---- 관리자 콘솔 ----
  $("gate-adminbtn").addEventListener("click", () => {
    $("gate-admin").hidden = false;
    refreshAdmin();
  });
  $("ga-close").addEventListener("click", () => ($("gate-admin").hidden = true));
  $("ga-refresh").addEventListener("click", () => refreshAdmin());
  $("ga-logout").addEventListener("click", async () => {
    await signOut();
    location.reload();
  });

  async function refreshAdmin(): Promise<void> {
    if ($("gate-admin").hidden) return;
    const mEl = $("ga-members");
    const oEl = $("ga-online");
    mEl.innerHTML = `<div class="ga-loading">${t("loading")}</div>`;
    oEl.innerHTML = `<div class="ga-loading">${t("loading")}</div>`;
    try {
      const [members, online] = await Promise.all([listMembers(), listActiveSessions()]);
      mEl.innerHTML = memberTable(members);
      oEl.innerHTML = onlineTable(online);
      bindAdminActions();
    } catch (err) {
      mEl.innerHTML = `<div class="ga-loading err">${String((err as Error).message ?? err)}</div>`;
    }
  }

  function statusLabel(p: Profile): string {
    if (p.blocked) return t("st_blocked");
    if (p.status === "approved") return t("st_approved");
    if (p.status === "rejected") return t("st_rejected");
    return t("st_pending");
  }

  function memberTable(members: Profile[]): string {
    const rows = members
      .map((p) => {
        const admin = p.role === "admin";
        const actions = admin
          ? "—"
          : `<button class="ga-btn ok" data-approve="${p.id}">${t("approve")}</button>
             <button class="ga-btn no" data-reject="${p.id}">${t("reject")}</button>
             ${p.blocked ? `<button class="ga-btn" data-unblock="${p.id}">${t("reconnect")}</button>` : `<button class="ga-btn" data-block="${p.id}">${t("disconnect")}</button>`}`;
        return `<tr><td>${esc(p.name)}</td><td>${esc(p.email)}</td><td><span class="ga-chip ${p.status}${p.blocked ? " blocked" : ""}">${statusLabel(p)}</span>${admin ? " 👑" : ""}</td><td class="ga-act">${actions}</td></tr>`;
      })
      .join("");
    return `<table class="ga-table"><thead><tr><th>${t("col_name")}</th><th>${t("col_email")}</th><th>${t("col_status")}</th><th>${t("col_action")}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function onlineTable(rows: SessionRow[]): string {
    if (!rows.length) return `<div class="ga-loading">${t("no_online")}</div>`;
    const body = rows
      .map((s) => {
        const flag = s.country_code ? flagEmoji(s.country_code) : "";
        return `<tr><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${esc(s.ip)}</td><td>${flag} ${esc(s.country)}</td><td class="ga-act">${s.user_id ? `<button class="ga-btn no" data-block="${s.user_id}">${t("disconnect")}</button>` : ""}</td></tr>`;
      })
      .join("");
    return `<table class="ga-table"><thead><tr><th>${t("col_name")}</th><th>${t("col_email")}</th><th>${t("col_ip")}</th><th>${t("col_country")}</th><th>${t("col_action")}</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function bindAdminActions(): void {
    const run = (fn: () => Promise<void>) => async () => {
      try {
        await fn();
        await refreshAdmin();
      } catch (err) {
        alert(String((err as Error).message ?? err));
      }
    };
    root.querySelectorAll<HTMLButtonElement>("[data-approve]").forEach((b) => (b.onclick = run(() => setStatus(b.dataset.approve!, "approved"))));
    root.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((b) => (b.onclick = run(() => setStatus(b.dataset.reject!, "rejected"))));
    root.querySelectorAll<HTMLButtonElement>("[data-block]").forEach((b) => (b.onclick = run(() => setBlocked(b.dataset.block!, true))));
    root.querySelectorAll<HTMLButtonElement>("[data-unblock]").forEach((b) => (b.onclick = run(() => setBlocked(b.dataset.unblock!, false))));
  }

  // ---- 비밀번호 재설정 리다이렉트 처리 ----
  if (supabaseConfigured) {
    onAuthChange(() => {});
    import("./supabase.js").then(({ supabase }) => {
      supabase?.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          showGate();
          view = "reset";
          renderView();
          setMsg(t("password"), "info");
        }
      });
    });
  }

  // ---- 초기화 ----
  applyI18n();
  if (!supabaseConfigured) {
    setMsg(t("msg_need_config"), "err");
    // 백엔드 설정 전까지 게임이 완전히 막히지 않도록 임시 게스트 입장 제공(설정되면 사라짐).
    const guest = document.createElement("button");
    guest.className = "gate-submit";
    guest.style.marginTop = "10px";
    guest.textContent = lang === "ko" ? "임시 게스트 입장" : "ゲスト入場";
    guest.onclick = () => {
      hideGate();
      onApproved({ id: "guest", email: null, name: "guest", role: "user", status: "approved", blocked: false, created_at: "" });
    };
    root.querySelector(".gate-card")!.appendChild(guest);
  } else {
    evaluate().catch(() => {}); // 기존 세션이 있으면 자동 입장 평가
  }
  showGate();
}

function esc(s: string | null): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function flagEmoji(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
