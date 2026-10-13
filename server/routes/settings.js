const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const isVercel = Boolean(process.env.VERCEL);
const uploadDir = isVercel
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '..', '..', 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Générateur de slug URL-friendly
function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'restaurant';
}

router.use(requireAuth);

// Récupérer les paramètres du profil restaurant et branding
router.get('/', (req, res) => {
  try {
    const restaurant = db.get(
      `SELECT id, name, slug, owner_name, phone, email, city, country, address, description, logo_url, opening_hours,
              subscription_plan, subscription_status, created_at,
              cover_image_url, brand_color, tagline, custom_domain, domain_status, instagram_handle, whatsapp_number, facebook_url, theme_style
       FROM restaurants WHERE id = ?`,
      [req.restaurant.id]
    );

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant non trouvé.' });
    }

    res.json({ success: true, restaurant });
  } catch (err) {
    console.error('Erreur récupération paramètres:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des paramètres.' });
  }
});

// Récupérer spécifiquement les données de branding & mini-site
router.get('/branding', (req, res) => {
  try {
    const restaurant = db.get(
      `SELECT id, name, slug, owner_name, phone, email, city, country, address, description, logo_url, opening_hours,
              cover_image_url, brand_color, tagline, custom_domain, domain_status, instagram_handle, whatsapp_number, facebook_url, theme_style
       FROM restaurants WHERE id = ?`,
      [req.restaurant.id]
    );

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant non trouvé.' });
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const publicUrl = `${protocol}://${host}/${restaurant.slug}`;
    const directUrl = `${protocol}://${host}/restaurant/${restaurant.slug}`;

    res.json({
      success: true,
      branding: {
        ...restaurant,
        public_url: publicUrl,
        direct_url: directUrl
      }
    });
  } catch (err) {
    console.error('Erreur récupération branding:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du branding.' });
  }
});

// Mettre à jour l'identité visuelle et le mini-site
router.put('/branding', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), (req, res) => {
  try {
    const {
      brand_color,
      cover_image_url,
      logo_url,
      tagline,
      instagram_handle,
      whatsapp_number,
      facebook_url,
      theme_style
    } = req.body;

    const current = db.get('SELECT * FROM restaurants WHERE id = ?', [req.restaurant.id]);

    let finalLogo = current.logo_url;
    if (req.files && req.files.logo && req.files.logo[0]) {
      finalLogo = `/uploads/${req.files.logo[0].filename}`;
    } else if (logo_url !== undefined && logo_url.trim()) {
      finalLogo = logo_url.trim();
    }

    let finalCover = current.cover_image_url || '';
    if (req.files && req.files.cover && req.files.cover[0]) {
      finalCover = `/uploads/${req.files.cover[0].filename}`;
    } else if (cover_image_url !== undefined && cover_image_url.trim()) {
      finalCover = cover_image_url.trim();
    }

    const newBrandColor = (brand_color && brand_color.trim()) ? brand_color.trim() : (current.brand_color || '#DC2626');
    const newTagline = tagline !== undefined ? tagline.trim() : (current.tagline || '');
    const newInstagram = instagram_handle !== undefined ? instagram_handle.trim() : (current.instagram_handle || '');
    const newWhatsapp = whatsapp_number !== undefined ? whatsapp_number.trim() : (current.whatsapp_number || '');
    const newFacebook = facebook_url !== undefined ? facebook_url.trim() : (current.facebook_url || '');
    const newTheme = theme_style !== undefined ? theme_style.trim() : (current.theme_style || 'moderne');

    db.run(
      `UPDATE restaurants 
       SET brand_color = ?, cover_image_url = ?, logo_url = ?, tagline = ?,
           instagram_handle = ?, whatsapp_number = ?, facebook_url = ?, theme_style = ?
       WHERE id = ?`,
      [newBrandColor, finalCover, finalLogo, newTagline, newInstagram, newWhatsapp, newFacebook, newTheme, req.restaurant.id]
    );

    const updated = db.get(
      `SELECT id, name, slug, owner_name, phone, email, city, country, address, description, logo_url, opening_hours,
              cover_image_url, brand_color, tagline, custom_domain, domain_status, instagram_handle, whatsapp_number, facebook_url, theme_style
       FROM restaurants WHERE id = ?`,
      [req.restaurant.id]
    );

    res.json({
      success: true,
      message: 'Identité visuelle du mini-site mise à jour avec succès !',
      branding: updated
    });
  } catch (err) {
    console.error('Erreur mise à jour branding:', err);
    res.status(500).json({ error: 'Impossible de mettre à jour le branding.' });
  }
});

