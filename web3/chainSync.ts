/**
 * Bridge between the app's sync queue and the on-chain anchor service.
 *
 * Anchoring rides the SAME offline queue as every other sync (see
 * services/syncQueue.ts): runs immediately when online, queues + retries when
 * offline. This function is the queue handler — it anchors the hash, then writes
 * the resulting tx proof back onto the local row.
 */

import { getDatabaseSafe } from '../db';
import { anchorRecord, type AnchorKind } from './anchor';

export interface AnchorJob {
  recordId: string;
  kind: AnchorKind;
  data: `0x${string}`;
}

/** Anchor a record's data on-chain and persist the tx proof locally. */
export async function anchorAndPersist(job: AnchorJob): Promise<void> {
  console.log(`[web3] anchoring ${job.kind} ${job.recordId} → ${job.data.slice(0, 14)}…`);
  const result = await anchorRecord(job);

  const db = await getDatabaseSafe();
  const table = job.kind === 'group' ? 'groups' : 'expenses';
  await db.runAsync(
    `UPDATE ${table} SET chain_tx_hash = ?, chain_anchored_at = ? WHERE id = ?`,
    [result.txHash, new Date(result.anchoredAt * 1000).toISOString(), job.recordId],
  );
  console.log(
    `[web3] anchored ${job.kind} ${job.recordId} ✓ tx ${result.txHash}` +
      (result.mocked ? ' (mock)' : ''),
  );
}
