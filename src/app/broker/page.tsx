import { redirect } from "next/navigation";

// Stock is the only thing in the broker portal, so /broker is just a door
// onto it rather than a landing page with one tile on it.
export default async function BrokerHomePage() {
  redirect("/broker/stock");
}
