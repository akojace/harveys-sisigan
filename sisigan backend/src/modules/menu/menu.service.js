// src/modules/menu/menu.service.js
// Menu Items, Categories, and Recipe BOM Management with Cost & Profit Metrics

const prisma = require('../../config/db');
const {
  convertQuantity,
  calculateProductRecipeCost,
  roundDecimals,
} = require('../../utils/inventoryCosting');
const { validateBranchAccess } = require('../../middleware/branchScope.middleware');

function photoToDataUri(photoBuffer) {
  if (!photoBuffer) return null;

  let buf;
  if (photoBuffer?.type === 'Buffer' && Array.isArray(photoBuffer.data)) {
    buf = Buffer.from(photoBuffer.data);
  } else if (Buffer.isBuffer(photoBuffer)) {
    buf = photoBuffer;
  } else {
    return `data:image/jpeg;base64,${photoBuffer}`;
  }

  const hex = buf.slice(0, 4).toString('hex');
  const mime = hex.startsWith('ffd8ff')
    ? 'image/jpeg'
    : hex.startsWith('89504e47')
      ? 'image/png'
      : hex.startsWith('47494638')
        ? 'image/gif'
        : hex.startsWith('52494646')
          ? 'image/webp'
          : 'image/jpeg';

  return `data:${mime};base64,${buf.toString('base64')}`;
}

function getMenuItemSelect(includePhoto = false) {
  return {
    id: true,
    name: true,
    description: true,
    price: true,
    imageUrl: true,
    isAvailable: true,
    categoryId: true,
    createdAt: true,
    updatedAt: true,
    ...(includePhoto ? { photo: true } : {}),
  };
}

function serializeItem(item, includePhoto = false) {
  const { photo, ...rest } = item;
  return includePhoto && photo ? { ...rest, photo: photoToDataUri(photo) } : rest;
}

/**
 * Evaluates branch-specific product availability, sellable servings, and limiting ingredient.
 * Formula:
 * Ingredient-Based Possible Servings = FLOOR(Available Stock / (Required Quantity / Yield Factor))
 * Maximum Sellable Product Servings = MIN(Ingredient-Based Possible Servings)
 * Limiting Ingredient = Ingredient with MIN(Ingredient-Based Possible Servings)
 */
