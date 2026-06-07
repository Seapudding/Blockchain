'use strict';

const { Contract } = require('fabric-contract-api');
const { DOC_TYPES, PREFIX, INDEX } = require('../constants');
const {
  parsePayload,
  requireFields,
  makeKey,
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

class EmergencyLinkageContract extends Contract {
  constructor() {
    super('EmergencyLinkageContract');
  }

  async CreateEmergencyRequest(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, [
      'requestId',
      'sourceDepartment',
      'eventId',
      'taskType',
      'priority',
      'targetArea'
    ]);

    const key = makeKey(PREFIX.EMERGENCY, payload.requestId);
    if (await stateExists(ctx, key)) {
      throw new Error(`Emergency request ${payload.requestId} already exists`);
    }

    const now = txTimestamp(ctx);
    const doc = {
      docType: DOC_TYPES.EMERGENCY_REQUEST,
      requestId: payload.requestId,
      sourceDepartment: payload.sourceDepartment,
      eventId: payload.eventId,
      taskType: payload.taskType,
      priority: payload.priority,
      targetArea: payload.targetArea,
      requiredPayload: payload.requiredPayload || [],
      expectedDurationMin: payload.expectedDurationMin || null,
      status: payload.status || 'requested',
      assignedUav: payload.assignedUav || null,
      missionId: payload.missionId || null,
      responseSummary: payload.responseSummary || null,
      blockchainRecord: payload.blockchainRecord || null,
      metadata: payload.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: clientId(ctx)
    };

    await putJson(ctx, key, doc);
    await writeIndex(ctx, INDEX.EMERGENCY_BY_EVENT, [doc.eventId, doc.requestId]);
    await writeIndex(ctx, INDEX.EMERGENCY_BY_DEPARTMENT, [doc.sourceDepartment, doc.requestId]);
    await writeIndex(ctx, INDEX.EMERGENCY_BY_STATUS, [doc.status, doc.requestId]);

    return jsonResult(doc);
  }

  async GetEmergencyRequest(ctx, requestId) {
    return jsonResult(await getJson(ctx, makeKey(PREFIX.EMERGENCY, requestId), `Emergency request ${requestId}`));
  }

  async UpdateEmergencyStatus(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['requestId', 'status']);

    const key = makeKey(PREFIX.EMERGENCY, payload.requestId);
    const doc = await getJson(ctx, key, `Emergency request ${payload.requestId}`);
    const previousStatus = doc.status;

    doc.status = payload.status;
    doc.assignedUav = payload.assignedUav || doc.assignedUav;
    doc.missionId = payload.missionId || doc.missionId;
    doc.responseSummary = payload.responseSummary || doc.responseSummary;
    doc.blockchainRecord = payload.blockchainRecord || doc.blockchainRecord;
    doc.metadata = Object.assign({}, doc.metadata || {}, payload.metadata || {});
    doc.updatedAt = txTimestamp(ctx);
    doc.updatedBy = clientId(ctx);

    await putJson(ctx, key, doc);
    if (previousStatus !== doc.status) {
      await deleteIndex(ctx, INDEX.EMERGENCY_BY_STATUS, [previousStatus, doc.requestId]);
      await writeIndex(ctx, INDEX.EMERGENCY_BY_STATUS, [doc.status, doc.requestId]);
    }

    return jsonResult(doc);
  }

  async QueryEmergencyByEvent(ctx, eventId) {
    const rows = await queryByIndex(ctx, INDEX.EMERGENCY_BY_EVENT, [eventId], 1, async (requestId) => {
      return getJson(ctx, makeKey(PREFIX.EMERGENCY, requestId), `Emergency request ${requestId}`);
    });
    return jsonResult(rows);
  }

  async QueryEmergencyByDepartment(ctx, department) {
    const rows = await queryByIndex(ctx, INDEX.EMERGENCY_BY_DEPARTMENT, [department], 1, async (requestId) => {
      return getJson(ctx, makeKey(PREFIX.EMERGENCY, requestId), `Emergency request ${requestId}`);
    });
    return jsonResult(rows);
  }

  async QueryEmergencyByStatus(ctx, status) {
    const rows = await queryByIndex(ctx, INDEX.EMERGENCY_BY_STATUS, [status], 1, async (requestId) => {
      return getJson(ctx, makeKey(PREFIX.EMERGENCY, requestId), `Emergency request ${requestId}`);
    });
    return jsonResult(rows);
  }
}

module.exports = {
  EmergencyLinkageContract
};

