import { redirect } from "next/navigation";

// The Enquiry Tracker now lives in 10 at 10, as its Response times tab.
// Kept as a redirect so bookmarks and installed home-screen apps land there.
export default function EnquiriesPage() {
  redirect("/ten-at-ten");
}
