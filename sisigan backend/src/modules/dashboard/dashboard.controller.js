// src/modules/dashboard/dashboard.controller.js
const dashboardService = require('./dashboard.service');

async function getDashboard(req, res, next) {
  try {
    const { period, from, to, branchId } = req.query;
    const data = await dashboardService.getDashboard(
      { period, from, to, branchId },
      req.user
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getBranches(req, res, next) {
  try {
    const branches = await dashboardService.getBranches();
    res.json({ success: true, data: branches });
  } catch (err) { next(err); }
}

async function getAuthLogs(req, res, next) {
  try {
    const { period, from, to, branchId, limit } = req.query;
    const logs = await dashboardService.getAuthLogs(
      { period, from, to, branchId, limit },
      req.user
    );
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
}

module.exports = { getDashboard, getBranches, getAuthLogs };
