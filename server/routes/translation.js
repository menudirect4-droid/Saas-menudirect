const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const translationService = require('../services/translationService');

/**
 * GET /api/translate/languages
 * Retourne les langues supportées (accessible publiquement)
 */
router.get('/languages', (req, res) => {
  res.json({
    success: true,
    languages: translationService.SUPPORTED_LANGUAGES
  });
});

// Toutes les routes suivantes nécessitent l'authentification du restaurant
router.use(requireAuth);

/**
 * GET /api/translate/status
 * Statistiques de couverture des traductions pour le restaurant
 */
router.get('/status', (req, res) => {
  try {
    const totalDishes = db.get(
      'SELECT COUNT(*) as total FROM dishes WHERE restaurant_id = ? AND is_active = 1',
      [req.restaurant.id]
    )?.total || 0;

    const stats = db.query(
      `SELECT language, COUNT(*) as count 
       FROM dish_translations 
       WHERE restaurant_id = ? 
       GROUP BY language`,
      [req.restaurant.id]
    );

    const coverage = {};
    Object.keys(translationService.SUPPORTED_LANGUAGES).forEach(lang => {
      if (lang !== 'fr') coverage[lang] = 0;
    });

    stats.forEach(s => {
      coverage[s.language] = s.count;
    });

    res.json({
      success: true,
      totalDishes,
      coverage
    });
  } catch (err) {
    console.error('Erreur récupération statut traductions:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques de traduction.' });
  }
});

/**
 * POST /api/translate/preview
 * Prévisualisation de traduction (ne modifie pas la base de données)
 */
/**
 * POST /api/translate/preview
 * Prévisualisation de traduction culinaire (supporte 1 ou plusieurs langues cibles)
 */
router.post('/preview', async (req, res) => {
  try {
    let targetLangs = req.body.targetLangs || req.body.targetLanguages;
    if (!targetLangs) {
      const single = req.body.targetLang || req.body.targetLanguage;
      if (single) targetLangs = [single];
    }

    if (!Array.isArray(targetLangs) || targetLangs.length === 0) {
      return res.status(400).json({ error: 'Veuillez sélectionner au moins une langue de destination.' });
    }

    const sourceLang = req.body.sourceLang || req.body.sourceLanguage || 'fr';
    const { scope = 'all', dishIds = [], categoryId } = req.body;

    // Filtrer les langues valides
    const validTargetLangs = targetLangs.filter(l => translationService.SUPPORTED_LANGUAGES[l] && l !== sourceLang);
    if (validTargetLangs.length === 0) {
      return res.status(400).json({ error: 'Aucune langue cible valide différente de la langue d\'origine.' });
    }

    // Récupérer les plats concernés appartenant à ce restaurant
    let dishesToTranslate = [];

    if (Array.isArray(dishIds) && dishIds.length > 0) {
      const placeholders = dishIds.map(() => '?').join(',');
      dishesToTranslate = db.query(
        `SELECT d.id, d.name, d.description, d.price, c.name as category_name
         FROM dishes d
         LEFT JOIN categories c ON d.category_id = c.id
         WHERE d.restaurant_id = ? AND d.id IN (${placeholders})`,
        [req.restaurant.id, ...dishIds]
      );
    } else if (categoryId && categoryId !== 'all') {
      dishesToTranslate = db.query(
        `SELECT d.id, d.name, d.description, d.price, c.name as category_name
         FROM dishes d
         LEFT JOIN categories c ON d.category_id = c.id
         WHERE d.restaurant_id = ? AND d.category_id = ?`,
        [req.restaurant.id, Number(categoryId)]
      );
    } else {
      // Tout le menu
      dishesToTranslate = db.query(
        `SELECT d.id, d.name, d.description, d.price, c.name as category_name
         FROM dishes d
         LEFT JOIN categories c ON d.category_id = c.id
         WHERE d.restaurant_id = ? AND d.is_active = 1`,
        [req.restaurant.id]
      );
    }

    if (dishesToTranslate.length === 0) {
      return res.status(404).json({ error: 'Aucun plat trouvé pour la traduction.' });
    }

    // Traduire pour chaque langue cible
    const resultsByLang = {};

    for (const targetLang of validTargetLangs) {
      const translatedResults = await translationService.translateBatch(
        dishesToTranslate.map(d => ({ id: d.id, name: d.name, description: d.description || '' })),
        { sourceLang, targetLang }
      );

      const resultMap = new Map(translatedResults.map(r => [r.id, r]));

      resultsByLang[targetLang] = dishesToTranslate.map(d => {
        const trans = resultMap.get(d.id) || {};
        return {
          dishId: d.id,
          targetLang,
          originalName: d.name,
          originalDescription: d.description || '',
          translatedName: trans.translatedName || d.name,
          translatedDescription: trans.translatedDescription || d.description || '',
          categoryName: d.category_name || 'Général',
          price: d.price,
          fromCache: !!trans.fromCache
        };
      });
    }

    // Récupérer et traduire également les catégories si tout le menu
    const categories = db.query('SELECT id, name FROM categories WHERE restaurant_id = ?', [req.restaurant.id]);
    const categoriesByLang = {};
    for (const targetLang of validTargetLangs) {
      const catResults = await translationService.translateBatch(
        categories.map(c => ({ id: c.id, name: c.name, description: '' })),
        { sourceLang, targetLang }
      );
      categoriesByLang[targetLang] = catResults.map(cr => ({
        categoryId: cr.id,
        originalName: categories.find(c => c.id === cr.id)?.name || '',
        translatedName: cr.translatedName || ''
      }));
    }

    res.json({
      success: true,
      sourceLang,
      targetLangs: validTargetLangs,
      resultsByLang,
      categoriesByLang,
      // Compatibilité pour appels avec un seul targetLang
      items: resultsByLang[validTargetLangs[0]] || []
    });
  } catch (err) {
    console.error('Erreur prévisualisation traduction:', err);
    res.status(500).json({ error: 'Impossible de générer la traduction culinaire pour le moment.' });
  }
});

