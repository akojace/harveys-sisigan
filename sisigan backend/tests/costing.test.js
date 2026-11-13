// tests/costing.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  convertQuantity,
  calculateWeightedAverageCost,
  calculateProductRecipeCost,
} = require('../src/utils/inventoryCosting');

describe('Inventory Costing & Unit Conversion Tests', () => {
  describe('Unit Conversions', () => {
    it('converts KG to GRAM correctly', () => {
      assert.equal(convertQuantity(1.5, 'KG', 'GRAM'), 1500);
      assert.equal(convertQuantity(0.25, 'KG', 'GRAM'), 250);
    });

    it('converts GRAM to KG correctly', () => {
      assert.equal(convertQuantity(200, 'GRAM', 'KG'), 0.2);
      assert.equal(convertQuantity(50000, 'GRAM', 'KG'), 50);
    });

    it('converts LITER to ML correctly', () => {
      assert.equal(convertQuantity(2, 'LITER', 'ML'), 2000);
      assert.equal(convertQuantity(0.05, 'LITER', 'ML'), 50);
    });

    it('converts ML to LITER correctly', () => {
      assert.equal(convertQuantity(250, 'ML', 'LITER'), 0.25);
    });

    it('converts same units with identical value', () => {
      assert.equal(convertQuantity(10, 'PCS', 'PCS'), 10);
      assert.equal(convertQuantity(5, 'PACK', 'PACK'), 5);
    });

    it('rejects incompatible unit conversions', () => {
      assert.throws(
        () => convertQuantity(100, 'GRAM', 'ML'),
        /Incompatible unit conversion/
      );
      assert.throws(
        () => convertQuantity(5, 'KG', 'PCS'),
        /Incompatible unit conversion/
      );
    });
  });

  describe('Perpetual Weighted-Average Costing', () => {
    it('computes initial purchase cost when existing stock is 0', () => {
      const res = calculateWeightedAverageCost({
        existingQuantity: 0,
        existingAvgCost: 0,
        purchaseQuantity: 10,
        purchaseCost: 1500,
        yieldPercentage: 100,
      });
      assert.equal(res.newQuantity, 10);
      assert.equal(res.newAverageCost, 150);
      assert.equal(res.inventoryValue, 1500);
    });

    it('computes prompt sample weighted-average cost correctly', () => {
      // Existing stock: 10 kg pork @ ₱150/kg = ₱1,500
      // New purchase: 5 kg pork @ ₱900 total (₱180/kg)
      // New average cost: (1500 + 900) / (10 + 5) = 2400 / 15 = ₱160/kg
      const res = calculateWeightedAverageCost({
        existingQuantity: 10,
        existingAvgCost: 150,
        purchaseQuantity: 5,
        purchaseCost: 900,
        yieldPercentage: 100,
      });
      assert.equal(res.newQuantity, 15);
      assert.equal(res.newAverageCost, 160);
      assert.equal(res.inventoryValue, 2400);
    });

    it('factors in preparation yield correctly', () => {
      // Purchased 1,000 g pork for ₱150 with 90% yield
      // Usable pork: 900 g -> effective unit cost: 150 / 900 = 0.1667/g
      const res = calculateWeightedAverageCost({
        existingQuantity: 0,
        existingAvgCost: 0,
        purchaseQuantity: 1000,
        purchaseCost: 150,
        yieldPercentage: 90,
      });
      assert.equal(res.usablePurchaseQuantity, 900);
      assert.equal(res.newAverageCost, 0.1667);
      assert.equal(res.inventoryValue, 150.03); // 900 * 0.1667
    });
  });

  describe('Product Recipe Costing', () => {
    it('computes product cost matching prompt example (₱37.00)', () => {
      const recipes = [
        { quantity: 200, unit: 'GRAM', ingredient: { id: 1, name: 'Pork', unit: 'GRAM', defaultPrice: 0.15 } },
        { quantity: 30, unit: 'GRAM', ingredient: { id: 2, name: 'Onion', unit: 'GRAM', defaultPrice: 0.05 } },
        { quantity: 5, unit: 'GRAM', ingredient: { id: 3, name: 'Chili', unit: 'GRAM', defaultPrice: 0.18 } },
        { quantity: 10, unit: 'ML', ingredient: { id: 4, name: 'Cooking Oil', unit: 'ML', defaultPrice: 0.10 } },
        { quantity: 5, unit: 'GRAM', ingredient: { id: 5, name: 'Seasoning', unit: 'GRAM', defaultPrice: 0.12 } },
        { quantity: 1, unit: 'PCS', ingredient: { id: 6, name: 'Packaging', unit: 'PCS', defaultPrice: 3.00 } },
      ];

      const res = calculateProductRecipeCost(recipes);
      assert.equal(res.costKnown, true);
      assert.equal(res.totalCost, 37.00);

      // Verify validation case from prompt:
      // Selling price 150, cost 37, qty sold 3:
      // Revenue 450, COGS 111, Profit 339, Margin 75.33%
      const price = 150;
      const qtySold = 3;
      const revenue = price * qtySold;
      const cogs = res.totalCost * qtySold;
      const grossProfit = revenue - cogs;
      const margin = (grossProfit / revenue) * 100;

      assert.equal(revenue, 450);
      assert.equal(cogs, 111);
      assert.equal(grossProfit, 339);
      assert.equal(Math.round(margin * 100) / 100, 75.33);
    });

    it('converts units in recipe lines (e.g. recipe specifies GRAM but ingredient unit is KG)', () => {
      const recipes = [
        // 200g of pork, but ingredient price is ₱150/KG
        { quantity: 200, unit: 'GRAM', ingredient: { id: 1, name: 'Pork', unit: 'KG', defaultPrice: 150 } },
      ];
      const res = calculateProductRecipeCost(recipes);
      assert.equal(res.costKnown, true);
      // 200g = 0.2kg * 150 = ₱30.00
      assert.equal(res.totalCost, 30.00);
    });
  });
});
