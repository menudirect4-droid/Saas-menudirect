require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const db = require('./server/db');

const app = express();
const PORT = process.env.PORT || 3000;

const isVercel = Boolean(process.env.VERCEL);

// Créer le dossier uploads si nécessaire (/tmp sur Vercel, public/uploads en local)
const uploadsDir = isVercel
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {}
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Options de mise en cache HTTP pour les fichiers statiques
const staticOptions = {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (/\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|woff2|woff|ttf|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    } else if (/\.(css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
};

// Fichiers statiques
app.use('/uploads', express.static(uploadsDir, staticOptions));
if (isVercel) {
  const localUploads = path.join(__dirname, 'public', 'uploads');
  if (fs.existsSync(localUploads)) {
    app.use('/uploads', express.static(localUploads, staticOptions));
  }
}
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use(express.static(path.join(__dirname), staticOptions));

// Routes API
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/menu', require('./server/routes/menu'));
app.use('/api/orders', require('./server/routes/orders'));
app.use('/api/customers', require('./server/routes/customers'));
app.use('/api/payments', require('./server/routes/payments'));
app.use('/api/settings', require('./server/routes/settings'));
app.use('/api/public', require('./server/routes/public'));
app.use('/api/translate', require('./server/routes/translation'));

// Routes Pages HTML
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Route publique sans authentification : Politique de confidentialité
app.get('/politique-de-confidentialite', (req, res) => {
  res.sendFile(path.join(__dirname, 'politique-de-confidentialite.html'));
});

// Redirection propre de l'ancienne route /cgu pour éviter tout lien cassé
app.get('/cgu', (req, res) => {
  res.redirect(301, '/politique-de-confidentialite');
});

// Route dynamique du menu public : /restaurant/:slug
app.get('/restaurant/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'restaurant.html'));
});

// Route d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Adresse publique courte partageable : /chez-maman ou par domaine personnalisé
app.get('/:slug', (req, res) => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  const restaurant = db.get('SELECT id FROM restaurants WHERE slug = ? OR custom_domain = ?', [slug, slug]);
  if (!restaurant) return res.status(404).sendFile(path.join(__dirname, 'index.html'));
  return res.sendFile(path.join(__dirname, 'restaurant.html'));
});

// Initialiser les données de démonstration si la base est neuve
function ensureDemoRestaurant() {
  try {
    const existing = db.get('SELECT id FROM restaurants WHERE slug = ?', ['le-jardin-des-saveurs']);
    if (!existing) {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('demo123', 10);
      const resto = db.run(
        `INSERT INTO restaurants (name, slug, owner_name, phone, email, password_hash, city, country, address, description, opening_hours, subscription_plan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Le Jardin des Saveurs',
          'le-jardin-des-saveurs',
          'Chef Adjovi',
          '+229 97 00 11 22',
          'demo@menudirect.bj',
          hash,
          'Cotonou',
          'Bénin',
          'Haie Vive, Rue 340, Cotonou',
          'Restaurant gastronomique africain et européen. Produits frais du terroir et grillades savoureuses.',
          'Mar - Dim : 11h30 - 23h30',
          'pro'
        ]
      );

      const restoId = Number(resto.lastInsertRowid);

      const c1 = db.run('INSERT INTO categories (restaurant_id, name, display_order) VALUES (?, ?, 1)', [restoId, 'Grillades & Viandes']);
      const c2 = db.run('INSERT INTO categories (restaurant_id, name, display_order) VALUES (?, ?, 2)', [restoId, 'Spécialités Locales']);
      const c3 = db.run('INSERT INTO categories (restaurant_id, name, display_order) VALUES (?, ?, 3)', [restoId, 'Boissons Fraîches']);

      const cat1Id = Number(c1.lastInsertRowid);
      const cat2Id = Number(c2.lastInsertRowid);
      const cat3Id = Number(c3.lastInsertRowid);

      db.run(
        `INSERT INTO dishes (restaurant_id, category_id, name, description, price, image_url, is_active) VALUES
        (?, ?, 'Poulet Braisé & Alloco', 'Cuisse de poulet fermier marinée aux épices locales, servie avec alloco doré et sauce pimentée maison.', 4500, 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=600&q=80', 1),
        (?, ?, 'Brochettes de Filet de Bœuf (Suya)', '4 brochettes tendres saupoudrées d\\'épices kankankan, accompagnées d\\'oignons doux et frites.', 5000, 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80', 1),
        (?, ?, 'Poisson Braisé Capitaine Entier', 'Capitaine frais grillé au feu de bois, garniture de condiments et attieke frais de Grand-Popo.', 6500, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80', 1),
        (?, ?, 'Attiéké Poisson Bar Doré', 'Attiéké traditionnel parfumé à l\\'huile rouge et oignons frits, servi avec poisson bar frit.', 3500, 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80', 1),
        (?, ?, 'Jus de Bissap Maison (1L)', 'Infusion fraîche de fleurs d\\'hibiscus, menthe sauvage et touche de vanille locale.', 1500, 'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80', 1)`,
        [restoId, cat1Id, restoId, cat1Id, restoId, cat1Id, restoId, cat2Id, restoId, cat3Id]
      );
      console.log('Restaurant démo "Le Jardin des Saveurs" prêt avec menu complet !');
    }
  } catch (err) {
    console.error('Erreur initialisation resto démo:', err);
  }
}

ensureDemoRestaurant();

// Démarrer le serveur uniquement hors environnement serverless Vercel
let server = null;
if (!isVercel) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(` Plateforme SaaS MenuDirect démarrée avec succès !`);
    console.log(` Port : ${PORT}`);
    console.log(` URL Landing : http://localhost:${PORT}`);
    console.log(` Dashboard   : http://localhost:${PORT}/dashboard`);
    console.log(` Démo Menu   : http://localhost:${PORT}/restaurant/le-jardin-des-saveurs`);
    console.log(`================================================`);
  });
  app.server = server;
}

app.app = app;
module.exports = app;
