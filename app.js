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
  settings: {}, fixed: [], paid: [], tx: [], budget: [], savings: [], tasks: [], goals: [], shopping: [], freq: [], milestones: {}, sources: [], events: [],
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

/* ================= data ================= */
const TABLES = {
  settings: ["settings", "*"], fixed: ["fixed_items", "*"], paid: ["fixed_paid", "*"], tx: ["transactions", "*"],
  budget: ["budget", "*"], savings: ["savings", "*"], tasks: ["tasks", "*"], goals: ["goals", "*"], shopping: ["shopping", "*"],
  freq: ["shopping_freq", "*"], milestones: ["milestones", "*"], sources: ["calendar_sources", "id,who,label,last_sync,last_error"], events: ["events", "*"],
};
async function load(key) {
  const [table, cols] = TABLES[key];
  let q = sb.from(table).select(cols);
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
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_IN" && !S.me) start(s); if (ev === "SIGNED_OUT") location.reload(); });
  if (session) start(session); else showLogin();
}
function showLogin() {
  $("#login").hidden = false;
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
  S.view = ["hoje", "agenda", "financas", "compras", "tarefas", "objetivos"].includes(v) ? v : "hoje";
  $$(".view").forEach(s => s.hidden = s.id !== "v-" + S.view);
  $$("[data-v]").forEach(a => a.classList.toggle("on", a.dataset.v === S.view));
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}
function render() {
  if (!S.who) return;
  const n = S.shopping.filter(i => !i.done).length; $("#nav-shop").textContent = n || "";
  ({ hoje: renderHoje, agenda: renderAgenda, financas: renderFin, compras: renderShop, tarefas: renderTasks, objetivos: renderGoals })[S.view]();
  reveal();
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
  const t = TODAY(), p = preg(), k = cycleKey(t), T = totals(k);
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
    ["Faltam", false], [`${Math.ceil(p.left / 7)} semanas`, true], ["para o bebé. Este ciclo sobram", false], [eur0.format(T.bal), true],
    [bills.length ? "e há" : "e não há contas a vencer esta semana.", false], ...(bills.length ? [[`${bills.length} ${bills.length === 1 ? "conta" : "contas"}`, true], ["a vencer esta semana.", false]] : []),
  ];
  for (const [txt, acc] of parts) for (const wd of txt.split(" ")) st.append(h("span", { class: "w" + (acc ? " acc" : "") }, wd), " ");
  scrubWords();
  $("#kpis").replaceChildren(
    kpi("Saldo do ciclo", T.bal, eur0.format, T.bal < 0 ? "neg" : ""),
    kpi("A pagar em 7 dias", billTot),
    kpi("Compras na lista", openShop, n => Math.round(n)),
    kpi("Tarefas abertas", openTasks, n => Math.round(n)));
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
      h("div", { class: "add" }, inp, h("button", { class: "pill sm", type: "button", onclick: async () => { const v = parseFloat(inp.value.replace(",", ".")); if (!v) return; await run(sb.from("savings").update({ saved: Math.max(0, +s.saved + v) }).eq("id", s.id), "Poupança atualizada"); } }, h("span", { "data-t": "Somar" }, "Somar"))))); });
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
    if (open) box.append(h("div", { class: "citems" }, r.items.sort((a, b) => b.a - a.a).map(i => h("div", null, h("span", null, i.n, h("span", { style: "color:#8f8f88" }, " · " + i.d)), h("span", { class: "num" }, eur.format(i.a))))));
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
    box.append(h("p", { class: "sec-label" }, `${n} · ${items.length}`), ...items.sort((a, b) => (a.due || "9").localeCompare(b.due || "9")).map(x => h("div", { class: "row" + (x.done ? " paid" : "") },
      tick(x.done, () => run(sb.from("tasks").update({ done: !x.done, done_at: x.done ? null : new Date().toISOString() }).eq("id", x.id)), "Concluir " + x.title),
      h("span", { class: "t" }, ed(x.title, x.title, v => run(sb.from("tasks").update({ title: v }).eq("id", x.id))), h("span", { class: "sub" }, h("span", { class: "chip " + x.who }, WHO[x.who] || x.who), " ", x.cat || "")),
      x.due ? h("span", { class: "chip " + (!x.done && x.due < t ? "late" : "") }, F.short.format(parseYmd(x.due))) : h("span"),
      delBtn(() => run(sb.from("tasks").delete().eq("id", x.id)))))); }
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
  $("#tk-form").onsubmit = async e => { e.preventDefault(); if (await run(sb.from("tasks").insert({ title: $("#tk-title").value.trim(), who: $("#tk-who").value, cat: $("#tk-cat").value, due: $("#tk-due").value || null }), "Tarefa criada")) { $("#tk-title").value = ""; $("#tk-due").value = ""; } };
  $("#tk-filter").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.tkFilter = b.dataset.f; $$("#tk-filter button").forEach(x => x.classList.toggle("on", x === b)); render(); };
  $("#tk-done").onchange = render;
  $("#gl-form").onsubmit = async e => { e.preventDefault(); if (await run(sb.from("goals").insert({ title: $("#gl-title").value.trim(), horizon: $("#gl-h").value, who: $("#gl-who").value }), "Objetivo criado")) $("#gl-title").value = ""; };
}

/* ================= login visual: living line field ================= */
let fieldRAF = null;
function startField() {
  const c = $("#field"), ctx = c.getContext("2d"); let w, hgt, dpr, mx = -1e4, my = -1e4, tmx = mx, tmy = my, vis = true;
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); w = c.clientWidth; hgt = c.clientHeight; c.width = w * dpr; c.height = hgt * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener("resize", size);
  addEventListener("pointermove", e => { tmx = e.clientX; tmy = e.clientY; });
  document.addEventListener("visibilitychange", () => vis = !document.hidden);
  const N = 46, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = t => {
    fieldRAF = requestAnimationFrame(draw); if (!vis) return;
    mx += (tmx - mx) * .12; my += (tmy - my) * .12;
    ctx.clearRect(0, 0, w, hgt);
    const time = reduce ? 0 : t * .00025;
    for (let i = 0; i < N; i++) {
      const y0 = hgt * .12 + (hgt * .62) * (i / (N - 1)), acc = i === 31;
      ctx.beginPath(); ctx.lineWidth = acc ? 1.6 : .8; ctx.strokeStyle = acc ? "#FF4F1F" : `rgba(13,13,12,${.08 + .1 * Math.sin(i * .3) ** 2})`;
      for (let x = 0; x <= w; x += 12) {
        const n = Math.sin(x * .004 + time * 3 + i * .22) * 14 + Math.sin(x * .011 - time * 2 + i * .5) * 6 + Math.sin(x * .0017 + time + i * .09) * 22;
        const dx = x - mx, dy = y0 - my, d2 = dx * dx + dy * dy, bulge = -Math.exp(-d2 / 22000) * 38 * Math.sign(dy || 1);
        const y = y0 + n + bulge; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
  fieldRAF = requestAnimationFrame(draw);
}
function stopField() { if (fieldRAF) cancelAnimationFrame(fieldRAF); fieldRAF = null; }
function tickClock() { const el = $("#clock"); const f = () => el.textContent = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Lisbon" }).format(new Date()); f(); setInterval(f, 1000); }

boot();
