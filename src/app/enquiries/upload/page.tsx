import { redirect } from "next/navigation";

// MotorComplete exports are uploaded through 10 at 10 now — one place for
// every report's data.
export default function EnquiryUploadPage() {
  redirect("/ten-at-ten/admin");
}
