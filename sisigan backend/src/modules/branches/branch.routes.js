// src/modules/branches/branch.routes.js
const express = require('express');
const { body } = require('express-validator');
const branchController = require('./branch.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();
router.use(authMiddleware);
router.use(roleMiddleware('OWNER'));  // Owner only

const createValidation = [
  body('name').notEmpty().trim().withMessage('Branch name is required.'),
  body('address').notEmpty().trim().withMessage('Address is required.'),
  body('city').notEmpty().trim().withMessage('City is required.'),
  body('contactNo').optional().isString().trim(),
];

// GET    /api/branches         — list all branches
router.get('/',           branchController.list);

// POST   /api/branches         — create new branch
router.post('/',          createValidation, branchController.create);

// PATCH  /api/branches/:id     — edit branch details
router.patch('/:id',      branchController.update);

// PATCH  /api/branches/:id/toggle — activate / deactivate
router.patch('/:id/toggle', branchController.toggle);

module.exports = router;
