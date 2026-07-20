-- Web3: on-chain payment proof for settlements.
--
-- payment_tx_hash / payment_chain_id are written by the payer's app.
-- payment_verified is written ONLY by the verify-payment edge function
-- (service role) after it has independently confirmed the transfer on-chain —
-- column privileges below make it unwritable from client sessions.

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS payment_tx_hash  TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS payment_chain_id INTEGER;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN NOT NULL DEFAULT false;

-- One real payment must not prove two debts.
CREATE UNIQUE INDEX IF NOT EXISTS settlements_payment_tx_hash_unique
  ON settlements (payment_tx_hash)
  WHERE payment_tx_hash IS NOT NULL;

-- Clients may write every settlement column EXCEPT payment_verified.
-- (service_role bypasses column privileges, so the edge function still can.)
REVOKE INSERT, UPDATE ON settlements FROM authenticated, anon;
GRANT INSERT (id, from_user_id, to_user_id, amount, currency, group_id, note,
              status, settled_at, created_at, payment_tx_hash, payment_chain_id)
  ON settlements TO authenticated;
GRANT UPDATE (id, from_user_id, to_user_id, amount, currency, group_id, note,
              status, settled_at, created_at, payment_tx_hash, payment_chain_id)
  ON settlements TO authenticated;
