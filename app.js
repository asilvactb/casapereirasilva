import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  return el;
}
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / 864e5);
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const F = {
  wd: new Intl.DateTimeFormat("pt-PT", { weekday: "short" }),
  long: new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long" }),
  short: new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short" }),
  month: new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }),
  mon: new Intl.DateTimeFormat("pt-PT", { month: "long" }),
  time: new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }),
  dy: new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" }),
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const TODAY = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const WHO = { alexandre: "Alexandre", rita: "Rita", ambos: "Ambos", familia: "Família", feriado: "Feriado" };
const SHOP_SECS = ["Supermercado", "Frescos", "Bebé e Rodrigo", "Farmácia", "Casa e limpeza", "Outros"];
const FIXED_CATS = ["Habitação", "Contas da casa", "Casa", "Transportes", "Créditos e dívidas", "Saúde", "Rodrigo", "Bebé", "Subscrições", "Lazer", "Outros"];
const INC_CATS = ["Salário", "Outras receitas"];
const MILESTONES = [
  { k: "eco1", w: [11, 13], t: "Ecografia do 1.º trimestre e rastreio combinado" },
  { k: "morfo", w: [20, 22], t: "Ecografia morfológica" },
  { k: "tdpa", w: [20, 36], t: "Vacina da tosse convulsa (Tdpa)" },
  { k: "ptgo", w: [24, 28], t: "Prova de tolerância à glicose" },
  { k: "quarto", w: [26, 32], t: "Preparar o quarto do bebé" },
  { k: "eco3", w: [30, 32], t: "Ecografia do 3.º trimestre" },
  { k: "licenca", w: [30, 34], t: "Tratar da licença parental" },
  { k: "auto", w: [32, 36], t: "Cadeira auto e carrinho prontos" },
  { k: "mala", w: [34, 36], t: "Mala da maternidade pronta" },
  { k: "dpp", w: [40, 40], t: "Data prevista do parto" },
];

let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
async function run(p, okMsg) { const { error } = await p; if (error) { toast("Não foi possível guardar: " + error.message); return false; } if (okMsg) toast(okMsg); return true; }

/* ================= state ================= */
const S = {
  me: null, who: null, view: "hoje",
  settings: {}, accounts: [], fixed: [], paid: [], tx: [], budget: [], savings: [], tasks: [], goals: [], shopping: [], freq: [], milestones: {}, sources: [], events: [],
  recipes: [], meals: [], baby: [], kids: [], smoves: [], mealWeek: null, rcTag: null, rcMode: null,
  cycle: null, calMonth: null, calSel: null, tkFilter: "todas", dashOpen: new Set(), quick: [],
};
const cycleDay = () => Number(S.settings.cycle_day ?? 20);
const firstCycle = () => S.settings.first_cycle || "2026-11";
const cycleKey = d => d.getDate() >= cycleDay() ? monthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)) : monthKey(d);
const cycleRange = k => { const [y, m] = k.split("-").map(Number); return { start: new Date(y, m - 2, cycleDay()), end: new Date(y, m - 1, cycleDay() - 1) }; };
const cycleDue = (k, day) => { const [y, m] = k.split("-").map(Number); return day >= cycleDay() ? new Date(y, m - 2, day) : new Date(y, m - 1, day); };
const shiftCycle = (k, n) => { const [y, m] = k.split("-").map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };
const cyclesBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const activeFixed = (k, kind) => S.fixed.filter(f => f.kind === kind && (!f.start_cycle || f.start_cycle <= k) && (!f.end_cycle || k <= f.end_cycle));
const isPaid = (k, id) => k < firstCycle() || S.paid.some(p => p.cycle === k && p.item_id === id);

function totals(k) {
  const tx = S.tx.filter(t => t.cycle === k);
  const fixInc = activeFixed(k, "income").reduce((s, f) => s + +f.amount, 0);
  const fixExp = activeFixed(k, "expense").reduce((s, f) => s + +f.amount, 0);
  const oneInc = tx.filter(t => t.type === "receita").reduce((s, t) => s + +t.amount, 0);
  const varExp = tx.filter(t => t.type === "despesa").reduce((s, t) => s + +t.amount, 0);
  return { fixInc, fixExp, oneInc, varExp, inc: fixInc + oneInc, exp: fixExp + varExp, bal: fixInc + oneInc - fixExp - varExp, tx };
}

/* Cash now = account balances confirmed at `balances_as_of`, plus everything that moved since:
   one-off movements logged after it, fixed bills ticked as paid after it, and salaries whose pay day has passed.
   Forecast = cash now + salaries still to come this cycle − fixed bills still unpaid this cycle (day-to-day spending excluded). */
function cash() {
  const asOf = new Date(S.settings.balances_as_of || 0), now = new Date(), k = cycleKey(TODAY()), end = cycleRange(k).end;
  const base = S.settings.balance_start != null ? +S.settings.balance_start : S.accounts.reduce((a, x) => a + +x.balance, 0);
  let moved = 0;
  S.tx.forEach(x => { if (new Date(x.created_at) > asOf) moved += x.type === "receita" ? +x.amount : -x.amount; });
  S.paid.forEach(p => { if (p.paid_at && new Date(p.paid_at) > asOf) { const f = S.fixed.find(f => f.id === p.item_id); if (f && f.kind === "expense") moved -= +f.amount; } });
  S.smoves.forEach(m => { if (new Date(m.at) > asOf) moved -= +m.amount; });
  const pays = [];
  for (const ck of [shiftCycle(k, -1), k]) activeFixed(ck, "income").forEach(f => f.pay_day && pays.push({ f, d: cycleDue(ck, f.pay_day) }));
  pays.forEach(({ f, d }) => { if (d > asOf && d <= now) moved += +f.amount; });
  const nowCash = base + moved;
  const incoming = pays.filter(({ d }) => d > now && d <= end).reduce((a, { f }) => a + +f.amount, 0);
  const unpaid = activeFixed(k, "expense").filter(f => !isPaid(k, f.id)).reduce((a, f) => a + +f.amount, 0);
  const saved = S.savings.reduce((a, x) => a + +x.saved, 0);
  return { base, moved, now: nowCash, incoming, unpaid, forecast: nowCash + incoming - unpaid, end, asOf, saved };
}

/* ================= data ================= */
const TABLES = {
  settings: ["settings", "*"], accounts: ["accounts", "*"], fixed: ["fixed_items", "*"], paid: ["fixed_paid", "*"], tx: ["transactions", "*"],
  budget: ["budget", "*"], savings: ["savings", "*"], tasks: ["tasks", "*"], goals: ["goals", "*"], shopping: ["shopping", "*"],
  freq: ["shopping_freq", "*"], recipes: ["recipes", "*"], meals: ["meal_plan", "*"], baby: ["baby_items", "*"], kids: ["kid_items", "*"], smoves: ["savings_moves", "*"], milestones: ["milestones", "*"], sources: ["calendar_sources", "id,who,label,last_sync,last_error"], events: ["events", "*"],
};
async function load(key) {
  const [table, cols] = TABLES[key];
  let q = sb.from(table).select(cols);
  if (key === "meals") q = q.gte("date", ymd(addDays(TODAY(), -70)));
  if (key === "events") q = q.gte("starts_at", addDays(TODAY(), -45).toISOString()).lte("starts_at", addDays(TODAY(), 200).toISOString()).order("starts_at");
  const { data, error } = await q;
  if (error) { console.warn(table, error.message); return; }
  if (key === "settings") S.settings = Object.fromEntries(data.map(r => [r.key, r.value]));
  else if (key === "milestones") S.milestones = Object.fromEntries(data.map(r => [r.key, r.done]));
  else S[key] = data;
}
const reloadT = {};
function watch() {
  const byTable = Object.fromEntries(Object.entries(TABLES).map(([k, [t]]) => [t, k]));
  sb.channel("casa").on("postgres_changes", { event: "*", schema: "public" }, p => {
    const key = byTable[p.table]; if (!key) return;
    clearTimeout(reloadT[key]); reloadT[key] = setTimeout(async () => { await load(key); render(); }, 250);
  }).subscribe();
}

/* ================= auth ================= */
/* Session backup: some browsers (iOS in-app browsers, home-screen apps, strict privacy modes)
   drop localStorage between visits. Keep the rotating refresh token in a long-lived cookie too. */
const RT = "cps_rt";
const saveRT = s => { document.cookie = s ? `${RT}=${encodeURIComponent(s.refresh_token)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure` : `${RT}=; Max-Age=0; Path=/`; try { if (s) localStorage.setItem("cps_email", s.user.email); } catch {} };
const readRT = () => decodeURIComponent((document.cookie.match(/(?:^|; )cps_rt=([^;]*)/) || [])[1] || "");
async function boot() {
  try { navigator.storage?.persist?.(); } catch {}
  let { data: { session } } = await sb.auth.getSession();
  if (!session && readRT()) {
    const { data, error } = await sb.auth.refreshSession({ refresh_token: readRT() });
    if (!error) session = data.session; else saveRT(null);
  }
  sb.auth.onAuthStateChange((ev, s) => {
    if (s) saveRT(s);
    if (ev === "SIGNED_IN" && !S.me) start(s);
    if (ev === "SIGNED_OUT") { saveRT(null); location.reload(); }
  });
  if (session) { saveRT(session); start(session); } else showLogin();
}
function showLogin() {
  $("#login").hidden = false;
  try { const e = localStorage.getItem("cps_email"); if (e) { $("#login-email").value = e; } } catch {}
  requestAnimationFrame(() => document.body.classList.add("ready"));
  startField(); tickClock();
}
$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#login-email").value.trim().toLowerCase(), password = $("#login-pass").value, msg = $("#login-msg");
  msg.textContent = "A entrar…";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = /invalid/i.test(error.message) ? "Email ou password errados." : "Não foi possível entrar: " + error.message; return; }
  start(data.session);
});
async function start(session) {
  if (S.me) return;
  const email = session.user.email.toLowerCase();
  const { data } = await sb.from("members").select("who,name").eq("email", email).maybeSingle();
  if (!data) { $("#login").hidden = true; $("#denied").hidden = false; $("#denied-email").textContent = email; return; }
  S.me = data.name; S.who = data.who;
  stopField();
  $("#login").hidden = true; $("#app").hidden = false;
  $("#me-name").textContent = S.me;
  await Promise.all(Object.keys(TABLES).map(load));
  S.cycle = cycleKey(TODAY()); S.calMonth = new Date(TODAY().getFullYear(), TODAY().getMonth(), 1);
  setupForms(); watch(); route();
}
$("#logout").addEventListener("click", () => sb.auth.signOut());
$("#denied-out").addEventListener("click", () => sb.auth.signOut());

/* ================= routing ================= */
window.addEventListener("hashchange", route);
function route() {
  const v = (location.hash || "#hoje").slice(1);
  S.view = ["hoje", "agenda", "financas", "refeicoes", "compras", "tarefas", "familia", "objetivos"].includes(v) ? v : "hoje";
  $$(".view").forEach(s => s.hidden = s.id !== "v-" + S.view);
  $$("[data-v]").forEach(a => a.classList.toggle("on", a.dataset.v === S.view));
  moveInd();
  window.scrollTo({ top: 0, behavior: "instant" });
  const view = $("#v-" + S.view); view.classList.add("fresh"); clearTimeout(route.t); route.t = setTimeout(() => view.classList.remove("fresh"), 2200);
  render();
}
/* sliding pill behind the active nav item */
function moveInd() {
  for (const bar of $$(".nav,.tabbar")) {
    let i = bar.querySelector(".ind"); if (!i) { i = document.createElement("span"); i.className = "ind"; bar.prepend(i); }
    const a = bar.querySelector("a.on"); if (!a || !a.offsetWidth) { i.style.opacity = 0; continue; }
    Object.assign(i.style, { opacity: 1, width: a.offsetWidth + "px", height: a.offsetHeight + "px", transform: `translate(${a.offsetLeft}px,${a.offsetTop}px)` });
    if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2, behavior: "smooth" });
  }
}
addEventListener("resize", () => moveInd());
document.fonts?.ready.then(() => moveInd());
/* spotlight that follows the pointer inside cards */
document.addEventListener("pointermove", e => {
  const c = e.target.closest?.(".block,.kpi,.goal,.shop"); if (!c) return;
  const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px");
}, { passive: true });
function render() {
  if (!S.who) return;
  const n = S.shopping.filter(i => !i.done).length; $("#nav-shop").textContent = n || "";
  ({ hoje: renderHoje, agenda: renderAgenda, financas: renderFin, refeicoes: renderMeals, familia: renderFamily, compras: renderShop, tarefas: renderTasks, objetivos: renderGoals })[S.view]();
  reveal(); moveInd();
  $$("#v-" + S.view + " :is(.row,.ev,.bud,.cbar)").forEach((r, i) => r.style.setProperty("--i", Math.min(i, 18)));
}

/* header hide on scroll */
let lastY = 0;
window.addEventListener("scroll", () => {
  const y = scrollY, top = $("#top");
  top.classList.toggle("scrolled", y > 8);
  top.classList.toggle("hide", y > lastY && y > 120);
  lastY = y;
}, { passive: true });

/* reveal */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .08 });
function reveal() { $$(".view:not([hidden]) .rv:not(.in)").forEach(el => io.observe(el)); }

/* count-up */
function countUp(el, to, fmt) {
  const from = 0, t0 = performance.now(), dur = 900;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(to); return; }
  const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function kpi(label, value, fmt = eur0.format, cls = "") {
  const b = h("b", { class: cls }, fmt(0)); countUp(b, value, fmt);
  return h("div", { class: "kpi rv" }, h("span", { class: "mono small muted" }, label), b);
}

/* inline edit */
function ed(text, value, onSave, { type = "text", cls = "" } = {}) {
  const s = h("span", { class: "ed " + cls, tabindex: "0", title: "Tocar para editar" }, text);
  const open = () => {
    const i = h("input", { class: "inl" + (type === "number" ? " n" : ""), type: type === "number" ? "text" : "text", inputmode: type === "number" ? "decimal" : null });
    i.value = value ?? ""; s.replaceWith(i); i.focus(); i.select();
    let done = false;
    const fin = async save => {
      if (done) return; done = true; i.replaceWith(s);
      if (!save) return;
      let v = i.value.trim();
      if (type === "number") v = v === "" ? null : Math.round(parseFloat(v.replace(",", ".")) * 100) / 100;
      if (v !== value && !(type === "number" && Number.isNaN(v))) await onSave(v);
    };
    i.addEventListener("keydown", e => { if (e.key === "Enter") i.blur(); if (e.key === "Escape") fin(false); });
    i.addEventListener("blur", () => fin(true));
  };
  s.addEventListener("click", open); s.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
  return s;
}
function delBtn(fn) {
  const b = h("button", { class: "del", "aria-label": "Apagar", type: "button" }, "×"); let t;
  b.addEventListener("click", async () => {
    if (!t) { b.classList.add("arm"); b.textContent = "Apagar?"; t = setTimeout(() => { t = null; b.classList.remove("arm"); b.textContent = "×"; }, 2800); return; }
    clearTimeout(t); await fn();
  });
  return b;
}
const tick = (on, fn, label) => h("button", { class: "tick" + (on ? " on" : ""), type: "button", "aria-pressed": String(!!on), "aria-label": label, onclick: fn });

/* ================= events ================= */
function sourceKind(sid) { const s = S.sources.find(x => x.id === sid); if (!s) return null; return /feriado/i.test(s.label) ? "feriado" : s.who; }
function allEvents() {
  const seen = new Set(), out = [];
  for (const e of S.events) {
    const who = e.source_id ? (sourceKind(e.source_id) || e.who) : e.who;
    const key = e.title + "|" + e.starts_at;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ ...e, who });
  }
  return out;
}
function eventsOn(day) {
  const k = ymd(day);
  return allEvents().filter(e => {
    if (e.all_day) { const s = e.starts_at.slice(0, 10), en = (e.ends_at || e.starts_at).slice(0, 10); return k >= s && (k < en || k === s); }
    return ymd(new Date(e.starts_at)) === k;
  }).sort((a, b) => (b.all_day - a.all_day) || a.starts_at.localeCompare(b.starts_at));
}
function evRow(e, showDay) {
  const st = new Date(e.starts_at);
  const when = e.all_day ? "Dia todo" : F.time.format(st) + (e.ends_at ? "\n" + F.time.format(new Date(e.ends_at)) : "");
  return h("div", { class: "ev" },
    h("span", { class: "when", style: "white-space:pre-line" }, showDay ? cap(F.wd.format(e.all_day ? parseYmd(e.starts_at) : st)).replace(".", "") + " " + (e.all_day ? parseYmd(e.starts_at) : st).getDate() + "\n" + (e.all_day ? "dia todo" : F.time.format(st)) : when),
    h("span", { class: "bar " + e.who }),
    h("span", null, e.title, e.location ? h("span", { class: "loc" }, e.location) : null));
}

/* ================= pregnancy ================= */
function preg() {
  const due = parseYmd(S.settings.due_date || "2027-04-30"), lmp = addDays(due, -280), days = dayDiff(lmp, TODAY());
  const w = Math.floor(days / 7), d = days % 7;
  return { due, lmp, w, d, left: dayDiff(TODAY(), due), tri: w < 14 ? "1.º trimestre" : w < 28 ? "2.º trimestre" : "3.º trimestre" };
}

/* ================= HOJE ================= */
function renderHoje() {
  const t = TODAY(), p = preg(), k = cycleKey(t), T = totals(k), C = cash();
  $("#today-meta").textContent = `${F.long.format(t)} · Braga · ciclo de ${F.mon.format(parseYmd(k + "-01"))}`;
  const part = new Date().getHours() < 13 ? "Bom dia" : new Date().getHours() < 20 ? "Boa tarde" : "Boa noite";
  const title = $("#today-title"); title.replaceChildren(h("span", null, `${part},`), h("br"), h("span", { class: "grey" }, `${S.me}.`));
  // bills due in the next 7 days (current + next cycle)
  const bills = [];
  for (const ck of [k, shiftCycle(k, 1)]) for (const f of activeFixed(ck, "expense")) {
    if (!f.pay_day || isPaid(ck, f.id)) continue;
    const due = cycleDue(ck, f.pay_day), dd = dayDiff(t, due);
    if (dd <= 7 && (dd >= 0 || ck === k)) bills.push({ f, due, dd, ck });
  }
  bills.sort((a, b) => a.due - b.due);
  const billTot = bills.reduce((s, b) => s + +b.f.amount, 0);
  const openShop = S.shopping.filter(i => !i.done).length, openTasks = S.tasks.filter(x => !x.done).length;
  const st = $("#today-statement"); st.replaceChildren();
  const parts = [
    ["Faltam", false], [`${Math.ceil(p.left / 7)} semanas`, true], ["para o bebé. Hoje têm", false], [eur0.format(C.now) + " disponíveis", true],
    [bills.length ? "e há" : "e não há contas a vencer esta semana.", false], ...(bills.length ? [[`${bills.length} ${bills.length === 1 ? "conta" : "contas"}`, true], ["a vencer esta semana.", false]] : []),
  ];
  for (const [txt, acc] of parts) for (const wd of txt.split(" ")) st.append(h("span", { class: "w" + (acc ? " acc" : "") }, wd), " ");
  scrubWords();
  $("#kpis").replaceChildren(
    kpi("Disponível agora", C.now, eur0.format, C.now < 0 ? "neg" : ""),
    kpi("Fim do ciclo · " + F.short.format(C.end), C.forecast, eur0.format, C.forecast < 0 ? "neg" : ""),
    kpi("A pagar em 7 dias", billTot),
    kpi("Compras na lista", openShop, n => Math.round(n)));
  const tn = S.meals.find(m => m.date === ymd(t) && m.slot === "jantar"), tr = tn?.recipe_id && recipeById(tn.recipe_id);
  $("#tonight").replaceChildren(h("span", { class: "tn-l" }, "Hoje ao jantar"),
    tn ? h("button", { class: "tn-n", type: "button", onclick: () => tr ? showRecipe(tr, tn) : (location.hash = "#refeicoes") }, tr ? tr.name : tn.title) : h("span", { class: "tn-n muted" }, "ainda nada planeado"),
    h("button", { class: "pill ghost sm", type: "button", onclick: tonight }, h("span", { "data-t": tn ? "Trocar" : "Sugerir" }, tn ? "Trocar" : "Sugerir")));
  const evBox = $("#today-events"); evBox.replaceChildren();
  let any = 0;
  for (let i = 0; i < 7; i++) { const day = addDays(t, i); for (const e of eventsOn(day)) { if (any++ < 9) evBox.append(evRow(e, true)); } }
  if (!any) evBox.append(h("p", { class: "empty" }, "Semana livre. Liga os calendários na Agenda para os eventos aparecerem aqui."));
  const bBox = $("#today-bills"); bBox.replaceChildren();
  if (!bills.length) bBox.append(h("p", { class: "empty" }, "Nada a vencer nos próximos 7 dias."));
  bills.forEach(b => bBox.append(h("div", { class: "row" },
    tick(false, () => togglePaid(b.ck, b.f.id, true), "Marcar pago " + b.f.name),
    h("span", { class: "t" }, b.f.name, h("span", { class: "sub" }, b.dd < 0 ? `em atraso desde ${F.short.format(b.due)}` : b.dd === 0 ? "vence hoje" : `vence ${F.short.format(b.due)}`)),
    h("span", { class: "chip " + (b.dd < 0 ? "late" : b.dd <= 2 ? "soon" : "") }, b.dd < 0 ? "atraso" : b.dd === 0 ? "hoje" : `${b.dd} d`),
    h("span", { class: "amt" }, eur.format(+b.f.amount)))));
  renderPreg();
}
function scrubWords() {
  const ws = $$("#today-statement .w");
  const upd = () => { const r = $("#today-statement").getBoundingClientRect(), vh = innerHeight; const p = Math.min(1, Math.max(0, (vh * .95 - r.top) / (vh * .55))); const n = Math.round(p * ws.length); ws.forEach((w, i) => w.classList.toggle("on", i < n)); };
  upd(); window.removeEventListener("scroll", scrubWords._h); scrubWords._h = upd; window.addEventListener("scroll", upd, { passive: true });
}
function renderPreg() {
  const p = preg(), box = $("#preg"); box.replaceChildren();
  if (p.w < 0 || p.w > 42) { box.hidden = true; return; }
  box.append(
    h("div", { class: "block-head" }, h("div", null, h("p", { class: "mono small muted" }, "Bebé a caminho"), h("h2", { class: "display-s" }, `${p.w} semanas`, h("span", { class: "grey" }, ` e ${p.d} ${p.d === 1 ? "dia" : "dias"}`))),
      h("p", { class: "mono small muted" }, `${p.tri} · DPP ${F.dy.format(p.due)}`)),
    h("div", { class: "ruler" }, Array.from({ length: 40 }, (_, i) => h("i", { class: (i + 1 < p.w ? "on" : "") + (i + 1 === p.w ? " now" : ""), title: `Semana ${i + 1}` }))),
    h("div", { class: "ruler-l" }, h("span", null, "1.º trimestre"), h("span", null, "2.º trimestre"), h("span", null, "3.º trimestre")),
    h("div", { class: "ms-list" }, MILESTONES.map(m => {
      const from = addDays(p.lmp, m.w[0] * 7), done = !!S.milestones[m.k], now = p.w >= m.w[0] && p.w <= m.w[1];
      return h("div", { class: "ms" + (done ? " done" : "") + (now && !done ? " now" : "") },
        tick(done, () => run(sb.from("milestones").upsert({ key: m.k, done: !done, updated_at: new Date().toISOString() })), m.t),
        h("span", { class: "t" }, m.t), h("span", { class: "w" }, `${m.w[0] === m.w[1] ? m.w[0] : m.w.join("–")} sem · ${F.short.format(from)}`));
    })));
}

