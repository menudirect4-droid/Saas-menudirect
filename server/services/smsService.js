/**
 * Service d'envoi de SMS & Notifications OTP — MenuDirect
 * Gère l'expédition de codes de sécurité pour la réinitialisation de mot de passe.
 * 
 * Supporte :
 * 1. Twilio SMS (si TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER configurés dans .env)
 * 2. API SMS Webhook Générique (si SMS_API_URL configuré)
 * 3. Moteur SMS Local / Simulation Intelligente pour le développement local et les tests
 * 4. Passerelle WhatsApp (lien direct pré-rempli)
 */

// Nettoyage et extraction des chiffres
function extractDigits(str) {
  if (!str) return '';
  return String(str).replace(/\D/g, '');
}

// Formatage international intelligent (Bénin par défaut si 8 ou 10 chiffres sans préfixe)
function formatPhoneInternational(phone) {
  if (!phone) return '';
  let digits = extractDigits(phone);
  
  // Si commence déjà par 229 (ex: 2290157070530)
  if (digits.startsWith('229') && digits.length >= 11) {
    return `+${digits}`;
  }
  
  // Si numéro béninois standard (10 chiffres commençant par 01, ou ancien format 8 chiffres)
  if (digits.length === 10 && digits.startsWith('01')) {
    return `+229${digits}`;
  }
  if (digits.length === 8) {
    return `+229${digits}`;
  }
  
  // Si le numéro original contenait un '+'
  if (String(phone).trim().startsWith('+')) {
    return `+${digits}`;
  }
  
  return `+229${digits}`;
}

// Masquage du numéro de téléphone pour l'affichage sécurisé (ex: 01 •• •• •• 30)
function maskPhoneNumber(phone) {
  if (!phone) return '•• •• •• ••';
  const clean = String(phone).trim();
  const digits = extractDigits(clean);
  
  if (digits.length <= 4) return '••••' + digits;
  
  const start = digits.slice(0, 2);
  const end = digits.slice(-2);
  return `${start} •• •• •• ${end}`;
}

// Comparateur souple de numéros de téléphone pour retrouver le compte utilisateur
function comparePhones(phoneA, phoneB) {
  const dA = extractDigits(phoneA);
  const dB = extractDigits(phoneB);
  
  if (!dA || !dB) return false;
  if (dA === dB) return true;
  
  // Si l'un est inclus dans l'autre ou se termine par les mêmes 8 ou 10 chiffres
  if (dA.length >= 8 && dB.length >= 8) {
    const last8A = dA.slice(-8);
    const last8B = dB.slice(-8);
    if (last8A === last8B) return true;
  }
  
  if (dA.length >= 10 && dB.length >= 10) {
    const last10A = dA.slice(-10);
    const last10B = dB.slice(-10);
    if (last10A === last10B) return true;
  }
  
  return dA.endsWith(dB) || dB.endsWith(dA);
}

/**
 * Envoi du code de réinitialisation par SMS
 * @param {string} phone - Numéro de téléphone du restaurateur
 * @param {string} code - Code à 6 chiffres généré
 * @param {string} restaurantName - Nom du restaurant
 */
async function sendResetCodeSMS(phone, code, restaurantName = 'Restaurant') {
  const internationalPhone = formatPhoneInternational(phone);
  const maskedPhone = maskPhoneNumber(phone);
  const cleanDigits = extractDigits(internationalPhone);
  
  const messageText = `MenuDirect : Votre code de réinitialisation est ${code}. Valable 15 minutes. Ne le partagez avec personne.`;
  
  // Lien WhatsApp direct
  const whatsappUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(messageText)}`;
  
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  
  const genericSmsUrl = process.env.SMS_API_URL;
  const genericSmsKey = process.env.SMS_API_KEY;
  
  let provider = 'simulation';
  let sentRealSMS = false;

  // 1. Essai Twilio si configuré
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      
      const body = new URLSearchParams({
        To: internationalPhone,
        From: twilioFrom,
        Body: messageText
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (response.ok) {
        sentRealSMS = true;
        provider = 'twilio';
        console.log(`[Twilio SMS] Envoyé avec succès au ${internationalPhone}`);
      } else {
        const errorData = await response.text();
        console.warn(`[Twilio SMS] Erreur d'envoi:`, errorData);
      }
    } catch (err) {
      console.error(`[Twilio SMS] Exception:`, err.message);
    }
  }

  // 2. Essai SMS Webhook Générique si configuré
  if (!sentRealSMS && genericSmsUrl) {
    try {
      const response = await fetch(genericSmsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(genericSmsKey ? { 'Authorization': `Bearer ${genericSmsKey}` } : {})
        },
        body: JSON.stringify({
          to: internationalPhone,
          message: messageText,
          code
        })
      });
      if (response.ok) {
        sentRealSMS = true;
        provider = 'generic_sms_gateway';
      }
    } catch (err) {
      console.warn(`[SMS Gateway] Erreur:`, err.message);
    }
  }

  // 3. Mode Simulation & Journalisation Locale
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║               📲 SMS MENUDIRECT — SÉCURITÉ OTP               ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ 🏢 Restaurant  : ${restaurantName.padEnd(44)}║`);
  console.log(`║ 📞 Numéro      : ${internationalPhone.padEnd(44)}║`);
  console.log(`║ 🔑 Code secret : ${code.padEnd(44)}║`);
  console.log(`║ 📡 Statut      : ${(sentRealSMS ? 'EXPÉDIÉ VIA ' + provider.toUpperCase() : 'SIMULATION LOCALE ACTIVE').padEnd(44)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  return {
    success: true,
    sentRealSMS,
    provider,
    internationalPhone,
    maskedPhone,
    whatsappUrl,
    // En mode simulation (sans passerelle externe payante), fournir le code pour faciliter les tests
    demoCode: sentRealSMS ? undefined : code
  };
}

module.exports = {
  extractDigits,
  formatPhoneInternational,
  maskPhoneNumber,
  comparePhones,
  sendResetCodeSMS
};
