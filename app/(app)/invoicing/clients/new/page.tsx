import { redirect } from "next/navigation";

// Private invoicing clients are now Service Users flagged for private invoicing.
// Add one by adding a Service User with the "Private invoicing" box ticked.
export default function Page() {
  redirect("/service-users/new");
}
