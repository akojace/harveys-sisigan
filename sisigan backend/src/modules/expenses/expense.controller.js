// src/modules/expenses/expense.controller.js

const { validationResult } = require('express-validator');
const expenseService = require('./expense.service');

async function createExpense(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const data = await expenseService.createExpense(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getExpenses(req, res, next) {
  try {
    const { branchId, category, from, to, page, limit } = req.query;
    const data = await expenseService.getExpenses(
      { branchId, category, from, to, page, limit },
      req.user
    );
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

async function deleteExpense(req, res, next) {
  try {
    await expenseService.deleteExpense(req.params.id, req.user);
    res.json({ success: true, message: 'Expense deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createExpense,
  getExpenses,
  deleteExpense,
};
