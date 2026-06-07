'use strict';

const express = require('express');
const morgan = require('morgan');
const { loadConfig } = require('./config');
const { createLedgerClient } = require('./services/ledgerClient');
const { OffchainStore } = require('./services/offchainStore');
const { createRoutes } = require('./routes');

async function createApp(config = loadConfig()) {
  const ledger = await createLedgerClient(config);
  const offchain = new OffchainStore(config.offchainRoot);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));

  app.use('/api/v1', createRoutes({ ledger, offchain, config }));

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.originalUrl });
  });

  app.use((error, req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({
      error: status >= 500 ? 'internal_error' : 'request_error',
      message: error.message
    });
  });

  return { app, ledger };
}

if (require.main === module) {
  createApp()
    .then(({ app }) => {
      const config = loadConfig();
      app.listen(config.port, () => {
        console.log(`UAV blackbox API listening on http://localhost:${config.port}/api/v1`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  createApp
};
