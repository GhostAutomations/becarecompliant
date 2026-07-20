import type { Metadata } from "next";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { listAccessibleBranches, listAccessibleServiceUsers } from "@/lib/invoicing/data";
import { createPrivateClient } from "@/lib/invoicing/actions";
import PrivateClientForm from "@/components/invoicing/private-client-form";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Add client" };

export default async function NewPrivateClientPage() {
  const { profile, user, companyId } = await requireInvoicing();
  const [branches, serviceUsers] = await Promise.all([
    listAccessibleBranches(companyId, profile.role, user.id),
    listAccessibleServiceUsers(companyId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/invoicing/clients" label="Back to Private Clients" />
      <h1 className="page-title">Add a private client</h1>
      <PrivateClientForm
        action={createPrivateClient}
        mode="create"
        branches={branches}
        serviceUsers={serviceUsers}
      />
    </div>
  );
}
