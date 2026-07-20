/**
 * Deploy TestUSDC (testnet-only mock, 6 decimals) to Monad testnet and mint
 * an initial balance to the deployer.
 *
 * Run:
 *   MONAD_DEPLOYER_KEY=0x... node scripts/deployTestUsdc.mjs
 *
 * On success, put the printed address in .env.local (EXPO_PUBLIC_MONAD_USDC)
 * and set it as the MONAD_USDC secret on the verify-payment function.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import solc from 'solc';
import { createWalletClient, createPublicClient, http, defineChain, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const RPC_URL = process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz';
const KEY = process.env.MONAD_DEPLOYER_KEY;

if (!KEY || !/^0x[0-9a-fA-F]{64}$/.test(KEY)) {
  console.error('✗ Set MONAD_DEPLOYER_KEY to a 0x-prefixed 64-hex private key of a FUNDED Monad testnet wallet.');
  process.exit(1);
}

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'MonadScan', url: 'https://testnet.monadscan.com' } },
});

const SRC = 'TestUSDC.sol';
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
const artifact = out.contracts[SRC].TestUSDC;
const abi = artifact.abi;
const bytecode = `0x${artifact.evm.bytecode.object}`;
console.log('  ✓ compiled (bytecode', (bytecode.length - 2) / 2, 'bytes)');

const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });

const balance = await pub.getBalance({ address: account.address });
console.log('› Deployer:', account.address, `(${Number(balance) / 1e18} MON)`);
if (balance === 0n) {
  console.error('✗ Deployer has 0 MON.');
  process.exit(1);
}

console.log('› Deploying TestUSDC …');
const hash = await wallet.deployContract({ abi, bytecode });
console.log('  tx:', hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
const token = receipt.contractAddress;

console.log('› Minting 1,000 USDC to deployer …');
const mintHash = await wallet.writeContract({
  address: token, abi, functionName: 'mint',
  args: [account.address, parseUnits('1000', 6)],
});
await pub.waitForTransactionReceipt({ hash: mintHash });

console.log('\n✅ Deployed TestUSDC');
console.log('   Address :', token);
console.log('   Explorer:', `https://testnet.monadscan.com/address/${token}`);
console.log('\nNext:');
console.log('  1. .env.local → EXPO_PUBLIC_MONAD_USDC=' + token);
console.log('  2. supabase secrets set MONAD_USDC=' + token);
console.log('  3. supabase functions deploy verify-payment');
