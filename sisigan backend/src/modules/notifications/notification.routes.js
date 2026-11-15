// src/modules/notifications/notification.routes.js
const express = require('express');
const notificationController = require('./notification.controller');
const authMiddleware = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', notificationController.getNotifications);
router.get('/summary', notificationController.getSummary);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
