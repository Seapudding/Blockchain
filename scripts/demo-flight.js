'use strict';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

function stamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function request(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-caller-system': 'demo-console',
      'x-department': 'course-demo',
      'x-access-reason': 'end_to_end_demo'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  console.log(`\n${method} ${path}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  const suffix = stamp();
  const uavId = `UAV-${suffix}`;
  const missionId = `MIS-${suffix}`;
  const accidentId = `ACC-${suffix}`;
  const eventId = `EVT-${suffix}`;
  const evidenceId = `EVD-${suffix}`;

  await request('GET', '/health');

  await request('POST', '/uavs', {
    uavId,
    model: 'Industrial-UAV-X1',
    serialNumber: `SN-${suffix}`,
    manufacturer: 'ChainAir Lab',
    operator: 'ChainAir Operations',
    flightControllerId: `FC-${suffix}`,
    pilotId: 'PILOT-001',
    certificateStatus: 'valid',
    insuranceStatus: 'valid',
    metadata: {
      lastSeenTime: new Date().toISOString(),
      lastSeenLocation: { lat: 30.2741, lon: 120.1551, alt: 82.5 }
    }
  });

  await request('POST', '/missions', {
    missionId,
    uavId,
    purpose: 'pipeline_inspection',
    startPoint: { lat: 30.2741, lon: 120.1551, alt: 0 },
    endPoint: { lat: 30.2851, lon: 120.1482, alt: 0 },
    approvedRoute: [
      { lat: 30.2741, lon: 120.1551, alt: 80 },
      { lat: 30.2792, lon: 120.1517, alt: 85 },
      { lat: 30.2851, lon: 120.1482, alt: 80 }
    ],
    timeWindow: {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    },
    operator: 'ChainAir Operations',
    pilotId: 'PILOT-001',
    payloadType: 'visible_camera',
    riskLevel: 'medium',
    authorizationStatus: 'approved'
  });

  const scheduledLog = await request('POST', `/missions/${missionId}/logs`, {
    eventType: 'scheduled_log',
    log: {
      timestamp: new Date().toISOString(),
      gps: { lat: 30.2792, lon: 120.1517, alt: 84.2 },
      speedMps: 8.6,
      headingDeg: 42,
      attitude: { roll: 1.2, pitch: -0.4, yaw: 42 },
      battery: { voltage: 22.1, current: 4.8, remainingPercent: 73 },
      mode: 'AUTO',
      command: 'WAYPOINT_NAVIGATION',
      communication: 'normal'
    }
  });

  const abnormalLog = await request('POST', `/missions/${missionId}/logs`, {
    eventId,
    eventType: 'collision_warning',
    severity: 'critical',
    log: {
      timestamp: new Date().toISOString(),
      eventId,
      eventType: 'collision_warning',
      gps: { lat: 30.2817, lon: 120.1502, alt: 83.6 },
      speedMps: 11.4,
      headingDeg: 51,
      attitude: { roll: 9.8, pitch: -6.1, yaw: 51 },
      battery: { voltage: 21.7, current: 9.2, remainingPercent: 61 },
      communication: 'unstable',
      alarms: ['obstacle_too_close', 'forced_brake'],
      remoteInput: { throttle: 0.1, yaw: 0.4 },
      autopilotCommand: 'EMERGENCY_HOLD'
    }
  });

  const evidenceRaw = {
    accidentId,
    missionId,
    uavId,
    window: 'T-30s to T+30s',
    logs: [scheduledLog.record, abnormalLog.record],
    conclusion: 'Collision warning and unstable communication require manual investigation.'
  };

  const evidence = await request('POST', '/evidence', {
    evidenceId,
    accidentId,
    missionId,
    uavId,
    accidentTime: new Date().toISOString(),
    accidentLocation: { lat: 30.2817, lon: 120.1502, alt: 83.6 },
    relatedLogIds: [scheduledLog.record.logId, abnormalLog.record.logId],
    evidence: evidenceRaw,
    integrityStatus: 'verified',
    analysisSummary: 'Preliminary analysis points to collision avoidance and communication instability.',
    responsibilitySuggestion: 'regulator_review_required'
  });

  await request('GET', `/logs/${scheduledLog.record.logId}/verify?hash=${scheduledLog.record.logHash}`);
  await request('GET', `/evidence/${evidenceId}/verify?hash=${evidence.record.evidenceHash}`);
  await request('GET', `/public-security/uav/${uavId}/identity`);

  await request('POST', '/fire-rescue/emergency-task', {
    eventId,
    taskType: 'fire_scene_reconnaissance',
    priority: 'high',
    targetArea: {
      center: { lat: 30.2817, lon: 120.1502 },
      radiusM: 800
    },
    requiredPayload: ['visible_camera', 'thermal_camera'],
    expectedDurationMin: 20,
    requestDepartment: 'City Fire Rescue'
  });

  await request('GET', `/regulator/missions/${missionId}/logs`);
  await request('GET', `/insurance/evidence/${evidenceId}`);
  await request('GET', `/access/audits/event/${eventId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

