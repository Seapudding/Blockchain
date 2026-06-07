'use strict';

const { UAVIdentityContract } = require('./lib/contracts/uavIdentityContract');
const { MissionLogContract } = require('./lib/contracts/missionLogContract');
const { EvidenceContract } = require('./lib/contracts/evidenceContract');
const { AccessControlContract } = require('./lib/contracts/accessControlContract');
const { EmergencyLinkageContract } = require('./lib/contracts/emergencyLinkageContract');

module.exports.contracts = [
  UAVIdentityContract,
  MissionLogContract,
  EvidenceContract,
  AccessControlContract,
  EmergencyLinkageContract
];