/* quick entry: "20 gasolina, 161 continente, recebi 300 extra" — parsed locally, nothing leaves the site */
const KW = [
  [/gasol|gas[oó]leo|combust|galp|bp\b|repsol|prio/i, "Combustível"],
  [/continente|pingo|lidl|aldi|mercadona|intermarch|minipre|super|mercearia|talho|peixaria|padaria|p[aã]o/i, "Supermercado"],
  [/jantar|almo[cç]o|restaur|caf[eé]\b|sushi|pizza|uber ?eats|glovo|bolt food/i, "Restaurantes"],
  [/farm[aá]cia|m[eé]dic|consulta|an[aá]lises|dentista|hospital|cuf|lentes/i, "Saúde"],
  [/fraldas|rodrigo|creche|escola|brinquedo/i, "Rodrigo"],
  [/beb[eé]|carrinho|berço|maternidade/i, "Bebé"],
  [/portagem|via ?verde|estaciona|uber|bolt|comboio|cp\b|autocarro|metro|oficina|pneu/i, "Transportes"],
  [/viagem|hotel|airbnb|voo|neve|f[eé]rias/i, "Viagens"],
  [/cinema|concerto|jogo|padel|golfe|gin[aá]sio|presente|roupa|zara|amazon/i, "Lazer"],
  [/netflix|spotify|hbo|disney|icloud|google|chatgpt|subscri/i, "Subscrições"],
  [/[aá]gua|luz|edp|vodafone|meo|nos\b|g[aá]s|ikea|leroy|casa|limpeza/i, "Casa"],
];
function parseQuick(text) {
  return text.split(/,|;|\n|\s+e\s+(?=\d)/i).map(s => s.trim()).filter(Boolean).map(chunk => {
    const m = chunk.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euros)?/i);
    if (!m) return null;
    const amount = parseFloat(m[1].replace(",", "."));
    let desc = (chunk.slice(0, m.index) + " " + chunk.slice(m.index + m[0].length)).replace(/\b(no|na|em|de|do|da|nos|nas|gastei|paguei|euros?)\b/gi, " ").replace(/\s+/g, " ").trim();
    const income = /recebi|receita|extra|sal[aá]rio|ordenado|reembolso/i.test(chunk);
    desc = desc.replace(/\b(recebi|receita)\b/gi, "").trim();
    const cat = income ? (/sal[aá]rio|ordenado/i.test(chunk) ? "Salário" : "Outras receitas") : (KW.find(([re]) => re.test(chunk))?.[1] || "Outros");
    return { type: income ? "receita" : "despesa", amount, desc: cap(desc || cat), cat };
  }).filter(Boolean);
}
function renderQuick() {
  const box = $("#quick-preview"); box.replaceChildren();
  if (!S.quick.length) return;
  const cats = [...new Set([...S.budget.map(b => b.cat), ...FIXED_CATS, ...INC_CATS])];
  box.append(h("div", { class: "qprev" },
    S.quick.map((q, i) => h("span", { class: "qchip" },
      h("b", { class: "num", style: q.type === "receita" ? "color:var(--good)" : "" }, (q.type === "receita" ? "+" : "−") + eur.format(q.amount)), q.desc,
      (() => { const s = h("select", { "aria-label": "Categoria" }, cats.map(c => h("option", null, c))); s.value = q.cat; s.onchange = () => q.cat = s.value; return s; })(),
      h("button", { class: "x", type: "button", "aria-label": "Tirar", onclick: () => { S.quick.splice(i, 1); renderQuick(); } }, "×"))),
    h("button", { class: "pill accent sm", type: "button", onclick: saveQuick }, h("span", { "data-t": "Registar" }, "Registar")),
    h("button", { class: "link", type: "button", onclick: () => { S.quick = []; renderQuick(); } }, "Cancelar")));
}
async function saveQuick() {
  const today = ymd(TODAY()), rows = S.quick.map(q => ({ type: q.type, amount: q.amount, descr: q.desc, cat: q.cat, date: today, cycle: cycleKey(TODAY()), who: S.who }));
  if (await run(sb.from("transactions").insert(rows), `${rows.length} ${rows.length === 1 ? "movimento registado" : "movimentos registados"}`)) { S.quick = []; $("#quick-in").value = ""; renderQuick(); }
}

/* ================= AGENDA ================= */
function renderAgenda() {
  const m0 = S.calMonth, y = m0.getFullYear(), mo = m0.getMonth(), t = TODAY();
  $("#cal-title").textContent = cap(F.month.format(m0));
  const first = new Date(y, mo, 1), lead = (first.getDay() + 6) % 7, start = addDays(first, -lead);
  const cells = Math.ceil((lead + new Date(y, mo + 1, 0).getDate()) / 7) * 7;
  const cal = $("#cal"); cal.replaceChildren(...["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => h("div", { class: "dh" }, d)));
  for (let i = 0; i < cells; i++) {
    const d = addDays(start, i), k = ymd(d), evs = eventsOn(d);
    cal.append(h("button", { type: "button", class: "c" + (d.getMonth() !== mo ? " out" : "") + (k === ymd(t) ? " today" : "") + (S.calSel === k ? " sel" : ""), onclick: () => { S.calSel = k; renderAgenda(); } },
      h("span", { class: "dn" }, d.getDate()),
      evs.slice(0, 3).map(e => h("span", { class: "ce " + e.who }, (e.all_day ? "" : F.time.format(new Date(e.starts_at)) + " ") + e.title)),
      evs.length > 3 ? h("span", { class: "more" }, `+${evs.length - 3}`) : null,
      h("span", { class: "dots" }, evs.slice(0, 4).map(e => h("i", { class: "sw " + e.who })))));
  }
  const sel = S.calSel ? parseYmd(S.calSel) : t;
  $("#day-title").textContent = cap(F.long.format(sel));
  const de = $("#day-events"), list = eventsOn(sel); de.replaceChildren(...(list.length ? list.map(e => evRow(e)) : [h("p", { class: "empty" }, "Dia livre.")]));
  const src = $("#sources"); src.replaceChildren();
  if (!S.sources.length) src.append(h("p", { class: "empty" }, "Ainda nenhum calendário ligado."));
  S.sources.forEach(s => src.append(h("div", { class: "src" }, h("i", { class: "sw " + (/feriado/i.test(s.label) ? "feriado" : s.who) }),
    h("span", null, s.label, h("span", { class: "sub mono small muted", style: "display:block" }, (WHO[s.who] || s.who) + " · " + (s.last_error ? "erro: " + s.last_error : s.last_sync ? "sincronizado " + ago(s.last_sync) : "à espera da primeira sincronização"))),
    delBtn(() => run(sb.from("calendar_sources").delete().eq("id", s.id), "Calendário removido")))));
}
function ago(iso) { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; }
async function syncNow() {
  const b = $("#sync-now"); b.disabled = true; toast("A sincronizar calendários…");
  const { data, error } = await sb.functions.invoke("sync-calendars", { body: {} });
  b.disabled = false;
  if (error) return toast("A sincronização falhou: " + error.message);
  const n = (data.report || []).reduce((s, r) => s + (r.events || 0), 0);
  toast(`Sincronizado: ${n} eventos`); await Promise.all([load("events"), load("sources")]); render();
}

/* ================= FINANÇAS ================= */
async function togglePaid(k, id, on) {
  if (on) await run(sb.from("fixed_paid").upsert({ cycle: k, item_id: id }), "Marcado como pago");
  else await run(sb.from("fixed_paid").delete().eq("cycle", k).eq("item_id", id));
}
function renderFin() {
  const k = S.cycle, T = totals(k), r = cycleRange(k), t = TODAY(), isCur = k === cycleKey(t);
  $("#cy-title").textContent = "Ciclo de " + F.mon.format(parseYmd(k + "-01"));
  $("#cy-range").textContent = `${F.short.format(r.start)} – ${F.short.format(r.end)}${isCur ? " · atual" : ""}`;
  $("#fin-kpis").replaceChildren(kpi("Entra", T.inc), kpi("Fixas", T.fixExp), kpi("Dia a dia", T.varExp), kpi("Sobra", T.bal, eur0.format, T.bal < 0 ? "neg" : ""));
  renderDash(k, T);
  renderCash();
  // fixed
  const box = $("#fixed"); box.replaceChildren();
  const upd = (f, col) => v => run(sb.from("fixed_items").update({ [col]: v }).eq("id", f.id));
  const incs = activeFixed(k, "income");
  if (incs.length) box.append(h("p", { class: "sec-label" }, "Rendimentos"));
  incs.forEach(f => box.append(h("div", { class: "row" }, h("span", { class: "sw " + (f.who || "familia") }),
    h("span", { class: "t" }, ed(f.name, f.name, upd(f, "name")), h("span", { class: "sub" }, "recebe ao dia ", ed(f.pay_day ? String(f.pay_day) : "—", f.pay_day, v => upd(f, "pay_day")(v ? Math.max(1, Math.min(31, Math.round(v))) : null), { type: "number" }), f.note ? " · " + f.note : "")),
    ed("+" + eur.format(+f.amount), +f.amount, upd(f, "amount"), { type: "number", cls: "amt in" }), delBtn(() => run(sb.from("fixed_items").delete().eq("id", f.id))))));
  box.append(h("p", { class: "sec-label" }, "Despesas"));
  const cyc = d => !d ? 99 : d >= cycleDay() ? d - cycleDay() : d + (32 - cycleDay());
  const exps = activeFixed(k, "expense").sort((a, b) => cyc(a.pay_day) - cyc(b.pay_day) || b.amount - a.amount);
  let paidSum = 0;
  exps.forEach(f => {
    const paid = isPaid(k, f.id); if (paid) paidSum += +f.amount;
    let chip = null;
    if (!paid && isCur && f.pay_day) { const due = cycleDue(k, f.pay_day), dd = dayDiff(t, due); chip = dd < 0 ? h("span", { class: "chip late" }, "atraso") : dd <= 5 ? h("span", { class: "chip soon" }, dd === 0 ? "hoje" : F.short.format(due)) : null; }
    const left = f.end_cycle ? cyclesBetween(k, f.end_cycle) : null;
    box.append(h("div", { class: "row" + (paid ? " paid" : "") },
      tick(paid, () => togglePaid(k, f.id, !paid), "Pago: " + f.name),
      h("span", { class: "t" }, ed(f.name, f.name, upd(f, "name")), " ", chip,
        h("span", { class: "sub" }, "dia ", ed(f.pay_day ? String(f.pay_day) : "—", f.pay_day, v => upd(f, "pay_day")(v ? Math.max(1, Math.min(31, Math.round(v))) : null), { type: "number" }),
          " · ", catSel(f.cat, v => upd(f, "cat")(v)),
          left != null ? ` · ${left === 0 ? "última prestação" : `faltam ${left}`}` : "", f.note ? " · " + f.note : "")),
      ed(eur.format(+f.amount), +f.amount, upd(f, "amount"), { type: "number", cls: "amt" }),
      delBtn(() => run(sb.from("fixed_items").delete().eq("id", f.id), "Despesa removida"))));
  });
  box.append(h("div", { class: "row", style: "grid-template-columns:1fr auto" }, h("span", { class: "mono small muted" }, `${eur.format(paidSum)} pago · ${eur.format(T.fixExp - paidSum)} por pagar`), h("b", { class: "num" }, eur.format(T.fixExp))));
  // tx
  const tb = $("#txs"); tb.replaceChildren();
  const txs = [...T.tx].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  if (!txs.length) tb.append(h("p", { class: "empty" }, "Sem movimentos neste ciclo."));
  txs.forEach(x => tb.append(h("div", { class: "row" }, h("span", { class: "mono small muted" }, F.short.format(parseYmd(x.date))),
    h("span", { class: "t" }, ed(x.descr || x.cat, x.descr, v => run(sb.from("transactions").update({ descr: v }).eq("id", x.id))), h("span", { class: "sub" }, catSel(x.cat, v => run(sb.from("transactions").update({ cat: v }).eq("id", x.id)), x.type === "receita"), x.who ? " · " + (WHO[x.who] || "") : "")),
    ed((x.type === "receita" ? "+" : "−") + eur.format(+x.amount), +x.amount, v => run(sb.from("transactions").update({ amount: v }).eq("id", x.id)), { type: "number", cls: "amt" + (x.type === "receita" ? " in" : "") }),
    delBtn(() => run(sb.from("transactions").delete().eq("id", x.id))))));
  // budget limits inside tx block
  const spentBy = {}; T.tx.filter(x => x.type === "despesa").forEach(x => spentBy[x.cat] = (spentBy[x.cat] || 0) + +x.amount);
  const withLimit = S.budget.filter(b => +b.monthly_limit > 0);
  if (withLimit.length) {
    tb.append(h("p", { class: "sec-label" }, "Orçamento"));
    withLimit.sort((a, b) => a.sort - b.sort).forEach(b => { const s = spentBy[b.cat] || 0, p = Math.min(100, s / b.monthly_limit * 100);
      tb.append(h("div", { class: "bud" }, h("div", { class: "bt" }, h("span", null, b.cat), h("span", { class: "num muted" }, `${eur0.format(s)} / `, ed(eur0.format(+b.monthly_limit), +b.monthly_limit, v => run(sb.from("budget").update({ monthly_limit: v || 0 }).eq("cat", b.cat)), { type: "number" }))),
        h("div", { class: "meter" }, h("i", { class: s > b.monthly_limit ? "over" : s > b.monthly_limit * .85 ? "near" : "", style: `width:${p}%` })))); });
  }
  // savings
  const sv = $("#savings"); sv.replaceChildren();
  S.savings.forEach(s => { const p = s.target > 0 ? Math.min(100, s.saved / s.target * 100) : 0, inp = h("input", { type: "text", inputmode: "decimal", placeholder: "+ €", "aria-label": "Somar a " + s.name });
    sv.append(h("div", { class: "sv rv" }, h("div", { class: "block-head" }, h("span", null, ed(s.name, s.name, v => run(sb.from("savings").update({ name: v }).eq("id", s.id)))), delBtn(() => run(sb.from("savings").delete().eq("id", s.id)))),
      h("b", null, ed(eur0.format(+s.saved), +s.saved, v => run(sb.from("savings").update({ saved: v || 0 }).eq("id", s.id)), { type: "number" })),
      h("span", { class: "mono small muted" }, "de ", ed(eur0.format(+s.target), +s.target, v => run(sb.from("savings").update({ target: v || 0 }).eq("id", s.id)), { type: "number" }), ` · ${Math.round(p)}%`),
      h("div", { class: "meter" }, h("i", { style: `width:${p}%;background:var(--accent)` })),
      h("div", { class: "add" }, inp, h("button", { class: "pill sm", type: "button", onclick: () => saveMove(s.id, parseFloat(inp.value.replace(",", ".")))  }, h("span", { "data-t": "Somar" }, "Somar"))))); });
}
function renderCash() {
  const C = cash(), box = $("#cash"); box.replaceChildren();
  const since = C.asOf.getTime() ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(C.asOf) : "—";
  const big = (label, v, sub, cls = "") => { const b = h("b", { class: "num " + (v < 0 ? "neg " : "") + cls }, eur0.format(0)); countUp(b, v, eur0.format); return h("div", null, h("span", { class: "mono small muted" }, label), b, sub ? h("span", { class: "small muted" }, sub) : null); };
  box.append(
    h("div", { class: "block-head" }, h("h3", null, "Agora"), h("span", { class: "mono small muted" }, "desde " + since)),
    h("div", { class: "cash-top" },
      big("Disponível agora", C.now, C.moved ? `${eur0.format(C.base)} de partida ${C.moved > 0 ? "+" : "−"} ${eur0.format(Math.abs(C.moved))} em movimentos` : "ponto de partida"),
      big("Fim do ciclo · " + F.short.format(C.end), C.forecast, `+${eur0.format(C.incoming)} a receber · −${eur0.format(C.unpaid)} fixas por pagar · sem dia a dia`),
      big("Poupanças", C.saved, "fora das contas do dia a dia")));
  const fix = ed("acertar saldo", C.now, async v => { if (v == null) return; const at = new Date().toISOString();
    await run(sb.from("settings").upsert([{ key: "balance_start", value: v }, { key: "balances_as_of", value: at }]), "Saldo acertado"); }, { type: "number", cls: "link" });
  box.append(h("p", { class: "small muted" }, `Posição global desde ${since}. Atualiza sozinha com cada gasto, receita, conta paga e ordenado. Só é preciso `, fix, " se alguma vez não bater certo com o banco."));
}
function catSel(cur, onSave, income) {
  const opts = income ? INC_CATS : [...new Set([...FIXED_CATS, ...S.budget.map(b => b.cat)])];
  const s = h("select", { class: "chip", style: "border:0;cursor:pointer", "aria-label": "Categoria" }, h("option", { value: "" }, "sem categoria"), opts.map(o => h("option", null, o)));
  s.value = cur || ""; s.onchange = () => onSave(s.value || null); return s;
}
function renderDash(k, T) {
  const by = {};
  const add = (c, key, a, item) => { c = c || "Sem categoria"; (by[c] ||= { fix: 0, v: 0, items: [] }); by[c][key] += a; by[c].items.push(item); };
  activeFixed(k, "expense").forEach(f => add(f.cat, "fix", +f.amount, { n: f.name, a: +f.amount, d: f.pay_day ? "dia " + f.pay_day : "fixa" }));
  T.tx.filter(x => x.type === "despesa").forEach(x => add(x.cat, "v", +x.amount, { n: x.descr || x.cat, a: +x.amount, d: F.short.format(parseYmd(x.date)) }));
  const rows = Object.entries(by).map(([c, o]) => ({ c, ...o, t: o.fix + o.v })).filter(r => r.t > 0).sort((a, b) => b.t - a.t);
  const total = rows.reduce((s, r) => s + r.t, 0), max = rows[0]?.t || 1;
  $("#dash-sub").textContent = `${eur0.format(total)} · ${T.inc ? Math.round(total / T.inc * 100) : 0}% do que entra`;
  const box = $("#dash"); box.replaceChildren(h("div", { class: "dash-legend" }, h("span", null, h("i", { class: "s-fix" }), "Fixas"), h("span", null, h("i", { class: "s-var" }), "Dia a dia")));
  rows.forEach(r => {
    const open = S.dashOpen.has(r.c), tog = () => { open ? S.dashOpen.delete(r.c) : S.dashOpen.add(r.c); renderDash(k, T); };
    box.append(h("div", { class: "cbar" + (open ? " open" : ""), role: "button", tabindex: "0", "aria-expanded": String(open), onclick: tog, onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } } },
      h("span", { class: "nm" }, h("span", { class: "chev" }, "›"), r.c, h("span", { class: "mono small muted" }, r.items.length)),
      h("span", { class: "track", style: `width:${r.t / max * 100}%` }, r.fix ? h("i", { class: "s-fix", style: `flex:${r.fix}` }) : null, r.v ? h("i", { class: "s-var", style: `flex:${r.v}` }) : null),
      h("span", { class: "v" }, eur.format(r.t), h("small", null, Math.round(r.t / total * 100) + "%"))));
    if (open) box.append(h("div", { class: "citems" }, r.items.sort((a, b) => b.a - a.a).map(i => h("div", null, h("span", null, i.n, h("span", { class: "muted" }, " · " + i.d)), h("span", { class: "num" }, eur.format(i.a))))));
  });
  if (!rows.length) box.append(h("p", { class: "empty" }, "Sem despesas neste ciclo."));
}

/* ================= COMPRAS ================= */
function renderShop() {
  const open = S.shopping.filter(i => !i.done), done = S.shopping.filter(i => i.done);
  $("#shop-count").textContent = open.length ? `${open.length} ${open.length === 1 ? "artigo" : "artigos"} em falta` : "Nada em falta";
  const list = $("#sh-list"); list.replaceChildren();
  const groups = [...SHOP_SECS, ...new Set(open.map(i => i.sec).filter(s => !SHOP_SECS.includes(s)))];
  const wrap = h("div", { class: "shop" });
  for (const sec of groups) { const items = open.filter(i => (i.sec || "Outros") === sec); if (!items.length) continue;
    wrap.append(h("p", { class: "sec-label" }, `${sec} · ${items.length}`), ...items.map(shopRow)); }
  if (!open.length) wrap.append(h("p", { class: "empty", style: "padding:20px 0" }, "A lista está vazia. Escreve o que falta: aparece logo no telemóvel do outro."));
  list.append(wrap);
  const db = $("#sh-done"); db.replaceChildren(...(done.length ? done.map(shopRow) : [h("p", { class: "empty" }, "Marca os artigos à medida que os pões no carrinho.")]));
  $("#sh-clear").hidden = !done.length;
  const onList = new Set(S.shopping.map(i => i.name.toLowerCase()));
  const fr = S.freq.filter(f => !onList.has(f.name.toLowerCase())).sort((a, b) => b.times - a.times).slice(0, 16);
  $("#sh-freq").replaceChildren(...fr.map(f => h("button", { type: "button", onclick: () => addShop(f.name, "", f.sec || "Outros") }, "+ " + f.name)));
}
function shopRow(i) {
  return h("div", { class: "row" + (i.done ? " paid" : "") },
    tick(i.done, () => run(sb.from("shopping").update({ done: !i.done, done_at: i.done ? null : new Date().toISOString() }).eq("id", i.id)), "Comprado: " + i.name),
    h("span", { class: "t" }, ed(i.name, i.name, v => run(sb.from("shopping").update({ name: v }).eq("id", i.id)))),
    h("span", { class: "mono small muted" }, ed(i.qty || "qtd", i.qty, v => run(sb.from("shopping").update({ qty: v }).eq("id", i.id)))),
    delBtn(() => run(sb.from("shopping").delete().eq("id", i.id))));
}
async function addShop(name, qty, sec) {
  name = cap(name.trim()); if (!name) return;
  if (S.shopping.some(i => !i.done && i.name.toLowerCase() === name.toLowerCase())) return toast(`"${name}" já está na lista`);
  await run(sb.from("shopping").insert({ name, qty: qty || null, sec, who: S.who }));
}
async function clearBought() {
  const done = S.shopping.filter(i => i.done);
  for (const i of done) { const f = S.freq.find(x => x.name.toLowerCase() === i.name.toLowerCase()); await sb.from("shopping_freq").upsert({ name: f ? f.name : i.name, sec: i.sec, times: (f?.times || 0) + 1 }); }
  await run(sb.from("shopping").delete().in("id", done.map(i => i.id)), "Lista limpa");
}

