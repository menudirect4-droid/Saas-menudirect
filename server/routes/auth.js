const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Générateur de slug URL-friendly
function generateSlug(text) {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return base || 'restaurant';
}

// Inscription d'un nouveau restaurant
router.post('/register', (req, res) => {
  try {
    const {
      name,
      owner_name,
      phone,
      email,
      password,
      confirm_password,
      city = 'Cotonou',
      country = 'Bénin',
      plan = 'standard'
    } = req.body;

    if (!name || !owner_name || !phone || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs obligatoires doivent être renseignés.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    if (confirm_password && password !== confirm_password) {
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas.' });
    }

    // Vérifier unicité email
    const existing = db.get('SELECT id FROM restaurants WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Un restaurant avec cette adresse e-mail existe déjà.' });
    }

    // Générer un slug unique
    let baseSlug = generateSlug(name);
    let slug = baseSlug;
    let counter = 1;
    while (db.get('SELECT id FROM restaurants WHERE slug = ?', [slug])) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);

    // Valider le plan
    const validPlan = ['standard', 'pro', 'master'].includes(plan.toLowerCase()) ? plan.toLowerCase() : 'standard';

    // Transaction pour insérer le restaurant et les catégories par défaut
    const result = db.transaction(() => {
      const restoResult = db.run(
        `INSERT INTO restaurants (name, slug, owner_name, phone, email, password_hash, city, country, subscription_plan, subscription_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [name.trim(), slug, owner_name.trim(), phone.trim(), email.trim().toLowerCase(), password_hash, city.trim(), country.trim(), validPlan]
      );

      const restaurantId = Number(restoResult.lastInsertRowid);

      // Créer 2 catégories par défaut pour guider le restaurateur
      const cat1 = db.run(
        'INSERT INTO categories (restaurant_id, name, display_order) VALUES (?, ?, 1)',
        [restaurantId, 'Plats principaux']
      );
      const cat2 = db.run(
        'INSERT INTO categories (restaurant_id, name, display_order) VALUES (?, ?, 2)',
        [restaurantId, 'Boissons & Desserts']
      );

      // Créer un plat exemple
      db.run(
        `INSERT INTO dishes (restaurant_id, category_id, name, description, price, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [
          restaurantId,
          Number(cat1.lastInsertRowid),
          'Poulet braisé spécial',
          'Poulet braisé assaisonné aux épices locales, accompagné d\'alloco ou de frites.',
          5000
        ]
      );

      // Créer session automatique
      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 jours
      db.run(
        'INSERT INTO sessions (token, restaurant_id, expires_at) VALUES (?, ?, ?)',
        [token, restaurantId, expiresAt]
      );

      return { restaurantId, token, slug };
    });

    // Poser le cookie
    res.cookie('md_session', result.token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
      sameSite: 'lax'
    });

    return res.status(201).json({
      success: true,
      message: 'Compte restaurant créé avec succès !',
      restaurant: {
        id: result.restaurantId,
        name: name.trim(),
        slug: result.slug,
        email: email.trim().toLowerCase()
      },
      token: result.token,
      redirect: '/dashboard'
    });
  } catch (err) {
    console.error('Erreur inscription:', err);
    return res.status(500).json({ error: 'Impossible de créer le compte restaurant. Veuillez réessayer.' });
  }
});

// Connexion restaurant
router.post('/login', (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Veuillez saisir votre e-mail (ou téléphone) et votre mot de passe.' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const restaurant = db.get(
      'SELECT * FROM restaurants WHERE LOWER(email) = ? OR phone = ?',
      [cleanIdentifier, identifier.trim()]
    );

    if (!restaurant) {
      return res.status(401).json({ error: 'Identifiants incorrects. Veuillez vérifier vos informations.' });
    }

    const isValid = bcrypt.compareSync(password, restaurant.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }

    // Créer token de session
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 jours
    db.run(
      'INSERT INTO sessions (token, restaurant_id, expires_at) VALUES (?, ?, ?)',
      [token, restaurant.id, expiresAt]
    );

    // Définir le cookie
    res.cookie('md_session', token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
      sameSite: 'lax'
    });

    return res.json({
      success: true,
      message: 'Connexion réussie !',
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        email: restaurant.email,
        subscription_plan: restaurant.subscription_plan
      },
      token,
      redirect: '/dashboard'
    });
  } catch (err) {
    console.error('Erreur connexion:', err);
    return res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

// Déconnexion
router.post('/logout', (req, res) => {
  const token = req.cookies?.md_session || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      db.run('DELETE FROM sessions WHERE token = ?', [token]);
    } catch (err) {
      console.error('Erreur suppression session:', err);
    }
  }
  res.clearCookie('md_session', { path: '/' });
  return res.json({ success: true, message: 'Déconnexion effectuée.' });
});

// Profil connecté
router.get('/me', requireAuth, (req, res) => {
  return res.json({
    authenticated: true,
    restaurant: req.restaurant
  });
});

module.exports = router;
