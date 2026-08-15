// src/modules/reports/report.controller.js

const reportService = require('./report.service');

async function getReports(req, res, next) {
  try {
    const { branchId, period, from, to } = req.query;
    const data = await reportService.getUsageReport(
      { branchId, period, from, to },
      req.user
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getReports };
