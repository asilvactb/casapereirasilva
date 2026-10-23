// Import a recipe from a URL: reads the schema.org Recipe JSON-LD that most recipe sites publish.
// Only signed-in household members can call it (checked against public.members through RLS).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

const txt = (s: unknown) => String(s ?? "")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();

function findRecipe(o: any): any {
  if (!o || typeof o !== "object") return null;
  if (Array.isArray(o)) { for (const x of o) { const f = findRecipe(x); if (f) return f; } return null; }
  const t = o["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
  for (const v of Object.values(o)) if (v && typeof v === "object") { const f = findRecipe(v); if (f) return f; }
  return null;
}
function steps(x: any): string[] {
  if (!x) return [];
  if (typeof x === "string") return x.split(/\n+/).map(txt).filter(Boolean);
  if (Array.isArray(x)) return x.flatMap(s => typeof s === "string" ? [txt(s)] : s?.itemListElement ? steps(s.itemListElement) : [txt(s?.text || s?.name)]);
  if (x.itemListElement) return steps(x.itemListElement);
  return [txt(x.text || x.name)];
}
const minutes = (d: unknown) => { const m = String(d || "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/); if (!m) return null; const v = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)); return v || null; };
const privateHost = (h: string) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(h) || h.endsWith(".internal") || h.endsWith(".local");

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) return json({ error: "Sessão inválida" }, 401);
    const { data: member } = await sb.from("members").select("who").eq("email", user.email.toLowerCase()).maybeSingle();
    if (!member) return json({ error: "Sem acesso" }, 403);

    const { url } = await req.json();
    let u: URL; try { u = new URL(String(url)); } catch { return json({ error: "Link inválido" }, 400); }
    if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname)) return json({ error: "Link inválido" }, 400);

    const r = await fetch(u, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "accept-language": "pt-PT,pt;q=0.9,en;q=0.6" } });
    if (!r.ok) return json({ error: `O site respondeu ${r.status}` }, 502);
    const html = (await r.text()).slice(0, 4_000_000);
    const meta = (p: string) => txt((html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']+)`, "i")) || [])[1]);

    let rec: any = null;
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try { rec = findRecipe(JSON.parse(m[1].trim())); } catch { /* malformed block */ }
      if (rec) break;
    }
    if (!rec) return json({ name: meta("og:title") || txt((html.match(/<title>([^<]+)/i) || [])[1]), image: meta("og:image") || null, ingredients: [], steps: "", url: u.href, partial: true });

    const img = Array.isArray(rec.image) ? (rec.image[0]?.url || rec.image[0]) : (rec.image?.url || rec.image);
    const yieldRaw = Array.isArray(rec.recipeYield) ? rec.recipeYield[0] : rec.recipeYield;
    const kw = [rec.recipeCategory, rec.recipeCuisine, rec.keywords].flat().filter(Boolean).join(",");
    return json({
      name: txt(rec.name),
      image: typeof img === "string" ? img : meta("og:image") || null,
      ingredients: (rec.recipeIngredient || rec.ingredients || []).map(txt).filter(Boolean),
      steps: steps(rec.recipeInstructions).filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join("\n"),
      minutes: minutes(rec.totalTime) || minutes(rec.cookTime) || null,
      servings: parseInt(String(yieldRaw ?? "")) || null,
      keywords: txt(kw).split(/\s*,\s*/).filter(Boolean).slice(0, 8),
      url: u.href,
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
