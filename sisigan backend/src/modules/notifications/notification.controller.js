// src/modules/notifications/notification.controller.js
const notificationService = require('./notification.service');
const { validateBranchAccess } = require('../../middleware/branchScope.middleware');

async function getNotifications(req, res, next) {
  try {
    const { severity, unreadOnly, resolved, limit, branchId } = req.query;
    const scopedBranchId = branchId ? validateBranchAccess(req.user, branchId) : undefined;
    const data = await notificationService.getUserNotifications(req.user, {
      severity,
      unreadOnly: unreadOnly === 'true',
      resolved,
      limit,
      branchId: scopedBranchId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const { branchId } = req.query;
    const scopedBranchId = branchId ? validateBranchAccess(req.user, branchId) : undefined;
    const data = await notificationService.getInventoryAlertSummary(req.user, {
      branchId: scopedBranchId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const updated = await notificationService.markNotificationAsRead(req.params.id, req.user.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    const result = await notificationService.markAllNotificationsAsRead(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  getSummary,
  markAsRead,
  markAllAsRead,
};
