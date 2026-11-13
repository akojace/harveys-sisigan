/**
 * Historical Transaction and Cost Reconciliation Script
 * 
 * Safely reconciles historical orders in Harvey's Sisigan database:
 * - Scans all completed orders.
 * - For orders/items lacking unitCost or cogs snapshots, calculates the COGS
 *   using the verified recipe BOM and ingredient unit costs.
 * - Persists snapshots into OrderItem (unitCost, cogs) and Order (cogs, discountTotal).
 * - Identifies and flags any uncomputable items (missing recipe/ingredient price).
 * - Does NOT mutate live inventory quantities retroactively (avoids physical inventory distortion).
 * - Generates an audit reconciliation report.
 */

const prisma = require('../config/db');
const { calculateProductRecipeCost, roundDecimals } = require('../utils/inventoryCosting');

async function reconcileHistoricalOrders({ dryRun = false } = {}) {
  console.log(`\n============================================================`);
  console.log(`HARVEY'S SISIGAN — HISTORICAL COGS & FINANCIAL RECONCILIATION`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (No database updates)' : 'LIVE MIGRATION'}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`============================================================\n`);

  const orders = await prisma.order.findMany({
    where: {
      status: 'COMPLETED',
    },
    include: {
      items: {
        include: {
          menuItem: {
            include: {
              recipes: {
                include: {
                  ingredient: {
                    include: {
                      inventory: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      payments: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${orders.length} completed historical order(s) to inspect.\n`);

  let ordersUpdated = 0;
  let itemsUpdated = 0;
  let totalReconstructedCogs = 0;
  const flaggedItems = [];

  for (const order of orders) {
    let orderCogs = 0;
    let orderItemsNeedUpdate = false;
    const itemUpdates = [];

    // Sum discounts if discountTotal is null or 0
    let discountTotal = Number(order.discountTotal || 0);
    if (!discountTotal && order.payments && order.payments.length > 0) {
      discountTotal = order.payments.reduce((sum, p) => sum + Number(p.discountAmount || 0), 0);
    }
    discountTotal = roundDecimals(discountTotal, 2);

    for (const item of order.items) {
      let itemUnitCost = Number(item.unitCost || 0);
      let itemCogs = Number(item.cogs || 0);

      if (!itemUnitCost || !itemCogs) {
        if (!item.menuItem) {
          flaggedItems.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            reason: `Order item ${item.id} has no associated menuItem (deleted)`,
          });
          continue;
        }

        if (!item.menuItem.recipes || item.menuItem.recipes.length === 0) {
          flaggedItems.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItem.name,
            reason: `Missing recipe BOM`,
          });
          continue;
        }

        const recipeCalc = calculateProductRecipeCost(item.menuItem.recipes, order.branchId);

        if (!recipeCalc.costKnown || recipeCalc.totalCost <= 0) {
          flaggedItems.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItem.name,
            reason: `Unresolved ingredient pricing in recipe`,
          });
          continue;
        }

        itemUnitCost = recipeCalc.totalCost;
        itemCogs = roundDecimals(itemUnitCost * item.quantity, 2);
        orderItemsNeedUpdate = true;

        itemUpdates.push({
          id: item.id,
          unitCost: itemUnitCost,
          cogs: itemCogs,
        });
      }

      orderCogs += itemCogs;
    }

    orderCogs = roundDecimals(orderCogs, 2);

    const orderNeedsUpdate =
      orderItemsNeedUpdate ||
      Number(order.cogs || 0) !== orderCogs ||
      Number(order.discountTotal || 0) !== discountTotal ||
      !order.inventoryDeducted;

    if (orderNeedsUpdate) {
      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          for (const iu of itemUpdates) {
            await tx.orderItem.update({
              where: { id: iu.id },
              data: {
                unitCost: iu.unitCost,
                cogs: iu.cogs,
              },
            });
            itemsUpdated++;
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              cogs: orderCogs,
              discountTotal: discountTotal,
              inventoryDeducted: true, // Mark so legacy orders don't re-deduct
            },
          });
        });
      } else {
        itemsUpdated += itemUpdates.length;
      }

      ordersUpdated++;
      totalReconstructedCogs += orderCogs;
      console.log(
        `✓ Order #${order.orderNumber} (ID: ${order.id}): Total Amount = ₱${order.totalAmount}, Discounts = ₱${discountTotal}, COGS = ₱${orderCogs}`
      );
    }
  }

  console.log(`\n============================================================`);
  console.log(`RECONCILIATION SUMMARY:`);
  console.log(`------------------------------------------------------------`);
  console.log(`Completed Orders Scanned:     ${orders.length}`);
  console.log(`Orders Updated:               ${ordersUpdated}`);
  console.log(`Order Items Reconciled:       ${itemsUpdated}`);
  console.log(`Total Reconstructed COGS:     ₱${totalReconstructedCogs.toFixed(2)}`);
  console.log(`Flagged / Unresolved Items:   ${flaggedItems.length}`);
  if (flaggedItems.length > 0) {
    console.log(`Flagged details:`, JSON.stringify(flaggedItems, null, 2));
  } else {
    console.log(`All completed historical orders have 100% verified recipe costing.`);
  }
  console.log(`============================================================\n`);
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  reconcileHistoricalOrders({ dryRun: isDryRun })
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Reconciliation error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { reconcileHistoricalOrders };
