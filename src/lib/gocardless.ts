const BASE = "https://bankaccountdata.gocardless.com/api/v2";

export function isGoCardlessConfigured(): boolean {
  return Boolean(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

/** Fresh access token (short-lived; the API re-issues on every request). */
async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  });
  if (!res.ok) throw new Error(`gocardless token failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access: string };
  return data.access;
}

async function gc<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`gocardless ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface GcInstitution {
  id: string;
  name: string;
  bic?: string | null;
  logo?: string | null;
  countries: string[];
  transaction_total_days: string;
}

export async function listInstitutions(country: string): Promise<GcInstitution[]> {
  return gc<GcInstitution[]>(`/institutions/?country=${encodeURIComponent(country)}`);
}

interface GcAgreement {
  id: string;
}

interface GcRequisition {
  id: string;
  link: string;
  status: string;
  accounts: string[];
}

/**
 * Start a bank connection: creates an end-user agreement + requisition.
 * The user authorizes at `link`, then GoCardless redirects to our callback.
 */
export async function createRequisition(
  institutionId: string,
  redirectUrl: string
): Promise<{ requisitionId: string; link: string }> {
  const agreement = await gc<GcAgreement>("/agreements/enduser/", {
    method: "POST",
    body: JSON.stringify({
      institution_id: institutionId,
      max_historical_days: 90,
      access_valid_for_days: 90,
    }),
  });
  const requisition = await gc<GcRequisition>("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      agreement: agreement.id,
      user_language: "PT",
    }),
  });
  return { requisitionId: requisition.id, link: requisition.link };
}

/** Fetch a requisition (status + linked account ids). */
export async function getRequisition(requisitionId: string): Promise<GcRequisition> {
  return gc<GcRequisition>(`/requisitions/${encodeURIComponent(requisitionId)}/`);
}

interface GcAccountDetails {
  account: {
    iban?: string | null;
    currency?: string | null;
    ownerName?: string | null;
  };
}

export interface GcTransaction {
  transactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: { amount?: string; currency?: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  additionalInformation?: string;
  bankTransactionCode?: string;
}

export interface GcTransactions {
  transactions: { booked: GcTransaction[]; pending: GcTransaction[] };
}

export async function getAccountDetails(accountId: string): Promise<GcAccountDetails> {
  return gc<GcAccountDetails>(`/accounts/${encodeURIComponent(accountId)}/details/`);
}

export async function getAccountTransactions(accountId: string): Promise<GcTransactions> {
  return gc<GcTransactions>(`/accounts/${encodeURIComponent(accountId)}/transactions/`);
}

/** Map a GoCardless transaction to LifeOS's transactions shape. */
export function mapGcTransaction(accountId: string, tx: GcTransaction): {
  amount: number;
  date: string;
  description: string;
  merchant: string | null;
  external_id: string;
} {
  const amount = parseFloat(tx.transactionAmount?.amount ?? "0") || 0;
  const merchant = tx.creditorName || tx.debtorName || null;
  const rawDesc = [tx.remittanceInformationUnstructured, tx.additionalInformation].find(Boolean) ?? "";
  const description = (rawDesc || merchant || "Movimento bancário").slice(0, 200);
  return {
    amount,
    date: tx.bookingDate || tx.valueDate || new Date().toISOString().slice(0, 10),
    description,
    merchant: merchant ? merchant.slice(0, 120) : null,
    external_id: `${accountId}:${tx.transactionId ?? `${tx.bookingDate ?? ""}-${rawDesc}`}`,
  };
}