async function evaluateBranchProductAvailability(menuItemIds, branchId) {
  if (!menuItemIds || !menuItemIds.length) return new Map();

  const bId = branchId ? Number(branchId) : null;

  // 1. Fetch branch manual toggles if branchId is specified
  const branchOverrides = bId
    ? await prisma.branchMenuItem.findMany({
        where: {
          branchId: bId,
          menuItemId: { in: menuItemIds },
        },
      })
    : [];

  const branchOverrideMap = new Map(branchOverrides.map((bo) => [bo.menuItemId, bo.isAvailable]));

  // 2. Fetch recipes for all menu items
  const recipes = await prisma.menuItemRecipeIngredient.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: {
      ingredient: { select: { id: true, name: true, unit: true, defaultMinThreshold: true } },
      menuItem: { select: { id: true, name: true } },
    },
    orderBy: { ingredient: { name: 'asc' } },
  });

  const recipesByItem = new Map();
  for (const r of recipes) {
    if (!recipesByItem.has(r.menuItemId)) recipesByItem.set(r.menuItemId, []);
    recipesByItem.get(r.menuItemId).push(r);
  }

  // 3. Fetch branch inventory stock if branchId is specified
  let inventoryByIngredient = new Map();
  if (bId) {
    const ingredientIds = [...new Set(recipes.map((r) => r.ingredientId))];
    if (ingredientIds.length > 0) {
      const invRows = await prisma.inventoryItem.findMany({
        where: {
          branchId: bId,
          ingredientId: { in: ingredientIds },
          isActive: true,
        },
        select: { ingredientId: true, quantity: true, minThreshold: true },
      });
      inventoryByIngredient = new Map(invRows.map((row) => [row.ingredientId, row]));
    }
  }

  // 4. Compute per-item availability
  const availabilityMap = new Map();

  for (const itemId of menuItemIds) {
    const itemRecipes = recipesByItem.get(itemId) || [];
    const isBranchEnabled = branchOverrideMap.has(itemId) ? branchOverrideMap.get(itemId) : true;

    // Rule: Missing or empty recipe -> 0 servings, not unlimited!
    if (itemRecipes.length === 0) {
      availabilityMap.set(itemId, {
        branchId: bId,
        menuItemId: itemId,
        menuItemName: null,
        hasRecipe: false,
        isBranchEnabled,
        isStockAvailable: false,
        availableServings: 0,
        maxProducible: 0,
        limitingIngredient: null,
        limitingIngredients: [],
        outOfStockIngredients: [],
        availabilityStatus: 'RECIPE_NOT_CONFIGURED',
        canOrder: false,
        explanation: 'Recipe not configured for this product.',
        ingredients: [],
      });
      continue;
    }

    if (!bId) {
      availabilityMap.set(itemId, {
        branchId: null,
        menuItemId: itemId,
        menuItemName: itemRecipes[0]?.menuItem?.name || null,
        hasRecipe: true,
        isBranchEnabled: true,
        isStockAvailable: false,
        availableServings: 0,
        maxProducible: 0,
        limitingIngredient: null,
        limitingIngredients: [],
        outOfStockIngredients: [],
        availabilityStatus: 'BRANCH_REQUIRED',
        canOrder: false,
        explanation: 'Select a branch to calculate available servings.',
        ingredients: [],
      });
      continue;
    }

    let minServings = Infinity;
    const ingredientAnalysis = [];
    const oosList = [];
    let hasUnitError = false;

    for (const r of itemRecipes) {
      const ingRow = inventoryByIngredient.get(r.ingredientId);
      const currentStock = ingRow ? Number(ingRow.quantity) : 0;
      const minThreshold =
        ingRow && ingRow.minThreshold != null
          ? Number(ingRow.minThreshold)
          : (r.ingredient?.defaultMinThreshold || 0);

      const recipeUnit = r.unit || r.ingredient.unit;
      const baseUnit = r.ingredient.unit;
      const reqRaw = Number(r.quantity) || 0;
      const yf = Number(r.yieldFactor) > 0 ? Number(r.yieldFactor) : 1;

      let baseNeeded = reqRaw;
      let unitError = null;

      try {
        baseNeeded = convertQuantity(reqRaw, recipeUnit, baseUnit);
      } catch (err) {
        unitError = err.message;
        hasUnitError = true;
      }

      // Factor in preparation yield / trimming loss
      const effectiveNeeded = yf > 0 ? baseNeeded / yf : baseNeeded;
      const ratio = effectiveNeeded > 0 ? currentStock / effectiveNeeded : 0;
      const servings =
        !unitError && effectiveNeeded > 0
          ? Math.floor(roundDecimals(ratio, 6))
          : 0;

      if (servings < minServings) {
        minServings = servings;
      }

      let ingStatus = 'OK';
      if (unitError) {
        ingStatus = 'UNIT_ERROR';
      } else if (currentStock < effectiveNeeded) {
        ingStatus = 'OUT_OF_STOCK';
        oosList.push({
          ingredientId: r.ingredientId,
          name: r.ingredient.name,
          unit: baseUnit,
          required: roundDecimals(effectiveNeeded, 3),
          available: roundDecimals(currentStock, 3),
        });
      } else if (currentStock <= minThreshold || servings <= 10) {
        ingStatus = 'LOW_STOCK';
      }

      ingredientAnalysis.push({
        ingredientId: r.ingredientId,
        name: r.ingredient.name,
        unit: baseUnit,
        recipeQuantity: reqRaw,
        recipeUnit,
        inventoryUnit: baseUnit,
        yieldFactor: yf,
        requiredPerServing: roundDecimals(effectiveNeeded, 4),
        required: roundDecimals(effectiveNeeded, 4),
        currentStock: roundDecimals(currentStock, 4),
        possibleServings: servings,
        status: ingStatus,
        unitError,
        isLimiting: false,
      });
    }

    const availableServings = hasUnitError
      ? 0
      : minServings === Infinity
      ? 0
      : Math.max(0, minServings);

    // Identify limiting ingredient(s)
    const limiting = ingredientAnalysis.filter((ing) => ing.possibleServings === availableServings);
    limiting.forEach((ing) => {
      ing.isLimiting = true;
    });

    const primaryLimiting =
      limiting.length > 0
        ? {
            id: limiting[0].ingredientId,
            name: limiting[0].name,
            unit: limiting[0].unit,
            required: limiting[0].requiredPerServing,
            currentStock: limiting[0].currentStock,
            possibleServings: limiting[0].possibleServings,
          }
        : null;

    let overallStatus = 'AVAILABLE';
    if (!isBranchEnabled) {
      overallStatus = 'BRANCH_DISABLED';
    } else if (hasUnitError) {
      overallStatus = 'INVALID_RECIPE_UNIT';
    } else if (availableServings <= 0) {
      overallStatus = 'OUT_OF_STOCK';
    } else if (availableServings <= 10) {
      overallStatus = 'LOW_STOCK';
    }

    const isStockAvailable = availableServings > 0 && !hasUnitError;
    const canOrder = isBranchEnabled && isStockAvailable;

    availabilityMap.set(itemId, {
      branchId: bId,
      menuItemId: itemId,
      menuItemName: itemRecipes[0]?.menuItem?.name || null,
      hasRecipe: true,
      isBranchEnabled,
      isStockAvailable,
      availableServings,
      maxProducible: availableServings,
      limitingIngredient: primaryLimiting,
      limitingIngredients: limiting.map((l) => ({
        id: l.ingredientId,
        name: l.name,
        unit: l.unit,
        required: l.requiredPerServing,
        currentStock: l.currentStock,
        possibleServings: l.possibleServings,
      })),
      outOfStockIngredients: oosList,
      availabilityStatus: overallStatus,
      canOrder,
      ingredients: ingredientAnalysis,
    });
  }

  return availabilityMap;
}

