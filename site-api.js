const SITE = window.STORYTELLER;

function publicImage(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith("/") ? path : `${location.pathname.replace(/[^/]*$/, "")}${path}`;
}

async function apiFetch(path, options = {}, token = "") {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", SITE.publishableKey);
  headers.set("Authorization", `Bearer ${token || SITE.anonKey}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${SITE.supabaseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error_description || data?.error || `Request failed (${response.status})`);
  return data;
}

async function getArtwork(id) {
  const q = new URLSearchParams({ select: "id,title,artist,category,image_path,description,price_a5_paise,price_a4_paise,price_a3_paise,is_published,sort_order", id: `eq.${id}` });
  const rows = await apiFetch(`/rest/v1/artworks?${q}`);
  return rows?.[0] || null;
}

async function getArtistArtworks(artist) {
  const q = new URLSearchParams({ select: "id,title,artist,category,image_path,description,price_a5_paise,price_a4_paise,price_a3_paise,is_published,sort_order", artist: `eq.${artist}`, is_published: "eq.true", order: "sort_order.asc,title.asc" });
  return await apiFetch(`/rest/v1/artworks?${q}`) || [];
}

function money(paise) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format((Number(paise) || 0) / 100);
}

function priceFor(artwork, size) {
  return artwork?.[`price_${String(size).toLowerCase()}_paise`] ?? null;
}
