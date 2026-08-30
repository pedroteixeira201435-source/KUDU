# Kudu Business Books — Releases

Windows installer downloads and auto-update feed for Kudu Business Books.
See the Releases tab for the latest version.

## Site Routes

- `/` - Kudu Books home page with a link to the accounting template.
- `/accountingtemplate` - sales page for Namibia Financial Model v10.
- `/accountingtemplate/success` - payment return page that prepares a secure download.
- `/accountingtemplate/cancel` - cancelled checkout page.

## Checkout Environment (Whop)

Payments run through [Whop](https://whop.com). Set these in Vercel before using live checkout:

- `WHOP_API_KEY` - rotated Whop company API key (never in public HTML or Git).
- `WHOP_COMPANY_ID` - `biz_J8AD6UwcxnXKqV`.
- `WHOP_PLAN_ID` - the one-time **$32.60 USD** plan under the "Namibia Financial Model" product.
- `TOKEN_SECRET` - long random secret used to sign temporary download links.
- `SITE_ORIGIN` - `https://kudubooks.com`.
- `PRODUCT_BLOB_URL` - URL of the Namibia Financial Model v10 `.xlsx` stored in **Vercel Blob**. The download function fetches this server-side; the client never sees it, so the file stays behind the paywall. (The `.xlsx` cannot be an env var — Vercel caps total env size at 64KB — and must not be committed to this public repo.)

Optional (defaults are correct): `WHOP_BASE_URL`, `WHOP_CHECKOUT_BASE`. Small files may instead use `PRODUCT_FILE_BASE64` / `PRODUCT_FILE_BASE64_1..N`.

### Product file storage (Vercel Blob)

1. Vercel dashboard → **Storage → Create → Blob**, connect it to the `kudubooks` project (adds `BLOB_READ_WRITE_TOKEN`).
2. Upload `private/Namibia_Financial_Model_v10.xlsx` to the store.
3. Put the resulting blob URL in `PRODUCT_BLOB_URL` and redeploy.

### One-time Whop dashboard setup

1. Create/confirm a **one-time $32.60 USD** plan on the "Namibia Financial Model" product; put its `plan_...` id in `WHOP_PLAN_ID`. (The seeded plan `plan_pyi8mrEJbjGkJ` is priced Free — do not use it.)
2. Set the product's **post-purchase redirect URL** to `https://kudubooks.com/accountingtemplate/success` so buyers return to the download page.
3. (Optional) Add a webhook at `https://kudubooks.com/api/whop-webhook` for `payment.succeeded` / `payment.failed`.

### How checkout works

- `create-accountingtemplate-order` mints an order id and returns the hosted Whop checkout URL with the order id attached as checkout metadata. No Whop resources are created at request time.
- `accountingtemplate-order-status` finds the settled Whop payment carrying that order id (`status === "paid"`) and returns a short-lived signed download link.
- `download-accountingtemplate` re-checks the live payment before streaming the `.xlsx`.

Do not commit the product workbook; `private/*.xlsx` is ignored for local testing only.