async function getOutOfStockMenuItemIds(menuItemIds, branchId) {
  if (!branchId || !menuItemIds.length) return new Set();
  const map = await evaluateBranchProductAvailability(menuItemIds, branchId);
  const blocked = new Set();
  for (const [id, info] of map.entries()) {
    if (!info.isBranchEnabled || !info.isStockAvailable) {
      blocked.add(id);
    }
  }
  return blocked;
}

async function getMenuWithCategories({
  includeUnavailable,
  includePhoto = false,
  enforceStock = false,
  branchId = null,
}) {
  const rawMenu = await prisma.category.findMany({
    include: {
      items: {
        select: getMenuItemSelect(includePhoto),
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const allItemIds = rawMenu.flatMap((category) => category.items.map((item) => item.id));
  const availabilityMap = await evaluateBranchProductAvailability(allItemIds, branchId);

  return rawMenu.map((category) => {
    const { items: menuItems, ...categoryRest } = category;

    const decoratedItems = menuItems.map((item) => {
      const avail = availabilityMap.get(item.id) || {
        isBranchEnabled: true,
        isStockAvailable: false,
        availableServings: 0,
        maxProducible: 0,
        hasRecipe: false,
        limitingIngredient: null,
        outOfStockIngredients: [],
        availabilityStatus: 'RECIPE_NOT_CONFIGURED',
      };

      const globalActive = Boolean(item.isAvailable);
      const effectiveAvailable = globalActive && avail.isBranchEnabled && avail.isStockAvailable;

      let status = avail.availabilityStatus;
      if (!globalActive) status = 'GLOBALLY_DISABLED';

      return {
        ...serializeItem(item, includePhoto),
        isAvailable: effectiveAvailable,
        isGloballyAvailable: globalActive,
        isBranchEnabled: avail.isBranchEnabled,
        isStockAvailable: avail.isStockAvailable,
        availableServings: avail.availableServings,
        maxProducible: avail.availableServings,
        limitingIngredient: avail.limitingIngredient,
        hasRecipe: avail.hasRecipe,
        availabilityStatus: status,
        outOfStockIngredients: avail.outOfStockIngredients,
        ingredients: avail.ingredients || [],
        branchId: branchId ? Number(branchId) : null,
      };
    });

    const filtered = decoratedItems.filter((item) => {
      if (enforceStock) return item.isAvailable;
      if (includeUnavailable) return true;
      return item.isGloballyAvailable && item.isBranchEnabled;
    });

    return {
      ...categoryRest,
      items: filtered,
    };
  });
}

async function getAllMenuItems({
  includeUnavailable,
  includePhoto = false,
  enforceStock = false,
  branchId = null,
}) {
  const rawItems = await prisma.menuItem.findMany({
    select: {
      ...getMenuItemSelect(includePhoto),
      category: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  const allItemIds = rawItems.map((item) => item.id);
  const availabilityMap = await evaluateBranchProductAvailability(allItemIds, branchId);

  const decoratedItems = rawItems.map((item) => {
    const avail = availabilityMap.get(item.id) || {
      isBranchEnabled: true,
      isStockAvailable: false,
      availableServings: 0,
      maxProducible: 0,
      hasRecipe: false,
      limitingIngredient: null,
      outOfStockIngredients: [],
      availabilityStatus: 'RECIPE_NOT_CONFIGURED',
    };

    const globalActive = Boolean(item.isAvailable);
    const effectiveAvailable = globalActive && avail.isBranchEnabled && avail.isStockAvailable;

    let status = avail.availabilityStatus;
    if (!globalActive) status = 'GLOBALLY_DISABLED';

    return {
      ...serializeItem(item, includePhoto),
      isAvailable: effectiveAvailable,
      isGloballyAvailable: globalActive,
      isBranchEnabled: avail.isBranchEnabled,
      isStockAvailable: avail.isStockAvailable,
      availableServings: avail.availableServings,
      maxProducible: avail.availableServings,
      limitingIngredient: avail.limitingIngredient,
      hasRecipe: avail.hasRecipe,
      availabilityStatus: status,
      outOfStockIngredients: avail.outOfStockIngredients,
      branchId: branchId ? Number(branchId) : null,
    };
  });

  return decoratedItems.filter((item) => {
    if (enforceStock) return item.isAvailable;
    if (includeUnavailable) return true;
    return item.isGloballyAvailable && item.isBranchEnabled;
  });
}

async function createMenuItem({ name, description, price, imageUrl, categoryId, photo }) {
  const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
  if (!category) throw { statusCode: 404, message: 'Category not found.' };

  const photoBuffer = photo
    ? Buffer.isBuffer(photo)
      ? photo
      : Buffer.from(photo, 'base64')
    : null;

  return prisma.menuItem.create({
    data: {
      name,
      description,
      price: Number(price),
      imageUrl,
      categoryId: Number(categoryId),
      photo: photoBuffer,
    },
    include: { category: { select: { id: true, name: true } } },
  });
}

async function updateMenuItem(id, data) {
  const item = await prisma.menuItem.findUnique({
    where: { id: Number(id) },
    select: { id: true, name: true, isAvailable: true },
  });
  if (!item) throw { statusCode: 404, message: 'Menu item not found.' };

  const photoBuffer = data.photo !== undefined
    ? data.photo
      ? Buffer.isBuffer(data.photo)
        ? data.photo
        : Buffer.from(data.photo, 'base64')
      : null
    : undefined;

  return prisma.menuItem.update({
    where: { id: Number(id) },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.price && { price: Number(data.price) }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.categoryId && { categoryId: Number(data.categoryId) }),
      ...(photoBuffer !== undefined && { photo: photoBuffer }),
    },
    include: { category: { select: { id: true, name: true } } },
  });
}

async function toggleAvailability(id, { branchId = null, global = false } = {}, requestingUser = null) {
  const item = await prisma.menuItem.findUnique({
    where: { id: Number(id) },
    select: { id: true, name: true, isAvailable: true },
  });
  if (!item) throw { statusCode: 404, message: 'Menu item not found.' };

  // If explicitly requested as global toggle (Owner only) or if no branch is scoped for an Owner
  if (global || (!branchId && requestingUser?.role === 'OWNER')) {
    const updated = await prisma.menuItem.update({
      where: { id: Number(id) },
      data: { isAvailable: !item.isAvailable },
    });
    return {
      id: updated.id,
      name: updated.name,
      isAvailable: updated.isAvailable,
      isGloballyAvailable: updated.isAvailable,
      scope: 'GLOBAL',
      message: `Menu item "${updated.name}" is now globally ${updated.isAvailable ? 'available' : 'disabled'}.`,
    };
  }

  // Branch-specific toggle
  const targetBranchId = requestingUser && requestingUser.role !== 'OWNER'
    ? Number(requestingUser.branchId)
    : Number(branchId || requestingUser?.branchId);

  if (!targetBranchId) {
    throw { statusCode: 400, message: 'branchId is required for branch-specific toggle.' };
  }

  const existing = await prisma.branchMenuItem.findUnique({
    where: {
      branchId_menuItemId: {
        branchId: targetBranchId,
        menuItemId: Number(id),
      },
    },
  });

  const nextVal = existing ? !existing.isAvailable : false;

  const record = await prisma.branchMenuItem.upsert({
    where: {
      branchId_menuItemId: {
        branchId: targetBranchId,
        menuItemId: Number(id),
      },
    },
    update: { isAvailable: nextVal },
    create: {
      branchId: targetBranchId,
      menuItemId: Number(id),
      isAvailable: nextVal,
    },
  });

  return {
    id: Number(id),
    name: item.name,
    branchId: targetBranchId,
    isAvailable: record.isAvailable && item.isAvailable,
    isBranchEnabled: record.isAvailable,
    isGloballyAvailable: item.isAvailable,
    scope: 'BRANCH',
    message: `Menu item "${item.name}" is now ${record.isAvailable ? 'enabled' : 'disabled'} for branch #${targetBranchId}.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe management functions with Costing & Profit Margins

async function getRecipeForMenuItem(menuItemId, branchId = null) {
  const item = await prisma.menuItem.findUnique({
    where: { id: Number(menuItemId) },
    select: {
      id: true,
      name: true,
      price: true,
      recipes: {
        include: {
          ingredient: {
            select: {
              id: true,
              name: true,
              unit: true,
              category: true,
              defaultPrice: true,
              yieldPercentage: true,
              inventory: {
                select: { branchId: true, price: true, quantity: true },
              },
            },
          },
        },
        orderBy: { ingredient: { name: 'asc' } },
      },
    },
  });

  if (!item) throw { statusCode: 404, message: 'Menu item not found.' };

  const costResult = calculateProductRecipeCost(item.recipes, branchId);
  const sellingPrice = Number(item.price);
  const totalCost = costResult.totalCost;
  const grossProfit = roundDecimals(sellingPrice - totalCost, 2);
  const grossProfitMargin =
    sellingPrice > 0 ? roundDecimals((grossProfit / sellingPrice) * 100, 2) : 0;

  const rows = item.recipes.map((r) => {
    const breakdown = costResult.lineBreakdown.find((b) => b.ingredientId === r.ingredientId);
    return {
      id: r.id,
      ingredientId: r.ingredientId,
      ingredientName: r.ingredient.name,
      quantity: Number(r.quantity),
      unit: r.unit || r.ingredient.unit,
      inventoryUnit: r.ingredient.unit,
      yieldFactor: Number(r.yieldFactor) || 1,
      unitCost: breakdown?.unitCost ?? null,
      lineCost: breakdown?.lineCost ?? null,
      costKnown: breakdown?.costKnown ?? false,
    };
  });

  rows.costMetrics = {
    totalCost,
    costKnown: costResult.costKnown,
    grossProfit,
    grossProfitMargin,
    sellingPrice,
  };
  rows.menuItem = {
    id: item.id,
    name: item.name,
    price: sellingPrice,
  };
  rows.recipe = rows;

  return rows;
}

async function upsertRecipeIngredient(menuItemId, { ingredientId, quantity, unit, yieldFactor = 1.00 }) {
  const item = await prisma.menuItem.findUnique({
    where: { id: Number(menuItemId) },
    select: { id: true },
  });
  if (!item) throw { statusCode: 404, message: 'Menu item not found.' };

  const ingredient = await prisma.ingredient.findUnique({ where: { id: Number(ingredientId) } });
  if (!ingredient) throw { statusCode: 404, message: 'Ingredient not found.' };

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty <= 0) {
    throw { statusCode: 400, message: 'Quantity must be greater than 0.' };
  }

  const recipeUnit = unit || ingredient.unit;
  // Test unit compatibility
  try {
    convertQuantity(qty, recipeUnit, ingredient.unit);
  } catch (err) {
    throw { statusCode: 400, message: `Recipe unit incompatible with ingredient: ${err.message}` };
  }

  const yf = Math.max(0.01, Math.min(Number(yieldFactor) || 1, 1));

  return prisma.menuItemRecipeIngredient.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId:   Number(menuItemId),
        ingredientId: Number(ingredientId),
      },
    },
    update: {
      quantity: qty,
      unit: recipeUnit,
      yieldFactor: yf,
    },
    create: {
      menuItemId:   Number(menuItemId),
      ingredientId: Number(ingredientId),
      quantity:     qty,
      unit:         recipeUnit,
      yieldFactor:  yf,
    },
    include: {
      ingredient: { select: { id: true, name: true, unit: true, category: true, defaultPrice: true } },
    },
  });
}

async function deleteRecipeIngredient(menuItemId, ingredientId) {
  const existing = await prisma.menuItemRecipeIngredient.findUnique({
    where: {
      menuItemId_ingredientId: {
        menuItemId:   Number(menuItemId),
        ingredientId: Number(ingredientId),
      },
    },
  });
  if (!existing) throw { statusCode: 404, message: 'Recipe ingredient not found.' };

  return prisma.menuItemRecipeIngredient.delete({
    where: {
      menuItemId_ingredientId: {
        menuItemId:   Number(menuItemId),
        ingredientId: Number(ingredientId),
      },
    },
  });
}

async function setRecipeIngredients(menuItemId, ingredients) {
  const item = await prisma.menuItem.findUnique({
    where: { id: Number(menuItemId) },
    select: { id: true },
  });
  if (!item) throw { statusCode: 404, message: 'Menu item not found.' };

  return prisma.$transaction(async (tx) => {
    await tx.menuItemRecipeIngredient.deleteMany({
      where: { menuItemId: Number(menuItemId) },
    });

    if (!ingredients || !ingredients.length) return [];

    const rows = [];
    for (const ing of ingredients) {
      const ingredient = await tx.ingredient.findUnique({
        where: { id: Number(ing.ingredientId) },
      });
      if (!ingredient) {
        throw { statusCode: 400, message: `Ingredient ID ${ing.ingredientId} not found.` };
      }

      const qty = Number(ing.quantity);
      if (Number.isNaN(qty) || qty <= 0) {
        throw { statusCode: 400, message: `Invalid quantity for ingredient "${ingredient.name}".` };
      }

      const recipeUnit = ing.unit || ingredient.unit;
      convertQuantity(qty, recipeUnit, ingredient.unit);

      const yf = Math.max(0.01, Math.min(Number(ing.yieldFactor) || 1, 1));

      const row = await tx.menuItemRecipeIngredient.create({
        data: {
          menuItemId:   Number(menuItemId),
          ingredientId: Number(ing.ingredientId),
          quantity:     qty,
          unit:         recipeUnit,
          yieldFactor:  yf,
        },
        include: {
          ingredient: { select: { id: true, name: true, unit: true, category: true, defaultPrice: true } },
        },
      });
      rows.push(row);
    }

    return rows;
  });
}

async function checkMenuItemStock(menuItemId, branchId) {
  const mId = Number(menuItemId);
  const bId = Number(branchId);

  const item = await prisma.menuItem.findUnique({
    where: { id: mId },
    select: {
      id: true,
      name: true,
      price: true,
      isAvailable: true,
      category: { select: { id: true, name: true } },
    },
  });

  if (!item) {
    throw { statusCode: 404, message: 'Menu item not found.' };
  }

  const map = await evaluateBranchProductAvailability([mId], bId);
  const info = map.get(mId) || {
    hasRecipe: false,
    canOrder: false,
    isBranchEnabled: true,
    isStockAvailable: false,
    availableServings: 0,
    maxProducible: 0,
    limitingIngredient: null,
    limitingIngredients: [],
    outOfStockIngredients: [],
    availabilityStatus: 'RECIPE_NOT_CONFIGURED',
    ingredients: [],
  };

  const globalActive = Boolean(item.isAvailable);
  const canOrder = globalActive && info.canOrder;

  let finalStatus = info.availabilityStatus;
  if (!globalActive) finalStatus = 'GLOBALLY_DISABLED';

  return {
    menuItemId: mId,
    menuItemName: item.name,
    branchId: bId,
    price: Number(item.price),
    category: item.category?.name || 'Uncategorized',
    isGloballyAvailable: globalActive,
    hasRecipe: info.hasRecipe,
    canOrder,
    isBranchEnabled: info.isBranchEnabled,
    isStockAvailable: info.isStockAvailable,
    availableServings: info.availableServings,
    maxProducible: info.maxProducible,
    limitingIngredient: info.limitingIngredient,
    limitingIngredients: info.limitingIngredients,
    outOfStockIngredients: info.outOfStockIngredients,
    status: finalStatus,
    ingredients: info.ingredients,
  };
}

/**
 * Returns comprehensive availability breakdown for a single menu item.
 * - If branchId is specified (or for Cashier/Manager): returns detailed breakdown for that branch.
 * - If Admin (OWNER) and no branchId: returns side-by-side branch comparison across all active branches!
 */
async function getMenuItemAvailability(menuItemId, requestingUser, { branchId = null } = {}) {
  const mId = Number(menuItemId);
  const item = await prisma.menuItem.findUnique({
    where: { id: mId },
    select: {
      id: true,
      name: true,
      price: true,
      isAvailable: true,
      category: { select: { id: true, name: true } },
    },
  });

  if (!item) {
    throw { statusCode: 404, message: 'Menu item not found.' };
  }

  const globalActive = Boolean(item.isAvailable);

  const scopedBranchId = requestingUser
    ? validateBranchAccess(requestingUser, branchId)
    : (branchId != null && branchId !== '' ? Number(branchId) : null);

  if (scopedBranchId != null) {
    const branch = await prisma.branch.findUnique({
      where: { id: scopedBranchId },
      select: { id: true, name: true, city: true },
    });
    if (!branch) throw { statusCode: 404, message: 'Branch not found.' };

    const branchStock = await checkMenuItemStock(mId, scopedBranchId);
    return {
      isComparison: false,
      menuItemId: mId,
      menuItemName: item.name,
      category: item.category?.name || 'Uncategorized',
      price: Number(item.price),
      isGloballyAvailable: globalActive,
      branch: {
        branchId: branch.id,
        branchName: branch.name,
        city: branch.city,
        ...branchStock,
      },
    };
  }

  // Admin / OWNER viewing all active branches
  const activeBranches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true, city: true },
    orderBy: { id: 'asc' },
  });

  const branchResults = await Promise.all(
    activeBranches.map(async (b) => {
      const stock = await checkMenuItemStock(mId, b.id);
      return {
        branchId: b.id,
        branchName: b.name,
        city: b.city,
        ...stock,
      };
    })
  );

  return {
    isComparison: true,
    menuItemId: mId,
    menuItemName: item.name,
    category: item.category?.name || 'Uncategorized',
    price: Number(item.price),
    isGloballyAvailable: globalActive,
    branches: branchResults,
  };
}

/**
 * Returns complete product availability matrix across all products and active branches (for Admin).
 */
async function getMenuAvailabilityMatrix(requestingUser) {
  const [activeBranches, categories] = await Promise.all([
    prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, city: true },
      orderBy: { id: 'asc' },
    }),
    prisma.category.findMany({
      include: {
        items: {
          select: { id: true, name: true, price: true, isAvailable: true, categoryId: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const allItems = categories.flatMap((c) =>
    c.items.map((it) => ({
      ...it,
      categoryName: c.name,
    }))
  );
  const allItemIds = allItems.map((i) => i.id);

  // For each branch, evaluate availability
  const branchEvaluations = new Map();
  for (const b of activeBranches) {
    const evalMap = await evaluateBranchProductAvailability(allItemIds, b.id);
    branchEvaluations.set(b.id, evalMap);
  }

  const matrix = allItems.map((item) => {
    const branchAvailability = {};
    for (const b of activeBranches) {
      const evalMap = branchEvaluations.get(b.id);
      const info = evalMap?.get(item.id);
      const globalActive = Boolean(item.isAvailable);

      let finalStatus = info?.availabilityStatus || 'OUT_OF_STOCK';
      if (!globalActive) finalStatus = 'GLOBALLY_DISABLED';

      branchAvailability[b.id] = {
        branchId: b.id,
        branchName: b.name,
        city: b.city,
        availableServings: info?.availableServings ?? 0,
        limitingIngredient: info?.limitingIngredient || null,
        status: finalStatus,
        canOrder: globalActive && (info?.canOrder || false),
        hasRecipe: info?.hasRecipe || false,
      };
    }

    return {
      id: item.id,
      name: item.name,
      category: item.categoryName,
      price: Number(item.price),
      isGloballyAvailable: Boolean(item.isAvailable),
      branchAvailability,
    };
  });

  return {
    branches: activeBranches,
    matrix,
  };
}

module.exports = {
  getMenuWithCategories,
  getAllMenuItems,
  createMenuItem,
  updateMenuItem,
  toggleAvailability,
  getRecipeForMenuItem,
  upsertRecipeIngredient,
  deleteRecipeIngredient,
  setRecipeIngredients,
  checkMenuItemStock,
  getMenuItemAvailability,
  getMenuAvailabilityMatrix,
  evaluateBranchProductAvailability,
};
