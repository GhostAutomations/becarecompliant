import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { getPrivateClient, listAccessibleServiceUsers } from "@/lib/invoicing/data";
import { updatePrivateClient, setPrivateClientStatus } from "@/lib/invoicing/actions";
import PrivateClientForm from "@/components/invoicing/private-client-form";
import ActionForm from "@/components/action-form";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditPrivateClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { companyId } = await requireInvoicing();
  const client = await getPrivateClient(id);
  if (!client || client.company_id !== companyId) redirect("/invoicing/clients");
  const serviceUsers = await listAccessibleServiceUsers(companyId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/invoicing/clients" label="Back to Private Clients" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">{client.name}</h1>
        <ActionForm
          action={setPrivateClientStatus}
          hidden={{ id: client.id, status: client.status === "active" ? "archived" : "active" }}
          label={client.status === "active" ? "Archive" : "Restore"}
          buttonClassName="btn-ghost text-xs"
          confirm={client.status === "active" ? "Archive this client?" : undefined}
          className=""
        />
      </div>
      <PrivateClientForm
        action={updatePrivateClient}
        mode="edit"
        branches={[]}
        serviceUsers={serviceUsers}
        initial={{
          id: client.id,
          client_type: client.client_type,
          name: client.name,
          branch_id: client.branch_id,
          branch_name: client.branch_name,
          contact_name: client.contact_name,
          email: client.email,
          phone: client.phone,
          address_line1: client.address_line1,
          address_line2: client.address_line2,
          city: client.city,
          postcode: client.postcode,
          service_user_id: client.service_user_id,
          payment_terms_days: client.payment_terms_days,
          notes: client.notes,
        }}
      />
    </div>
  );
}
