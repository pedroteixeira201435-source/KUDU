# Kudu Business Books — Releases

Windows installer downloads and auto-update feed for Kudu Business Books.
See the Releases tab for the latest version.

## Site Routes

- `/` - Kudu Books home page with a link to the accounting template.
- `/accountingtemplate` - sales page for Namibia Financial Model v10.
- `/accountingtemplate/success` - payment return page that prepares a secure download.
- `/accountingtemplate/cancel` - cancelled checkout page.

## Checkout Environment

Set these in Vercel before using live SWAPAY checkout:

- `SWAPAY_API_KEY` - rotated SWAPAY production API key.
- `TOKEN_SECRET` - long random secret used to sign temporary download links.
- `SITE_ORIGIN` - `https://kudubooks.com`.
- `SWAPAY_BASE_URL` - `https://api.swa-pay.com`.
- `PRODUCT_FILE_BASE64` - base64-encoded Namibia Financial Model v10 `.xlsx` file for secure production delivery.

The SWAPAY key must never be placed in public HTML or committed to Git.
Do not commit the product workbook; `private/*.xlsx` is ignored for local testing only.
