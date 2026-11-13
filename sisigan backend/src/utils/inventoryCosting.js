// src/utils/inventoryCosting.js
// Production-grade unit conversions, perpetual weighted-average costing, and recipe costing.

const MASS_UNITS = {
  KG: 1000,
  GRAM: 1,
};

const VOLUME_UNITS = {
  LITER: 1000,
  ML: 1,
  GALLON: 3785.411784,
};

const COUNT_UNITS = ['PCS', 'PACK', 'BAG', 'TUB', 'TANK'];

/**
 * Returns unit category: 'MASS' | 'VOLUME' | 'COUNT' | 'UNKNOWN'
 */
function getUnitDimension(unit) {
  if (!unit) return 'UNKNOWN';
  const u = String(unit).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(MASS_UNITS, u)) return 'MASS';
  if (Object.prototype.hasOwnProperty.call(VOLUME_UNITS, u)) return 'VOLUME';
  if (COUNT_UNITS.includes(u)) return 'COUNT';
  return 'UNKNOWN';
}

/**
 * Converts quantity from fromUnit to toUnit.
 * Throws an informative error if units are incompatible.
 */
function convertQuantity(quantity, fromUnit, toUnit, customPackRatio = null) {
  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty < 0) {
    throw new Error(`Invalid quantity: ${quantity}`);
  }

  const from = String(fromUnit || '').trim().toUpperCase();
  const to = String(toUnit || '').trim().toUpperCase();

  if (from === to) {
    return roundDecimals(qty, 4);
  }

  const dimFrom = getUnitDimension(from);
  const dimTo = getUnitDimension(to);

  // Cross-dimension check
  if (dimFrom === 'UNKNOWN' || dimTo === 'UNKNOWN') {
    throw new Error(`Unsupported measurement unit: "${from}" or "${to}"`);
  }

  if (dimFrom !== dimTo) {
    // Custom ratio override allowed e.g. 1 BAG = 50,000 GRAM
    if (customPackRatio && customPackRatio > 0) {
      if (dimFrom === 'COUNT' && (dimTo === 'MASS' || dimTo === 'VOLUME')) {
        return roundDecimals(qty * customPackRatio, 4);
      }
      if ((dimFrom === 'MASS' || dimFrom === 'VOLUME') && dimTo === 'COUNT') {
        return roundDecimals(qty / customPackRatio, 4);
      }
    }
    throw new Error(
      `Incompatible unit conversion: Cannot convert ${from} (${dimFrom}) to ${to} (${dimTo}). Units must share the same measurement dimension.`
    );
  }

  // MASS conversions (base: GRAM)
  if (dimFrom === 'MASS') {
    const qtyGrams = qty * MASS_UNITS[from];
    const targetQty = qtyGrams / MASS_UNITS[to];
    return roundDecimals(targetQty, 4);
  }

  // VOLUME conversions (base: ML)
  if (dimFrom === 'VOLUME') {
    const qtyMl = qty * VOLUME_UNITS[from];
    const targetQty = qtyMl / VOLUME_UNITS[to];
    return roundDecimals(targetQty, 4);
  }

  // COUNT units (PCS, PACK, BAG, TUB, TANK) without matching unit or ratio cannot be arbitrarily converted
  if (customPackRatio && customPackRatio > 0) {
    return roundDecimals(qty * customPackRatio, 4);
  }

  throw new Error(`Direct conversion between count units "${from}" and "${to}" requires an explicit pack size.`);
}

/**
 * Perpetual Weighted-Average Cost calculation.
 * 
 * Formula:
 * Usable New Quantity = purchaseQuantity * (yieldPercentage / 100)
 * Effective Cost per Usable Unit = purchaseCost / Usable New Quantity
 * 
 * If existingQuantity <= 0:
 *   New Average Cost = Effective Cost per Usable Unit
 * Else:
 *   Existing Value = existingQuantity * existingAvgCost
 *   Total Value = Existing Value + purchaseCost
 *   Total Quantity = existingQuantity + Usable New Quantity
 *   New Average Cost = Total Value / Total Quantity
 */
