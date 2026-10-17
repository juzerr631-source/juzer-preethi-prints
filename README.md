# The StoryTeller Frames

**where frames find a home.**

Photography prints by Juzer and Preethi. This static GitHub Pages storefront uses Supabase for its published artist catalogue, secured artist editing, and private order intake.

## Pages

- `index.html` — homepage, artist menu, introduction placeholder, and Instagram links.
- `artist.html?artist=Preethi` / `artist.html?artist=Juzer` — artist galleries, print-size previews, and price-aware ordering.
- `checkout.html` and `order-confirmation.html` — customer details, order review, server-priced order creation, and artist-specific UPI payment handoff.
- `admin.html` — authenticated catalogue editor with image upload, descriptions, prices, publishing, and reordering.

## Configuration

Public project URL and publishable key are in `site-config.js`; these are browser-safe. Service role credentials must stay in Supabase Edge Function secrets. To email artists after orders, configure `RESEND_API_KEY`, `PREETHI_ORDER_EMAIL`, `JUZER_ORDER_EMAIL`, and verified `ORDER_FROM_EMAIL` for the `submit-order` function. Artist login accounts must be provisioned in Supabase Auth and allowlisted in `public.admin_users` by a trusted project administrator.

Final print prices and artist email/payment setup must be confirmed by the artists before opening paid orders. The only seeded price is a labelled A5 test price.