/* ================= TAREFAS ================= */
function renderTasks() {
  const t = ymd(TODAY()), wk = ymd(addDays(TODAY(), 7)), showDone = $("#tk-done").checked;
  const ts = S.tasks.filter(x => S.tkFilter === "todas" || x.who === S.tkFilter);
  const open = ts.filter(x => !x.done);
  const groups = [["Atrasadas", open.filter(x => x.due && x.due < t)], ["Esta semana", open.filter(x => x.due && x.due >= t && x.due <= wk)], ["Mais tarde", open.filter(x => x.due && x.due > wk)], ["Sem prazo", open.filter(x => !x.due)]];
  if (showDone) groups.push(["Concluídas", ts.filter(x => x.done)]);
  const box = h("div", { class: "shop" });
  for (const [n, items] of groups) { if (!items.length) continue;
    box.append(h("p", { class: "sec-label" }, `${n} · ${items.length}`), ...items.sort((a, b) => (a.due || "9").localeCompare(b.due || "9")).map(taskRow)); }
  if (!box.childNodes.length) box.append(h("p", { class: "empty", style: "padding:20px 0" }, "Nada pendente."));
  $("#tk-list").replaceChildren(box);
}

/* ================= OBJETIVOS ================= */
function renderGoals() {
  const box = $("#goals"); box.replaceChildren();
  for (const [k, label] of [["curto", "Este ano"], ["medio", "1 a 3 anos"], ["longo", "Longo prazo"]]) {
    const items = S.goals.filter(g => g.horizon === k);
    box.append(h("div", { class: "gcol" }, h("p", { class: "sec-label" }, `${label} · ${items.length}`),
      items.length ? items.map(g => h("div", { class: "goal rv" }, h("span", { class: "t" }, ed(g.title, g.title, v => run(sb.from("goals").update({ title: v }).eq("id", g.id)))),
        h("span", null, h("span", { class: "chip " + g.who }, WHO[g.who] || g.who)),
        h("div", { class: "meter" }, h("i", { style: `width:${g.progress}%;background:var(--accent)` })),
        h("div", { class: "ctl" }, h("span", { class: "seg" }, h("button", { type: "button", onclick: () => run(sb.from("goals").update({ progress: Math.max(0, g.progress - 10) }).eq("id", g.id)) }, "−"), h("span", { class: "pct", style: "padding:8px 6px" }, g.progress + "%"), h("button", { type: "button", onclick: () => run(sb.from("goals").update({ progress: Math.min(100, g.progress + 10) }).eq("id", g.id)) }, "+")),
          delBtn(() => run(sb.from("goals").delete().eq("id", g.id)))))) : h("p", { class: "empty" }, "—")));
  }
}

/* ================= shared dialog ================= */
function openDlg(...kids) {
  const d = $("#dlg"); $("#dlg-body").replaceChildren(h("button", { class: "dlg-x", type: "button", "aria-label": "Fechar", onclick: () => d.close() }, "×"), ...kids.flat().filter(k => k != null && k !== false));
  if (!d.open) d.showModal();
}
const closeDlg = () => $("#dlg").open && $("#dlg").close();
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/* ================= REFEIÇÕES ================= */
const SLOTS = [["almoco", "Almoço"], ["jantar", "Jantar"]];
const MAIN_TAGS = ["peixe", "carne", "vegetariano", "massa", "sopa"];
const TAG_SET = ["peixe", "carne", "vegetariano", "massa", "sopa", "rápido", "forno", "miúdos"];
const recipeById = id => S.recipes.find(r => r.id === id);
const activeRecipes = () => S.recipes.filter(r => r.status !== "arquivada");
const monday = d => addDays(d, -((d.getDay() + 6) % 7));

/* How much we want a recipe right now: what we said about it, how long since we ate it, and whether it is ours yet. */
function recipeScore(r, ref = TODAY()) {
  const fb = r.loves + r.likes + r.nos;
  const pref = fb ? (2 * r.loves + r.likes - 3 * r.nos) / fb : 0;
  const days = r.last_cooked ? dayDiff(parseYmd(r.last_cooked), ref) : 45;
  const fresh = days < 7 ? -2 : Math.min(days, 45) / 45 * 1.5;
  return (r.status === "nossa" ? 1 : .3) + pref * 1.2 + fresh - .35 * Math.min(r.skips, 4) + Math.min(r.cooked, 6) * .08;
}
function reasonFor(r) {
  const bits = [];
  if (r.loves) bits.push(`adoraram ${r.loves}×`); else if (r.likes) bits.push(`gostaram ${r.likes}×`);
  if (r.nos) bits.push(`${r.nos}× não`);
  if (r.last_cooked) { const d = dayDiff(parseYmd(r.last_cooked), TODAY()); bits.push(d <= 0 ? "feita hoje" : `feita há ${d} ${d === 1 ? "dia" : "dias"}`); }
  else bits.push(r.status === "ideia" ? "ideia nova" : "ainda não feita");
  return bits.join(" · ");
}

/* "500 g de bacalhau desfiado" → { name: "Bacalhau desfiado", qty: "500 g" } */
const UNITS = "kg|g|gr|mg|l|dl|cl|ml|colher(?:es)?(?: de (?:sopa|chá|sobremesa))?|c\\.? ?(?:de )?(?:sopa|chá)|chávenas?|copos?|latas?|pacotes?|embalage(?:m|ns)|unidades?|dentes?|folhas?|ramos?|pitadas?|fatias?|postas?|molhos?|q\\.?b\\.?";
function splitIng(s) {
  const t = String(s).trim().replace(/^[-•*·–]\s*/, "");
  const m = t.match(new RegExp(`^((?:\\d+[\\d.,/]*|½|¼|¾|meia|meio|uma?|dois|duas|três)\\s*(?:(?:${UNITS})(?![a-zà-úç]))?\\.?\\s*(?:de\\s+)?)(.+)$`, "i"));
  let name = m ? m[2] : t; const qty = m ? m[1].replace(/\s*de\s*$/i, "").trim() : "";
  name = name.replace(/\(.*?\)/g, "").split(/,| q\.?b\.?| a gosto| para /i)[0].trim();
  return { name: cap(name), qty };
}
const PANTRY = /^(sal|sal grosso|pimenta|pimenta preta|azeite|água|óleo|vinagre|açúcar|farinha|louro|folha de louro|colorau|noz-moscada|caril em pó|orégãos|oregãos|salsa seca)$/i;
const FRESH = /(peixe|bacalhau|salm|dourad|robalo|pescad|camar|frango|peru|vaca|porco|carne|bife|febra|pato|chouri|ovo|leite|natas|queijo|iogurte|manteiga|alface|tomate|cebola|alho|batata|cenoura|courgette|curgete|br[oó]colo|espinafre|pimento|ab[oó]bora|beringela|lim[aã]o|laranja|ma[cç][aã]|banana|fruta|salsa|coentros|cogumelo|ervilha|feij[aã]o verde)/i;

