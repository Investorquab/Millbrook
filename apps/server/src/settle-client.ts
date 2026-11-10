/**
 * The on-chain settlement client. Signs with the operator key and posts a
 * transfer batch to the contract's `settle`, returning the transaction hash so
 * the server can record it (the "record every transaction hash" in the plan).
 * Testnet only.
 */

import { connect, keyStores, KeyPair, type Account } from "near-api-js";
import type { Transfer } from "./settlement.js";

export interface NearConfig {
  network: string;
  rpcUrl: string;
  operatorId: string;
  operatorKey: string;
  contractId: string;
}

const DEFAULT_RPC = "https://test.rpc.fastnear.com";

export async function makeAccount(cfg: NearConfig): Promise<Account> {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(cfg.network, cfg.operatorId, KeyPair.fromString(cfg.operatorKey as `ed25519:${string}`));
  const near = await connect({ networkId: cfg.network, nodeUrl: cfg.rpcUrl || DEFAULT_RPC, keyStore });
  return near.account(cfg.operatorId);
}

export interface SettleResult {
  txHash: string;
  transfers: number;
  settlementIndex: number;
}

/** Post one day's transfer batch on-chain. A no-op batch is skipped. */
export async function settleBatch(
  account: Account,
  contractId: string,
  transfers: Transfer[],
): Promise<SettleResult | null> {
  if (transfers.length === 0) return null;
  const outcome = await account.functionCall({
    contractId,
    methodName: "settle",
    args: { transfers },
    gas: 120_000_000_000_000n as unknown as bigint,
    attachedDeposit: 0n as unknown as bigint,
  });
  const txHash = outcome.transaction?.hash ?? "";
  const returned = (outcome as { status?: { SuccessValue?: string } }).status?.SuccessValue;
  let settlementIndex = 0;
  if (returned) {
    try {
      settlementIndex = Number(JSON.parse(Buffer.from(returned, "base64").toString("utf8")));
    } catch {
      settlementIndex = 0;
    }
  }
  return { txHash, transfers: transfers.length, settlementIndex };
}

export function viewU64(account: Account, contractId: string, methodName: string, args: object = {}): Promise<number> {
  return account.viewFunction({ contractId, methodName, args }) as Promise<number>;
}
