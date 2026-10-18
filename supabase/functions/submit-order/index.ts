import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigins = new Set([
  "https://juzerr631-source.github.io",
  "https://thestorytellerframes.com",
  "https://www.thestorytellerframes.com",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function response(body: unknown, status = 200, origin = "") {
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

function safe(s: unknown, max: number) {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "null", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" } });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, allowedOrigins.has(origin) ? origin : "null");
  if (!allowedOrigins.has(origin)) return response({ error: "Origin not allowed" }, 403, "null");
  try {
    const input = await req.json();
    if (safe(input.website, 200)) return response({ error: "Invalid request" }, 400, origin);
    const id = safe(input.artwork_id, 64);
    const size = safe(input.size, 3).toUpperCase();
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["A5", "A4", "A3"].includes(size)) {
      return response({ error: "Choose a valid photograph and print size." }, 400, origin);
    }
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const artRes = await fetch(`${supabaseUrl}/rest/v1/artworks?id=eq.${encodeURIComponent(id)}&select=id,title,artist,image_path,is_published,price_a5_paise,price_a4_paise,price_a3_paise`, { headers });
    const arts = await artRes.json();
    const artwork = Array.isArray(arts) ? arts[0] : null;
    if (!artwork || !artwork.is_published) return response({ error: "This photograph is no longer available." }, 404, origin);
    const price = artwork[`price_${size.toLowerCase()}_paise`];
    if (!Number.isInteger(price) || price <= 0) return response({ error: "This print size is not available yet." }, 409, origin);
    if (Number(input.quote_paise) !== price) return response({ error: "The price changed. Please return to the artist page and review the current price." }, 409, origin);

    const fields = {
      customer_name: safe(input.customer_name, 120), phone: safe(input.phone, 30),
      email: safe(input.email, 254).toLowerCase(), delivery_address: safe(input.delivery_address, 1000),
      city: safe(input.city, 120), state: safe(input.state, 120), postal_code: safe(input.postal_code, 20),
      country: safe(input.country, 120), special_request: safe(input.special_request, 5000),
    };
    const words = fields.special_request ? fields.special_request.split(/\s+/).length : 0;
    if (!fields.customer_name || fields.phone.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
      !fields.delivery_address || !fields.city || !fields.state || fields.postal_code.length < 2 || !fields.country || words > 500) {
      return response({ error: "Check the customer details and keep the artist note within 500 words." }, 400, origin);
    }

    const row = {
      ...fields, product_title: artwork.title, artist: artwork.artist, product_file: artwork.image_path,
      selected_size: size, print_price_paise: price, frame_price_paise: 0, shipping_price_paise: 0,
      total_paise: price, upi_reference: null, payment_status: "pending_verification",
      order_status: "received", artwork_id: artwork.id, notification_status: "not_configured",
    };
    const insert = await fetch(`${supabaseUrl}/rest/v1/orders?select=order_number,total_paise,artist,product_title,selected_size`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(row),
    });
    const inserted = await insert.json();
    if (!insert.ok || !Array.isArray(inserted) || !inserted[0]) {
      console.error("Order insert failed", insert.status, inserted);
      return response({ error: "We could not save the order. Please try again." }, 500, origin);
    }
    const order = inserted[0];

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const artistEmail = Deno.env.get(artwork.artist === "Preethi" ? "PREETHI_ORDER_EMAIL" : "JUZER_ORDER_EMAIL");
    const from = Deno.env.get("ORDER_FROM_EMAIL");
    let notification = "not_configured";
    let customerNotification = "not_configured";
    if (apiKey && artistEmail && from) {
      const html = `<h2>New order ${escapeHtml(order.order_number)}</h2><p><b>${escapeHtml(artwork.title)}</b> · ${size} · ₹${(price / 100).toFixed(2)}</p><p>${escapeHtml(fields.customer_name)} · ${escapeHtml(fields.phone)} · ${escapeHtml(fields.email)}</p><p>${escapeHtml(fields.delivery_address)}, ${escapeHtml(fields.city)}, ${escapeHtml(fields.state)} ${escapeHtml(fields.postal_code)}, ${escapeHtml(fields.country)}</p><p>${escapeHtml(fields.special_request || "No note")}</p><p>Payment is pending manual verification.</p>`;
      try {
        const mail = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `order-artist-${order.order_number}` }, body: JSON.stringify({ from, to: [artistEmail], subject: `New StoryTeller order ${order.order_number}`, html }) });
        notification = mail.ok ? "sent" : "failed";
        if (!mail.ok) console.error("Order email failed", mail.status, await mail.text());
      } catch (e) { notification = "failed"; console.error("Order email error", e); }
      await fetch(`${supabaseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(order.order_number)}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ notification_status: notification }) });
    }
    if (apiKey && from) {
      const customerHtml = `<h2>Order received: ${escapeHtml(order.order_number)}</h2><p>Thank you, ${escapeHtml(fields.customer_name)}.</p><p>${escapeHtml(artwork.title)} by ${escapeHtml(artwork.artist)} · ${size} · ₹${(price / 100).toFixed(2)}</p><p>Your order is recorded. Payment is pending manual verification by the artist. This email is not proof of payment.</p><p>Keep your payment receipt and this order number. Please do not pay again if your bank already shows a successful payment.</p>`;
      try {
        const mail = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `order-customer-${order.order_number}` }, body: JSON.stringify({ from, to: [fields.email], subject: `StoryTeller order received ${order.order_number}`, html: customerHtml }) });
        customerNotification = mail.ok ? "sent" : "failed";
        if (!mail.ok) console.error("Customer order email failed", mail.status);
      } catch { customerNotification = "failed"; }
    }
    return response({ order: { ...order, notification_status: notification }, email_notification: notification, email_notifications: { artist: notification, customer: customerNotification } }, 201, origin);
  } catch (error) {
    console.error("submit-order error", error);
    return response({ error: "The order could not be processed. Please try again." }, 500, origin);
  }
});
