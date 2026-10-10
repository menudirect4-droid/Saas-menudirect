const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Configuration du stockage des images
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    cb(null, `dish-${Date.now()}-${cleanName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      return cb(null, true);
    }
    cb(new Error('Format d\'image non supporté (utilisez JPG, PNG ou WebP).'));
  }
});

// Toutes les routes menu requièrent l'authentification
router.use(requireAuth);

// ==========================================
// CATÉGORIES
// ==========================================

// Liste des catégories
router.get('/categories', (req, res) => {
  try {
    const categories = db.query(
      `SELECT c.*, (SELECT COUNT(*) FROM dishes d WHERE d.category_id = c.id) as dishes_count
       FROM categories c
       WHERE c.restaurant_id = ?
       ORDER BY c.display_order ASC, c.id ASC`,
      [req.restaurant.id]
    );
    res.json({ success: true, categories });
  } catch (err) {
    console.error('Erreur récupération catégories:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories.' });
  }
});

// Ajouter une catégorie
router.post('/categories', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire.' });
    }

    const maxOrder = db.get(
      'SELECT MAX(display_order) as max_order FROM categories WHERE restaurant_id = ?',
      [req.restaurant.id]
    );
    const nextOrder = (maxOrder?.max_order || 0) + 1;

    const result = db.run(
      'INSERT INTO categories (restaurant_id, name, display_order) VALUES (?, ?, ?)',
      [req.restaurant.id, name.trim(), nextOrder]
    );

    const newCat = db.get('SELECT * FROM categories WHERE id = ?', [Number(result.lastInsertRowid)]);
    res.status(201).json({ success: true, category: newCat });
  } catch (err) {
    console.error('Erreur création catégorie:', err);
    res.status(500).json({ error: 'Impossible de créer la catégorie.' });
  }
});

// Modifier une catégorie
router.put('/categories/:id', (req, res) => {
  try {
    const catId = Number(req.params.id);
    const { name, display_order } = req.body;

    const category = db.get('SELECT * FROM categories WHERE id = ? AND restaurant_id = ?', [catId, req.restaurant.id]);
    if (!category) {
      return res.status(404).json({ error: 'Catégorie introuvable.' });
    }

    const newName = name ? name.trim() : category.name;
    const newOrder = display_order !== undefined ? Number(display_order) : category.display_order;

    db.run(
      'UPDATE categories SET name = ?, display_order = ? WHERE id = ? AND restaurant_id = ?',
      [newName, newOrder, catId, req.restaurant.id]
    );

    const updated = db.get('SELECT * FROM categories WHERE id = ?', [catId]);
    res.json({ success: true, category: updated });
  } catch (err) {
    console.error('Erreur mise à jour catégorie:', err);
    res.status(500).json({ error: 'Erreur lors de la modification de la catégorie.' });
  }
});

// Supprimer une catégorie
router.delete('/categories/:id', (req, res) => {
  try {
    const catId = Number(req.params.id);
    const category = db.get('SELECT * FROM categories WHERE id = ? AND restaurant_id = ?', [catId, req.restaurant.id]);
    if (!category) {
      return res.status(404).json({ error: 'Catégorie introuvable.' });
    }

    db.run('DELETE FROM categories WHERE id = ? AND restaurant_id = ?', [catId, req.restaurant.id]);
    res.json({ success: true, message: 'Catégorie supprimée avec succès.' });
  } catch (err) {
    console.error('Erreur suppression catégorie:', err);
    res.status(500).json({ error: 'Impossible de supprimer cette catégorie.' });
  }
});

// ==========================================
// PLATS (DISHES)
// ==========================================

// Liste des plats
router.get('/dishes', (req, res) => {
  try {
    const dishes = db.query(
      `SELECT d.*, c.name as category_name
       FROM dishes d
       LEFT JOIN categories c ON d.category_id = c.id
       WHERE d.restaurant_id = ?
       ORDER BY d.is_active DESC, c.display_order ASC, d.id DESC`,
      [req.restaurant.id]
    );
    res.json({ success: true, dishes });
  } catch (err) {
    console.error('Erreur récupération plats:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du menu.' });
  }
});

// Ajouter un plat (gère multipart file ou json/urlencoded)
router.post('/dishes', upload.single('image'), (req, res) => {
  try {
    const { name, description = '', price, category_id, image_url = '', is_active = 1 } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom du plat est obligatoire.' });
    }

    const numPrice = parseInt(price, 10);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ error: 'Le prix doit être un nombre positif en FCFA.' });
    }

    let finalImageUrl = image_url ? image_url.trim() : '';
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    }

    // Vérifier la catégorie si fournie
    let catId = category_id ? Number(category_id) : null;
    if (catId) {
      const cat = db.get('SELECT id FROM categories WHERE id = ? AND restaurant_id = ?', [catId, req.restaurant.id]);
      if (!cat) catId = null;
    }

    const result = db.run(
      `INSERT INTO dishes (restaurant_id, category_id, name, description, price, image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.restaurant.id,
        catId,
        name.trim(),
        description.trim(),
        numPrice,
        finalImageUrl,
        Number(is_active) ? 1 : 0
      ]
    );

    const newDish = db.get(
      `SELECT d.*, c.name as category_name FROM dishes d LEFT JOIN categories c ON d.category_id = c.id WHERE d.id = ?`,
      [Number(result.lastInsertRowid)]
    );

    res.status(201).json({ success: true, dish: newDish, message: 'Plat ajouté avec succès !' });
  } catch (err) {
    console.error('Erreur création plat:', err);
    res.status(500).json({ error: err.message || 'Impossible d\'ajouter ce plat.' });
  }
});