/**
 * POST /api/translate/save
 * Sauvegarde les traductions validées ou modifiées
 */
router.post('/save', (req, res) => {
  try {
    const { translations = [], categoryTranslations = [], targetLang, sourceLang = 'fr' } = req.body;

    if (!Array.isArray(translations) && !Array.isArray(categoryTranslations)) {
      return res.status(400).json({ error: 'Aucune traduction fournie.' });
    }

    let savedDishesCount = 0;
    let savedCatsCount = 0;

    db.transaction(() => {
      // 1. Sauvegarde des plats
      if (Array.isArray(translations)) {
        for (const item of translations) {
          const dishId = Number(item.dishId || item.dish_id);
          const lang = item.targetLang || item.language || targetLang;
          const name = (item.translatedName || item.name || '').trim();
          const description = (item.translatedDescription !== undefined ? item.translatedDescription : (item.description || '')).trim();
          const status = item.status === 'brouillon' ? 'brouillon' : 'valide';

          if (!dishId || !name || !lang) continue;

          const dish = db.get('SELECT id FROM dishes WHERE id = ? AND restaurant_id = ?', [dishId, req.restaurant.id]);
          if (!dish) continue;

          db.run(
            `INSERT INTO dish_translations (restaurant_id, dish_id, language, name, description, status, source_lang, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(restaurant_id, dish_id, language) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               status = excluded.status,
               updated_at = CURRENT_TIMESTAMP`,
            [req.restaurant.id, dishId, lang, name, description, status, sourceLang]
          );
          savedDishesCount++;
        }
      }

      // 2. Sauvegarde des catégories
      if (Array.isArray(categoryTranslations)) {
        for (const cat of categoryTranslations) {
          const categoryId = Number(cat.categoryId || cat.category_id);
          const lang = cat.targetLang || cat.language || targetLang;
          const name = (cat.translatedName || cat.name || '').trim();

          if (!categoryId || !name || !lang) continue;

          const category = db.get('SELECT id FROM categories WHERE id = ? AND restaurant_id = ?', [categoryId, req.restaurant.id]);
          if (!category) continue;

          db.run(
            `INSERT INTO category_translations (restaurant_id, category_id, language, name, status, source_lang, updated_at)
             VALUES (?, ?, ?, ?, 'valide', ?, CURRENT_TIMESTAMP)
             ON CONFLICT(restaurant_id, category_id, language) DO UPDATE SET
               name = excluded.name,
               status = excluded.status,
               updated_at = CURRENT_TIMESTAMP`,
            [req.restaurant.id, categoryId, lang, name, sourceLang]
          );
          savedCatsCount++;
        }
      }
    });

    res.json({
      success: true,
      savedDishesCount,
      savedCatsCount,
      message: `${savedDishesCount} plat(s) et ${savedCatsCount} catégorie(s) enregistrés avec succès !`
    });
  } catch (err) {
    console.error('Erreur sauvegarde traductions:', err);
    res.status(500).json({ error: 'Impossible d\'enregistrer les traductions.' });
  }
});

