// src/modules/menu/menu.routes.js

const express = require('express');
const { body } = require('express-validator');
const menuController = require('./menu.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const router = express.Router();

router.use(authMiddleware);

const itemValidation = [
  body('name').notEmpty().withMessage('Name is required.'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number.'),
  body('categoryId').isInt({ min: 1 }).withMessage('Valid categoryId is required.'),
];

// GET  /api/menu/categories  - Menu grouped by category (for Flutter POS screen)
router.get('/categories', menuController.getMenuByCategory);

// GET  /api/menu             - Flat list of all items
router.get('/', menuController.getAllItems);

// POST /api/menu             - Add item (OWNER/MANAGER)
router.post('/', roleMiddleware('OWNER', 'MANAGER'), itemValidation, menuController.createItem);

// PATCH /api/menu/:id        - Edit item
router.patch('/:id', roleMiddleware('OWNER', 'MANAGER'), menuController.updateItem);

// PATCH /api/menu/:id/toggle - Toggle availability (86'd item)
router.patch('/:id/toggle', roleMiddleware('OWNER', 'MANAGER'), menuController.toggleItem);

// ─────────────────────────────────────────────────────────────────────────────
// ADDED — Recipe management routes

// GET /api/menu/:id/recipe - Returns all recipe ingredients for one menu item.
router.get('/:id/recipe', menuController.getRecipe);

// POST /api/menu/:id/recipe  { ingredientId, quantity } - Adds one ingredient to the recipe, or updates its quantity if it already exists.
router.post('/:id/recipe', roleMiddleware('OWNER', 'MANAGER'), menuController.upsertRecipeIngredient);

// PUT /api/menu/:id/recipe  { ingredients: [ { ingredientId, quantity } ] } - Bulk-replaces the entire recipe atomically.
router.put('/:id/recipe', roleMiddleware('OWNER', 'MANAGER'), menuController.setRecipe);  

// DELETE /api/menu/:id/recipe/:ingId - Removes one ingredient from the recipe.
router.delete('/:id/recipe/:ingId', roleMiddleware('OWNER', 'MANAGER'), menuController.deleteRecipeIngredient);

// GET /api/menu/:id/stock-check?branchId= - Checks if the menu item can be made with current inventory in the specified branch.
router.get('/:id/stock-check', menuController.checkStock);


module.exports = router;
