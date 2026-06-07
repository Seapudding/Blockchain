'use strict';

const DOC_TYPES = Object.freeze({
  UAV: 'uav_identity',
  MISSION: 'flight_mission',
  LOG_ANCHOR: 'flight_log_anchor',
  EVIDENCE: 'accident_evidence_package',
  ACCESS_GRANT: 'access_grant',
  ACCESS_AUDIT: 'access_audit',
  EMERGENCY_REQUEST: 'emergency_request'
});

const PREFIX = Object.freeze({
  UAV: 'uav',
  MISSION: 'mission',
  LOG: 'log',
  EVIDENCE: 'evidence',
  GRANT: 'grant',
  AUDIT: 'audit',
  EMERGENCY: 'emergency'
});

const INDEX = Object.freeze({
  UAV_BY_OPERATOR: 'uav~operator',
  UAV_BY_STATUS: 'uav~status',
  MISSION_BY_UAV: 'mission~uav',
  MISSION_BY_STATUS: 'mission~status',
  LOG_BY_MISSION: 'log~mission',
  LOG_BY_EVENT: 'log~event',
  LOG_BY_UAV: 'log~uav',
  EVIDENCE_BY_MISSION: 'evidence~mission',
  EVIDENCE_BY_ACCIDENT: 'evidence~accident',
  EVIDENCE_BY_UAV: 'evidence~uav',
  GRANT_BY_REQUESTER: 'grant~requester',
  GRANT_BY_DEPARTMENT: 'grant~department',
  GRANT_BY_STATUS: 'grant~status',
  AUDIT_BY_CALLER: 'audit~caller',
  AUDIT_BY_DEPARTMENT: 'audit~department',
  AUDIT_BY_EVENT: 'audit~event',
  EMERGENCY_BY_EVENT: 'emergency~event',
  EMERGENCY_BY_DEPARTMENT: 'emergency~department',
  EMERGENCY_BY_STATUS: 'emergency~status'
});

module.exports = {
  DOC_TYPES,
  PREFIX,
  INDEX
};

