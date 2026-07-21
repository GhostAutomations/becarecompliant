import "server-only";

/**
 * Company-branded invoice PDF. Unlike the compliance reports (which carry the Be
 * Care Compliant brand for inspectors), an invoice is the CARE COMPANY's own
 * document, so it leads with their logo and name. Engine: @react-pdf/renderer.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  Image,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatMoney, displayStatus, STATUS_LABEL, type InvoicingConfig } from "./types";
import type { InvoiceDetail } from "./data";

const INK = "#0d1d4b";
const MUTED = "#5b6b8c";
const LINE = "#dfe4f0";
const HEAD = "#0b1b45";

const INVOICE_TO_LABEL: Record<string, string> = {
  service_user: "the service user",
  nhs: "NHS",
  solicitor: "solicitor",
  next_of_kin: "next of kin",
  other: "other",
};

const GOLD = "#8a6a1f";

function fmtDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 10, color: INK },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { height: 76, maxWidth: 300, objectFit: "contain", marginBottom: 8 },
  company: { fontSize: 15, fontWeight: 700, color: INK },
  invoiceWord: { fontSize: 20, fontWeight: 700, color: HEAD, textAlign: "right" },
  invoiceNo: { fontSize: 10, color: MUTED, textAlign: "right", marginTop: 2 },
  cols: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  col: { width: "48%" },
  label: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
  strong: { fontWeight: 700 },
  small: { fontSize: 9, color: INK, marginBottom: 1 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  metaKey: { fontSize: 9, color: MUTED },
  metaVal: { fontSize: 9, color: INK },
  tHead: { flexDirection: "row", backgroundColor: HEAD, paddingVertical: 5, paddingHorizontal: 6 },
  th: { fontSize: 8.5, fontWeight: 700, color: "#ffffff" },
  tRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: LINE },
  td: { fontSize: 9.5, color: INK },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  totalsKey: { width: 90, fontSize: 9.5, color: MUTED, textAlign: "right", paddingRight: 8 },
  totalsVal: { width: 80, fontSize: 9.5, color: INK, textAlign: "right" },
  totalStrong: { fontWeight: 700, fontSize: 11, color: HEAD },
  section: { marginTop: 16 },
  heading: { fontSize: 9, fontWeight: 700, color: HEAD, textTransform: "uppercase", marginBottom: 3 },
  para: { fontSize: 9.5, color: INK, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 26, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
  footerText: { fontSize: 7.5, color: MUTED },
});

function InvoiceDocument({
  inv,
  config,
  companyName,
  logo,
  today,
}: {
  inv: InvoiceDetail;
  config: InvoicingConfig;
  companyName: string;
  logo: string | null;
  today: string;
}) {
  const ds = displayStatus(inv.status, inv.due_date, today);
  return (
    <Document title={inv.number ? `Invoice ${inv.number}` : "Draft invoice"} author={companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.topRow}>
          <View>
            {logo ? <Image src={logo} style={s.logo} /> : null}
            <Text style={s.company}>{companyName}</Text>
          </View>
          <View>
            <Text style={s.invoiceWord}>INVOICE</Text>
            <Text style={s.invoiceNo}>{inv.number ?? "Draft"}</Text>
            <Text style={s.invoiceNo}>{STATUS_LABEL[ds]}</Text>
          </View>
        </View>

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.label}>Bill to</Text>
            <Text style={[s.small, s.strong]}>{inv.bill_to_name ?? inv.client_name}</Text>
            <Text style={s.small}>Invoice to {INVOICE_TO_LABEL[inv.invoice_to ?? "service_user"]}</Text>
            {inv.bill_to_address ? <Text style={s.small}>{inv.bill_to_address}</Text> : null}
            {inv.bill_to_email ? <Text style={s.small}>{inv.bill_to_email}</Text> : null}
            {inv.bill_to_phone ? <Text style={s.small}>{inv.bill_to_phone}</Text> : null}
          </View>
          <View style={s.col}>
            <View style={s.metaRow}><Text style={s.metaKey}>Issued</Text><Text style={s.metaVal}>{inv.issue_date ?? "Not set"}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Due</Text><Text style={s.metaVal}>{inv.due_date ?? "Not set"}</Text></View>
            {inv.supply_period_start || inv.supply_period_end ? (
              <View style={s.metaRow}><Text style={s.metaKey}>Service period</Text><Text style={s.metaVal}>{inv.supply_period_start ?? "…"} to {inv.supply_period_end ?? "…"}</Text></View>
            ) : null}
            {config.vat_enabled && inv.vat_number_snapshot ? (
              <View style={s.metaRow}><Text style={s.metaKey}>VAT number</Text><Text style={s.metaVal}>{inv.vat_number_snapshot}</Text></View>
            ) : null}
            {inv.status === "paid" ? (
              <View style={s.metaRow}><Text style={s.metaKey}>Paid</Text><Text style={s.metaVal}>{inv.paid_date}{inv.paid_method ? ` (${inv.paid_method})` : ""}</Text></View>
            ) : null}
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={[s.th, { width: "34%" }]}>Service</Text>
          <Text style={[s.th, { width: "16%" }]}>Unit</Text>
          <Text style={[s.th, { width: "20%" }]}>Handed</Text>
          <Text style={[s.th, { width: "12%", textAlign: "right" }]}>Qty</Text>
          <Text style={[s.th, { width: "18%", textAlign: "right" }]}>Amount</Text>
        </View>
        {inv.lines.map((l, i) => {
          const prev = inv.lines[i - 1];
          const weekKey = `${l.period_start ?? ""}|${l.period_end ?? ""}`;
          const prevKey = prev ? `${prev.period_start ?? ""}|${prev.period_end ?? ""}` : null;
          const showWeek = l.period_start && l.period_end && weekKey !== prevKey;
          return (
            <View key={l.id} wrap={false}>
              {showWeek ? (
                <Text style={{ fontSize: 8.5, fontWeight: 700, color: GOLD, marginTop: 6, marginBottom: 2 }}>
                  Week: {fmtDate(l.period_start)} to {fmtDate(l.period_end)}
                </Text>
              ) : null}
              <View style={s.tRow}>
                <Text style={[s.td, { width: "34%" }]}>{l.service ?? l.description}</Text>
                <Text style={[s.td, { width: "16%" }]}>{l.unit_label ?? "—"}</Text>
                <Text style={[s.td, { width: "20%" }]}>{l.handed === "double" ? "Double handed" : l.handed === "single" ? "Single handed" : "—"}</Text>
                <Text style={[s.td, { width: "12%", textAlign: "right" }]}>{l.quantity}</Text>
                <Text style={[s.td, { width: "18%", textAlign: "right" }]}>{formatMoney(l.line_total_pence)}</Text>
              </View>
            </View>
          );
        })}

        <View style={{ marginTop: 8 }}>
          <View style={s.totalsRow}><Text style={s.totalsKey}>Subtotal</Text><Text style={s.totalsVal}>{formatMoney(inv.subtotal_pence)}</Text></View>
          {inv.vat_applied ? (
            <View style={s.totalsRow}><Text style={s.totalsKey}>VAT</Text><Text style={s.totalsVal}>{formatMoney(inv.vat_pence)}</Text></View>
          ) : null}
          <View style={s.totalsRow}><Text style={[s.totalsKey, s.totalStrong]}>Total</Text><Text style={[s.totalsVal, s.totalStrong]}>{formatMoney(inv.total_pence)}</Text></View>
        </View>

        {inv.notes ? (
          <View style={s.section}><Text style={s.heading}>Notes</Text><Text style={s.para}>{inv.notes}</Text></View>
        ) : null}
        {config.payment_details ? (
          <View style={s.section}><Text style={s.heading}>Payment details</Text><Text style={s.para}>{config.payment_details}</Text></View>
        ) : null}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {config.invoice_footer ? config.invoice_footer : companyName}
            {config.company_number ? `  ·  Company number ${config.company_number}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(
  inv: InvoiceDetail,
  config: InvoicingConfig,
  companyName: string,
  today: string,
  logo: string | null = null,
): Promise<Buffer> {
  return renderToBuffer(
    <InvoiceDocument inv={inv} config={config} companyName={companyName} logo={logo} today={today} />,
  );
}
