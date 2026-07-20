// The invoice PDF renderer uses JSX, so it lives in pdf-doc.tsx. This module
// re-exports it so existing imports of "@/lib/invoicing/pdf" keep working.
export { renderInvoicePdf } from "./pdf-doc";