// Configurer ou lier un nom de domaine personnalisé
router.post('/domain', (req, res) => {
  try {
    const { custom_domain } = req.body;
    if (!custom_domain || !custom_domain.trim()) {
      return res.status(400).json({ error: 'Veuillez saisir un nom de domaine valide (ex: menu.monrestaurant.com).' });
    }

    const cleanDomain = custom_domain.trim().toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');

    // Validation simple du format de domaine
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
    if (!domainRegex.test(cleanDomain)) {
      return res.status(400).json({ error: 'Format de domaine invalide. Utilisez par exemple menu.monrestaurant.bj ou commandez.monresto.com.' });
    }

    // Vérifier l'unicité
    const existing = db.get('SELECT id FROM restaurants WHERE custom_domain = ? AND id != ?', [cleanDomain, req.restaurant.id]);
    if (existing) {
      return res.status(409).json({ error: 'Ce domaine personnalisé est déjà associé à un autre restaurant.' });
    }

    db.run(
      'UPDATE restaurants SET custom_domain = ?, domain_status = ? WHERE id = ?',
      [cleanDomain, 'en_attente_dns', req.restaurant.id]
    );

    res.json({
      success: true,
      custom_domain: cleanDomain,
      domain_status: 'en_attente_dns',
      dns_instructions: {
        type: 'CNAME',
        host: cleanDomain.includes('.') ? cleanDomain.split('.')[0] : '@',
        target: 'saas.menudirect.bj',
        ttl: 3600
      },
      message: `Domaine ${cleanDomain} enregistré. Veuillez créer l'enregistrement CNAME pointant vers saas.menudirect.bj.`
    });
  } catch (err) {
    console.error('Erreur configuration domaine:', err);
    res.status(500).json({ error: 'Impossible d\'enregistrer le nom de domaine.' });
  }
});

// Supprimer le domaine personnalisé
router.delete('/domain', (req, res) => {
  try {
    db.run(
      'UPDATE restaurants SET custom_domain = ?, domain_status = ? WHERE id = ?',
      ['', 'non_configure', req.restaurant.id]
    );

    res.json({
      success: true,
      message: 'Domaine personnalisé déconnecté avec succès.'
    });
  } catch (err) {
    console.error('Erreur suppression domaine:', err);
    res.status(500).json({ error: 'Impossible de déconnecter le domaine.' });
  }
});

// Mettre à jour le profil du restaurant
router.put('/', upload.single('logo'), (req, res) => {
  try {
    const {
      name,
      owner_name,
      phone,
      city,
      country,
      address,
      description,
      opening_hours,
      logo_url
    } = req.body;

    const current = db.get('SELECT * FROM restaurants WHERE id = ?', [req.restaurant.id]);

    const newName = name ? name.trim() : current.name;
    const newOwner = owner_name ? owner_name.trim() : current.owner_name;
    const newPhone = phone ? phone.trim() : current.phone;
    const newCity = city !== undefined ? city.trim() : current.city;
    const newCountry = country !== undefined ? country.trim() : current.country;
    const newAddress = address !== undefined ? address.trim() : current.address;
    const newDesc = description !== undefined ? description.trim() : current.description;
    const newHours = opening_hours !== undefined ? opening_hours.trim() : current.opening_hours;

    let finalLogo = current.logo_url;
    if (req.file) {
      finalLogo = `/uploads/${req.file.filename}`;
    } else if (logo_url !== undefined) {
      finalLogo = logo_url.trim();
    }

    db.run(
      `UPDATE restaurants 
       SET name = ?, owner_name = ?, phone = ?, city = ?, country = ?, address = ?, description = ?, opening_hours = ?, logo_url = ?
       WHERE id = ?`,
      [newName, newOwner, newPhone, newCity, newCountry, newAddress, newDesc, newHours, finalLogo, req.restaurant.id]
    );

    const updated = db.get(
      `SELECT id, name, slug, owner_name, phone, email, city, country, address, description, logo_url, opening_hours, subscription_plan, subscription_status
       FROM restaurants WHERE id = ?`,
      [req.restaurant.id]
    );

    res.json({
      success: true,
      message: 'Paramètres mis à jour avec succès !',
      restaurant: updated
    });
  } catch (err) {
    console.error('Erreur mise à jour paramètres:', err);
    res.status(500).json({ error: 'Impossible de mettre à jour les paramètres.' });
  }
});

