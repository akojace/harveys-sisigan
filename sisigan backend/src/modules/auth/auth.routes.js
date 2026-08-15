// src/modules/auth/auth.routes.js - UPDATED

const express = require('express');
const { body } = require('express-validator');
const authController = require('./auth.controller');
const authMiddleware = require('../../middleware/auth.middleware');

const router = express.Router();

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  authController.login
);

// GET /api/auth/me  (protected)
router.get('/me', authMiddleware, authController.me);
router.post('/logout', authMiddleware, authController.logout);

// NEW - Password Reset Routes
// POST /api/auth/forgot-password
// Request a password reset by providing email
router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Valid email is required.'),
  ],
  authController.forgotPassword
);

// POST /api/auth/verify-reset-code
// Verify the reset code sent to email
router.post(
  '/verify-reset-code',
  [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('code').notEmpty().withMessage('Verification code is required.'),
  ],
  authController.verifyResetCode
);

// POST /api/auth/reset-password
// Complete the password reset with new password
router.post(
  '/reset-password',
  [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('code').notEmpty().withMessage('Verification code is required.'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long.'),
  ],
  authController.resetPassword
);

module.exports = router;