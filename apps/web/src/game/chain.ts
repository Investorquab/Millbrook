/**
 * A tiny, dependency-free read of the live Millbrook contract on NEAR testnet.
 * One JSON-RPC `call_function` view per number — no wallet, no near-api-js, no
 * bundle weight. It sends only the public contract id and a view-method name
 * (never any user data), so the Proof screen can show the real on-chain audit
 * total straight from the chain, with a graceful fallback when testnet is
 * unreachable. See `contracts/millbrook` — `audit_total`/`settlement_count` are
 * `u64` views, so each result decodes as a plain JSON number.
 */

// The Millbrook ledger contract (a sub-account), operated by millbrook.testnet.
// It is seeded clean to 10,000 and settles each game day, so the Proof screen's
// live audit read and the explorer both reflect the real, closed economy.
export const CONTRACT_ID = "game.millbrook.testnet";
export const EXPLORER = `https://testnet.nearblocks.io/address/${CONTRACT_ID}`;

// FastNEAR's public testnet RPC (CORS-enabled); the legacy near.org public RPC
// is deprecated.
const RPC = "https://test.rpc.fastnear.com";

async function viewU64(method: string, signal: AbortSignal): Promise<number> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "millbrook",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: CONTRACT_ID,
        method_name: method,
        args_base64: "e30=", // base64("{}") — the views take no arguments
      },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error?.message ?? "rpc error");
  const bytes: unknown = json.result?.result;
  if (!Array.isArray(bytes)) throw new Error("no result");
  const text = String.fromCharCode(...(bytes as number[])).trim();
  const n = Number.parseInt(text.replace(/"/g, ""), 10);
  if (!Number.isFinite(n)) throw new Error("unparseable result");
  return n;
}

export interface ChainAudit {
  auditTotal: number;
  settlements: number;
}

/** Read the contract's audited coin total and settlement count, live. Rejects
 *  (so the caller can fall back) on any network/RPC failure or timeout. */
export async function readChainAudit(timeoutMs = 7000): Promise<ChainAudit> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const [auditTotal, settlements] = await Promise.all([
      viewU64("audit_total", ctrl.signal),
      viewU64("settlement_count", ctrl.signal),
    ]);
    return { auditTotal, settlements };
  } finally {
    clearTimeout(timer);
  }
}
