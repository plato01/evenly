-- Web3: publish each user's crypto receiving details on the shared users table
-- so group-mates can see where to send a payment (RLS users_read_group_mates
-- already grants read access to users in shared groups).

ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_chain_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_token    TEXT;
