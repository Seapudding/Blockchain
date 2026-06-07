'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('./hash');

const DEFAULT_STATE = {
  uavs: {},
  missions: {},
  logs: {},
  evidence: {},
  grants: {},
  audits: {},
  emergencies: {}
};

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parsePayload(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object') {
    return value;
  }
  return JSON.parse(value);
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  if (missing.length > 0) {
    throw new Error(`Missing required field(s): ${missing.join(', ')}`);
  }
}

class LocalLedgerClient {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return clone(DEFAULT_STATE);
    }
    return Object.assign(clone(DEFAULT_STATE), JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  async evaluate(contractName, transactionName, ...args) {
    return this.dispatch(contractName, transactionName, false, args);
  }

  async submit(contractName, transactionName, ...args) {
    const result = this.dispatch(contractName, transactionName, true, args);
    this.save();
    return result;
  }

  dispatch(contractName, transactionName, mutating, args) {
    const handlers = {
      UAVIdentityContract: this.uavHandlers(),
      MissionLogContract: this.missionHandlers(),
      EvidenceContract: this.evidenceHandlers(),
      AccessControlContract: this.accessHandlers(),
      EmergencyLinkageContract: this.emergencyHandlers()
    };

    const contract = handlers[contractName];
    if (!contract || !contract[transactionName]) {
      throw new Error(`Unsupported local transaction ${contractName}:${transactionName}`);
    }

    return clone(contract[transactionName](...args, mutating));
  }

  uavHandlers() {
    return {
      RegisterUAV: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['uavId', 'model', 'serialNumber', 'manufacturer', 'operator', 'flightControllerId', 'pilotId']);
        if (this.state.uavs[payload.uavId]) {
          throw new Error(`UAV ${payload.uavId} already exists`);
        }
        const now = nowIso();
        const doc = {
          docType: 'uav_identity',
          certificateStatus: 'pending',
          insuranceStatus: 'pending',
          status: 'active',
          metadata: {},
          ...payload,
          identityHash: payload.identityHash || sha256({
            uavId: payload.uavId,
            serialNumber: payload.serialNumber,
            manufacturer: payload.manufacturer,
            operator: payload.operator,
            flightControllerId: payload.flightControllerId,
            pilotId: payload.pilotId
          }),
          createdAt: now,
          updatedAt: now,
          createdBy: 'local-api'
        };
        this.state.uavs[doc.uavId] = doc;
        return doc;
      },
      GetUAV: (uavId) => this.required(this.state.uavs, uavId, 'UAV'),
      UpdateUAVStatus: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['uavId', 'status']);
        const doc = this.required(this.state.uavs, payload.uavId, 'UAV');
        Object.assign(doc, {
          status: payload.status,
          certificateStatus: payload.certificateStatus || doc.certificateStatus,
          insuranceStatus: payload.insuranceStatus || doc.insuranceStatus,
          metadata: Object.assign({}, doc.metadata || {}, payload.metadata || {}),
          updatedAt: nowIso(),
          updatedBy: 'local-api'
        });
        return doc;
      },
      VerifyUAVIdentity: (uavId, expectedHash) => {
        const doc = this.required(this.state.uavs, uavId, 'UAV');
        return { uavId, expectedHash, onChainHash: doc.identityHash, verified: doc.identityHash === expectedHash };
      },
      QueryUAVsByOperator: (operator) => Object.values(this.state.uavs).filter((item) => item.operator === operator),
      QueryUAVsByStatus: (status) => Object.values(this.state.uavs).filter((item) => item.status === status)
    };
  }

  missionHandlers() {
    return {
      CreateMission: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['missionId', 'uavId', 'purpose', 'operator', 'timeWindow']);
        if (this.state.missions[payload.missionId]) {
          throw new Error(`Mission ${payload.missionId} already exists`);
        }
        this.required(this.state.uavs, payload.uavId, 'UAV');
        const now = nowIso();
        const doc = {
          docType: 'flight_mission',
          startPoint: null,
          endPoint: null,
          approvedRoute: [],
          payloadType: 'none',
          riskLevel: 'medium',
          authorizationStatus: 'pending',
          status: 'filed',
          metadata: {},
          ...payload,
          createdAt: now,
          updatedAt: now,
          createdBy: 'local-api'
        };
        this.state.missions[doc.missionId] = doc;
        return doc;
      },
      GetMission: (missionId) => this.required(this.state.missions, missionId, 'Mission'),
      UpdateMissionStatus: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['missionId', 'status']);
        const doc = this.required(this.state.missions, payload.missionId, 'Mission');
        Object.assign(doc, {
          status: payload.status,
          authorizationStatus: payload.authorizationStatus || doc.authorizationStatus,
          resultSummary: payload.resultSummary || doc.resultSummary || null,
          metadata: Object.assign({}, doc.metadata || {}, payload.metadata || {}),
          updatedAt: nowIso(),
          updatedBy: 'local-api'
        });
        return doc;
      },
      RecordLogAnchor: (payloadJson) => this.createLogAnchor(payloadJson, false),
      RecordAbnormalEvent: (payloadJson) => this.createLogAnchor(payloadJson, true),
      GetLogAnchor: (logId) => this.required(this.state.logs, logId, 'Log anchor'),
      VerifyLogHash: (logId, expectedHash) => {
        const doc = this.required(this.state.logs, logId, 'Log anchor');
        return { logId, expectedHash, onChainHash: doc.logHash, verified: doc.logHash === expectedHash };
      },
      QueryLogsByMission: (missionId) => Object.values(this.state.logs).filter((item) => item.missionId === missionId),
      QueryLogsByEvent: (eventId) => Object.values(this.state.logs).filter((item) => item.eventId === eventId),
      QueryMissionsByUAV: (uavId) => Object.values(this.state.missions).filter((item) => item.uavId === uavId)
    };
  }

  createLogAnchor(payloadJson, abnormal) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, ['logId', 'missionId', 'uavId', 'logHash', 'storageUri', 'signature']);
    if (this.state.logs[payload.logId]) {
      throw new Error(`Log anchor ${payload.logId} already exists`);
    }
    this.required(this.state.missions, payload.missionId, 'Mission');
    const now = nowIso();
    const doc = {
      docType: 'flight_log_anchor',
      eventId: null,
      eventType: abnormal ? 'abnormal_event' : 'scheduled_log',
      severity: abnormal ? 'warning' : 'info',
      metadata: {},
      ...payload,
      createdAt: now,
      createdBy: 'local-api'
    };
    this.state.logs[doc.logId] = doc;
    return doc;
  }

  evidenceHandlers() {
    return {
      CreateEvidencePackage: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['evidenceId', 'accidentId', 'missionId', 'uavId', 'evidenceHash', 'storageUri', 'accidentTime', 'accidentLocation']);
        if (this.state.evidence[payload.evidenceId]) {
          throw new Error(`Evidence package ${payload.evidenceId} already exists`);
        }
        this.required(this.state.missions, payload.missionId, 'Mission');
        const now = nowIso();
        const doc = {
          docType: 'accident_evidence_package',
          relatedLogIds: [],
          integrityStatus: 'pending',
          analysisSummary: null,
          responsibilitySuggestion: null,
          metadata: {},
          ...payload,
          createdAt: now,
          updatedAt: now,
          createdBy: 'local-api'
        };
        this.state.evidence[doc.evidenceId] = doc;
        return doc;
      },
      GetEvidencePackage: (evidenceId) => this.required(this.state.evidence, evidenceId, 'Evidence package'),
      VerifyEvidenceHash: (evidenceId, expectedHash) => {
        const doc = this.required(this.state.evidence, evidenceId, 'Evidence package');
        return { evidenceId, expectedHash, onChainHash: doc.evidenceHash, verified: doc.evidenceHash === expectedHash };
      },
      MarkEvidenceVerified: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['evidenceId', 'integrityStatus']);
        const doc = this.required(this.state.evidence, payload.evidenceId, 'Evidence package');
        doc.integrityStatus = payload.integrityStatus;
        doc.verificationDetail = payload.verificationDetail || doc.verificationDetail || null;
        doc.updatedAt = nowIso();
        return doc;
      },
      AttachAnalysisReport: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['evidenceId', 'analysisSummary']);
        const doc = this.required(this.state.evidence, payload.evidenceId, 'Evidence package');
        doc.analysisSummary = payload.analysisSummary;
        doc.responsibilitySuggestion = payload.responsibilitySuggestion || doc.responsibilitySuggestion || null;
        doc.updatedAt = nowIso();
        return doc;
      },
      QueryEvidenceByMission: (missionId) => Object.values(this.state.evidence).filter((item) => item.missionId === missionId),
      QueryEvidenceByAccident: (accidentId) => Object.values(this.state.evidence).filter((item) => item.accidentId === accidentId)
    };
  }

  accessHandlers() {
    return {
      GrantAccess: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['grantId', 'requester', 'department', 'dataScopes', 'reason', 'expiresAt', 'authorizedBy']);
        if (this.state.grants[payload.grantId]) {
          throw new Error(`Access grant ${payload.grantId} already exists`);
        }
        const now = nowIso();
        const doc = {
          docType: 'access_grant',
          status: 'active',
          metadata: {},
          ...payload,
          createdAt: now,
          updatedAt: now,
          createdBy: 'local-api'
        };
        this.state.grants[doc.grantId] = doc;
        return doc;
      },
      GetAccessGrant: (grantId) => this.required(this.state.grants, grantId, 'Access grant'),
      RevokeAccess: (grantId) => {
        const doc = this.required(this.state.grants, grantId, 'Access grant');
        doc.status = 'revoked';
        doc.updatedAt = nowIso();
        return doc;
      },
      CheckAccess: (requester, dataScope) => {
        const now = Date.now();
        const grant = Object.values(this.state.grants).find((item) => {
          return item.requester === requester
            && item.status === 'active'
            && Array.isArray(item.dataScopes)
            && item.dataScopes.includes(dataScope)
            && Date.parse(item.expiresAt) >= now;
        });
        return { requester, dataScope, authorized: Boolean(grant), grantId: grant ? grant.grantId : null };
      },
      RecordAccessAudit: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['auditId', 'callerSystem', 'department', 'apiPath', 'dataType', 'reason', 'authorizationStatus']);
        if (this.state.audits[payload.auditId]) {
          throw new Error(`Access audit ${payload.auditId} already exists`);
        }
        const doc = {
          docType: 'access_audit',
          relatedEventId: null,
          resultHash: null,
          metadata: {},
          ...payload,
          createdAt: nowIso(),
          createdBy: 'local-api'
        };
        this.state.audits[doc.auditId] = doc;
        return doc;
      },
      GetAccessAudit: (auditId) => this.required(this.state.audits, auditId, 'Access audit'),
      QueryAuditsByRelatedEvent: (eventId) => Object.values(this.state.audits).filter((item) => item.relatedEventId === eventId),
      QueryAuditsByDepartment: (department) => Object.values(this.state.audits).filter((item) => item.department === department)
    };
  }

  emergencyHandlers() {
    return {
      CreateEmergencyRequest: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['requestId', 'sourceDepartment', 'eventId', 'taskType', 'priority', 'targetArea']);
        if (this.state.emergencies[payload.requestId]) {
          throw new Error(`Emergency request ${payload.requestId} already exists`);
        }
        const now = nowIso();
        const doc = {
          docType: 'emergency_request',
          requiredPayload: [],
          status: 'requested',
          assignedUav: null,
          missionId: null,
          responseSummary: null,
          blockchainRecord: null,
          metadata: {},
          ...payload,
          createdAt: now,
          updatedAt: now,
          createdBy: 'local-api'
        };
        this.state.emergencies[doc.requestId] = doc;
        return doc;
      },
      GetEmergencyRequest: (requestId) => this.required(this.state.emergencies, requestId, 'Emergency request'),
      UpdateEmergencyStatus: (payloadJson) => {
        const payload = parsePayload(payloadJson);
        requireFields(payload, ['requestId', 'status']);
        const doc = this.required(this.state.emergencies, payload.requestId, 'Emergency request');
        Object.assign(doc, {
          status: payload.status,
          assignedUav: payload.assignedUav || doc.assignedUav,
          missionId: payload.missionId || doc.missionId,
          responseSummary: payload.responseSummary || doc.responseSummary,
          blockchainRecord: payload.blockchainRecord || doc.blockchainRecord,
          metadata: Object.assign({}, doc.metadata || {}, payload.metadata || {}),
          updatedAt: nowIso(),
          updatedBy: 'local-api'
        });
        return doc;
      },
      QueryEmergencyByEvent: (eventId) => Object.values(this.state.emergencies).filter((item) => item.eventId === eventId),
      QueryEmergencyByDepartment: (department) => Object.values(this.state.emergencies).filter((item) => item.sourceDepartment === department),
      QueryEmergencyByStatus: (status) => Object.values(this.state.emergencies).filter((item) => item.status === status)
    };
  }

  required(collection, id, label) {
    const value = collection[id];
    if (!value) {
      throw new Error(`${label} ${id} does not exist`);
    }
    return value;
  }
}

module.exports = {
  LocalLedgerClient
};

