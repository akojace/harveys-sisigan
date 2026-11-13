// prisma/seed.js
// Seeds the database with initial Sisigan Restaurant data

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const prisma = new PrismaClient();

async function applyMenuItemPhotosFromSql() {
  const sqlPath = path.join(__dirname, 'mediumBlob photos.sql');
  if (!fs.existsSync(sqlPath)) {
    console.log(`⚠️  Skipping photos: missing file ${sqlPath}`);
    return { updated: 0, scanned: 0 };
  }

  const stream = fs.createReadStream(sqlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let scanned = 0;
  let updated = 0;
  let inMenuItemsInsert = false;

  // Tuple lines look like:
  // (1, 'Beef Bulalo', '', 160.00, NULL, 1, 1, '...', '...', 0xffd8...)
  const tupleRe = /^\((\d+),[\s\S]*?,\s*0x([0-9a-fA-F]+)\)\s*;?\s*$/;

  for await (const line of rl) {
    if (!inMenuItemsInsert) {
      if (line.startsWith('INSERT INTO `menu_items`')) inMenuItemsInsert = true;
      continue;
    }

    // Each INSERT line is followed by a single tuple line in your export, then repeats.
    if (line.startsWith('INSERT INTO `menu_items`')) continue;

    const m = line.match(tupleRe);
    if (!m) continue;

    scanned++;
    const id = Number(m[1]);
    const hex = m[2];

    // Avoid doing work if already matches (optional), but simplest is just update.
    const photo = Buffer.from(hex, 'hex');
    await prisma.menuItem.update({
      where: { id },
      data: { photo },
    });
    updated++;

    // If file contains only menu_items inserts, we can keep going; otherwise stop when inserts end.
    // Heuristic: if we ever hit an empty line after having processed inserts, end.
  }

  return { updated, scanned };
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function getInventorySeedItems() {
  return [
    // SAUCES / CONDIMENTS
    { name: 'Chilli Oil', category: 'SAUCE', unit: 'ML', quantity: 200, consumptionDays: 2, consumptionLabel: '2 days', price: 0.15 },
    { name: 'Dried Garlic', category: 'SAUCE', unit: 'ML', quantity: 200, consumptionDays: 2, consumptionLabel: '2 days', price: 0.20 },
    { name: 'Ketchup', category: 'SAUCE', unit: 'PCS', quantity: 1, consumptionDays: 1, consumptionLabel: 'Daily', price: 45.00 },
    { name: 'Hot Sauce', category: 'SAUCE', unit: 'ML', quantity: 200, consumptionDays: 3, consumptionLabel: '3 days', price: 0.18 },
    { name: 'Suka (Vinegar)', category: 'SAUCE', unit: 'ML', quantity: 200, consumptionDays: 3, consumptionLabel: '3 days', price: 0.08 },
    { name: 'Mang Tomas', category: 'SAUCE', unit: 'PCS', quantity: 2, consumptionDays: 1, consumptionLabel: 'Daily', price: 48.00 },
    { name: 'Knorr', category: 'SAUCE', unit: 'PACK', quantity: 1, consumptionDays: 1, consumptionLabel: 'Daily', price: 15.00 },
    { name: 'Patis', category: 'SAUCE', unit: 'LITER', quantity: 1, consumptionDays: 14, consumptionLabel: '2 weeks', price: 60.00 },
    { name: 'Mayonnaise', category: 'SAUCE', unit: 'TUB', quantity: 1, consumptionDays: 1, consumptionLabel: 'Daily', price: 180.00 },

    // SPICES
    { name: 'Sili (Red & Green)', category: 'SPICES', unit: 'GRAM', quantity: 300, consumptionDays: 3, consumptionLabel: '2-3 days', price: 0.25 },
    { name: 'Paminta', category: 'SPICES', unit: 'PACK', quantity: 1, consumptionDays: 1, consumptionLabel: 'Daily', price: 50.00 },

    // MAIN INGREDIENTS
    // Silog Meat: ₱280/kg = ₱0.28 per gram (100g serving = ₱28.00)
    { name: 'Silog Meat', category: 'MAIN_INGREDIENT', unit: 'GRAM', quantity: 10000, consumptionDays: null, consumptionLabel: '100 grams per serving', price: 0.28 },
    // Barkada Meat: ₱280/kg = ₱0.28 per gram (200g serving = ₱56.00)
    { name: 'Barkada Meat', category: 'MAIN_INGREDIENT', unit: 'GRAM', quantity: 20000, consumptionDays: null, consumptionLabel: '200 grams per serving', price: 0.28 },
    { name: 'Pizza (Any Flavor)', category: 'MAIN_INGREDIENT', unit: 'PCS', quantity: 18, consumptionDays: null, consumptionLabel: '1 piece per pizza order', price: 35.00 },

    // RICE
    // 1 bag = 50,000 grams @ ₱1,350 purchase cost -> Unit Cost = 1350 / 50000 = ₱0.027 per gram
    { name: 'Bigas', category: 'RICE', unit: 'GRAM', quantity: 50000, consumptionDays: 2, consumptionLabel: '1 bag (2 days)', price: 0.027 },

    // UTILITIES
    { name: 'Tubig', category: 'UTILITIES', unit: 'GALLON', quantity: 5, consumptionDays: 7, consumptionLabel: '1 week', price: 25.00 },

    // GAS
    { name: 'LPG Gas (Bulalo Kalan)', category: 'GAS', unit: 'TANK', quantity: 1, consumptionDays: 14, consumptionLabel: '2 weeks', price: 900.00 },
    { name: 'LPG Gas (Sisigan Kalan)', category: 'GAS', unit: 'TANK', quantity: 1, consumptionDays: 5, consumptionLabel: '5 days', price: 900.00 },
    { name: 'LPG Gas (Rice / Kanin)', category: 'GAS', unit: 'TANK', quantity: 1, consumptionDays: 60, consumptionLabel: '2 months', price: 900.00 },
    { name: 'LPG Gas (Pizza Oven)', category: 'GAS', unit: 'TANK', quantity: 1, consumptionDays: 180, consumptionLabel: '6 months', price: 900.00 },
  ].map((item) => ({
    ...item,
    dailyDeduction: item.consumptionDays ? round3(item.quantity / item.consumptionDays) : null,
    minThreshold: round3(item.quantity * 0.2),
  }));
}

async function seedInventoryAndRecipes(branches) {
  const items = getInventorySeedItems();

  // 1) Global ingredient catalog
  for (const item of items) {
    await prisma.ingredient.upsert({
      where: { name: item.name },
      update: {
        category: item.category,
        unit: item.unit,
        defaultConsumptionRateDays: item.consumptionDays,
        defaultConsumptionLabel: item.consumptionLabel,
        defaultDailyDeduction: item.dailyDeduction,
        defaultMinThreshold: item.minThreshold,
        defaultPrice: item.price ?? null,
      },
      create: {
        name: item.name,
        category: item.category,
        unit: item.unit,
        defaultConsumptionRateDays: item.consumptionDays,
        defaultConsumptionLabel: item.consumptionLabel,
        defaultDailyDeduction: item.dailyDeduction,
        defaultMinThreshold: item.minThreshold,
        defaultPrice: item.price ?? null,
      },
    });
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { name: { in: items.map((i) => i.name) } },
  });
  const ingredientByName = new Map(ingredients.map((i) => [i.name, i]));

  // 2) Branch-level inventory stock
  for (const branch of branches) {
    for (const item of items) {
      const ingredient = ingredientByName.get(item.name);
      if (!ingredient) continue;

      await prisma.inventoryItem.upsert({
        where: {
          branchId_ingredientId: {
            branchId: branch.id,
            ingredientId: ingredient.id,
          },
        },
        update: {
          quantity: item.quantity,
          minThreshold: item.minThreshold,
          price: item.price ?? null,
          consumptionRateDays: item.consumptionDays,
          consumptionLabel: item.consumptionLabel,
          dailyDeductionAmount: item.dailyDeduction,
        },
        create: {
          branchId: branch.id,
          ingredientId: ingredient.id,
          quantity: item.quantity,
          minThreshold: item.minThreshold,
          price: item.price ?? null,
          consumptionRateDays: item.consumptionDays,
          consumptionLabel: item.consumptionLabel,
          dailyDeductionAmount: item.dailyDeduction,
        },
      });
    }
  }

  // 3) Recipe mapping:
  //    - Silog menu items -> Bigas 100g + Silog Meat 100g
  //    - Barkada items -> Barkada Meat 200g
  const bigas = ingredientByName.get('Bigas');
  const silogMeat = ingredientByName.get('Silog Meat');
  const barkadaMeat = ingredientByName.get('Barkada Meat');
  const pizzaAnyFlavor = ingredientByName.get('Pizza (Any Flavor)');

  if (!bigas || !silogMeat || !barkadaMeat || !pizzaAnyFlavor) {
    console.log('⚠️  Skipping recipe seed: required ingredient(s) not found');
    return;
  }

  await prisma.menuItemRecipeIngredient.deleteMany({});

  const menuItems = await prisma.menuItem.findMany({
    include: { category: true },
  });

  const recipeRows = [];
  for (const menuItem of menuItems) {
    const lowerName = menuItem.name.toLowerCase();
    const isSilog = lowerName.includes('silog');
    const isBarkada = menuItem.category?.name === 'Barkada Meals' || lowerName.includes('barkada');
    const isCombo = menuItem.category?.name === 'Combo Meals' || lowerName.includes('cm') || lowerName.includes('combo');
    const isPizza = menuItem.category?.name === 'Pizza' || lowerName.includes('pizza');
    const isSiomaiRice = lowerName.includes('siomairice');

    if (isSilog) {
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: bigas.id, quantity: 100, unit: 'GRAM', yieldFactor: 1.00 });
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: silogMeat.id, quantity: 100, unit: 'GRAM', yieldFactor: 1.00 });
    } else if (isCombo) {
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: bigas.id, quantity: 100, unit: 'GRAM', yieldFactor: 1.00 });
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: silogMeat.id, quantity: 100, unit: 'GRAM', yieldFactor: 1.00 });
    } else if (isSiomaiRice) {
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: bigas.id, quantity: 100, unit: 'GRAM', yieldFactor: 1.00 });
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: silogMeat.id, quantity: 50, unit: 'GRAM', yieldFactor: 1.00 });
    }

    if (isBarkada) {
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: barkadaMeat.id, quantity: 200, unit: 'GRAM', yieldFactor: 1.00 });
    }

    if (isPizza) {
      recipeRows.push({ menuItemId: menuItem.id, ingredientId: pizzaAnyFlavor.id, quantity: 1, unit: 'PCS', yieldFactor: 1.00 });
    }
  }

  if (recipeRows.length) {
    await prisma.menuItemRecipeIngredient.createMany({ data: recipeRows, skipDuplicates: true });
  }

  console.log(`✅ Seeded ${items.length} ingredients, ${branches.length * items.length} inventory stocks, ${recipeRows.length} recipe rows`);
}

async function main() {
  console.log('🌱 Seeding Sisigan Restaurant POS...\n');

    // ── Branches ──────────────────────────────────────────
  const branches = await Promise.all([
    prisma.branch.upsert({
      where: { id: 1 },
      update: { name: 'Lumban Branch', address: 'Lumban', city: 'Laguna' },
      create: {
        name: 'Lumban Branch',
        address: 'Lumban',
        city: 'Laguna',
        contactNo: '09171234001',
      },
    }),
    prisma.branch.upsert({
      where: { id: 2 },
      update: { name: 'Sta. Cruz Branch', address: 'Sta. Cruz', city: 'Laguna' },
      create: {
        name: 'Sta. Cruz Branch',
        address: 'Sta. Cruz',
        city: 'Laguna',
        contactNo: '09171234002',
      },
    }),
    prisma.branch.upsert({
      where: { id: 3 },
      update: { name: 'Pagsanjan Branch', address: 'Pagsanjan', city: 'Laguna' },
      create: {
        name: 'Pagsanjan Branch',
        address: 'Pagsanjan',
        city: 'Laguna',
        contactNo: '09171234003',
      },
    }),
    prisma.branch.upsert({
      where: { id: 4 },
      update: { name: 'Paete Branch', address: 'Paete', city: 'Laguna' },
      create: {
        name: 'Paete Branch',
        address: 'Paete',
        city: 'Laguna',
        contactNo: '09171234004',
      },
    }),
  ]);
  console.log(`✅ Created ${branches.length} branches`);

  // ── Owner (oversees all branches) ─────────────────────
  const ownerPassword = await bcrypt.hash('owner123', 12);
  await prisma.user.upsert({
    where: { email: 'owner@sisigan.ph' },
    update: {},
    create: {
      name: 'Sisigan Owner',
      email: 'owner@sisigan.ph',
      password: ownerPassword,
      role: 'OWNER',
      branchId: 1, // Owner is seated at Branch 1 but sees all
    },
  });

  // ── Manager Users ───────────────────────────────────────
  const managerPassword = await bcrypt.hash('manager123', 12);
  await prisma.user.upsert({
    where: { email: 'manager@sisigan.ph' },
    update: { branchId: 1 },
    create: {
      name: 'Lumban Manager',
      email: 'manager@sisigan.ph',
      password: managerPassword,
      role: 'MANAGER',
      branchId: 1,
    },
  });
  await prisma.user.upsert({
    where: { email: 'manager.lumban@sisigan.ph' },
    update: { branchId: 1 },
    create: {
      name: 'Lumban Manager',
      email: 'manager.lumban@sisigan.ph',
      password: managerPassword,
      role: 'MANAGER',
      branchId: 1,
    },
  });
  await prisma.user.upsert({
    where: { email: 'manager.stacruz@sisigan.ph' },
    update: { branchId: 2 },
    create: {
      name: 'Sta. Cruz Manager',
      email: 'manager.stacruz@sisigan.ph',
      password: managerPassword,
      role: 'MANAGER',
      branchId: 2,
    },
  });

  // Cashier per branch
  const cashierPassword = await bcrypt.hash('cashier123', 12);
  const cashiers = await Promise.all([
    prisma.user.upsert({
      where: { email: 'cashier1@sisigan.ph' },
      update: { branchId: 1 },
      create: {
        name: 'Lumban Cashier',
        email: 'cashier1@sisigan.ph',
        password: cashierPassword,
        role: 'CASHIER',
        branchId: 1,
      },
    }),
    prisma.user.upsert({
      where: { email: 'cashier.lumban@sisigan.ph' },
      update: { branchId: 1 },
      create: {
        name: 'Lumban Cashier',
        email: 'cashier.lumban@sisigan.ph',
        password: cashierPassword,
        role: 'CASHIER',
        branchId: 1,
      },
    }),
    prisma.user.upsert({
      where: { email: 'cashier.stacruz@sisigan.ph' },
      update: { branchId: 2 },
      create: {
        name: 'Sta. Cruz Cashier',
        email: 'cashier.stacruz@sisigan.ph',
        password: cashierPassword,
        role: 'CASHIER',
        branchId: 2,
      },
    }),
    prisma.user.upsert({
      where: { email: 'cashier2@sisigan.ph' },
      update: { branchId: 2 },
      create: {
        name: 'Sta. Cruz Cashier 2',
        email: 'cashier2@sisigan.ph',
        password: cashierPassword,
        role: 'CASHIER',
        branchId: 2,
      },
    }),
    prisma.user.upsert({
      where: { email: 'cashier3@sisigan.ph' },
      update: { branchId: 3 },
      create: {
        name: 'Pagsanjan Cashier',
        email: 'cashier3@sisigan.ph',
        password: cashierPassword,
        role: 'CASHIER',
        branchId: 3,
      },
    }),
  ]);
  console.log(`✅ Created owner + manager + ${cashiers.length} cashiers`);

  // ── Menu Categories ────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({ where: { id: 1 }, update: { name: 'Barkada Meals', sortOrder: 1 }, create: { id: 1, name: 'Barkada Meals', sortOrder: 1 } }),
    prisma.category.upsert({ where: { id: 2 }, update: { name: 'Combo Meals',   sortOrder: 2 }, create: { id: 2, name: 'Combo Meals',   sortOrder: 2 } }),
    prisma.category.upsert({ where: { id: 3 }, update: { name: 'Silog Meals',   sortOrder: 3 }, create: { id: 3, name: 'Silog Meals',   sortOrder: 3 } }),
    prisma.category.upsert({ where: { id: 4 }, update: { name: 'Pizza',         sortOrder: 4 }, create: { id: 4, name: 'Pizza',         sortOrder: 4 } }),
    prisma.category.upsert({ where: { id: 5 }, update: { name: 'Add-ons',       sortOrder: 5 }, create: { id: 5, name: 'Add-ons',       sortOrder: 5 } }),
  ]);
  console.log(`✅ Created/updated ${categories.length} categories`);

  // ── Menu Items (from Menu.xlsx) ────────────────────────
  // Note: Crispy Sisig Barkada has two price variants — using 130 as base price.
  // Note: Duplicate "Crispy Bagnet" removed, keeping one entry.
  const menuItems = [
    // Barkada Meals (categoryId: 1)
    { name: 'Beef Bulalo',                price: 160,  categoryId: 1 },
    { name: 'Pancit Bihon Guisado',       price: 135,  categoryId: 1 },
    { name: 'Crispy Chicharon Bulaklak',  price: 130,  categoryId: 1 },
    { name: 'Crispy Dinakdakan',          price: 145,  categoryId: 1 },
    { name: 'Crispy Sisig Barkada',       price: 130,  categoryId: 1, description: '130 / 142 with egg' },
    { name: 'Calamares',                  price: 145,  categoryId: 1 },
    { name: 'Pancit Canton Guisado',      price: 135,  categoryId: 1 },
    { name: 'Shanghai',                   price: 145,  categoryId: 1 },
    { name: 'Garlic Butter Bangus',       price: 199,  categoryId: 1 },
    { name: 'Crispy Bagnet',              price: 130,  categoryId: 1 },

    // Combo Meals (categoryId: 2)
    { name: 'CM1 Egg + Rice + Hungarian + Sisig',   price: 145, categoryId: 2 },
    { name: 'CM2 Egg + Rice + Nuggets + Sisig',     price: 145, categoryId: 2 },
    { name: 'CM3 Egg + Rice + Shanghai + Sisig',    price: 145, categoryId: 2 },
    { name: 'CM4 Egg + Rice + Bagnet + Nuggets',    price: 145, categoryId: 2 },
    { name: 'CM5 Egg + Rice + Bagnet + Sisig',      price: 145, categoryId: 2 },
    { name: 'CM6 Egg + Rice + Hotdog + Sisig',      price: 125, categoryId: 2 },
    { name: 'CM7 Egg + Rice + Bagnet + Hotdog',     price: 125, categoryId: 2 },
    { name: 'CM8 Egg + Rice + Bagnet + Hungarian',  price: 145, categoryId: 2 },

    // Silog Meals (categoryId: 3)
    { name: 'Sisilog',        price: 89,  categoryId: 3 },
    { name: 'Bagnetsilog',    price: 89,  categoryId: 3 },
    { name: 'Hungarian Silog',price: 89,  categoryId: 3 },
    { name: 'Shanghaisilog',  price: 89,  categoryId: 3 },
    { name: 'Nuggets Silog',  price: 89,  categoryId: 3 },
    { name: 'Hotsilog',       price: 65,  categoryId: 3 },
    { name: 'Siomaisilog',    price: 50,  categoryId: 3 },
    { name: 'Siomairice',     price: 39,  categoryId: 3 },
    { name: 'Dinakdakansilog',price: 99,  categoryId: 3 },
    { name: 'Chicksilog',     price: 110, categoryId: 3 },
    { name: 'Bangsilog',      price: 110, categoryId: 3 },
    { name: 'Porksilog',      price: 110, categoryId: 3 },

    // Pizza (categoryId: 4)
    { name: '4 in 1',         price: 89, categoryId: 4 },
    { name: 'Double Cheese',  price: 79, categoryId: 4 },
    { name: 'Shawarma',       price: 89, categoryId: 4 },
    { name: 'Hawaiian',       price: 89, categoryId: 4 },
    { name: 'Beefy Mushroom', price: 89, categoryId: 4 },
    { name: 'Ham and Cheese', price: 79, categoryId: 4 },
    { name: 'Bacon',          price: 89, categoryId: 4 },
    { name: 'Pepperoni',      price: 89, categoryId: 4 },
  ];

  let createdItems = 0;
  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: createdItems + 1 },
      update: {},
      create: { ...item, id: createdItems + 1 },
    });
    createdItems++;
  }
  console.log(`✅ Created ${createdItems} menu items`);

  await seedInventoryAndRecipes(branches);

  const photoResult = await applyMenuItemPhotosFromSql();
  if (photoResult.updated > 0) {
    console.log(`✅ Applied photos to ${photoResult.updated} menu items`);
  } else {
    console.log('ℹ️  No menu item photos applied');
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('📋 Login credentials:');
  console.log('   Owner:  owner@sisigan.ph   / owner123');
  console.log('   Manager:  manager@sisigan.ph      / manager123');
  console.log('   Cashier1: cashier1@sisigan.ph   / cashier123');
  console.log('   Cashier2: cashier2@sisigan.ph   / cashier123');
  console.log('   Cashier3: cashier3@sisigan.ph   / cashier123\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


