'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '..', '.env') });

function repoPath(...parts) {
  return path.resolve(__dirname, '..', '..', '..', ...parts);
}

function resolveFromApi(value, fallback) {
  const raw = value || fallback;
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(__dirname, '..', raw);
}

function loadConfig() {
  return {
    port: Number(process.env.PORT || 3000),
    ledgerMode: process.env.LEDGER_MODE || 'mock',
    mockLedgerPath: resolveFromApi(process.env.MOCK_LEDGER_PATH, repoPath('data', 'mock-ledger.json')),
    offchainRoot: resolveFromApi(process.env.OFFCHAIN_ROOT, repoPath('data', 'offchain')),
    fabric: {
      channelName: process.env.FABRIC_CHANNEL_NAME || 'uav-blackbox',
      chaincodeName: process.env.FABRIC_CHAINCODE_NAME || 'uavblackbox',
      mspId: process.env.FABRIC_MSP_ID || 'Org1MSP',
      peerEndpoint: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
      peerHostAlias: process.env.FABRIC_PEER_HOST_ALIAS || 'peer0.org1.example.com',
      tlsCertPath: process.env.FABRIC_TLS_CERT_PATH,
      signCertPath: process.env.FABRIC_SIGN_CERT_PATH,
      privateKeyPath: process.env.FABRIC_PRIVATE_KEY_PATH
    }
  };
}

module.exports = {
  loadConfig
};

