const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Liste des paiements du restaurant
router.get('/', (req, res) => {
  try {
    const payments = db.query(
      `SELECT p.*, o.order_number, o.customer_name, o.customer_phone
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.restaurant_id = ?
       ORDER BY p.id DESC`,
      [req.restaurant.id]
    );

    const stats = db.get(
      `SELECT 
        COALESCE(SUM(CASE WHEN status = 'paye' THEN amount ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status = 'en_attente' THEN amount ELSE 0 END), 0) as pending_amount,
        COUNT(*) as total_count
       FROM payments WHERE restaurant_id = ?`,
      [req.restaurant.id]
    );

    res.json({
      success: true,
      payments,
      stats: {
        paid_amount: stats?.paid_amount || 0,
        pending_amount: stats?.pending_amount || 0,
        total_count: stats?.total_count || 0
      }
    });
  } catch (err) {
    console.error('Erreur récupération paiements:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des paiements.' });
  }
});

// Modifier statut d'un paiement
router.patch('/:id/status', (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    const { status, payment_method } = req.body;

    const existing = db.get(
      'SELECT * FROM payments WHERE id = ? AND restaurant_id = ?',
      [paymentId, req.restaurant.id]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Paiement introuvable.' });
    }

    const newStatus = status || existing.status;
    const newMethod = payment_method || existing.payment_method;

    db.run(
      'UPDATE payments SET status = ?, payment_method = ? WHERE id = ? AND restaurant_id = ?',
      [newStatus, newMethod, paymentId, req.restaurant.id]
    );

    res.json({ success: true, message: 'Paiement mis à jour.' });
  } catch (err) {
    console.error('Erreur mise à jour paiement:', err);
    res.status(500).json({ error: 'Impossible de mettre à jour le paiement.' });
  }
});

module.exports = router;
