const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

// Récupérer le menu public d'un restaurant par son slug
router.get('/:slug', (req, res) => {
  try {
    const slug = req.params.slug.trim().toLowerCase();
    const restaurant = db.get(
      `SELECT id, name, slug, owner_name, phone, email, city, country, address, description, logo_url, opening_hours,
              cover_image_url, brand_color, tagline, custom_domain, instagram_handle, whatsapp_number, facebook_url, theme_style
       FROM restaurants WHERE slug = ? OR custom_domain = ?`,
      [slug, slug]
    );

    if (!restaurant) {
      return res.status(404).json({ error: 'Ce restaurant n\'existe pas ou a modifié son adresse.' });
    }

    // Récupérer les catégories
    const categories = db.query(
      `SELECT id, name, display_order
       FROM categories
       WHERE restaurant_id = ?
       ORDER BY display_order ASC, id ASC`,
      [restaurant.id]
    );

    // Récupérer les plats actifs
    const dishes = db.query(
      `SELECT id, category_id, name, description, price, image_url, is_active
       FROM dishes
       WHERE restaurant_id = ? AND is_active = 1
       ORDER BY id DESC`,
      [restaurant.id]
    );

    // Récupérer les traductions validées des plats
    const dishTranslations = db.query(
      `SELECT dish_id, language, name, description
       FROM dish_translations
       WHERE restaurant_id = ? AND status = 'valide'`,
      [restaurant.id]
    );

    // Récupérer les traductions des catégories
    const catTranslations = db.query(
      `SELECT category_id, language, name
       FROM category_translations
       WHERE restaurant_id = ? AND status = 'valide'`,
      [restaurant.id]
    );

    const translations = {
      dishes: {},
      categories: {}
    };

    dishTranslations.forEach(t => {
      if (!translations.dishes[t.dish_id]) {
        translations.dishes[t.dish_id] = {};
      }
      translations.dishes[t.dish_id][t.language] = {
        name: t.name,
        description: t.description
      };
    });

    catTranslations.forEach(t => {
      if (!translations.categories[t.category_id]) {
        translations.categories[t.category_id] = {};
      }
      translations.categories[t.category_id][t.language] = t.name;
    });

    res.json({
      success: true,
      restaurant,
      categories,
      dishes,
      translations
    });
  } catch (err) {
    console.error('Erreur menu public:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du menu.' });
  }
});

// Passer une commande client
router.post('/:slug/order', (req, res) => {
  try {
    const slug = req.params.slug.trim().toLowerCase();
    const restaurant = db.get('SELECT id, name, phone FROM restaurants WHERE slug = ?', [slug]);

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant introuvable.' });
    }

    const {
      customer_name,
      customer_phone,
      customer_address = '',
      notes = '',
      payment_method = 'especes',
      items = []
    } = req.body;

    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: 'Veuillez renseigner votre nom complet.' });
    }

    if (!customer_phone || !customer_phone.trim()) {
      return res.status(400).json({ error: 'Veuillez renseigner votre numéro de téléphone.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Votre panier est vide. Veuillez ajouter au moins un plat.' });
    }

    // Valider et calculer les prix depuis la base de données
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const dishId = Number(item.id);
      const qty = parseInt(item.quantity, 10);

      if (!dishId || isNaN(qty) || qty <= 0) {
        continue;
      }

      const dish = db.get(
        'SELECT id, name, price, is_active FROM dishes WHERE id = ? AND restaurant_id = ?',
        [dishId, restaurant.id]
      );

      if (!dish || !dish.is_active) {
        return res.status(400).json({
          error: `Le plat "${item.name || 'sélectionné'}" n'est plus disponible actuellement.`
        });
      }

      const subtotal = dish.price * qty;
      totalAmount += subtotal;

      validatedItems.push({
        dish_id: dish.id,
        dish_name: dish.name,
        unit_price: dish.price,
        quantity: qty,
        subtotal
      });
    }

    if (validatedItems.length === 0) {
      return res.status(400).json({ error: 'Aucun plat valide dans votre commande.' });
    }

    // Générer numéro de commande unique lisible : ex CMD-2026-4921
    const year = new Date().getFullYear();
    const randDigits = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `CMD-${year}-${randDigits}`;

    // Transaction atomique : commande + items + client + paiement
    const createdOrder = db.transaction(() => {
      // 1. Insérer la commande
      const orderInsert = db.run(
        `INSERT INTO orders (order_number, restaurant_id, customer_name, customer_phone, customer_address, notes, total_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'nouvelle')`,
        [
          orderNumber,
          restaurant.id,
          customer_name.trim(),
          customer_phone.trim(),
          customer_address.trim(),
          notes.trim(),
          totalAmount
        ]
      );

      const orderId = Number(orderInsert.lastInsertRowid);

      // 2. Insérer les articles
      for (const it of validatedItems) {
        db.run(
          `INSERT INTO order_items (order_id, dish_id, dish_name, unit_price, quantity, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, it.dish_id, it.dish_name, it.unit_price, it.quantity, it.subtotal]
        );
      }

      // 3. Mettre à jour ou insérer le client
      const existingCustomer = db.get(
        'SELECT id, orders_count, total_spent FROM customers WHERE restaurant_id = ? AND phone = ?',
        [restaurant.id, customer_phone.trim()]
      );

      if (existingCustomer) {
        db.run(
          `UPDATE customers 
           SET name = ?, address = ?, orders_count = orders_count + 1, total_spent = total_spent + ?, last_order_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [customer_name.trim(), customer_address.trim(), totalAmount, existingCustomer.id]
        );
      } else {
        db.run(
          `INSERT INTO customers (restaurant_id, name, phone, address, orders_count, total_spent)
           VALUES (?, ?, ?, ?, 1, ?)`,
          [restaurant.id, customer_name.trim(), customer_phone.trim(), customer_address.trim(), totalAmount]
        );
      }

      // 4. Insérer l'enregistrement de paiement
      db.run(
        `INSERT INTO payments (order_id, restaurant_id, amount, payment_method, status)
         VALUES (?, ?, ?, ?, 'en_attente')`,
        [orderId, restaurant.id, totalAmount, payment_method === 'mobile_money' ? 'mobile_money' : 'especes']
      );

      return {
        id: orderId,
        order_number: orderNumber,
        total_amount: totalAmount,
        items_count: validatedItems.length
      };
    });

    res.status(201).json({
      success: true,
      message: 'Votre commande a été transmise avec succès au restaurant !',
      order: {
        id: createdOrder.id,
        order_number: createdOrder.order_number,
        total_amount: createdOrder.total_amount,
        customer_name: customer_name.trim(),
        restaurant_name: restaurant.name,
        restaurant_phone: restaurant.phone
      }
    });
  } catch (err) {
    console.error('Erreur création commande client:', err);
    res.status(500).json({ error: 'Une erreur est survenue lors de la création de votre commande.' });
  }
});

module.exports = router;
