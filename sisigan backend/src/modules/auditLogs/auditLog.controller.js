// src/modules/auditLogs/auditLog.controller.js

const inventoryService = require('../inventory/inventory.service');

async function getAuditLogs(req, res, next) {
  try {
    const { branchId, actionType, from, to, limit } = req.query;
    const data = await inventoryService.getAuditLogs(
      { branchId, actionType, from, to, limit },
      req.user
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAuditLogs };
