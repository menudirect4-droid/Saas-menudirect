const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const isVercel = Boolean(process.env.VERCEL);
const dbDir = isVercel ? '/tmp' : path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (e) {}
}

const dbPath = path.join(dbDir, 'menudirect.db');

// Sur Vercel, copier la base préexistante data/menudirect.db vers /tmp si elle existe
if (isVercel && !fs.existsSync(dbPath)) {
  const seedPath = path.join(__dirname, '..', 'data', 'menudirect.db');
  if (fs.existsSync(seedPath)) {
    try {
      fs.copyFileSync(seedPath, dbPath);
    } catch (err) {
      console.warn('Note Vercel: initialisation d\'une nouvelle base dans /tmp');
    }
  }
}

const db = new DatabaseSync(dbPath);

// Configuration pragma pour la rapidité, la robustesse et le cache en mémoire
db.exec(`
  PRAGMA journal_mode = ${isVercel ? 'DELETE' : 'WAL'};
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -32000;
  PRAGMA temp_store = MEMORY;
  PRAGMA foreign_keys = ON;
`);

// Initialisation des tables si non existantes
db.exec(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    city TEXT DEFAULT 'Cotonou',
    country TEXT DEFAULT 'Bénin',
    address TEXT DEFAULT '',
    description TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    opening_hours TEXT DEFAULT 'Lun - Dim : 10h00 - 23h00',
    subscription_plan TEXT DEFAULT 'standard',
    subscription_status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_reset_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    reset_token TEXT,
    attempts INTEGER DEFAULT 0,
    is_used INTEGER DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price INTEGER NOT NULL,
    image_url TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    total_amount INTEGER NOT NULL,
    status TEXT DEFAULT 'nouvelle',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id INTEGER REFERENCES dishes(id) ON DELETE SET NULL,
    dish_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT DEFAULT '',
    orders_count INTEGER DEFAULT 1,
    total_spent INTEGER DEFAULT 0,
    last_order_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurant_id, phone)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    payment_method TEXT DEFAULT 'especes',
    status TEXT DEFAULT 'en_attente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dish_translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'valide',
    source_lang TEXT DEFAULT 'fr',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurant_id, dish_id, language)
  );

  CREATE TABLE IF NOT EXISTS category_translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'valide',
    source_lang TEXT DEFAULT 'fr',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurant_id, category_id, language)
  );

  CREATE TABLE IF NOT EXISTS translation_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_hash TEXT UNIQUE NOT NULL,
    source_lang TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    translated_name TEXT NOT NULL,
    translated_desc TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_categories_resto ON categories(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_dishes_resto ON dishes(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_dishes_resto_cat ON dishes(restaurant_id, category_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_orders_resto ON orders(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_orders_resto_status ON orders(restaurant_id, status);
  CREATE INDEX IF NOT EXISTS idx_orders_resto_created ON orders(restaurant_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_customers_resto ON customers(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_payments_resto ON payments(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_dish_trans_resto ON dish_translations(restaurant_id, language);
  CREATE INDEX IF NOT EXISTS idx_dish_trans_dish ON dish_translations(dish_id, language);
  CREATE INDEX IF NOT EXISTS idx_cat_trans_resto ON category_translations(restaurant_id, language);
  CREATE INDEX IF NOT EXISTS idx_trans_cache_hash ON translation_cache(source_hash);
  CREATE INDEX IF NOT EXISTS idx_reset_codes_resto ON password_reset_codes(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_reset_codes_token ON password_reset_codes(reset_token);
`);

// Migrations dynamiques pour assurer la présence des nouveaux champs
function runMigrations() {
  const columnsToAdd = [
    { name: 'cover_image_url', type: "TEXT DEFAULT ''" },
    { name: 'brand_color', type: "TEXT DEFAULT '#DC2626'" },
    { name: 'tagline', type: "TEXT DEFAULT ''" },
    { name: 'custom_domain', type: "TEXT DEFAULT ''" },
    { name: 'domain_status', type: "TEXT DEFAULT 'non_configure'" },
    { name: 'instagram_handle', type: "TEXT DEFAULT ''" },
    { name: 'whatsapp_number', type: "TEXT DEFAULT ''" },
    { name: 'facebook_url', type: "TEXT DEFAULT ''" },
    { name: 'theme_style', type: "TEXT DEFAULT 'moderne'" },
    { name: 'font_family', type: "TEXT DEFAULT 'Plus Jakarta Sans'" }
  ];

  for (const col of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE restaurants ADD COLUMN ${col.name} ${col.type};`);
    } catch (e) {
      // Colonne déjà existante ou erreur mineure ignorée
    }
  }
}

runMigrations();

// Helpers d'exécution
const query = (sql, params = []) => {
  return db.prepare(sql).all(...params);
};

const get = (sql, params = []) => {
  return db.prepare(sql).get(...params);
};

const run = (sql, params = []) => {
  return db.prepare(sql).run(...params);
};

const transaction = (fn) => {
  db.exec('BEGIN TRANSACTION');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

module.exports = {
  db,
  query,
  get,
  run,
  transaction
};
