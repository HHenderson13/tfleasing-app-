// Moved to components/stock-browser.tsx when /broker/stock started sharing
// it. Re-exported here so existing imports keep working — same pattern as
// components/section.tsx. New code should import from the component.
export { StockBrowser, type StockRow, type StockAudience } from "@/components/stock-browser";
