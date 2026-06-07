'use strict';

const crypto = require('crypto');

function parsePayload(payloadJson) {
  if (payloadJson === undefined || payloadJson === null || payloadJson === '') {
    return {};
  }
  if (typeof payloadJson === 'object') {
    return payloadJson;
  }
  try {
    return JSON.parse(payloadJson);
  } catch (error) {
    throw new Error(`Payload must be valid JSON: ${error.message}`);
  }
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new Error(`Missing required field(s): ${missing.join(', ')}`);
  }
}

function makeKey(prefix, id) {
  if (!id || typeof id !== 'string') {
    throw new Error(`Invalid id for ${prefix}`);
  }
  return `${prefix}:${id}`;
}

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

function txTimestamp(ctx) {
  const txTime = ctx.stub.getTxTimestamp();
  const seconds = typeof txTime.seconds.toNumber === 'function'
    ? txTime.seconds.toNumber()
    : Number(txTime.seconds);
  const millis = seconds * 1000 + Math.floor((txTime.nanos || 0) / 1000000);
  return new Date(millis).toISOString();
}

function clientId(ctx) {
  try {
    return ctx.clientIdentity.getID();
  } catch (error) {
    return 'unknown-client';
  }
}

async function stateExists(ctx, key) {
  const data = await ctx.stub.getState(key);
  return data && data.length > 0;
}

async function getJson(ctx, key, label) {
  const data = await ctx.stub.getState(key);
  if (!data || data.length === 0) {
    throw new Error(`${label || key} does not exist`);
  }
  return JSON.parse(data.toString('utf8'));
}

async function putJson(ctx, key, value) {
  await ctx.stub.putState(key, Buffer.from(JSON.stringify(value)));
  return value;
}

async function writeIndex(ctx, indexName, attributes) {
  const key = ctx.stub.createCompositeKey(indexName, attributes);
  await ctx.stub.putState(key, Buffer.from('\u0000'));
}

async function deleteIndex(ctx, indexName, attributes) {
  const key = ctx.stub.createCompositeKey(indexName, attributes);
  await ctx.stub.deleteState(key);
}

async function queryByIndex(ctx, indexName, attributes, idPosition, resolver) {
  const iterator = await ctx.stub.getStateByPartialCompositeKey(indexName, attributes);
  const results = [];

  try {
    while (true) {
      const response = await iterator.next();
      if (response.value && response.value.key) {
        const composite = ctx.stub.splitCompositeKey(response.value.key);
        const id = composite.attributes[idPosition];
        results.push(await resolver(id));
      }
      if (response.done) {
        break;
      }
    }
  } finally {
    await iterator.close();
  }

  return results;
}

function jsonResult(value) {
  return JSON.stringify(value);
}

module.exports = {
  parsePayload,
  requireFields,
  makeKey,
  stableStringify,
  sha256,
  txTimestamp,
  clientId,
  stateExists,
  getJson,
  putJson,
  writeIndex,
  deleteIndex,
  queryByIndex,
  jsonResult
};

