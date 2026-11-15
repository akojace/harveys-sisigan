// src/modules/branches/branch.controller.js
const { validationResult } = require('express-validator');
const branchService = require('./branch.service');

async function list(req, res, next) {
  try {
    const branches = await branchService.listBranches();
    res.json({ success: true, data: branches });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const branch = await branchService.createBranch(req.body);
    res.status(201).json({ success: true, data: branch });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const branch = await branchService.updateBranch(req.params.id, req.body);
    res.json({ success: true, data: branch });
  } catch (err) { next(err); }
}

async function toggle(req, res, next) {
  try {
    const branch = await branchService.toggleBranch(req.params.id);
    res.json({ success: true, data: branch });
  } catch (err) { next(err); }
}

async function dependencies(req, res, next) {
  try {
    const data = await branchService.getBranchDependencies(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const reassignOwnerToBranchId =
      req.body?.reassignOwnerToBranchId ?? req.query?.reassignOwnerToBranchId;
    const data = await branchService.deleteBranch(req.params.id, req.user, {
      reassignOwnerToBranchId,
    });
    res.json({
      success: true,
      message: 'Branch and associated records permanently deleted.',
      deletedBranch: data.deletedBranch,
      deletedRecords: data.deletedRecords,
      data,
    });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, toggle, dependencies, remove };
