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

class AccessControlContract extends Contract {
  constructor() {
    super('AccessControlContract');
  }

  async GrantAccess(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, [
      'grantId',
      'requester',
      'department',
      'dataScopes',
      'reason',
      'expiresAt',
      'authorizedBy'
    ]);

    const key = makeKey(PREFIX.GRANT, payload.grantId);
    if (await stateExists(ctx, key)) {
      throw new Error(`Access grant ${payload.grantId} already exists`);
    }

    const now = txTimestamp(ctx);
    const doc = {
      docType: DOC_TYPES.ACCESS_GRANT,
      grantId: payload.grantId,
      requester: payload.requester,
      department: payload.department,
      dataScopes: payload.dataScopes,
      reason: payload.reason,
      expiresAt: payload.expiresAt,
      authorizedBy: payload.authorizedBy,
      status: payload.status || 'active',
      metadata: payload.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: clientId(ctx)
    };

    await putJson(ctx, key, doc);
    await writeIndex(ctx, INDEX.GRANT_BY_REQUESTER, [doc.requester, doc.grantId]);
    await writeIndex(ctx, INDEX.GRANT_BY_DEPARTMENT, [doc.department, doc.grantId]);
    await writeIndex(ctx, INDEX.GRANT_BY_STATUS, [doc.status, doc.grantId]);

    return jsonResult(doc);
  }

  async GetAccessGrant(ctx, grantId) {
    return jsonResult(await getJson(ctx, makeKey(PREFIX.GRANT, grantId), `Access grant ${grantId}`));
  }

  async RevokeAccess(ctx, grantId) {
    const key = makeKey(PREFIX.GRANT, grantId);
    const doc = await getJson(ctx, key, `Access grant ${grantId}`);
    const previousStatus = doc.status;

    doc.status = 'revoked';
    doc.updatedAt = txTimestamp(ctx);
    doc.updatedBy = clientId(ctx);

    await putJson(ctx, key, doc);
    if (previousStatus !== doc.status) {
      await deleteIndex(ctx, INDEX.GRANT_BY_STATUS, [previousStatus, doc.grantId]);
      await writeIndex(ctx, INDEX.GRANT_BY_STATUS, [doc.status, doc.grantId]);
    }

    return jsonResult(doc);
  }

  async CheckAccess(ctx, requester, dataScope) {
    const rows = await queryByIndex(ctx, INDEX.GRANT_BY_REQUESTER, [requester], 1, async (grantId) => {
      return getJson(ctx, makeKey(PREFIX.GRANT, grantId), `Access grant ${grantId}`);
    });
    const now = Date.parse(txTimestamp(ctx));
    const matched = rows.find((grant) => {
      const scopes = Array.isArray(grant.dataScopes) ? grant.dataScopes : [];
      return grant.status === 'active'
        && scopes.includes(dataScope)
        && Date.parse(grant.expiresAt) >= now;
    });

    return jsonResult({
      requester,
      dataScope,
      authorized: Boolean(matched),
      grantId: matched ? matched.grantId : null
    });
  }

  async RecordAccessAudit(ctx, payloadJson) {
    const payload = parsePayload(payloadJson);
    requireFields(payload, [
      'auditId',
      'callerSystem',
      'department',
      'apiPath',
      'dataType',
      'reason',
      'authorizationStatus'
    ]);

    const key = makeKey(PREFIX.AUDIT, payload.auditId);
    if (await stateExists(ctx, key)) {
      throw new Error(`Access audit ${payload.auditId} already exists`);
    }

    const now = txTimestamp(ctx);
    const doc = {
      docType: DOC_TYPES.ACCESS_AUDIT,
      auditId: payload.auditId,
      callerSystem: payload.callerSystem,
      department: payload.department,
      apiPath: payload.apiPath,
      dataType: payload.dataType,
      reason: payload.reason,
      relatedEventId: payload.relatedEventId || null,
      authorizationStatus: payload.authorizationStatus,
      resultHash: payload.resultHash || null,
      metadata: payload.metadata || {},
      createdAt: now,
      createdBy: clientId(ctx)
    };

    await putJson(ctx, key, doc);
    await writeIndex(ctx, INDEX.AUDIT_BY_CALLER, [doc.callerSystem, doc.auditId]);
    await writeIndex(ctx, INDEX.AUDIT_BY_DEPARTMENT, [doc.department, doc.auditId]);
    if (doc.relatedEventId) {
      await writeIndex(ctx, INDEX.AUDIT_BY_EVENT, [doc.relatedEventId, doc.auditId]);
    }

    return jsonResult(doc);
  }

  async GetAccessAudit(ctx, auditId) {
    return jsonResult(await getJson(ctx, makeKey(PREFIX.AUDIT, auditId), `Access audit ${auditId}`));
  }

  async QueryAuditsByRelatedEvent(ctx, eventId) {
    const rows = await queryByIndex(ctx, INDEX.AUDIT_BY_EVENT, [eventId], 1, async (auditId) => {
      return getJson(ctx, makeKey(PREFIX.AUDIT, auditId), `Access audit ${auditId}`);
    });
    return jsonResult(rows);
  }

  async QueryAuditsByDepartment(ctx, department) {
    const rows = await queryByIndex(ctx, INDEX.AUDIT_BY_DEPARTMENT, [department], 1, async (auditId) => {
      return getJson(ctx, makeKey(PREFIX.AUDIT, auditId), `Access audit ${auditId}`);
    });
    return jsonResult(rows);
  }
}

module.exports = {
  AccessControlContract
};

