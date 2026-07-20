import { redirect } from "next/navigation";

// A private invoicing client is a Service User. Their invoicing details are
// edited on the Service User record, so send old client links to that record.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/service-users/${id}`);
}
