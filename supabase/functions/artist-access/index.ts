import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigins = new Set([
  "https://juzerr631-source.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const approvedArtists = new Map([
  ["245b97acd1d6190a6e44f77f547024c59226e24a7cb26021f3b31b469d04af1b", "Preethi"],
  ["ebf050e7b5123172e3aa87ddb654d718e056f2f3aa9a80a9deabada6051f1b8d", "Juzer"],
]);

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const corsOrigin = allowedOrigins.has(origin) ? origin : "null";
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
    } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsOrigin);
  if (!allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, "null");
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401, origin);
  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: authorization },
    });
    const user = await userResponse.json();
    if (!userResponse.ok || !user?.id || !user?.email) return json({ error: "Your sign-in session could not be verified." }, 401, origin);
    if (!user.email_confirmed_at && !user.confirmed_at) return json({ error: "Confirm your email from the inbox before opening the artist editor." }, 403, origin);
    const email = String(user.email).trim().toLowerCase();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
    const emailHash = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
    const displayName = approvedArtists.get(emailHash);
    if (!displayName) return json({ error: "This email is not on the approved artist list." }, 403, origin);

    const saved = await fetch(`${supabaseUrl}/rest/v1/admin_users?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ user_id: user.id, display_name: displayName, role: "admin" }),
    });
    const rows = await saved.json();
    if (!saved.ok) {
      console.error("Artist approval row could not be saved", saved.status, rows);
      return json({ error: "Artist access could not be enabled. Please try again." }, 500, origin);
    }
    return json({ approved: true, display_name: rows?.[0]?.display_name || displayName }, 200, origin);
  } catch (error) {
    console.error("artist-access error", error);
    return json({ error: "Artist access could not be checked. Please try again." }, 500, origin);
  }
});
