// src/modules/users/user.controller.js
const { validationResult } = require('express-validator');
const userService = require('./user.service');

async function list(req, res, next) {
  try {
    const users = await userService.listUsers({ requestingUser: req.user });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const user = await userService.createUser(req.body, req.user);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const result = await userService.resetPassword(req.params.id, req.body.newPassword, req.user);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function toggleActive(req, res, next) {
  try {
    const result = await userService.toggleActive(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, resetPassword, toggleActive };