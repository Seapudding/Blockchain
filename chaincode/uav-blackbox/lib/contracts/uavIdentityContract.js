'use strict';

const { Contract } = require('fabric-contract-api');
const { DOC_TYPES, PREFIX, INDEX } = require('../constants');
const {
  parsePayload,
  requireFields,
  makeKey,
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
} = require('../ledger');

class UAVIdentityContract extends Contract {
  constructor() {
    super('UAVIdentityContract');
  }

  async RegisterUAV(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, [
      'uavId',
      'model',
      'serialNumber',
      'manufacturer',
      'operator',
      'flightControllerId',
      'pilotId'
    ]);

    const key = makeKey(PREFIX.UAV, payload.uavId);
    if (await stateExists(ctx, key)) {
      throw new Error(`UAV ${payload.uavId} already exists`);
    }

    const now = txTimestamp(ctx);
    const identityHash = payload.identityHash || sha256({
      uavId: payload.uavId,
      serialNumber: payload.serialNumber,
      manufacturer: payload.manufacturer,
      operator: payload.operator,
      flightControllerId: payload.flightControllerId,
      pilotId: payload.pilotId
    });

    const doc = {
      docType: DOC_TYPES.UAV,
      uavId: payload.uavId,
      model: payload.model,
      serialNumber: payload.serialNumber,
      manufacturer: payload.manufacturer,
      operator: payload.operator,
      flightControllerId: payload.flightControllerId,
      pilotId: payload.pilotId,
      certificateStatus: payload.certificateStatus || 'pending',
      insuranceStatus: payload.insuranceStatus || 'pending',
      status: payload.status || 'active',
      identityHash,
      metadata: payload.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: clientId(ctx)
    };

    await putJson(ctx, key, doc);
    await writeIndex(ctx, INDEX.UAV_BY_OPERATOR, [doc.operator, doc.uavId]);
    await writeIndex(ctx, INDEX.UAV_BY_STATUS, [doc.status, doc.uavId]);

    return jsonResult(doc);
  }

  async GetUAV(ctx, uavId) {
    return jsonResult(await getJson(ctx, makeKey(PREFIX.UAV, uavId), `UAV ${uavId}`));
  }

  async UpdateUAVStatus(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['uavId', 'status']);

    const key = makeKey(PREFIX.UAV, payload.uavId);
    const doc = await getJson(ctx, key, `UAV ${payload.uavId}`);
    const previousStatus = doc.status;

    doc.status = payload.status;
    doc.certificateStatus = payload.certificateStatus || doc.certificateStatus;
    doc.insuranceStatus = payload.insuranceStatus || doc.insuranceStatus;
    doc.metadata = Object.assign({}, doc.metadata || {}, payload.metadata || {});
    doc.updatedAt = txTimestamp(ctx);
    doc.updatedBy = clientId(ctx);

    await putJson(ctx, key, doc);
    if (previousStatus !== doc.status) {
      await deleteIndex(ctx, INDEX.UAV_BY_STATUS, [previousStatus, doc.uavId]);
      await writeIndex(ctx, INDEX.UAV_BY_STATUS, [doc.status, doc.uavId]);
    }

    return jsonResult(doc);
  }

  async VerifyUAVIdentity(ctx, uavId, expectedHash) {
    const doc = await getJson(ctx, makeKey(PREFIX.UAV, uavId), `UAV ${uavId}`);
    return jsonResult({
      uavId,
      expectedHash,
      onChainHash: doc.identityHash,
      verified: doc.identityHash === expectedHash
    });
  }

  async QueryUAVsByOperator(ctx, operator) {
    const rows = await queryByIndex(ctx, INDEX.UAV_BY_OPERATOR, [operator], 1, async (uavId) => {
      return getJson(ctx, makeKey(PREFIX.UAV, uavId), `UAV ${uavId}`);
    });
    return jsonResult(rows);
  }

  async QueryUAVsByStatus(ctx, status) {
    const rows = await queryByIndex(ctx, INDEX.UAV_BY_STATUS, [status], 1, async (uavId) => {
      return getJson(ctx, makeKey(PREFIX.UAV, uavId), `UAV ${uavId}`);
    });
    return jsonResult(rows);
  }
}

module.exports = {
  UAVIdentityContract
};

