const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Liste des clients du restaurant
router.get('/', (req, res) => {
  try {
    const customers = db.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM orders o WHERE o.customer_phone = c.phone AND o.restaurant_id = c.restaurant_id) as actual_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.customer_phone = c.phone AND o.restaurant_id = c.restaurant_id AND o.status != 'annulee') as actual_spent
       FROM customers c
       WHERE c.restaurant_id = ?
       ORDER BY c.last_order_at DESC, c.id DESC`,
      [req.restaurant.id]
    );

    res.json({ success: true, customers });
  } catch (err) {
    console.error('Erreur récupération clients:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des clients.' });
  }
});

// Détails d'un client et son historique
router.get('/:id', (req, res) => {
  try {
    const customerId = Number(req.params.id);
    const customer = db.get(
      'SELECT * FROM customers WHERE id = ? AND restaurant_id = ?',
      [customerId, req.restaurant.id]
    );

    if (!customer) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }

    const orders = db.query(
      'SELECT * FROM orders WHERE restaurant_id = ? AND customer_phone = ? ORDER BY id DESC',
      [req.restaurant.id, customer.phone]
    );

    res.json({
      success: true,
      customer: {
        ...customer,
        orders
      }
    });
  } catch (err) {
    console.error('Erreur détails client:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du client.' });
  }
});

module.exports = router;
