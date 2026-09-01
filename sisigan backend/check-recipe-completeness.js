// check-recipe-completeness.js
// One-off script: checks how many menu items have complete recipe +
// ingredient cost data, so we know whether profit tracking can compute
// real numbers or needs data entry first. Safe to delete after running.
//
// Usage:  node check-recipe-completeness.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const menuItems = await prisma.menuItem.findMany({
    where: { isAvailable: true },
    include: {
      recipes: { include: { ingredient: true } },
    },
    orderBy: { name: 'asc' },
  });

  const noRecipe = [];
  const missingPrice = [];
  const complete = [];

  for (const item of menuItems) {
    if (item.recipes.length === 0) {
      noRecipe.push(item.name);
      continue;
    }
    const missingIngredients = item.recipes
      .filter((r) => r.ingredient.defaultPrice == null)
      .map((r) => r.ingredient.name);

    if (missingIngredients.length > 0) {
      missingPrice.push({ item: item.name, missing: missingIngredients });
      continue;
    }

    const cost = item.recipes.reduce(
      (sum, r) => sum + Number(r.quantity) * Number(r.ingredient.defaultPrice),
      0
    );
    const price = Number(item.price);
    const profit = price - cost;
    complete.push({ item: item.name, price, cost: Math.round(cost * 100) / 100, profit: Math.round(profit * 100) / 100 });
  }

  console.log(`\nTotal available menu items: ${menuItems.length}`);
  console.log(`✅ Complete (cost computable): ${complete.length}`);
  console.log(`⚠️  Has recipe but missing ingredient price: ${missingPrice.length}`);
  console.log(`❌ No recipe at all: ${noRecipe.length}`);

  if (complete.length > 0) {
    console.log('\n--- Sample of computable profit (first 10) ---');
    complete.slice(0, 10).forEach((c) => {
      console.log(`${c.item.padEnd(30)} price ₱${c.price.toFixed(2).padStart(8)}  cost ₱${c.cost.toFixed(2).padStart(8)}  profit ₱${c.profit.toFixed(2).padStart(8)}`);
    });
  }

  if (missingPrice.length > 0) {
    console.log('\n--- Items with recipe but missing ingredient price ---');
    missingPrice.forEach((m) => console.log(`${m.item}: missing price for [${m.missing.join(', ')}]`));
  }

  if (noRecipe.length > 0) {
    console.log('\n--- Items with NO recipe linked ---');
    noRecipe.forEach((n) => console.log(`- ${n}`));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
