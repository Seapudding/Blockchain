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
  queryByIndex,
  jsonResult
} = require('../ledger');

class EvidenceContract extends Contract {
  constructor() {
    super('EvidenceContract');
  }

  async CreateEvidencePackage(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, [
      'evidenceId',
      'accidentId',
      'missionId',
      'uavId',
      'evidenceHash',
      'storageUri',
      'accidentTime',
      'accidentLocation'
    ]);

    const key = makeKey(PREFIX.EVIDENCE, payload.evidenceId);
    if (await stateExists(ctx, key)) {
      throw new Error(`Evidence package ${payload.evidenceId} already exists`);
    }

    await getJson(ctx, makeKey(PREFIX.MISSION, payload.missionId), `Mission ${payload.missionId}`);

    const now = txTimestamp(ctx);
    const doc = {
      docType: DOC_TYPES.EVIDENCE,
      evidenceId: payload.evidenceId,
      accidentId: payload.accidentId,
      missionId: payload.missionId,
      uavId: payload.uavId,
      evidenceHash: payload.evidenceHash,
      storageUri: payload.storageUri,
      accidentTime: payload.accidentTime,
      accidentLocation: payload.accidentLocation,
      relatedLogIds: payload.relatedLogIds || [],
      integrityStatus: payload.integrityStatus || 'pending',
      analysisSummary: payload.analysisSummary || null,
      responsibilitySuggestion: payload.responsibilitySuggestion || null,
      metadata: payload.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: clientId(ctx)
    };

    await putJson(ctx, key, doc);
    await writeIndex(ctx, INDEX.EVIDENCE_BY_MISSION, [doc.missionId, doc.evidenceId]);
    await writeIndex(ctx, INDEX.EVIDENCE_BY_ACCIDENT, [doc.accidentId, doc.evidenceId]);
    await writeIndex(ctx, INDEX.EVIDENCE_BY_UAV, [doc.uavId, doc.evidenceId]);

    return jsonResult(doc);
  }

  async GetEvidencePackage(ctx, evidenceId) {
    return jsonResult(await getJson(ctx, makeKey(PREFIX.EVIDENCE, evidenceId), `Evidence package ${evidenceId}`));
  }

  async VerifyEvidenceHash(ctx, evidenceId, expectedHash) {
    const doc = await getJson(ctx, makeKey(PREFIX.EVIDENCE, evidenceId), `Evidence package ${evidenceId}`);
    return jsonResult({
      evidenceId,
      expectedHash,
      onChainHash: doc.evidenceHash,
      verified: doc.evidenceHash === expectedHash
    });
  }

  async MarkEvidenceVerified(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['evidenceId', 'integrityStatus']);

    const key = makeKey(PREFIX.EVIDENCE, payload.evidenceId);
    const doc = await getJson(ctx, key, `Evidence package ${payload.evidenceId}`);
    doc.integrityStatus = payload.integrityStatus;
    doc.verificationDetail = payload.verificationDetail || doc.verificationDetail || null;
    doc.updatedAt = txTimestamp(ctx);
    doc.updatedBy = clientId(ctx);

    await putJson(ctx, key, doc);
    return jsonResult(doc);
  }

  async AttachAnalysisReport(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['evidenceId', 'analysisSummary']);

    const key = makeKey(PREFIX.EVIDENCE, payload.evidenceId);
    const doc = await getJson(ctx, key, `Evidence package ${payload.evidenceId}`);
    doc.analysisSummary = payload.analysisSummary;
    doc.responsibilitySuggestion = payload.responsibilitySuggestion || doc.responsibilitySuggestion || null;
    doc.updatedAt = txTimestamp(ctx);
    doc.updatedBy = clientId(ctx);

    await putJson(ctx, key, doc);
    return jsonResult(doc);
  }

  async QueryEvidenceByMission(ctx, missionId) {
    const rows = await queryByIndex(ctx, INDEX.EVIDENCE_BY_MISSION, [missionId], 1, async (evidenceId) => {
      return getJson(ctx, makeKey(PREFIX.EVIDENCE, evidenceId), `Evidence package ${evidenceId}`);
    });
    return jsonResult(rows);
  }

  async QueryEvidenceByAccident(ctx, accidentId) {
    const rows = await queryByIndex(ctx, INDEX.EVIDENCE_BY_ACCIDENT, [accidentId], 1, async (evidenceId) => {
      return getJson(ctx, makeKey(PREFIX.EVIDENCE, evidenceId), `Evidence package ${evidenceId}`);
    });
    return jsonResult(rows);
  }
}

module.exports = {
  EvidenceContract
};

