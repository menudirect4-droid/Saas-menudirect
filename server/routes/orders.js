const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const VALID_STATUSES = ['nouvelle', 'acceptee', 'en_preparation', 'prete', 'terminee', 'annulee'];

// Statistiques d'accueil du dashboard
router.get('/stats', (req, res) => {
  try {
    const restaurantId = req.restaurant.id;

    // Date du jour (format YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    // Commandes aujourd'hui
    const todayOrders = db.get(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
       FROM orders
       WHERE restaurant_id = ? AND date(created_at) = date('now', 'localtime') AND status != 'annulee'`,
      [restaurantId]
    );

    // Commandes par statut en cours
    const pendingCount = db.get(
      `SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ? AND status = 'nouvelle'`,
      [restaurantId]
    );

    const preparingCount = db.get(
      `SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ? AND status IN ('acceptee', 'en_preparation')`,
      [restaurantId]
    );

    const readyCount = db.get(
      `SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ? AND status = 'prete'`,
      [restaurantId]
    );

    const completedToday = db.get(
      `SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ? AND status = 'terminee' AND date(created_at) = date('now', 'localtime')`,
      [restaurantId]
    );

    // Chiffre d'affaires total
    const totalStats = db.get(
      `SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount), 0) as total_revenue
       FROM orders WHERE restaurant_id = ? AND status != 'annulee'`,
      [restaurantId]
    );

    // Dernières commandes (5)
    const recentOrders = db.query(
      `SELECT o.*, 
        (SELECT json_group_array(json_object(
          'id', oi.id,
          'dish_name', oi.dish_name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'subtotal', oi.subtotal
        )) FROM order_items oi WHERE oi.order_id = o.id) as items_json
       FROM orders o
       WHERE o.restaurant_id = ?
       ORDER BY o.id DESC
       LIMIT 5`,
      [restaurantId]
    );

    const formattedRecent = recentOrders.map(o => ({
      ...o,
      items: o.items_json ? JSON.parse(o.items_json) : []
    }));

    const period = ['today', '7', '30'].includes(String(req.query.period)) ? String(req.query.period) : '7';
    const days = period === 'today' ? 1 : Number(period);
    const periodOffset = `-${days - 1} days`;
    const salesByDay = db.query(`SELECT date(o.created_at, 'localtime') as day, COUNT(*) as orders, COALESCE(SUM(o.total_amount), 0) as revenue FROM orders o WHERE o.restaurant_id = ? AND o.status != 'annulee' AND date(o.created_at, 'localtime') >= date('now', 'localtime', ?) GROUP BY date(o.created_at, 'localtime') ORDER BY day ASC`, [restaurantId, periodOffset]);
    const topProducts = db.query(`SELECT oi.dish_name as name, SUM(oi.quantity) as quantity, SUM(oi.subtotal) as revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.restaurant_id = ? AND o.status != 'annulee' AND date(o.created_at, 'localtime') >= date('now', 'localtime', ?) GROUP BY oi.dish_name ORDER BY quantity DESC, revenue DESC LIMIT 5`, [restaurantId, periodOffset]);

    res.json({
      success: true,
      stats: {
        orders_today: todayOrders?.count || 0,
        revenue_today: todayOrders?.revenue || 0,
        pending_orders: pendingCount?.count || 0,
        preparing_orders: preparingCount?.count || 0,
        ready_orders: readyCount?.count || 0,
        completed_orders: completedToday?.count || 0,
        total_orders: totalStats?.total_orders || 0,
        total_revenue: totalStats?.total_revenue || 0
      },
      recent_orders: formattedRecent,
      analytics: { period, sales_by_day: salesByDay, top_products: topProducts }
    });
  } catch (err) {
    console.error('Erreur récupération stats:', err);
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques.' });
  }
});

// Liste des commandes avec filtres et items
router.get('/', (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const restaurantId = req.restaurant.id;

    let sql = `
      SELECT o.*,
        (SELECT json_group_array(json_object(
          'id', oi.id,
          'dish_name', oi.dish_name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'subtotal', oi.subtotal
        )) FROM order_items oi WHERE oi.order_id = o.id) as items_json
      FROM orders o
      WHERE o.restaurant_id = ?
    `;
    const params = [restaurantId];

    if (status && VALID_STATUSES.includes(status)) {
      sql += ` AND o.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY o.id DESC LIMIT ?`;
    params.push(Number(limit) || 50);

    const orders = db.query(sql, params);

    const formattedOrders = orders.map(o => ({
      ...o,
      items: o.items_json ? JSON.parse(o.items_json) : []
    }));

    res.json({
      success: true,
      orders: formattedOrders,
      count: formattedOrders.length
    });
  } catch (err) {
    console.error('Erreur récupération commandes:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des commandes.' });
  }
});

// Détails d'une commande
router.get('/:id', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = db.get(
      'SELECT * FROM orders WHERE id = ? AND restaurant_id = ?',
      [orderId, req.restaurant.id]
    );

    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    const items = db.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orderId]
    );

    const payment = db.get(
      'SELECT * FROM payments WHERE order_id = ?',
      [orderId]
    );

    res.json({
      success: true,
      order: {
        ...order,
        items,
        payment
      }
    });
  } catch (err) {
    console.error('Erreur détails commande:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de la commande.' });
  }
});

// Mise à jour du statut d'une commande
router.patch('/:id/status', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Statut invalide. Choisissez parmi : ${VALID_STATUSES.join(', ')}.`
      });
    }

    const existing = db.get(
      'SELECT * FROM orders WHERE id = ? AND restaurant_id = ?',
      [orderId, req.restaurant.id]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    db.transaction(() => {
      db.run(
        `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`,
        [status, orderId, req.restaurant.id]
      );

      // Si la commande est terminée, marquer le paiement comme payé
      if (status === 'terminee') {
        db.run(
          `UPDATE payments SET status = 'paye' WHERE order_id = ? AND restaurant_id = ?`,
          [orderId, req.restaurant.id]
        );
      } else if (status === 'annulee') {
        db.run(
          `UPDATE payments SET status = 'annule' WHERE order_id = ? AND restaurant_id = ?`,
          [orderId, req.restaurant.id]
        );
      }
    });

    const updated = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);

    res.json({
      success: true,
      message: `Statut de la commande ${updated.order_number} mis à jour en "${status}".`,
      order: updated
    });
  } catch (err) {
    console.error('Erreur changement statut:', err);
    res.status(500).json({ error: 'Impossible de changer le statut de la commande.' });
  }
});

module.exports = router;