/**
 * GET /api/translate/dishes/:lang
 * Récupérer toutes les traductions pour une langue donnée
 */
router.get('/dishes/:lang', (req, res) => {
  try {
    const lang = req.params.lang.trim().toLowerCase();
    const translations = db.query(
      `SELECT dt.*, d.name as original_name, d.description as original_description, d.price, c.name as category_name
       FROM dish_translations dt
       JOIN dishes d ON dt.dish_id = d.id
       LEFT JOIN categories c ON d.category_id = c.id
       WHERE dt.restaurant_id = ? AND dt.language = ?
       ORDER BY dt.updated_at DESC`,
      [req.restaurant.id, lang]
    );

    res.json({
      success: true,
      language: lang,
      translations
    });
  } catch (err) {
    console.error('Erreur récupération traductions:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des traductions.' });
  }
});

/**
 * PUT /api/translate/dish
 * Met à jour manuellement la traduction d'un plat
 */
router.put('/dish', (req, res) => {
  try {
    const { dishId, language, name, description } = req.body;
    if (!dishId || !language || !name) {
      return res.status(400).json({ error: 'Identifiant du plat, langue et nom traduit requis.' });
    }
    const dish = db.get('SELECT id FROM dishes WHERE id = ? AND restaurant_id = ?', [Number(dishId), req.restaurant.id]);
    if (!dish) return res.status(404).json({ error: 'Plat introuvable.' });

    db.run(
      `INSERT INTO dish_translations (restaurant_id, dish_id, language, name, description, status, source_lang, updated_at)
       VALUES (?, ?, ?, ?, ?, 'valide', 'fr', CURRENT_TIMESTAMP)
       ON CONFLICT(restaurant_id, dish_id, language) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         status = 'valide',
         updated_at = CURRENT_TIMESTAMP`,
      [req.restaurant.id, Number(dishId), language.toLowerCase().trim(), name.trim(), (description || '').trim()]
    );

    res.json({ success: true, message: 'Traduction mise à jour avec succès !' });
  } catch (err) {
    console.error('Erreur mise à jour traduction plat:', err);
    res.status(500).json({ error: 'Impossible de mettre à jour la traduction.' });
  }
});

/**
 * DELETE /api/translate/:dishId/:lang
 * Supprime la traduction d'un plat pour une langue
 */
router.delete('/:dishId/:lang', (req, res) => {
  try {
    const dishId = Number(req.params.dishId);
    const lang = req.params.lang.trim().toLowerCase();

    db.run(
      'DELETE FROM dish_translations WHERE restaurant_id = ? AND dish_id = ? AND language = ?',
      [req.restaurant.id, dishId, lang]
    );

    res.json({ success: true, message: 'Traduction supprimée.' });
  } catch (err) {
    console.error('Erreur suppression traduction:', err);
    res.status(500).json({ error: 'Impossible de supprimer cette traduction.' });
  }
});

module.exports = router;