function calculateWeightedAverageCost({
  existingQuantity = 0,
  existingAvgCost = 0,
  purchaseQuantity,
  purchaseCost,
  yieldPercentage = 100,
}) {
  const exQty = Math.max(0, Number(existingQuantity) || 0);
  const exCost = Number(existingAvgCost) > 0 ? Number(existingAvgCost) : 0;
  const pQty = Number(purchaseQuantity);
  const pCost = Number(purchaseCost);
  const yieldPct = Math.max(1, Math.min(Number(yieldPercentage) || 100, 100));

  if (Number.isNaN(pQty) || pQty <= 0) {
    throw new Error('Purchase quantity must be a positive number.');
  }
  if (Number.isNaN(pCost) || pCost < 0) {
    throw new Error('Purchase cost must be a non-negative number.');
  }

  const usablePurchaseQuantity = pQty * (yieldPct / 100);
  const newPurchaseUnitCost = pCost / usablePurchaseQuantity;

  if (exQty <= 0 || exCost <= 0) {
    const finalUnitCost = roundDecimals(newPurchaseUnitCost, 4);
    const finalQuantity = roundDecimals(usablePurchaseQuantity, 4);
    const finalValue = roundDecimals(finalQuantity * finalUnitCost, 2);
    return {
      newQuantity: finalQuantity,
      newAverageCost: finalUnitCost,
      inventoryValue: finalValue,
      usablePurchaseQuantity,
      effectivePurchaseUnitCost: finalUnitCost,
    };
  }

  const existingValue = exQty * exCost;
  const totalValue = existingValue + pCost;
  const totalQuantity = exQty + usablePurchaseQuantity;
  const newAverageCost = totalValue / totalQuantity;

  return {
    newQuantity: roundDecimals(totalQuantity, 4),
    newAverageCost: roundDecimals(newAverageCost, 4),
    inventoryValue: roundDecimals(totalValue, 2),
    usablePurchaseQuantity: roundDecimals(usablePurchaseQuantity, 4),
    effectivePurchaseUnitCost: roundDecimals(newPurchaseUnitCost, 4),
  };
}

/**
 * Calculates recipe cost for a single menu item based on provided recipes and ingredient costs.
 * 
 * @param {Array} recipes - Array of recipe rows with ingredient details:
 *    { quantity, unit?, yieldFactor?, ingredient: { unit, defaultPrice, inventory: [{ price, branchId }] } }
 * @param {number|null} branchId - Scoped branch id (optional)
 * @returns {{ totalCost: number, costKnown: boolean, lineBreakdown: Array }}
 */
function calculateProductRecipeCost(recipes, branchId = null) {
  if (!Array.isArray(recipes) || recipes.length === 0) {
    return {
      totalCost: 0,
      costKnown: false,
      missingReason: 'No recipe configured',
      lineBreakdown: [],
    };
  }

  let totalCost = 0;
  let allKnown = true;
  const lineBreakdown = [];

  for (const r of recipes) {
    const ing = r.ingredient;
    if (!ing) {
      allKnown = false;
      continue;
    }

    // Resolve branch-specific price or fallback to ingredient defaultPrice
    let unitCost = null;
    if (branchId && Array.isArray(ing.inventory)) {
      const branchStock = ing.inventory.find((inv) => inv.branchId === Number(branchId));
      if (branchStock && branchStock.price != null && Number(branchStock.price) > 0) {
        unitCost = Number(branchStock.price);
      }
    }

    if (unitCost == null && ing.defaultPrice != null && Number(ing.defaultPrice) > 0) {
      unitCost = Number(ing.defaultPrice);
    }

    const recipeUnit = r.unit || ing.unit;
    const inventoryUnit = ing.unit;
    const reqQty = Number(r.quantity) || 0;
    const yieldFactor = Number(r.yieldFactor) > 0 ? Number(r.yieldFactor) : 1;

    let convertedQty = reqQty;
    let unitError = null;
    try {
      convertedQty = convertQuantity(reqQty, recipeUnit, inventoryUnit);
    } catch (err) {
      unitError = err.message;
      allKnown = false;
    }

    // Effective required quantity factoring in yield/waste (e.g. 100g raw / 0.9 yield = 111.11g required)
    const effectiveQty = yieldFactor > 0 ? convertedQty / yieldFactor : convertedQty;

    let lineCost = 0;
    if (unitCost != null && !unitError) {
      lineCost = effectiveQty * unitCost;
      totalCost += lineCost;
    } else {
      allKnown = false;
    }

    lineBreakdown.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      recipeQuantity: reqQty,
      recipeUnit,
      inventoryUnit,
      convertedQuantity: roundDecimals(convertedQty, 4),
      effectiveQuantity: roundDecimals(effectiveQty, 4),
      yieldFactor,
      unitCost: unitCost != null ? roundDecimals(unitCost, 4) : null,
      lineCost: unitCost != null && !unitError ? roundDecimals(lineCost, 4) : null,
      costKnown: unitCost != null && !unitError,
      unitError,
    });
  }

  return {
    totalCost: roundDecimals(totalCost, 4),
    costKnown: allKnown,
    lineBreakdown,
  };
}

function roundDecimals(val, places = 2) {
  const factor = Math.pow(10, places);
  return Math.round((Number(val) + Number.EPSILON) * factor) / factor;
}

module.exports = {
  MASS_UNITS,
  VOLUME_UNITS,
  COUNT_UNITS,
  getUnitDimension,
  convertQuantity,
  calculateWeightedAverageCost,
  calculateProductRecipeCost,
  roundDecimals,
};
