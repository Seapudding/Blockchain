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

class MissionLogContract extends Contract {
  constructor() {
    super('MissionLogContract');
  }

  async CreateMission(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['missionId', 'uavId', 'purpose', 'operator', 'timeWindow']);

    const missionKey = makeKey(PREFIX.MISSION, payload.missionId);
    if (await stateExists(ctx, missionKey)) {
      throw new Error(`Mission ${payload.missionId} already exists`);
    }

    await getJson(ctx, makeKey(PREFIX.UAV, payload.uavId), `UAV ${payload.uavId}`);

    const now = txTimestamp(ctx);
    const doc = {
      docType: DOC_TYPES.MISSION,
      missionId: payload.missionId,
      uavId: payload.uavId,
      purpose: payload.purpose,
      startPoint: payload.startPoint || null,
      endPoint: payload.endPoint || null,
      approvedRoute: payload.approvedRoute || [],
      timeWindow: payload.timeWindow,
      operator: payload.operator,
      pilotId: payload.pilotId || null,
      payloadType: payload.payloadType || 'none',
      riskLevel: payload.riskLevel || 'medium',
      authorizationStatus: payload.authorizationStatus || 'pending',
      status: payload.status || 'filed',
      metadata: payload.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: clientId(ctx)
    };

    await putJson(ctx, missionKey, doc);
    await writeIndex(ctx, INDEX.MISSION_BY_UAV, [doc.uavId, doc.missionId]);
    await writeIndex(ctx, INDEX.MISSION_BY_STATUS, [doc.status, doc.missionId]);

    return jsonResult(doc);
  }

  async GetMission(ctx, missionId) {
    return jsonResult(await getJson(ctx, makeKey(PREFIX.MISSION, missionId), `Mission ${missionId}`));
  }

  async UpdateMissionStatus(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['missionId', 'status']);

    const key = makeKey(PREFIX.MISSION, payload.missionId);
    const doc = await getJson(ctx, key, `Mission ${payload.missionId}`);
    const previousStatus = doc.status;

    doc.status = payload.status;
    doc.authorizationStatus = payload.authorizationStatus || doc.authorizationStatus;
    doc.resultSummary = payload.resultSummary || doc.resultSummary || null;
    doc.metadata = Object.assign({}, doc.metadata || {}, payload.metadata || {});
    doc.updatedAt = txTimestamp(ctx);
    doc.updatedBy = clientId(ctx);

    await putJson(ctx, key, doc);
    if (previousStatus !== doc.status) {
      await deleteIndex(ctx, INDEX.MISSION_BY_STATUS, [previousStatus, doc.missionId]);
      await writeIndex(ctx, INDEX.MISSION_BY_STATUS, [doc.status, doc.missionId]);
    }

    return jsonResult(doc);
  }

  async RecordLogAnchor(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['logId', 'missionId', 'uavId', 'logHash', 'storageUri', 'signature']);

    const key = makeKey(PREFIX.LOG, payload.logId);
    if (await stateExists(ctx, key)) {
      throw new Error(`Log anchor ${payload.logId} already exists`);
    }

    await getJson(ctx, makeKey(PREFIX.MISSION, payload.missionId), `Mission ${payload.missionId}`);

    const now = txTimestamp(ctx);
    const doc = {
      docType: DOC_TYPES.LOG_ANCHOR,
      logId: payload.logId,
      missionId: payload.missionId,
      uavId: payload.uavId,
      eventId: payload.eventId || null,
      eventType: payload.eventType || 'scheduled_log',
      severity: payload.severity || 'info',
      logHash: payload.logHash,
      storageUri: payload.storageUri,
      signature: payload.signature,
      recordedAt: payload.recordedAt || now,
      metadata: payload.metadata || {},
      createdAt: now,
      createdBy: clientId(ctx)
    };

    await putJson(ctx, key, doc);
    await writeIndex(ctx, INDEX.LOG_BY_MISSION, [doc.missionId, doc.logId]);
    await writeIndex(ctx, INDEX.LOG_BY_UAV, [doc.uavId, doc.logId]);
    if (doc.eventId) {
      await writeIndex(ctx, INDEX.LOG_BY_EVENT, [doc.eventId, doc.logId]);
    }

    return jsonResult(doc);
  }

  async RecordAbnormalEvent(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    payload.eventType = payload.eventType || 'abnormal_event';
    payload.severity = payload.severity || 'warning';
    return this.RecordLogAnchor(ctx, JSON.stringify(payload));
  }

  async GetLogAnchor(ctx, logId) {
    return jsonResult(await getJson(ctx, makeKey(PREFIX.LOG, logId), `Log anchor ${logId}`));
  }

  async VerifyLogHash(ctx, logId, expectedHash) {
    const doc = await getJson(ctx, makeKey(PREFIX.LOG, logId), `Log anchor ${logId}`);
    return jsonResult({
      logId,
      expectedHash,
      onChainHash: doc.logHash,
      verified: doc.logHash === expectedHash
    });
  }

  async QueryLogsByMission(ctx, missionId) {
    const rows = await queryByIndex(ctx, INDEX.LOG_BY_MISSION, [missionId], 1, async (logId) => {
      return getJson(ctx, makeKey(PREFIX.LOG, logId), `Log anchor ${logId}`);
    });
    return jsonResult(rows);
  }

  async QueryLogsByEvent(ctx, eventId) {
    const rows = await queryByIndex(ctx, INDEX.LOG_BY_EVENT, [eventId], 1, async (logId) => {
      return getJson(ctx, makeKey(PREFIX.LOG, logId), `Log anchor ${logId}`);
    });
    return jsonResult(rows);
  }

  async QueryMissionsByUAV(ctx, uavId) {
    const rows = await queryByIndex(ctx, INDEX.MISSION_BY_UAV, [uavId], 1, async (missionId) => {
      return getJson(ctx, makeKey(PREFIX.MISSION, missionId), `Mission ${missionId}`);
    });
    return jsonResult(rows);
  }
}

module.exports = {
  MissionLogContract
};

