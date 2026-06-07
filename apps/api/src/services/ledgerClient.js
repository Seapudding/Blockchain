'use strict';

const { LocalLedgerClient } = require('./localLedgerClient');
const { FabricGatewayClient } = require('./fabricGatewayClient');

async function createLedgerClient(config) {
  if (config.ledgerMode === 'fabric') {
    return FabricGatewayClient.create(config.fabric);
  }

  return new LocalLedgerClient(config.mockLedgerPath);
}

module.exports = {
  createLedgerClient
};

