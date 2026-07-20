/**
 * Deploy EvenlyAnchor to Monad testnet.
 *
 * Compiles contracts/EvenlyAnchor.sol with solc and deploys it with viem.
 * No secrets in the repo — the deployer key is read from the environment.
 *
 * Prereqs:
 *   yarn add -D solc viem            # already added if you ran the setup
 *   A funded Monad testnet wallet.   # get MON from https://faucet.monad.xyz
 *
 * Run (PowerShell):
 *   $env:MONAD_DEPLOYER_KEY="0x<your funded testnet private key>"
 *   node scripts/deployAnchor.mjs
 *
 * Run (bash):
 *   MONAD_DEPLOYER_KEY=0x... node scripts/deployAnchor.mjs
 *
 * On success it prints the deployed contract address + explorer link. Put that
 * address in web3/config.ts (ANCHOR_CONTRACT) and set it as the ANCHOR_CONTRACT
 * secret on the monad-relay function.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import solc from 'solc';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const RPC_URL = process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz';
const KEY = process.env.MONAD_DEPLOYER_KEY;

if (!KEY || !/^0x[0-9a-fA-F]{64}$/.test(KEY)) {
  console.error('✗ Set MONAD_DEPLOYER_KEY to a 0x-prefixed 64-hex private key of a FUNDED Monad testnet wallet.');
  console.error('  Get testnet MON from https://faucet.monad.xyz');
  process.exit(1);
}

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'MonadScan', url: 'https://testnet.monadscan.com' } },
});

// ── 1. Compile ──────────────────────────────────────────────────────────────
const SRC = 'EvenlyAnchor.sol';
const source = readFileSync(join(ROOT, 'contracts', SRC), 'utf8');

console.log('› Compiling', SRC, '…');
const input = {
  language: 'Solidity',
  sources: { [SRC]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) {
  const fatal = out.errors.filter((e) => e.severity === 'error');
  out.errors.forEach((e) => console.error(e.formattedMessage));
  if (fatal.length) process.exit(1);
}
const artifact = out.contracts[SRC].EvenlyAnchor;
const abi = artifact.abi;
const bytecode = `0x${artifact.evm.bytecode.object}`;
console.log('  ✓ compiled (bytecode', (bytecode.length - 2) / 2, 'bytes)');

// ── 2. Deploy ─────────────────────────────────────────────────────────────
const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });

const balance = await pub.getBalance({ address: account.address });
console.log('› Deployer:', account.address, `(${Number(balance) / 1e18} MON)`);
if (balance === 0n) {
  console.error('✗ Deployer has 0 MON. Fund it at https://faucet.monad.xyz and retry.');
  process.exit(1);
}

console.log('› Deploying EvenlyAnchor …');
const hash = await wallet.deployContract({ abi, bytecode });
console.log('  tx:', hash);
const receipt = await pub.waitForTransactionReceipt({ hash });

console.log('\n✅ Deployed EvenlyAnchor');
console.log('   Address :', receipt.contractAddress);
console.log('   Explorer:', `https://testnet.monadscan.com/address/${receipt.contractAddress}`);
console.log('\nNext:');
console.log('  1. Put this address in web3/config.ts  → ANCHOR_CONTRACT');
console.log('  2. supabase secrets set ANCHOR_CONTRACT=' + receipt.contractAddress);
console.log('  3. Submit this address as your Testnet contract address.');