function renderMeals() {
  if (!S.mealWeek) S.mealWeek = monday(TODAY());
  const w0 = S.mealWeek, days = [...Array(7)].map((_, i) => addDays(w0, i)), t = ymd(TODAY());
  const isThis = ymd(w0) === ymd(monday(TODAY()));
  $("#wk-title").textContent = isThis ? "Esta semana" : ymd(w0) > t ? "Semana seguinte" : "Semana passada";
  $("#wk-range").textContent = `${F.short.format(days[0])} – ${F.short.format(days[6])}`;
  const wk = $("#week"); wk.replaceChildren();
  for (const d of days) {
    const ds = ymd(d), card = h("div", { class: "day rv" + (ds === t ? " today" : "") + (ds < t ? " past" : "") });
    card.append(h("div", { class: "day-h" }, h("b", null, cap(F.wd.format(d)).replace(".", "")), h("span", { class: "muted" }, d.getDate())));
    for (const [slot, label] of SLOTS) {
      const m = S.meals.find(x => x.date === ds && x.slot === slot);
      card.append(m ? mealSlot(m, label) : h("button", { class: "slot empty", type: "button", onclick: () => pickMeal(ds, slot) }, "+ " + label));
    }
    wk.append(card);
  }
  // library
  const q = norm($("#rc-q").value), tag = S.rcTag;
  const list = activeRecipes().filter(r => (!tag || r.tags.includes(tag)) && (!q || norm(r.name).includes(q) || r.ingredients.some(i => norm(i).includes(q))))
    .map(r => ({ r, s: recipeScore(r) })).sort((a, b) => b.s - a.s);
  $("#rc-count").textContent = `${activeRecipes().filter(r => r.status === "nossa").length} nossas · ${activeRecipes().filter(r => r.status === "ideia").length} ideias`;
  $("#rc-tags").replaceChildren(...TAG_SET.map(g => h("button", { type: "button", class: "chip" + (tag === g ? " on" : ""), onclick: () => { S.rcTag = tag === g ? null : g; renderMeals(); } }, g)));
  $("#rc-list").replaceChildren(...(list.length ? list.map(({ r }) => h("button", { class: "rc rv", type: "button", onclick: () => showRecipe(r) },
    r.image ? h("img", { src: r.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : h("span", { class: "rc-ph" }, r.name.slice(0, 1)),
    h("span", { class: "rc-t" }, h("b", null, r.name), h("span", { class: "sub" }, reasonFor(r)),
      h("span", { class: "rc-tags" }, r.status === "ideia" ? h("span", { class: "chip soon" }, "ideia") : null, r.tags.slice(0, 3).map(g => h("span", { class: "chip" }, g)), r.minutes ? h("span", { class: "chip" }, r.minutes + " min") : null))))
    : [h("p", { class: "empty" }, "Nenhuma receita com esse filtro.")]));
  if (!$("#rc-editor").childNodes.length) setRcMode(S.rcMode || "link");
}
function mealSlot(m, label) {
  const r = m.recipe_id && recipeById(m.recipe_id), name = r ? r.name : m.title || "—", past = m.date <= ymd(TODAY());
  const box = h("div", { class: "slot" + (m.status === "feito" ? " done" : "") + (m.status === "saltado" ? " skipped" : "") });
  box.append(h("span", { class: "slot-l" }, label), h("button", { class: "slot-n", type: "button", onclick: () => r ? showRecipe(r, m) : pickMeal(m.date, m.slot) }, name));
  if (r && m.status === "planeado") box.append(h("span", { class: "slot-r" }, reasonFor(r)));
  if (m.status === "planeado" && past) box.append(h("div", { class: "fb" },
    ...(r ? [["adorei", "Adorei"], ["bom", "Bom"], ["nao", "Não repetir"]] : [["feito", "Feito"]]).map(([k, l]) => h("button", { type: "button", class: "fb-" + k, onclick: () => mealFeedback(m, k) }, l)),
    h("button", { type: "button", class: "fb-skip", onclick: () => mealFeedback(m, "saltado") }, "Não fizemos")));
  else if (m.status !== "planeado") box.append(h("button", { type: "button", class: "chip fbchip " + (m.feedback || "saltado"), title: "Desfazer", onclick: () => undoFeedback(m) },
    m.status === "saltado" ? "Não fizemos" : { adorei: "Adorei", bom: "Bom", nao: "Não repetir" }[m.feedback] || "Feito", " ↺"));
  box.append(h("button", { class: "slot-x", type: "button", "aria-label": "Tirar do plano", onclick: () => removeMeal(m) }, "×"));
  return box;
}
async function planMeal(date, slot, recipe, title) {
  const ex = S.meals.find(x => x.date === date && x.slot === slot);
  const row = { date, slot, recipe_id: recipe ? recipe.id : null, title: recipe ? null : title, status: "planeado", feedback: null };
  const ok = ex ? await run(sb.from("meal_plan").update(row).eq("id", ex.id)) : await run(sb.from("meal_plan").insert(row));
  if (ok) { closeDlg(); toast(`${recipe ? recipe.name : title} · ${cap(F.wd.format(parseYmd(date)))}`); }
}
function pickMeal(date, slot) {
  const inp = h("input", { type: "search", placeholder: "Procurar ou escrever (ex.: Sobras, Jantar fora)", class: "dlg-search" });
  const out = h("div", { class: "pick" });
  const draw = () => {
    const q = norm(inp.value);
    const items = activeRecipes().filter(r => !q || norm(r.name).includes(q)).map(r => ({ r, s: recipeScore(r, parseYmd(date)) })).sort((a, b) => b.s - a.s).slice(0, 30);
    out.replaceChildren(
      inp.value.trim() ? h("button", { class: "pick-i free", type: "button", onclick: () => planMeal(date, slot, null, cap(inp.value.trim())) }, h("b", null, `Usar "${cap(inp.value.trim())}"`), h("span", { class: "sub" }, "sem receita")) : null,
      ...items.map(({ r }) => h("button", { class: "pick-i", type: "button", onclick: () => planMeal(date, slot, r) }, h("b", null, r.name), h("span", { class: "sub" }, reasonFor(r)))));
  };
  inp.oninput = draw; draw();
  openDlg(h("h3", null, `${SLOTS.find(s => s[0] === slot)[1]} de ${F.long.format(parseYmd(date))}`), inp, out);
  setTimeout(() => inp.focus(), 50);
}
async function bumpRecipe(r, patch) { await run(sb.from("recipes").update(patch).eq("id", r.id)); }
async function mealFeedback(m, fb) {
  const r = m.recipe_id && recipeById(m.recipe_id);
  if (!await run(sb.from("meal_plan").update({ status: fb === "saltado" ? "saltado" : "feito", feedback: fb === "saltado" || fb === "feito" ? null : fb }).eq("id", m.id))) return;
  if (!r) return;
  if (fb === "saltado") return bumpRecipe(r, { skips: r.skips + 1 });
  if (fb === "feito") return bumpRecipe(r, { cooked: r.cooked + 1, last_cooked: !r.last_cooked || r.last_cooked < m.date ? m.date : r.last_cooked });
  const col = { adorei: "loves", bom: "likes", nao: "nos" }[fb];
  await bumpRecipe(r, { [col]: r[col] + 1, cooked: r.cooked + 1, last_cooked: !r.last_cooked || r.last_cooked < m.date ? m.date : r.last_cooked, status: r.status === "ideia" && fb !== "nao" ? "nossa" : r.status });
  toast(fb === "nao" ? "Anotado: vai aparecer muito menos" : fb === "adorei" ? "Anotado: vai aparecer mais vezes" : "Anotado");
}
async function undoFeedback(m) {
  const r = m.recipe_id && recipeById(m.recipe_id);
  if (!await run(sb.from("meal_plan").update({ status: "planeado", feedback: null }).eq("id", m.id))) return;
  if (!r) return;
  if (m.status === "saltado") return bumpRecipe(r, { skips: Math.max(0, r.skips - 1) });
  const col = { adorei: "loves", bom: "likes", nao: "nos" }[m.feedback];
  if (col) await bumpRecipe(r, { [col]: Math.max(0, r[col] - 1), cooked: Math.max(0, r.cooked - 1) });
}
async function removeMeal(m) {
  const r = m.recipe_id && recipeById(m.recipe_id);
  if (await run(sb.from("meal_plan").delete().eq("id", m.id)) && r && m.status === "planeado" && m.date >= ymd(TODAY())) await bumpRecipe(r, { skips: r.skips + 1 });
}
/* Fill the empty dinners of the visible week: best score, a little randomness, variety across fish/meat/veg, quick dishes on weekdays. */
async function suggestWeek() {
  const t = ymd(TODAY()), days = [...Array(7)].map((_, i) => addDays(S.mealWeek, i));
  const week = S.meals.filter(m => m.date >= ymd(days[0]) && m.date <= ymd(days[6]));
  const used = new Set(week.map(m => m.recipe_id).filter(Boolean)), count = {};
  week.forEach(m => { const r = recipeById(m.recipe_id); r && r.tags.forEach(g => count[g] = (count[g] || 0) + 1); });
  const rows = [];
  for (const d of days) {
    const ds = ymd(d); if (ds < t || week.some(m => m.date === ds && m.slot === "jantar")) continue;
    const weekday = d.getDay() >= 1 && d.getDay() <= 4;
    const best = activeRecipes().filter(r => !used.has(r.id) && r.nos < 2 + r.loves).map(r => {
      let s = recipeScore(r, d) + rnd() * .8;
      if (weekday) { if (r.minutes > 45) s -= .8; if (r.tags.includes("rápido")) s += .3; }
      MAIN_TAGS.forEach(g => { if (r.tags.includes(g)) s -= .7 * (count[g] || 0); });
      if (r.tags.includes("peixe") && (count.peixe || 0) < 2) s += .5;
      return { r, s };
    }).sort((a, b) => b.s - a.s)[0];
    if (!best) break;
    used.add(best.r.id); best.r.tags.forEach(g => count[g] = (count[g] || 0) + 1);
    rows.push({ date: ds, slot: "jantar", recipe_id: best.r.id, status: "planeado" });
  }
  if (!rows.length) return toast("Os jantares desta semana já estão todos planeados");
  if (await run(sb.from("meal_plan").insert(rows))) toast(`Sugeri ${rows.length} ${rows.length === 1 ? "jantar" : "jantares"}. Para trocar, toca no nome.`);
}
function tonight() {
  const t = ymd(TODAY()), have = S.meals.find(m => m.date === t && m.slot === "jantar");
  const top = activeRecipes().filter(r => r.nos < 2 + r.loves).map(r => ({ r, s: recipeScore(r) + rnd() * 1.2 })).sort((a, b) => b.s - a.s).slice(0, 3);
  openDlg(h("h3", null, "O que jantamos hoje?"), have ? h("p", { class: "small muted" }, `Já está planeado: ${have.recipe_id ? recipeById(have.recipe_id)?.name : have.title}. Escolher outro substitui.`) : null,
    h("div", { class: "pick" }, ...top.map(({ r }) => h("button", { class: "pick-i", type: "button", onclick: () => planMeal(t, "jantar", r) }, h("b", null, r.name), h("span", { class: "sub" }, reasonFor(r) + (r.minutes ? ` · ${r.minutes} min` : ""))))),
    h("button", { class: "pill ghost sm", type: "button", onclick: tonight }, h("span", { "data-t": "Outras três" }, "Outras três")));
}
async function mealsToShopping() {
  const t = ymd(TODAY()), days = [...Array(7)].map((_, i) => ymd(addDays(S.mealWeek, i)));
  const meals = S.meals.filter(m => days.includes(m.date) && m.date >= t && m.status === "planeado" && m.recipe_id);
  if (!meals.length) return toast("Não há refeições planeadas com receita nesta semana");
  const agg = new Map();
  for (const m of meals) for (const ing of recipeById(m.recipe_id)?.ingredients || []) {
    const { name, qty } = splitIng(ing); if (!name || PANTRY.test(name)) continue;
    const k = norm(name), cur = agg.get(k) || { name, qty: [] }; if (qty) cur.qty.push(qty); agg.set(k, cur);
  }
  const open = new Set(S.shopping.filter(i => !i.done).map(i => norm(i.name)));
  const rows = [...agg.entries()].filter(([k]) => !open.has(k)).map(([, v]) => {
    const f = S.freq.find(x => norm(x.name) === norm(v.name));
    return { name: v.name, qty: v.qty.join(" + ") || null, sec: f?.sec || (FRESH.test(v.name) ? "Frescos" : "Supermercado"), who: S.who };
  });
  if (!rows.length) return toast("Já está tudo na lista de compras");
  if (await run(sb.from("shopping").insert(rows))) toast(`${rows.length} ingredientes adicionados às compras`);
}
function showRecipe(r, meal) {
  const nextFree = () => { for (let i = 0; i < 14; i++) { const ds = ymd(addDays(TODAY(), i)); if (!S.meals.some(m => m.date === ds && m.slot === "jantar")) return ds; } return ymd(TODAY()); };
  openDlg(
    r.image ? h("img", { class: "dlg-img", src: r.image, alt: "", referrerpolicy: "no-referrer" }) : null,
    h("h3", null, r.name),
    h("p", { class: "small muted" }, [reasonFor(r), r.minutes ? r.minutes + " min" : null, r.servings ? r.servings + " pessoas" : null].filter(Boolean).join(" · ")),
    h("div", { class: "rc-tags" }, r.status === "ideia" ? h("span", { class: "chip soon" }, "ideia") : null, r.tags.map(g => h("span", { class: "chip" }, g))),
    r.ingredients.length ? h("div", null, h("p", { class: "sec-label" }, "Ingredientes"), h("ul", { class: "ing" }, r.ingredients.map(i => h("li", null, i)))) : null,
    r.steps ? h("div", null, h("p", { class: "sec-label" }, "Preparação"), h("p", { class: "steps" }, r.steps)) : null,
    r.url ? h("p", null, h("a", { class: "link", href: r.url, target: "_blank", rel: "noopener" }, "Abrir a receita original ↗")) : null,
    h("div", { class: "dlg-actions" },
      meal ? null : h("button", { class: "pill sm", type: "button", onclick: () => planMeal(nextFree(), "jantar", r) }, h("span", { "data-t": "Planear jantar" }, "Planear jantar")),
      r.status === "ideia" ? h("button", { class: "pill ghost sm", type: "button", onclick: async () => { await bumpRecipe(r, { status: "nossa" }); closeDlg(); } }, h("span", { "data-t": "É das nossas" }, "É das nossas")) : null,
      h("button", { class: "pill ghost sm", type: "button", onclick: () => { closeDlg(); S.rcMode = "manual"; setRcMode("manual", r); $("#rc-add").scrollIntoView({ behavior: "smooth" }); } }, h("span", { "data-t": "Editar" }, "Editar")),
      h("button", { class: "pill ghost sm", type: "button", onclick: async () => { await bumpRecipe(r, { status: "arquivada" }); closeDlg(); toast("Receita arquivada"); } }, h("span", { "data-t": "Não nos interessa" }, "Não nos interessa"))));
}
/* Add / edit recipe: link import (edge function), pasted text, or manual. All three end in the same editable form. */
function setRcMode(mode, edit) {
  S.rcMode = mode; $$("#rc-mode button").forEach(b => b.classList.toggle("on", b.dataset.m === mode));
  const src = $("#rc-src"); src.replaceChildren(); $("#rc-editor").replaceChildren();
  if (mode === "link") {
    const i = h("input", { type: "url", placeholder: "https://… link de uma receita", required: true });
    const b = h("button", { class: "pill sm", type: "submit" }, h("span", { "data-t": "Importar" }, "Importar"));
    src.append(h("form", { class: "row-form", onsubmit: async e => { e.preventDefault(); b.disabled = true; b.firstChild.textContent = "A ler…";
      const { data, error } = await sb.functions.invoke("import-recipe", { body: { url: i.value.trim() } }); b.disabled = false; b.firstChild.textContent = "Importar";
      if (error || data?.error) return toast("Não consegui ler esse link" + (data?.error ? `: ${data.error}` : ""));
      if (data.partial) toast("O site não tem a receita em formato legível. Completa à mão.");
      recipeEditor({ name: data.name, ingredients: data.ingredients, steps: data.steps, minutes: data.minutes, servings: data.servings, image: data.image, url: data.url, tags: guessTags(data.name + " " + (data.keywords || []).join(" ") + " " + data.ingredients.join(" "), data.minutes) });
    } }, i, b));
  } else if (mode === "texto") {
    const ta = h("textarea", { rows: 7, placeholder: "Cola aqui a receita (nome na primeira linha, depois ingredientes e preparação)" });
    src.append(h("div", { class: "rc-paste" }, ta, h("button", { class: "pill sm", type: "button", onclick: () => { const p = parseRecipeText(ta.value); if (!p.name) return toast("Cola primeiro o texto"); recipeEditor({ ...p, tags: guessTags(p.name + " " + p.ingredients.join(" "), null) }); } }, h("span", { "data-t": "Ler" }, "Ler"))));
  } else recipeEditor(edit || { name: "", ingredients: [], steps: "", tags: [] });
}
function guessTags(text, minutes) {
  const t = norm(text), tags = [];
  if (/bacalhau|salmao|dourada|robalo|pescada|atum|peixe|camarao|polvo|lulas|marisco|sardinha/.test(t)) tags.push("peixe");
  if (/frango|vaca|porco|carne|bife|pato|peru|febra|chourico|hamburguer|bolonhesa/.test(t)) tags.push("carne");
  if (!tags.length && /grao|lentilha|feijao|tofu|legumes|vegetarian|cogumelo|espinafre/.test(t)) tags.push("vegetariano");
  if (/massa|esparguete|lasanha|penne|fusilli|tagliatelle|macarrao|noodles/.test(t)) tags.push("massa");
  if (/sopa|creme de/.test(t)) tags.push("sopa");
  if (/forno|assad/.test(t)) tags.push("forno");
  if (minutes && minutes <= 30) tags.push("rápido");
  return [...new Set(tags)];
}
function parseRecipeText(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (!lines.length) return {};
  const name = lines.shift().replace(/^#+\s*/, "");
  const iIng = lines.findIndex(l => /^ingredientes/i.test(l)), iSteps = lines.findIndex(l => /^(prepara|modo de prepara|instru|passos|como fazer)/i.test(l));
  let ingredients, steps;
  if (iIng >= 0) { ingredients = lines.slice(iIng + 1, iSteps > iIng ? iSteps : undefined); steps = iSteps >= 0 ? lines.slice(iSteps + 1) : (iIng > 0 ? lines.slice(0, iIng) : []); }
  else { ingredients = lines.filter(l => /^([-•*·]|\d+[\d.,/]*\s*(kg|g|ml|l|dl|colher|ch[aá]vena|lata|dente|unidade)?\b)/i.test(l) && l.length < 80); steps = lines.filter(l => !ingredients.includes(l)); }
  return { name, ingredients: ingredients.map(l => l.replace(/^[-•*·]\s*/, "")), steps: steps.join("\n") };
}
function recipeEditor(r) {
  const f = (tag, attrs, val) => { const el = h(tag, attrs); el.value = val ?? ""; return el; };
  const name = f("input", { placeholder: "Nome", required: true }, r.name);
  const ing = f("textarea", { rows: 6, placeholder: "Ingredientes, um por linha (ex.: 500 g de bacalhau)" }, (r.ingredients || []).join("\n"));
  const steps = f("textarea", { rows: 5, placeholder: "Preparação (opcional)" }, r.steps);
  const mins = f("input", { type: "number", min: 0, placeholder: "Minutos" }, r.minutes);
  const tagsSel = new Set(r.tags || []);
  const tagBox = h("div", { class: "chips" }, TAG_SET.map(g => { const b = h("button", { type: "button", class: "chip" + (tagsSel.has(g) ? " on" : "") }, g); b.onclick = () => { tagsSel.has(g) ? tagsSel.delete(g) : tagsSel.add(g); b.classList.toggle("on"); }; return b; }));
  const form = h("form", { class: "rc-edit", onsubmit: async e => { e.preventDefault();
    const row = { name: cap(name.value.trim()), ingredients: ing.value.split("\n").map(s => s.trim()).filter(Boolean), steps: steps.value.trim() || null, minutes: parseInt(mins.value) || null, tags: [...tagsSel], url: r.url || null, image: r.image || null, servings: r.servings || null };
    const ok = r.id ? await run(sb.from("recipes").update(row).eq("id", r.id), "Receita atualizada") : await run(sb.from("recipes").insert({ ...row, status: "nossa", created_by: S.who }), "Receita guardada");
    if (ok) setRcMode(S.rcMode === "manual" ? "manual" : S.rcMode);
  } },
    r.image ? h("img", { class: "rc-prev-img", src: r.image, alt: "", referrerpolicy: "no-referrer" }) : null,
    name, h("div", { class: "rc-2" }, mins, tagBox), ing, steps,
    h("div", { class: "dlg-actions" }, h("button", { class: "pill sm", type: "submit" }, h("span", { "data-t": r.id ? "Guardar alterações" : "Guardar receita" }, r.id ? "Guardar alterações" : "Guardar receita")),
      r.id ? h("button", { class: "pill ghost sm", type: "button", onclick: () => setRcMode("manual") }, h("span", { "data-t": "Cancelar" }, "Cancelar")) : null));
  $("#rc-editor").replaceChildren(form);
}

/* ================= FAMÍLIA ================= */
function renderFamily() {
  const p = preg(), k = cycleKey(TODAY()), dueKey = cycleKey(p.due), cyclesLeft = Math.max(1, cyclesBetween(k, dueKey) + 1);
  $("#fm-meta").textContent = `bebé: ${p.w}+${p.d} semanas · faltam ${cyclesLeft} ciclos até ao parto`;
  // savings plan
  const fund = S.savings.find(s => s.id === "bebe") || { id: "bebe", target: 0, saved: 0, name: "Fundo do bebé" };
  const listCost = S.baby.filter(b => b.status === "falta").reduce((a, b) => a + (+b.cost || 0), 0);
  const target = Math.max(+fund.target, listCost), need = Math.max(0, target - +fund.saved);
  const per = Math.ceil(need / cyclesLeft / 5) * 5, r = cycleRange(k);
  const thisCycle = S.smoves.filter(m => m.saving_id === "bebe" && new Date(m.at) >= r.start && new Date(m.at) < addDays(r.end, 1)).reduce((a, m) => a + +m.amount, 0);
  const left = Math.max(0, per - thisCycle), pct = target ? Math.min(100, fund.saved / target * 100) : 0;
  const amt = h("input", { type: "text", inputmode: "decimal", value: left ? String(left) : "", "aria-label": "Valor posto de lado" });
  $("#baby-plan").replaceChildren(
    h("div", { class: "block-head" }, h("h3", null, "Plano até ao bebé"), h("span", { class: "mono small muted" }, `DPP ${F.dy.format(p.due)}`)),
    h("div", { class: "cash-top" },
      h("div", null, h("span", { class: "mono" }, "Pôr de lado por ciclo"), h("b", null, eur0.format(per)), h("span", { class: "small" }, need ? `${eur0.format(need)} em falta ÷ ${cyclesLeft} ciclos` : "Fundo completo")),
      h("div", null, h("span", { class: "mono" }, "Este ciclo"), h("b", null, eur0.format(thisCycle)), h("span", { class: "small muted" }, left ? `faltam ${eur0.format(left)}` : "feito")),
      h("div", null, h("span", { class: "mono" }, "Fundo do bebé"), h("b", null, `${eur0.format(+fund.saved)}`), h("span", { class: "small muted" }, `de ${eur0.format(target)}${listCost > +fund.target ? " (pela lista)" : ""}`))),
    h("div", { class: "meter" }, h("i", { style: `width:${pct}%` })),
    h("div", { class: "row-form" }, amt, h("button", { class: "pill sm", type: "button", onclick: () => saveMove("bebe", parseFloat(amt.value.replace(",", "."))) }, h("span", { "data-t": "Já pus de lado" }, "Já pus de lado"))),
    h("p", { class: "small muted" }, "Quando passarem dinheiro para a poupança, carreguem aqui: o fundo sobe e o disponível em Finanças desce."));
  // baby list
  const bl = $("#bb-list"); bl.replaceChildren();
  const st = { falta: "Falta", temos: "Temos", comprado: "Comprado" }, nextSt = { falta: "temos", temos: "comprado", comprado: "falta" };
  [...S.baby].sort((a, b) => (a.status === "falta" ? 0 : 1) - (b.status === "falta" ? 0 : 1) || a.sort - b.sort).forEach(b => bl.append(h("div", { class: "row" + (b.status !== "falta" ? " paid" : "") },
    h("button", { type: "button", class: "chip " + (b.status === "falta" ? "soon" : "ok"), title: "Mudar estado", onclick: () => run(sb.from("baby_items").update({ status: nextSt[b.status] }).eq("id", b.id)) }, st[b.status]),
    h("span", { class: "t" }, ed(b.name, b.name, v => run(sb.from("baby_items").update({ name: v }).eq("id", b.id))), b.cat ? h("span", { class: "sub" }, b.cat) : null),
    ed(b.cost ? eur.format(+b.cost) : "€ ?", b.cost, v => run(sb.from("baby_items").update({ cost: v }).eq("id", b.id)), { type: "number", cls: "amt" }),
    delBtn(() => run(sb.from("baby_items").delete().eq("id", b.id))))));
  $("#bb-sum").textContent = `${S.baby.filter(b => b.status === "falta").length} em falta · ${eur0.format(listCost)} estimado`;
  // leave (rules checked Oct 2026; a labour reform was in Parliament)
  const d42 = addDays(p.due, 42), d7 = addDays(p.due, 7);
  $("#bb-leave").replaceChildren(h("div", { class: "leave" },
    h("p", null, h("b", null, "Rita: "), `42 dias seguidos a seguir ao parto, só dela (até ${F.short.format(d42)} se nascer na data prevista).`),
    h("p", null, h("b", null, "Alexandre: "), `28 dias obrigatórios nos 42 dias a seguir ao nascimento, 7 deles seguidos logo após o parto (até ${F.short.format(d7)}), e o resto até ${F.short.format(d42)}. Há mais 7 dias facultativos.`),
    h("p", null, h("b", null, "Modelos: "), "120 dias a 100%, 150 dias a 80% (100% se partilhados), 180 dias a 83% (90% se partilhados e o pai gozar pelo menos 60)."),
    h("p", { class: "small muted" }, "Está no Parlamento uma reforma que pode mudar isto. Confirmem na Segurança Social perto da data, conforme a situação profissional de cada um.")));
  kidList("#bb-admin", "bebe");
  // Rodrigo
  const birth = S.settings.rodrigo_birth;
  const ageTxt = birth ? (() => { const b = parseYmd(birth), m = (TODAY().getFullYear() - b.getFullYear()) * 12 + TODAY().getMonth() - b.getMonth() - (TODAY().getDate() < b.getDate() ? 1 : 0); return m < 24 ? `${m} meses` : `${Math.floor(m / 12)} anos e ${m % 12} meses`; })() : null;
  $("#kid-age").replaceChildren(ed(ageTxt ? `${ageTxt} · nasceu a ${F.dy.format(parseYmd(birth))}` : "data de nascimento?", birth, v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? run(sb.from("settings").upsert({ key: "rodrigo_birth", value: v })) : toast("Usa o formato aaaa-mm-dd")));
  kidList("#kid-list", "rodrigo");
  // Nós
  const us = S.tasks.filter(t => t.cat === "Nós" && !t.done);
  $("#us").replaceChildren(...(us.length ? us.map(taskRow) : [h("p", { class: "empty" }, "Sem planos a dois. Criem uma tarefa na categoria Nós.")]),
    h("p", { class: "small muted" }, "Quando marcarem como feito, volta a aparecer daqui a um mês e passa a ser o outro a organizar."));
}
function kidList(sel, kid) {
  const items = S.kids.filter(x => x.kid === kid).sort((a, b) => (a.done - b.done) || (a.date || "9").localeCompare(b.date || "9"));
  const kindLabel = { vacina: "Vacina", consulta: "Consulta", marco: "Marco", nota: "Nota" };
  $(sel).replaceChildren(...(items.length ? items.map(x => h("div", { class: "row" + (x.done ? " paid" : "") },
    tick(x.done, () => run(sb.from("kid_items").update({ done: !x.done }).eq("id", x.id)), "Feito: " + x.title),
    h("span", { class: "t" }, ed(x.title, x.title, v => run(sb.from("kid_items").update({ title: v }).eq("id", x.id))), h("span", { class: "sub" }, kindLabel[x.kind] || x.kind, x.note ? " · " + x.note : "")),
    ed(x.date ? F.short.format(parseYmd(x.date)) : "data", x.date, v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") || !v ? run(sb.from("kid_items").update({ date: v || null }).eq("id", x.id)) : toast("Usa aaaa-mm-dd"), { cls: "mono small" }),
    delBtn(() => run(sb.from("kid_items").delete().eq("id", x.id))))) : [h("p", { class: "empty" }, "—")]));
}
async function saveMove(id, amount) {
  if (!amount || Number.isNaN(amount)) return toast("Indica o valor");
  const s = S.savings.find(x => x.id === id); if (!s) return;
  if (await run(sb.from("savings_moves").insert({ saving_id: id, amount, who: S.who })) && await run(sb.from("savings").update({ saved: Math.max(0, +s.saved + amount) }).eq("id", id), `${eur0.format(amount)} no ${s.name.toLowerCase()}`)) await load("smoves");
}

/* ================= recurring tasks ================= */
function nextDue(due, recur) {
  const base = !due || due < ymd(TODAY()) ? TODAY() : parseYmd(due);
  if (recur === "mensal") { const d = new Date(base); d.setMonth(d.getMonth() + 1); return ymd(d); }
  return ymd(addDays(base, recur === "quinzenal" ? 14 : 7));
}
const otherOf = w => w === "alexandre" ? "rita" : w === "rita" ? "alexandre" : w;
async function completeTask(x) {
  if (x.recur && !x.done) {
    const due = nextDue(x.due, x.recur), who = x.rotate ? otherOf(x.who) : x.who;
    if (await run(sb.from("tasks").update({ due, who, done_at: new Date().toISOString() }).eq("id", x.id))) toast(`Feito. Próxima: ${F.short.format(parseYmd(due))}${x.rotate ? " · " + WHO[who] : ""}`);
    return;
  }
  await run(sb.from("tasks").update({ done: !x.done, done_at: x.done ? null : new Date().toISOString() }).eq("id", x.id));
}
function taskRow(x) {
  const t = ymd(TODAY());
  return h("div", { class: "row" + (x.done ? " paid" : "") },
    tick(x.done, () => completeTask(x), "Concluir " + x.title),
    h("span", { class: "t" }, ed(x.title, x.title, v => run(sb.from("tasks").update({ title: v }).eq("id", x.id))),
      h("span", { class: "sub" }, h("span", { class: "chip " + x.who }, WHO[x.who] || x.who), " ", x.cat || "", x.recur ? h("span", { class: "chip" }, "↻ " + x.recur + (x.rotate ? " · alterna" : "")) : null)),
    x.due ? h("span", { class: "chip " + (!x.done && x.due < t ? "late" : "") }, F.short.format(parseYmd(x.due))) : h("span"),
    delBtn(() => run(sb.from("tasks").delete().eq("id", x.id))));
}

/* ================= forms ================= */
function setupForms() {
  const cats = [...new Set([...S.budget.sort((a, b) => a.sort - b.sort).map(b => b.cat), ...FIXED_CATS])];
  const fillTx = () => { const inc = $("#tx-type").value === "receita"; $("#tx-cat").replaceChildren(...(inc ? INC_CATS : cats).map(c => h("option", null, c))); };
  fillTx(); $("#tx-type").onchange = fillTx;
  $("#fx-cat").replaceChildren(h("option", { value: "" }, "Categoria"), ...FIXED_CATS.map(c => h("option", null, c)));
  $("#sh-sec").replaceChildren(...SHOP_SECS.map(s => h("option", null, s)));
  $("#tx-date").value = ymd(TODAY());

  $("#quick-form").onsubmit = e => { e.preventDefault(); S.quick = parseQuick($("#quick-in").value); if (!S.quick.length) toast("Não encontrei valores. Ex.: 20 gasolina, 161 continente"); renderQuick(); };
  $("#tx-form").onsubmit = async e => { e.preventDefault(); const date = $("#tx-date").value;
    if (await run(sb.from("transactions").insert({ type: $("#tx-type").value, amount: parseFloat($("#tx-amt").value), descr: $("#tx-desc").value.trim() || null, cat: $("#tx-cat").value, date, cycle: cycleKey(parseYmd(date)), who: S.who }), "Registado")) { $("#tx-amt").value = ""; $("#tx-desc").value = ""; } };
  $("#fx-add").onclick = () => { $("#fx-form").hidden = !$("#fx-form").hidden; };
  $("#fx-form").onsubmit = async e => { e.preventDefault();
    const endRaw = $("#fx-end").value.trim(), m = endRaw.match(/^(\d{1,2})\s*[\/.\- ]\s*(\d{2,4})$/), end = m ? `${m[2].length === 2 ? "20" + m[2] : m[2]}-${pad(+m[1])}` : null;
    if (endRaw && !end) return toast("Última prestação: usa mm/aaaa");
    if (await run(sb.from("fixed_items").insert({ kind: $("#fx-kind").value, name: $("#fx-name").value.trim(), amount: parseFloat($("#fx-amt").value), pay_day: parseInt($("#fx-day").value) || null, cat: $("#fx-cat").value || null, start_cycle: S.cycle, end_cycle: end }), "Adicionado")) { e.target.reset(); $("#fx-form").hidden = true; } };
  $("#sv-form").onsubmit = async e => { e.preventDefault(); if (await run(sb.from("savings").insert({ name: $("#sv-name").value.trim(), target: parseFloat($("#sv-target").value) || 0 }), "Meta criada")) e.target.reset(); };
  $("#cy-prev").onclick = () => { S.cycle = shiftCycle(S.cycle, -1); render(); };
  $("#cy-next").onclick = () => { S.cycle = shiftCycle(S.cycle, 1); render(); };
  $("#cal-prev").onclick = () => { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() - 1, 1); S.calSel = null; render(); };
  $("#cal-next").onclick = () => { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + 1, 1); S.calSel = null; render(); };
  $("#sync-now").onclick = syncNow;
  $("#src-form").onsubmit = async e => { e.preventDefault(); const url = $("#src-url").value.trim();
    if (!/^(https|webcal):\/\//i.test(url)) return toast("Cola o endereço iCal completo");
    if (await run(sb.from("calendar_sources").insert({ who: $("#src-who").value, label: $("#src-label").value.trim(), ics_url: url }), "Calendário ligado")) { e.target.reset(); await load("sources"); syncNow(); } };
  $("#sh-form").onsubmit = async e => { e.preventDefault(); const n = $("#sh-name").value, q = $("#sh-qty").value; $("#sh-name").value = ""; $("#sh-qty").value = ""; $("#sh-name").focus(); await addShop(n, q, $("#sh-sec").value); };
  $("#sh-clear").onclick = clearBought;
  $("#tk-form").onsubmit = async e => { e.preventDefault(); if (await run(sb.from("tasks").insert({ title: $("#tk-title").value.trim(), who: $("#tk-who").value, cat: $("#tk-cat").value, due: $("#tk-due").value || ($("#tk-recur").value ? ymd(TODAY()) : null), recur: $("#tk-recur").value || null, rotate: $("#tk-rotate").checked }), "Tarefa criada")) { $("#tk-title").value = ""; $("#tk-due").value = ""; $("#tk-recur").value = ""; $("#tk-rotate").checked = false; } };
  $("#tk-filter").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.tkFilter = b.dataset.f; $$("#tk-filter button").forEach(x => x.classList.toggle("on", x === b)); render(); };
  $("#tk-done").onchange = render;
  $("#wk-prev").onclick = () => { S.mealWeek = addDays(S.mealWeek, -7); renderMeals(); };
  $("#wk-next").onclick = () => { S.mealWeek = addDays(S.mealWeek, 7); renderMeals(); };
  $("#ml-suggest").onclick = suggestWeek;
  $("#ml-tonight").onclick = tonight;
  $("#ml-shop").onclick = mealsToShopping;
  $("#rc-q").oninput = () => renderMeals();
  $("#rc-mode").onclick = e => { const b = e.target.closest("button"); if (b) setRcMode(b.dataset.m); };
  $("#dlg").addEventListener("click", e => { if (e.target.id === "dlg") closeDlg(); });
  $("#bb-form").onsubmit = async e => { e.preventDefault(); if (await run(sb.from("baby_items").insert({ name: cap($("#bb-name").value.trim()), cost: parseFloat($("#bb-cost").value) || null, sort: 99 }), "Adicionado")) e.target.reset(); };
  $("#kid-form").onsubmit = async e => { e.preventDefault(); if (await run(sb.from("kid_items").insert({ kid: "rodrigo", kind: $("#kid-kind").value, title: $("#kid-title").value.trim(), date: $("#kid-date").value || null }), "Adicionado")) e.target.reset(); };
  $("#gl-form").onsubmit = async e => { e.preventDefault(); if (await run(sb.from("goals").insert({ title: $("#gl-title").value.trim(), horizon: $("#gl-h").value, who: $("#gl-who").value }), "Objetivo criado")) $("#gl-title").value = ""; };
}

/* ================= login visual: soft colour blobs drifting slowly ================= */
let fieldRAF = null;
function startField() {
  const c = $("#field"), ctx = c.getContext("2d"); let w, hgt, dpr, vis = true, mx = .5, my = .5, tmx = .5, tmy = .5;
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); w = c.clientWidth; hgt = c.clientHeight; c.width = w * dpr; c.height = hgt * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener("resize", size);
  addEventListener("pointermove", e => { tmx = e.clientX / innerWidth; tmy = e.clientY / innerHeight; });
  document.addEventListener("visibilitychange", () => vis = !document.hidden);
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
  const blobs = [["--blob-1", .72, .3, .34], ["--blob-2", .88, .72, .3], ["--blob-3", .55, .78, .26]];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = t => {
    fieldRAF = requestAnimationFrame(draw); if (!vis) return;
    mx += (tmx - mx) * .03; my += (tmy - my) * .03;
    const time = reduce ? 0 : t * .00025;
    ctx.clearRect(0, 0, w, hgt);
    blobs.forEach(([v, x, y, r], i) => {
      const cx = w * (x + Math.sin(time + i * 2) * .06 + (mx - .5) * .05 * (i + 1)), cy = hgt * (y + Math.cos(time * .8 + i) * .07 + (my - .5) * .05 * (i + 1)), R = Math.max(w, hgt) * r;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); const c0 = col(v); g.addColorStop(0, c0); g.addColorStop(1, c0.replace(/,\s*[\d.]+\)$/, ",0)"));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
    });
  };
  fieldRAF = requestAnimationFrame(draw);
}
function stopField() { if (fieldRAF) cancelAnimationFrame(fieldRAF); fieldRAF = null; }
function tickClock() { const el = $("#clock"); const f = () => el.textContent = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Lisbon" }).format(new Date()); f(); setInterval(f, 1000); }

boot();