// Vérifier la disponibilité d'un slug
router.get('/slug/check', (req, res) => {
  try {
    const slug = (req.query.slug || '').trim().toLowerCase();
    if (!slug || slug.length < 3) {
      return res.status(400).json({ available: false, error: 'Le slug doit contenir au moins 3 caractères.' });
    }

    const cleanSlug = generateSlug(slug);
    const existing = db.get('SELECT id FROM restaurants WHERE slug = ? AND id != ?', [cleanSlug, req.restaurant.id]);

    res.json({
      success: true,
      slug: cleanSlug,
      available: !existing
    });
  } catch (err) {
    console.error('Erreur vérification slug:', err);
    res.status(500).json({ error: 'Erreur lors de la vérification du slug.' });
  }
});

// Modifier le slug du restaurant
router.patch('/slug', (req, res) => {
  try {
    const { slug } = req.body;
    if (!slug || slug.trim().length < 3) {
      return res.status(400).json({ error: 'Le slug doit contenir au moins 3 caractères.' });
    }

    const cleanSlug = generateSlug(slug.trim());

    if (cleanSlug.length < 3) {
      return res.status(400).json({ error: 'Le slug généré est trop court. Utilisez un nom plus long.' });
    }

    // Mots réservés pour éviter les conflits de routes
    const reserved = ['login', 'register', 'dashboard', 'api', 'admin', 'restaurant', 'menu', 'public', 'uploads', 'settings'];
    if (reserved.includes(cleanSlug)) {
      return res.status(400).json({ error: 'Ce slug est un mot réservé et ne peut pas être utilisé.' });
    }

    // Vérifier l'unicité
    const existing = db.get('SELECT id FROM restaurants WHERE slug = ? AND id != ?', [cleanSlug, req.restaurant.id]);
    if (existing) {
      return res.status(409).json({ error: 'Ce slug est déjà utilisé par un autre restaurant. Choisissez un nom différent.' });
    }

    db.run('UPDATE restaurants SET slug = ? WHERE id = ?', [cleanSlug, req.restaurant.id]);

    res.json({
      success: true,
      message: 'Adresse du menu mise à jour avec succès !',
      slug: cleanSlug
    });
  } catch (err) {
    console.error('Erreur mise à jour slug:', err);
    res.status(500).json({ error: 'Impossible de mettre à jour l\'adresse du menu.' });
  }
});

// Générer le QR Code du menu public (retourne une image PNG en base64)
router.get('/qrcode', async (req, res) => {
  try {
    const restaurant = db.get('SELECT slug, name FROM restaurants WHERE id = ?', [req.restaurant.id]);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant non trouvé.' });
    }

    // Construire l'URL publique
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const publicUrl = `${protocol}://${host}/${restaurant.slug}`;

    // Générer le QR Code en PNG base64
    const qrDataUrl = await QRCode.toDataURL(publicUrl, {
      width: 512,
      margin: 2,
      color: {
        dark: '#111111',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'H'
    });

    res.json({
      success: true,
      qr_code: qrDataUrl,
      public_url: publicUrl,
      restaurant_name: restaurant.name,
      slug: restaurant.slug
    });
  } catch (err) {
    console.error('Erreur génération QR Code:', err);
    res.status(500).json({ error: 'Impossible de générer le QR Code.' });
  }
});

// Changer de formule d'abonnement (Standard, Pro, Master)
router.post('/subscription', (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ['standard', 'pro', 'master'];

    if (!plan || !validPlans.includes(plan.toLowerCase())) {
      return res.status(400).json({ error: 'Plan d\'abonnement invalide (standard, pro, master).' });
    }

    const selectedPlan = plan.toLowerCase();

    db.run(
      'UPDATE restaurants SET subscription_plan = ?, subscription_status = ? WHERE id = ?',
      [selectedPlan, 'active', req.restaurant.id]
    );

    res.json({
      success: true,
      message: `Votre abonnement a été mis à jour vers la formule ${selectedPlan.toUpperCase()} !`,
      subscription_plan: selectedPlan
    });
  } catch (err) {
    console.error('Erreur mise à jour abonnement:', err);
    res.status(500).json({ error: 'Impossible de mettre à jour l\'abonnement.' });
  }
});

module.exports = router;
