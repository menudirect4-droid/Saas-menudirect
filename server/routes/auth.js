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

// =========================================================================
// RÉCUPÉRATION DE MOT DE PASSE PAR CODE SMS (OTP)
// =========================================================================
const smsService = require('../services/smsService');

function findRestaurantByIdentifier(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim();
  const lower = clean.toLowerCase();

  // 1. Recherche directe par email ou téléphone
  let resto = db.get('SELECT * FROM restaurants WHERE LOWER(email) = ? OR phone = ?', [lower, clean]);
  if (resto) return resto;

  // 2. Comparaison souple sur les numéros de téléphone
  const allRestos = db.query('SELECT * FROM restaurants');
  for (const r of allRestos) {
    if (smsService.comparePhones(r.phone, clean)) {
      return r;
    }
  }

  return null;
}

// Étape 1 : Demande d'envoi du code de vérification par SMS
router.post('/forgot-password/send-code', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || !String(identifier).trim()) {
      return res.status(400).json({ error: 'Veuillez saisir votre numéro de téléphone (ou votre adresse e-mail).' });
    }

    const restaurant = findRestaurantByIdentifier(identifier);
    if (!restaurant) {
      return res.status(404).json({
        error: 'Aucun compte restaurant trouvé avec ce numéro de téléphone. Vérifiez le numéro utilisé lors de votre inscription.'
      });
    }

    // Cooldown de sécurité (30 secondes)
    const recentCode = db.get(
      "SELECT * FROM password_reset_codes WHERE restaurant_id = ? AND is_used = 0 AND created_at > datetime('now', '-30 seconds') ORDER BY id DESC LIMIT 1",
      [restaurant.id]
    );

    if (recentCode) {
      const masked = smsService.maskPhoneNumber(restaurant.phone);
      return res.json({
        success: true,
        message: 'Un code vous a déjà été envoyé très récemment. Veuillez vérifier vos messages.',
        phone: restaurant.phone,
        maskedPhone: masked,
        restaurantName: restaurant.name,
        demoCode: recentCode.code,
        cooldown: true
      });
    }

    // Générer code aléatoire à 6 chiffres
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // Valable 15 minutes

    // Enregistrer en base de données
    db.run(
      'INSERT INTO password_reset_codes (restaurant_id, phone, code, expires_at) VALUES (?, ?, ?, ?)',
      [restaurant.id, restaurant.phone, code, expiresAt]
    );

    // Expédier via le service SMS
    const smsResult = await smsService.sendResetCodeSMS(restaurant.phone, code, restaurant.name);

    return res.json({
      success: true,
      message: `Code envoyé avec succès par SMS au ${smsResult.maskedPhone} !`,
      phone: restaurant.phone,
      maskedPhone: smsResult.maskedPhone,
      restaurantName: restaurant.name,
      demoCode: smsResult.demoCode,
      whatsappUrl: smsResult.whatsappUrl
    });
  } catch (err) {
    console.error('Erreur send-code:', err);
    return res.status(500).json({ error: 'Erreur lors de l\'envoi du code par SMS. Veuillez réessayer.' });
  }
});

// Étape 2 : Vérification du code SMS saisi
router.post('/forgot-password/verify-code', (req, res) => {
  try {
    const { identifier, code } = req.body;
    if (!identifier || !code) {
      return res.status(400).json({ error: 'Veuillez saisir le numéro de téléphone et le code à 6 chiffres.' });
    }

    const restaurant = findRestaurantByIdentifier(identifier);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant introuvable.' });
    }

    const cleanCode = String(code).trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      return res.status(400).json({ error: 'Le code doit contenir exactement 6 chiffres.' });
    }

    const record = db.get(
      'SELECT * FROM password_reset_codes WHERE restaurant_id = ? AND is_used = 0 ORDER BY id DESC LIMIT 1',
      [restaurant.id]
    );

    if (!record) {
      return res.status(400).json({ error: 'Aucun code actif. Veuillez demander un nouveau code.' });
    }

    if (Date.now() > record.expires_at) {
      return res.status(400).json({ error: 'Ce code a expiré. Veuillez demander un nouveau code.' });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Nombre maximal de tentatives dépassé. Veuillez demander un nouveau code.' });
    }

    if (record.code !== cleanCode) {
      db.run('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?', [record.id]);
      const remaining = 5 - (record.attempts + 1);
      return res.status(400).json({
        error: `Code SMS incorrect. Vérifiez le SMS reçu (${remaining} essai${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}).`
      });
    }

    // Code valide : création d'un jeton temporaire unique pour la réinitialisation
    const resetToken = crypto.randomUUID();
    db.run('UPDATE password_reset_codes SET reset_token = ? WHERE id = ?', [resetToken, record.id]);

    return res.json({
      success: true,
      message: 'Code validé avec succès ! Vous pouvez maintenant définir un nouveau mot de passe.',
      resetToken
    });
  } catch (err) {
    console.error('Erreur verify-code:', err);
    return res.status(500).json({ error: 'Erreur lors de la vérification du code.' });
  }
});

// Étape 3 : Application du nouveau mot de passe
router.post('/forgot-password/reset-password', (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'Veuillez saisir votre nouveau mot de passe.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit comporter au moins 6 caractères.' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Les deux mots de passe ne correspondent pas.' });
    }

    const record = db.get(
      'SELECT * FROM password_reset_codes WHERE reset_token = ? AND is_used = 0 AND expires_at > ?',
      [resetToken, Date.now()]
    );

    if (!record) {
      return res.status(400).json({ error: 'Session de réinitialisation expirée ou invalide. Veuillez recommencer.' });
    }

    // Hasher le nouveau mot de passe
    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    // Mettre à jour le restaurant et marquer le code comme consommé
    db.transaction(() => {
      db.run('UPDATE restaurants SET password_hash = ? WHERE id = ?', [newHash, record.restaurant_id]);
      db.run('UPDATE password_reset_codes SET is_used = 1 WHERE id = ?', [record.id]);

      // Créer une nouvelle session pour connecter directement le restaurant
      const sessionToken = crypto.randomUUID();
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      db.run(
        'INSERT INTO sessions (token, restaurant_id, expires_at) VALUES (?, ?, ?)',
        [sessionToken, record.restaurant_id, expiresAt]
      );

      res.cookie('md_session', sessionToken, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
        sameSite: 'lax'
      });
    });

    return res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès ! Connexion automatique en cours...',
      redirect: '/dashboard'
    });
  } catch (err) {
    console.error('Erreur reset-password:', err);
    return res.status(500).json({ error: 'Impossible de réinitialiser le mot de passe. Veuillez réessayer.' });
  }
});

module.exports = router;