// Modifier un plat
router.put('/dishes/:id', upload.single('image'), (req, res) => {
  try {
    const dishId = Number(req.params.id);
    const existing = db.get('SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?', [dishId, req.restaurant.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Plat introuvable.' });
    }

    const { name, description, price, category_id, image_url, is_active } = req.body;

    const newName = name !== undefined ? name.trim() : existing.name;
    const newDesc = description !== undefined ? description.trim() : existing.description;
    const newPrice = price !== undefined ? parseInt(price, 10) : existing.price;

    let finalImageUrl = existing.image_url;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    } else if (image_url !== undefined) {
      finalImageUrl = image_url.trim();
    }

    let catId = category_id !== undefined ? (category_id ? Number(category_id) : null) : existing.category_id;
    if (catId) {
      const cat = db.get('SELECT id FROM categories WHERE id = ? AND restaurant_id = ?', [catId, req.restaurant.id]);
      if (!cat) catId = null;
    }

    const activeState = is_active !== undefined ? (Number(is_active) ? 1 : 0) : existing.is_active;

    db.run(
      `UPDATE dishes SET name = ?, description = ?, price = ?, category_id = ?, image_url = ?, is_active = ?
       WHERE id = ? AND restaurant_id = ?`,
      [newName, newDesc, newPrice, catId, finalImageUrl, activeState, dishId, req.restaurant.id]
    );

    const updated = db.get(
      `SELECT d.*, c.name as category_name FROM dishes d LEFT JOIN categories c ON d.category_id = c.id WHERE d.id = ?`,
      [dishId]
    );

    res.json({ success: true, dish: updated, message: 'Plat modifié avec succès !' });
  } catch (err) {
    console.error('Erreur modification plat:', err);
    res.status(500).json({ error: 'Impossible de modifier ce plat.' });
  }
});

// Activer / Désactiver un plat (switch disponibilité)
router.patch('/dishes/:id/toggle-active', (req, res) => {
  try {
    const dishId = Number(req.params.id);
    const existing = db.get('SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?', [dishId, req.restaurant.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Plat introuvable.' });
    }

    const newState = existing.is_active ? 0 : 1;
    db.run('UPDATE dishes SET is_active = ? WHERE id = ? AND restaurant_id = ?', [newState, dishId, req.restaurant.id]);

    res.json({
      success: true,
      is_active: newState,
      message: newState ? 'Le plat est maintenant disponible.' : 'Le plat est marqué comme épuisé.'
    });
  } catch (err) {
    console.error('Erreur toggle plat:', err);
    res.status(500).json({ error: 'Impossible de modifier la disponibilité.' });
  }
});

// Supprimer un plat
router.delete('/dishes/:id', (req, res) => {
  try {
    const dishId = Number(req.params.id);
    const existing = db.get('SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?', [dishId, req.restaurant.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Plat introuvable.' });
    }

    db.run('DELETE FROM dishes WHERE id = ? AND restaurant_id = ?', [dishId, req.restaurant.id]);
    res.json({ success: true, message: 'Plat supprimé du menu avec succès.' });
  } catch (err) {
    console.error('Erreur suppression plat:', err);
    res.status(500).json({ error: 'Impossible de supprimer ce plat.' });
  }
});

module.exports = router;
