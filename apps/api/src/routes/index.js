'use strict';

const express = require('express');
const { sha256, demoSignature } = require('../services/hash');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function id(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${Math.random().toString(16).slice(2, 8)}`;
}

async function recordAudit(ledger, req, detail) {
  const audit = {
    auditId: id('AUDIT'),
    callerSystem: req.get('x-caller-system') || detail.callerSystem || 'api-gateway',
    department: req.get('x-department') || detail.department || 'platform',
    apiPath: req.originalUrl,
    dataType: detail.dataType,
    reason: req.get('x-access-reason') || detail.reason || 'api_call',
    relatedEventId: detail.relatedEventId || null,
    authorizationStatus: detail.authorizationStatus || 'allowed',
    resultHash: detail.result ? sha256(detail.result) : null,
    metadata: detail.metadata || {}
  };

  try {
    return await ledger.submit('AccessControlContract', 'RecordAccessAudit', JSON.stringify(audit));
  } catch (error) {
    return Object.assign(audit, { auditError: error.message });
  }
}

function createRoutes(services) {
  const router = express.Router();
  const { ledger, offchain } = services;

  router.get('/health', (req, res) => {
    res.json({
      ok: true,
      service: 'uav-blackbox-api',
      ledgerMode: services.config.ledgerMode
    });
  });

  router.post('/uavs', asyncHandler(async (req, res) => {
    const result = await ledger.submit('UAVIdentityContract', 'RegisterUAV', JSON.stringify(req.body));
    res.status(201).json(result);
  }));

  router.get('/uavs/:uavId', asyncHandler(async (req, res) => {
    const result = await ledger.evaluate('UAVIdentityContract', 'GetUAV', req.params.uavId);
    res.json(result);
  }));

  router.patch('/uavs/:uavId/status', asyncHandler(async (req, res) => {
    const result = await ledger.submit('UAVIdentityContract', 'UpdateUAVStatus', JSON.stringify({
      ...req.body,
      uavId: req.params.uavId
    }));
    res.json(result);
  }));

  router.post('/missions', asyncHandler(async (req, res) => {
    const result = await ledger.submit('MissionLogContract', 'CreateMission', JSON.stringify(req.body));
    res.status(201).json(result);
  }));

  router.get('/missions/:missionId', asyncHandler(async (req, res) => {
    const result = await ledger.evaluate('MissionLogContract', 'GetMission', req.params.missionId);
    res.json(result);
  }));

  router.patch('/missions/:missionId/status', asyncHandler(async (req, res) => {
    const result = await ledger.submit('MissionLogContract', 'UpdateMissionStatus', JSON.stringify({
      ...req.body,
      missionId: req.params.missionId
    }));
    res.json(result);
  }));

  router.post('/missions/:missionId/logs', asyncHandler(async (req, res) => {
    const mission = await ledger.evaluate('MissionLogContract', 'GetMission', req.params.missionId);
    const rawLog = req.body.log || req.body;
    const logId = req.body.logId || id(`${req.params.missionId}-LOG`);
    const logHash = req.body.logHash || sha256(rawLog);
    const storage = req.body.storageUri
      ? { uri: req.body.storageUri, path: null }
      : offchain.putJson('logs', `${logId}.json`, rawLog);

    const payload = {
      logId,
      missionId: req.params.missionId,
      uavId: req.body.uavId || mission.uavId,
      eventId: req.body.eventId || rawLog.eventId || null,
      eventType: req.body.eventType || rawLog.eventType || 'scheduled_log',
      severity: req.body.severity || rawLog.severity || 'info',
      logHash,
      storageUri: storage.uri,
      signature: req.body.signature || demoSignature(logHash, req.body.signer),
      recordedAt: req.body.recordedAt || rawLog.timestamp || new Date().toISOString(),
      metadata: req.body.metadata || {}
    };

    const transaction = payload.eventType === 'scheduled_log' ? 'RecordLogAnchor' : 'RecordAbnormalEvent';
    const result = await ledger.submit('MissionLogContract', transaction, JSON.stringify(payload));
    res.status(201).json({ record: result, offchain: storage });
  }));

  router.get('/missions/:missionId/logs', asyncHandler(async (req, res) => {
    const result = await ledger.evaluate('MissionLogContract', 'QueryLogsByMission', req.params.missionId);
    res.json(result);
  }));

  router.get('/logs/:logId/verify', asyncHandler(async (req, res) => {
    const expectedHash = req.query.hash;
    const result = await ledger.evaluate('MissionLogContract', 'VerifyLogHash', req.params.logId, expectedHash);
    res.json(result);
  }));

  router.post('/evidence', asyncHandler(async (req, res) => {
    const evidenceId = req.body.evidenceId || id('EVIDENCE');
    const rawEvidence = req.body.evidence || req.body;
    const evidenceHash = req.body.evidenceHash || sha256(rawEvidence);
    const { evidence, ...anchorFields } = req.body;
    const storage = req.body.storageUri
      ? { uri: req.body.storageUri, path: null }
      : offchain.putJson('evidence', `${evidenceId}.json`, rawEvidence);

    const payload = {
      ...anchorFields,
      evidenceId,
      evidenceHash,
      storageUri: storage.uri
    };

    const result = await ledger.submit('EvidenceContract', 'CreateEvidencePackage', JSON.stringify(payload));
    res.status(201).json({ record: result, offchain: storage });
  }));

  router.get('/evidence/:evidenceId', asyncHandler(async (req, res) => {
    const result = await ledger.evaluate('EvidenceContract', 'GetEvidencePackage', req.params.evidenceId);
    res.json(result);
  }));

  router.get('/evidence/:evidenceId/verify', asyncHandler(async (req, res) => {
    const result = await ledger.evaluate('EvidenceContract', 'VerifyEvidenceHash', req.params.evidenceId, req.query.hash);
    res.json(result);
  }));

  router.post('/access/grants', asyncHandler(async (req, res) => {
    const result = await ledger.submit('AccessControlContract', 'GrantAccess', JSON.stringify(req.body));
    res.status(201).json(result);
  }));

  router.post('/access/audits', asyncHandler(async (req, res) => {
    const result = await ledger.submit('AccessControlContract', 'RecordAccessAudit', JSON.stringify(req.body));
    res.status(201).json(result);
  }));

  router.get('/access/audits/event/:eventId', asyncHandler(async (req, res) => {
    const result = await ledger.evaluate('AccessControlContract', 'QueryAuditsByRelatedEvent', req.params.eventId);
    res.json(result);
  }));

  router.get('/public-security/uav/:uavId/identity', asyncHandler(async (req, res) => {
    const uav = await ledger.evaluate('UAVIdentityContract', 'GetUAV', req.params.uavId);
    const response = {
      uav_id: uav.uavId,
      operator: uav.operator,
      model: uav.model,
      certificate_status: uav.certificateStatus,
      insurance_status: uav.insuranceStatus,
      last_seen_time: uav.metadata && uav.metadata.lastSeenTime ? uav.metadata.lastSeenTime : null,
      last_seen_location: uav.metadata && uav.metadata.lastSeenLocation ? uav.metadata.lastSeenLocation : null,
      blockchain_identity_hash: uav.identityHash
    };

    const audit = await recordAudit(ledger, req, {
      department: 'public-security',
      dataType: 'uav_identity',
      reason: 'identity_verification',
      result: response
    });

    res.json({ ...response, audit_record: audit.auditId });
  }));

  router.post('/fire-rescue/emergency-task', asyncHandler(async (req, res) => {
    const requestId = req.body.requestId || id('FIRE');
    const payload = {
      requestId,
      sourceDepartment: req.body.requestDepartment || req.body.sourceDepartment || 'fire-rescue',
      eventId: req.body.eventId,
      taskType: req.body.taskType || req.body.task_type,
      priority: req.body.priority || 'high',
      targetArea: req.body.targetArea || req.body.target_area,
      requiredPayload: req.body.requiredPayload || req.body.required_payload || [],
      expectedDurationMin: req.body.expectedDurationMin || req.body.expected_duration_min || null,
      metadata: req.body.metadata || {}
    };

    const record = await ledger.submit('EmergencyLinkageContract', 'CreateEmergencyRequest', JSON.stringify(payload));
    const response = {
      task_accept_status: 'accepted',
      request_id: record.requestId,
      mission_id: record.missionId,
      assigned_uav: record.assignedUav,
      blockchain_record: `ledger:${record.requestId}`,
      estimated_takeoff_time: null
    };

    const audit = await recordAudit(ledger, req, {
      department: 'fire-rescue',
      dataType: 'emergency_task',
      reason: 'fire_scene_reconnaissance',
      relatedEventId: record.eventId,
      result: response
    });

    res.status(201).json({ ...response, audit_record: audit.auditId });
  }));

  router.get('/emergency/events/:eventId/requests', asyncHandler(async (req, res) => {
    const result = await ledger.evaluate('EmergencyLinkageContract', 'QueryEmergencyByEvent', req.params.eventId);
    res.json(result);
  }));

  router.patch('/emergency/requests/:requestId/status', asyncHandler(async (req, res) => {
    const result = await ledger.submit('EmergencyLinkageContract', 'UpdateEmergencyStatus', JSON.stringify({
      ...req.body,
      requestId: req.params.requestId
    }));
    res.json(result);
  }));

  router.get('/insurance/evidence/:evidenceId', asyncHandler(async (req, res) => {
    const evidence = await ledger.evaluate('EvidenceContract', 'GetEvidencePackage', req.params.evidenceId);
    const audit = await recordAudit(ledger, req, {
      department: 'insurance',
      dataType: 'accident_evidence',
      reason: 'claim_review',
      relatedEventId: evidence.accidentId,
      result: evidence
    });
    res.json({ evidence, audit_record: audit.auditId });
  }));

  router.get('/regulator/missions/:missionId/logs', asyncHandler(async (req, res) => {
    const logs = await ledger.evaluate('MissionLogContract', 'QueryLogsByMission', req.params.missionId);
    const audit = await recordAudit(ledger, req, {
      department: 'low-altitude-regulator',
      dataType: 'flight_log_anchor',
      reason: 'flight_trace_review',
      result: logs
    });
    res.json({ logs, audit_record: audit.auditId });
  }));

  return router;
}

module.exports = {
  createRoutes
};
