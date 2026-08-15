const menuService = require('./menu.service');
const { validationResult } = require('express-validator');

async function getMenuByCategory(req, res, next) {
  try {
    const includeUnavailable = req.query.includeUnavailable === 'true';
    const includePhoto       = req.query.includePhoto === 'true';
    const enforceStock       = req.query.enforceStock === 'true';
    const branchId           = req.query.branchId ? Number(req.query.branchId) : req.user?.branchId;

    const menu = await menuService.getMenuWithCategories({
      includeUnavailable,
      includePhoto,
      enforceStock,
      branchId,
    });
    res.json({ success: true, data: menu });
  } catch (err) {
    next(err);
  }
}

async function getAllItems(req, res, next) {
  try {
    const includeUnavailable = req.query.includeUnavailable === 'true';
    const includePhoto       = req.query.includePhoto === 'true';
    const enforceStock       = req.query.enforceStock === 'true';
    const branchId           = req.query.branchId ? Number(req.query.branchId) : req.user?.branchId;

    const items = await menuService.getAllMenuItems({
      includeUnavailable,
      includePhoto,
      enforceStock,
      branchId,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const item = await menuService.createMenuItem(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const item = await menuService.updateMenuItem(req.params.id, req.body);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function toggleItem(req, res, next) {
  try {
    const item = await menuService.toggleAvailability(req.params.id);
    res.json({
      success: true,
      data: item,
      message: `Item is now ${item.isAvailable ? 'available' : 'unavailable'}.`
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDED — Recipe management controllers

// Returns all ingredients in a menu item's recipe with name, unit, and category.
async function getRecipe(req, res, next) {
  try {
    const data = await menuService.getRecipeForMenuItem(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// Adds one ingredient to the recipe, or updates its quantity if it already exists.
async function upsertRecipeIngredient(req, res, next) {
  try {
    const { ingredientId, quantity } = req.body;
    if (!ingredientId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'ingredientId and quantity are required.',
      });
    }
    const data = await menuService.upsertRecipeIngredient(
      req.params.id,
      { ingredientId, quantity }
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// Removes one ingredient from a menu item's recipe.
async function deleteRecipeIngredient(req, res, next) {
  try {
    await menuService.deleteRecipeIngredient(Number(req.params.id), Number(req.params.ingId));
    res.json({ success: true, message: 'Ingredient removed from recipe.' });
  } catch (err) {
    next(err);
  }
}

// Passing an empty array clears the recipe entirely.
async function setRecipe(req, res, next) {
  try {
    const { ingredients } = req.body;
    if (!Array.isArray(ingredients)) {
      return res.status(400).json({
        success: false,
        message: 'ingredients must be an array.',
      });
    }
    const data = await menuService.setRecipeIngredients(req.params.id, ingredients);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// Checks the current inventory stock for every ingredient in this menu item's
async function checkStock(req, res, next) {
  try {
    // branchId can come from query string or fall back to the user's own branch
    const branchId = req.query.branchId ? Number(req.query.branchId) : req.user?.branchId;
    if (!branchId) {
      return res.status(400).json({ success: false, message: 'branchId is required.' });
    }
    const data = await menuService.checkMenuItemStock(req.params.id, branchId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}


module.exports = {
  getMenuByCategory,
  getAllItems,
  createItem,
  updateItem,
  toggleItem,
  getRecipe,
  upsertRecipeIngredient,
  deleteRecipeIngredient,
  setRecipe,
  checkStock,
};
