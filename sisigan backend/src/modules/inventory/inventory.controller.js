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

async function patchInventoryDetails(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { category, unit, price, minThreshold, consumptionRateDays, consumptionLabel, dailyDeductionAmount, yieldPercentage } = req.body;
    const data = await inventoryService.updateIngredientDetails(
      req.params.id,
      { category, unit, price, minThreshold, consumptionRateDays, consumptionLabel, dailyDeductionAmount, yieldPercentage },
      req.user
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function restockInventory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const data = await inventoryService.restockInventoryItem(req.body, req.user);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function adjustInventory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { itemId, newQuantity, actionType, note } = req.body;
    const data = await inventoryService.adjustInventoryItem(
      itemId,
      { newQuantity, actionType, note },
      req.user
    );

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function transferStock(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const data = await inventoryService.transferInventory(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getTransfers(req, res, next) {
  try {
    const { branchId, status, limit } = req.query;
    const data = await inventoryService.getTransfers({ branchId, status, limit }, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function cancelTransfer(req, res, next) {
  try {
    const data = await inventoryService.cancelTransfer(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getInventoryDependencies(req, res, next) {
  try {
    const { branchId } = req.query;
    const data = await inventoryService.getInventoryItemDependencies(
      req.params.id,
      req.user,
      branchId
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function deleteInventory(req, res, next) {
  try {
    const branchId = req.query.branchId ?? req.body?.branchId;
    const data = await inventoryService.deleteInventoryItem(
      req.params.id,
      req.user,
      { branchId }
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getInventory,
  patchInventory,
  patchInventoryDetails,
  createInventory,
  restockInventory,
  adjustInventory,
  transferStock,
  cancelTransfer,
  getTransfers,
  getInventoryDependencies,
  deleteInventory,
};
