const db = require('../db');

const requireAuth = (req, res, next) => {
  const token = req.cookies?.md_session || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Session absente ou expirée. Veuillez vous connecter.' });
  }

  try {
    const session = db.get(
      'SELECT s.*, r.id as resto_id, r.name, r.slug, r.owner_name, r.phone, r.email, r.city, r.country, r.address, r.description, r.logo_url, r.opening_hours, r.subscription_plan, r.subscription_status FROM sessions s JOIN restaurants r ON s.restaurant_id = r.id WHERE s.token = ? AND s.expires_at > ?',
      [token, Date.now()]
    );

    if (!session) {
      res.clearCookie('md_session');
      return res.status(401).json({ error: 'Session invalide ou expirée.' });
    }

    req.restaurant = {
      id: session.resto_id,
      name: session.name,
      slug: session.slug,
      owner_name: session.owner_name,
      phone: session.phone,
      email: session.email,
      city: session.city,
      country: session.country,
      address: session.address,
      description: session.description,
      logo_url: session.logo_url,
      opening_hours: session.opening_hours,
      subscription_plan: session.subscription_plan,
      subscription_status: session.subscription_status
    };
    req.sessionToken = token;

    next();
  } catch (err) {
    console.error('Erreur authentification:', err);
    return res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
};

const optionalAuth = (req, res, next) => {
  const token = req.cookies?.md_session || req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      const session = db.get(
        'SELECT s.*, r.id as resto_id, r.name, r.slug, r.owner_name, r.phone, r.email, r.city, r.country, r.address, r.description, r.logo_url, r.opening_hours, r.subscription_plan, r.subscription_status FROM sessions s JOIN restaurants r ON s.restaurant_id = r.id WHERE s.token = ? AND s.expires_at > ?',
        [token, Date.now()]
      );
      if (session) {
        req.restaurant = {
          id: session.resto_id,
          name: session.name,
          slug: session.slug,
          owner_name: session.owner_name,
          phone: session.phone,
          email: session.email,
          city: session.city,
          country: session.country,
          address: session.address,
          description: session.description,
          logo_url: session.logo_url,
          opening_hours: session.opening_hours,
          subscription_plan: session.subscription_plan,
          subscription_status: session.subscription_status
        };
      }
    } catch (err) {
      // Ignorer pour optionalAuth
    }
  }
  next();
};

module.exports = {
  requireAuth,
  optionalAuth
};
