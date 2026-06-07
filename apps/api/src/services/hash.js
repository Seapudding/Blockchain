'use strict';

const crypto = require('crypto');

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  const body = typeof value === 'string' ? value : stableStringify(value);
  return crypto.createHash('sha256').update(body).digest('hex');
}

function demoSignature(hash, signer) {
  return `demo-signature:${sha256({ hash, signer: signer || 'chainair-platform' })}`;
}

module.exports = {
  stableStringify,
  sha256,
  demoSignature
};

