// src/modules/inventory/inventory.controller.js

const { validationResult } = require('express-validator');
const inventoryService = require('./inventory.service');

async function getInventory(req, res, next) {
  try {
    const { branchId, lowOnly, search } = req.query;
    const data = await inventoryService.getInventory(
      {
        branchId,
        lowOnly: String(lowOnly).toLowerCase() === 'true',
        search: search || '',
      },
      req.user
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function patchInventory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { quantity, note } = req.body;
    const data = await inventoryService.updateInventoryItem(
      req.params.id,
      { quantity, note },
      req.user
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createInventory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const data = await inventoryService.createInventoryItem(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getInventory, patchInventory, createInventory };
