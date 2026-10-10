const crypto = require('crypto');
const db = require('../db');

/**
 * Service de Traduction IA Culinaire — MenuDirect
 * Supporte :
 * 1. Google Gemini API (GEMINI_API_KEY)
 * 2. OpenAI API (OPENAI_API_KEY)
 * 3. Moteur Culinaire Autonome (Fallback intelligent avec dictionnaire gastronomique africain & international)
 */

const SUPPORTED_LANGUAGES = {
  fr: { code: 'fr', name: 'Français', flag: '🇫🇷', label: 'FR' },
  en: { code: 'en', name: 'English (Anglais)', flag: '🇬🇧', label: 'EN' },
  pt: { code: 'pt', name: 'Português (Portugais)', flag: '🇵🇹', label: 'PT' },
  es: { code: 'es', name: 'Español (Espagnol)', flag: '🇪🇸', label: 'ES' },
  fon: { code: 'fon', name: 'Fɔngbe (Fon - Bénin)', flag: '🇧🇯', label: 'FON' },
  de: { code: 'de', name: 'Deutsch (Allemand)', flag: '🇩🇪', label: 'DE' },
  it: { code: 'it', name: 'Italiano (Italien)', flag: '🇮🇹', label: 'IT' },
  ar: { code: 'ar', name: 'العربية (Arabe)', flag: '🇸🇦', label: 'AR' },
  zh: { code: 'zh', name: '中文 (Chinois)', flag: '🇨🇳', label: 'ZH' }
};

// Dictionnaire culinaire étendu pour la gastronomie béninoise, ouest-africaine et internationale
const CULINARY_DICTIONARY = {
  // Termes principaux
  'poulet braise': {
    en: { name: 'Grilled Chicken', desc: 'Flame-grilled marinated chicken with local spices' },
    pt: { name: 'Frango Grelhado', desc: 'Frango marinado grelhado na brasa com especiarias locais' },
    es: { name: 'Pollo a la Brasa', desc: 'Pollo marinado a la brasa con especias locales' },
    fon: { name: 'Kokló Bibla', desc: 'Kokló ɖagbe bibla kpó nunukún lɛ́ kpó' }
  },
  'poulet': { en: 'Chicken', pt: 'Frango', es: 'Pollo', fon: 'Kokló' },
  'poisson': { en: 'Fish', pt: 'Peixe', es: 'Pescado', fon: 'Hwevǐ' },
  'poisson braise': {
    en: { name: 'Grilled Whole Fish', desc: 'Charcoal-grilled whole fish seasoned with African herbs and spices' },
    pt: { name: 'Peixe Grelhado na Brasa', desc: 'Peixe grelhado no carvão temperado com ervas e especiarias' },
    es: { name: 'Pescado a la Brasa', desc: 'Pescado entero a la brasa sazonado con hierbas y especias' },
    fon: { name: 'Hwevǐ Bibla', desc: 'Hwevǐ ɖagbe bibla kpó takin kpó' }
  },
  'alloco': {
    en: { name: 'Alloco (Fried Plantains)', desc: 'Golden fried sweet plantain bites served with savory sauce' },
    pt: { name: 'Alloco (Banana-da-terra Frita)', desc: 'Pedaços de banana-da-terra fritos servidos com molho especial' },
    es: { name: 'Alloco (Plátano Maduro Frito)', desc: 'Trocitos de plátano maduro fritos dorados con salsa sabrosa' },
    fon: { name: 'Alɔkɔ', desc: 'Kokwe bibla dídó kpó sɔsi takin tɔn kpó' }
  },
  'aloko': {
    en: { name: 'Alloco (Fried Plantains)', desc: 'Golden fried sweet plantain bites' },
    pt: { name: 'Alloco (Banana Frita)', desc: 'Pedaços de banana fritos dourados' },
    es: { name: 'Alloco (Plátano Frito)', desc: 'Plátano frito crujiente' },
    fon: { name: 'Alɔkɔ', desc: 'Kokwe bibla dídó' }
  },
  'atassi': {
    en: { name: 'Atassi (Rice & Beans)', desc: 'Traditional cooked rice and beans specialty served with fried spicy tomato sauce' },
    pt: { name: 'Atassi (Arroz e Feijão)', desc: 'Especialidade tradicional de arroz e feijão com molho de tomate apimentado' },
    es: { name: 'Atassi (Arroz y Frijoles)', desc: 'Especialidad tradicional de arroz y frijoles servida con salsa picante' },
    fon: { name: 'Atassi', desc: 'Mɔlikún kpó ayikún kpó ɖaɖa' }
  },
  'amiwo': {
    en: { name: 'Amiwo (Red Corn Dough)', desc: 'Rich seasoned red corn porridge prepared with savory tomato and meat stock' },
    pt: { name: 'Amiwo (Massa de Milho Vermelha)', desc: 'Massa tradicional de milho temperada com tomate e caldo' },
    es: { name: 'Amiwo (Masa de Maíz Rojo)', desc: 'Masa tradicional de maíz rojo sazonada con caldo de carne y tomate' },
    fon: { name: 'Amiwɔ', desc: 'Wɔ̌ vɔvɔ ɖaɖa kpó ami kpó lan sín sìn kpó' }
  },
  'igname pilee': {
    en: { name: 'Pounded Yam', desc: 'Smooth and fluffy traditional pounded yam served with rich soup or stew' },
    pt: { name: 'Inhame Prensado', desc: 'Purê tradicional e aveludado de inhame servido com molho encorpado' },
    es: { name: 'Ñame Machacado', desc: 'Puré tradicional y suave de ñame acompañado de salsa rica' },
    fon: { name: 'Agbelí / Téwó', desc: 'Té sísɔ́ ɖagbe kpó nusúnnú dídó kpó' }
  },
  'riz gras': {
    en: { name: 'Jollof Rice', desc: 'Fragrant and rich tomato-simmered rice cooked with hearty spices and meat' },
    pt: { name: 'Arroz Jollof', desc: 'Arroz perfumado cozido no molho de tomate com especiarias e carne' },
    es: { name: 'Arroz Jollof', desc: 'Arroz aromático cocinado en salsa de tomate con especias y carne' },
    fon: { name: 'Mɔlikún Amilɔ', desc: 'Mɔlikún vɔvɔ ɖaɖa kpó ami kpó lan kpó' }
  },
  'brochettes': {
    en: { name: 'Suya Meat Skewers', desc: 'Tender grilled meat skewers dusted with spicy peanut suya seasoning' },
    pt: { name: 'Espetinhos de Carne', desc: 'Espetinhos grelhados e marinados com temperos e especiarias' },
    es: { name: 'Brochetas de Carne', desc: 'Brochetas de carne a la parrilla marinadas con especias sabrosas' },
    fon: { name: 'Lan Cɔcɔ', desc: 'Lan mimlɛ́ sísɔ́ dó atin jí bó bi' }
  },
  'bissap': {
    en: { name: 'Fresh Hibiscus (Bissap) Juice', desc: 'Refreshing chilled hibiscus flower infusion infused with mint and pineapple' },
    pt: { name: 'Suco de Hibisco (Bissap)', desc: 'Bebida refrescante de flor de hibisco com menta e abacaxi' },
    es: { name: 'Zumo de Hibisco (Bissap)', desc: 'Bebida refrescante de flor de hibisco con menta fresca y piña' },
    fon: { name: 'Bissap Sín', desc: 'Bissap ama sín fífá kpó timi kpó' }
  },
  'baobab': {
    en: { name: 'Baobab Superfruit Nectar', desc: 'Creamy and tangy wild baobab fruit nectar naturally packed with vitamins' },
    pt: { name: 'Suco Natural de Baobá', desc: 'Néctar cremoso e refrescante de polpa de baobá' },
    es: { name: 'Néctar de Baobab', desc: 'Zumo cremoso y refrescante de pulpa natural de baobab' },
    fon: { name: 'Kpásá Sín', desc: 'Kpásá sín fífá víví ɖagbe' }
  }
};

/**
 * Calcul du hash MD5 pour le cache
 */
function getCacheHash(sourceLang, targetLang, text) {
  return crypto
    .createHash('sha256')
    .update(`${sourceLang}:${targetLang}:${text.trim().toLowerCase()}`)
    .digest('hex');
}

/**
 * Vérifier le cache de traduction
 */
function getFromCache(sourceLang, targetLang, name, description = '') {
  try {
    const combined = `${name}|||${description}`;
    const hash = getCacheHash(sourceLang, targetLang, combined);
    const cached = db.get(
      'SELECT translated_name, translated_desc FROM translation_cache WHERE source_hash = ?',
      [hash]
    );
    if (cached) {
      return {
        name: cached.translated_name,
        description: cached.translated_desc,
        fromCache: true
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Enregistrer dans le cache
 */
function saveToCache(sourceLang, targetLang, name, description, translatedName, translatedDesc) {
  try {
    const combined = `${name}|||${description}`;
    const hash = getCacheHash(sourceLang, targetLang, combined);
    db.run(
      `INSERT OR REPLACE INTO translation_cache (source_hash, source_lang, target_lang, translated_name, translated_desc)
       VALUES (?, ?, ?, ?, ?)`,
      [hash, sourceLang, targetLang, translatedName, translatedDesc || '']
    );
  } catch (err) {
    // Silencieux
  }
}

// Initialisation du SDK officiel Google Gen AI
let googleGenAIClass = null;
try {
  const { GoogleGenAI } = require('@google/genai');
  googleGenAIClass = GoogleGenAI;
} catch (e) {
  console.warn('[Gemini SDK] @google/genai introuvable, tentative avec @google/generative-ai...');
}

/**
 * Moteur 1 : Google Gemini API (SDK Officiel Google)
 */
async function translateWithGemini(items, sourceLang, targetLang) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini API] GEMINI_API_KEY non configurée dans .env');
    return null;
  }

  const targetLangName = SUPPORTED_LANGUAGES[targetLang]?.name || targetLang;
  const sourceLangName = SUPPORTED_LANGUAGES[sourceLang]?.name || sourceLang;

  const prompt = `You are a professional culinary translator and gastronomic linguist for restaurant menus, West African gastronomy (Benin, Côte d'Ivoire, Senegal, Nigeria), and international cuisine.
Translate the following restaurant menu items from ${sourceLangName} (${sourceLang}) to ${targetLangName} (${targetLang}).

CULINARY & BRAND GUIDELINES:
1. Authentic Local Names: Keep signature dish names recognizable (e.g. Poulet braisé, Alloco, Atassi, Amiwo, Poisson braisé, Garba, Suya, Bissap). Add brief, appetizing clarifying descriptions in parentheses when helpful (e.g. "Alloco (Golden Fried Plantains)").
2. Fon language (fɔngbe): Use authentic Beninese Latin orthography (e.g. Kokló bibla, Hwevǐ bibla, Alɔkɔ, Wɔ̌ vɔvɔ, Mɔlikún).
3. Do NOT modify prices, portions, or sizes.
4. Keep the culinary tone mouth-watering, refined, and accurate.

Translate this exact JSON array of dishes:
${JSON.stringify(items, null, 2)}

Return ONLY a valid, raw JSON array of objects with the exact structure (no markdown formatting, no code blocks):
[
  {
    "id": item_id,
    "translatedName": "...",
    "translatedDescription": "..."
  }
]`;

  // 1. Essayer avec le SDK officiel @google/genai (Gemini 2.5 / 3.6 / Flash)
  if (googleGenAIClass) {
    try {
      const ai = new googleGenAIClass({ apiKey });
      const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          });

          const rawText = response?.text;
          if (rawText) {
            const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
            const parsed = JSON.parse(cleanText);
            if (Array.isArray(parsed)) {
              console.log(`[Gemini SDK] Traduction réussie avec ${modelName} pour ${parsed.length} plat(s).`);
              return parsed;
            }
          }
        } catch (modelErr) {
          console.warn(`[Gemini SDK] ${modelName} indisponible (${modelErr.message}), essai du modèle suivant...`);
          continue;
        }
      }
    } catch (sdkErr) {
      console.warn('[Gemini SDK] Erreur @google/genai:', sdkErr.message);
    }
  }

  // 2. Fallback avec @google/generative-ai
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        });

        const result = await model.generateContent(prompt);
        const rawText = result.response.text();
        if (rawText) {
          const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
          const parsed = JSON.parse(cleanText);
          if (Array.isArray(parsed)) {
            console.log(`[GenerativeAI SDK] Traduction réussie avec ${modelName} pour ${parsed.length} plat(s).`);
            return parsed;
          }
        }
      } catch (err) {
        continue;
      }
    }
  } catch (genAiErr) {
    console.warn('[GenerativeAI SDK] Erreur:', genAiErr.message);
  }

  return null;
}

/**
 * Moteur 2 : OpenAI API
 */
async function translateWithOpenAI(items, sourceLang, targetLang) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const targetLangName = SUPPORTED_LANGUAGES[targetLang]?.name || targetLang;
  const sourceLangName = SUPPORTED_LANGUAGES[sourceLang]?.name || sourceLang;

  const prompt = `You are a culinary translator for restaurant menus. Translate from ${sourceLangName} to ${targetLangName}. Keep dish names authentic and descriptions appetizing.
Items to translate:
${JSON.stringify(items, null, 2)}

Return ONLY a raw JSON array matching:
[ { "id": number, "translatedName": "string", "translatedDescription": "string" } ]`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
  } catch (err) {
    console.warn('[OpenAI API] Échec:', err.message);
  }
  return null;
}

/**
 * Moteur 3 : Moteur Culinaire Autonome (Offline & Local Context-Aware Fallback)
 * Fournit des traductions culinaires précises et naturelles même sans clé API.
 */
function translateWithCulinaryEngine(item, targetLang) {
  const cleanName = (item.name || '').trim().toLowerCase();
  const cleanDesc = (item.description || '').trim();

  // 1. Recherche exacte ou par préfixe dans le dictionnaire gastronomique
  for (const [key, trans] of Object.entries(CULINARY_DICTIONARY)) {
    if (cleanName.includes(key)) {
      const match = trans[targetLang];
      if (match) {
        if (typeof match === 'object') {
          // Nom et description spécifiques
          let finalName = match.name;
          // Si le nom original avait des modificateurs comme "spécial" ou "maison"
          if (cleanName.includes('special')) {
            if (targetLang === 'en') finalName += ' Special';
            else if (targetLang === 'pt') finalName += ' Especial';
            else if (targetLang === 'es') finalName += ' Especial';
            else if (targetLang === 'fon') finalName += ' Ðagbe';
          }
          return {
            translatedName: finalName,
            translatedDescription: cleanDesc ? formatCulinaryDesc(cleanDesc, targetLang) : match.desc
          };
        } else if (typeof match === 'string') {
          return {
            translatedName: replaceCulinaryWord(item.name, key, match),
            translatedDescription: formatCulinaryDesc(cleanDesc, targetLang)
          };
        }
      }
    }
  }

  // 2. Règles génériques de transformation culinaire
  return {
    translatedName: transformDishName(item.name, targetLang),
    translatedDescription: formatCulinaryDesc(cleanDesc, targetLang)
  };
}

function replaceCulinaryWord(original, frenchWord, replacement) {
  const regex = new RegExp(frenchWord, 'gi');
  return original.replace(regex, replacement);
}

function transformDishName(name, lang) {
  if (!name) return '';
  const text = name.trim();

  if (lang === 'en') {
    return text
      .replace(/poulet/gi, 'Chicken')
      .replace(/poisson/gi, 'Fish')
      .replace(/boeuf|viande/gi, 'Beef')
      .replace(/riz/gi, 'Rice')
      .replace(/salade/gi, 'Salad')
      .replace(/frites/gi, 'Fries')
      .replace(/sauce/gi, 'Sauce')
      .replace(/jus de/gi, 'Fresh Juice of')
      .replace(/eau minérale|eau/gi, 'Mineral Water')
      .replace(/bière/gi, 'Beer')
      .replace(/cocktail/gi, 'Cocktail')
      .replace(/grillé|braisé/gi, 'Grilled')
      .replace(/épicé/gi, 'Spicy')
      .replace(/maison/gi, 'Homemade')
      .replace(/spécial/gi, 'Special');
  }

  if (lang === 'es') {
    return text
      .replace(/poulet/gi, 'Pollo')
      .replace(/poisson/gi, 'Pescado')
      .replace(/boeuf|viande/gi, 'Ternera')
      .replace(/riz/gi, 'Arroz')
      .replace(/salade/gi, 'Ensalada')
      .replace(/frites/gi, 'Patatas fritas')
      .replace(/sauce/gi, 'Salsa')
      .replace(/jus de/gi, 'Zumo de')
      .replace(/eau/gi, 'Agua')
      .replace(/bière/gi, 'Cerveza')
      .replace(/cocktail/gi, 'Cóctel')
      .replace(/grillé|braisé/gi, 'a la brasa')
      .replace(/épicé/gi, 'picante')
      .replace(/maison/gi, 'casero')
      .replace(/spécial/gi, 'especial');
  }

  if (lang === 'pt') {
    return text
      .replace(/poulet/gi, 'Frango')
      .replace(/poisson/gi, 'Peixe')
      .replace(/boeuf|viande/gi, 'Carne bovina')
      .replace(/riz/gi, 'Arroz')
      .replace(/salade/gi, 'Salada')
      .replace(/frites/gi, 'Batatas fritas')
      .replace(/sauce/gi, 'Molho')
      .replace(/jus de/gi, 'Suco de')
      .replace(/eau/gi, 'Água')
      .replace(/bière/gi, 'Cerveja')
      .replace(/cocktail/gi, 'Coquetel')
      .replace(/grillé|braisé/gi, 'Grelhado')
      .replace(/épicé/gi, 'picante')
      .replace(/maison/gi, 'caseiro')
      .replace(/spécial/gi, 'especial');
  }

  if (lang === 'fon') {
    return text
      .replace(/poulet braisé|poulet grillé/gi, 'Kokló bibla')
      .replace(/poulet/gi, 'Kokló')
      .replace(/poisson braisé/gi, 'Hwevǐ bibla')
      .replace(/poisson/gi, 'Hwevǐ')
      .replace(/boeuf|viande/gi, 'Nyìlan')
      .replace(/riz gras|riz/gi, 'Mɔlikún')
      .replace(/eau/gi, 'Sìn')
      .replace(/jus/gi, 'Atínsín')
      .replace(/boisson/gi, 'Nùnú')
      .replace(/spécial|maison/gi, 'Ðagbe');
  }

  return text;
}

function formatCulinaryDesc(desc, lang) {
  if (!desc) return '';
  const text = desc.trim();

  if (lang === 'en') {
    return text
      .replace(/accompagné de/gi, 'served with')
      .replace(/avec/gi, 'with')
      .replace(/sauce pimentée/gi, 'spicy chili sauce')
      .replace(/sauce tomate/gi, 'tomato stew')
      .replace(/sauce oignons/gi, 'caramelized onion sauce')
      .replace(/légumes frais/gi, 'fresh vegetables')
      .replace(/épices locales/gi, 'authentic local spices')
      .replace(/garniture au choix/gi, 'choice of side');
  }

  if (lang === 'es') {
    return text
      .replace(/accompagné de/gi, 'servido con')
      .replace(/avec/gi, 'con')
      .replace(/sauce pimentée/gi, 'salsa picante')
      .replace(/sauce tomate/gi, 'salsa de tomate')
      .replace(/sauce oignons/gi, 'salsa de cebolla')
      .replace(/légumes frais/gi, 'verduras frescas')
      .replace(/épices locales/gi, 'especias locales');
  }

  if (lang === 'pt') {
    return text
      .replace(/accompagné de/gi, 'servido com')
      .replace(/avec/gi, 'com')
      .replace(/sauce pimentée/gi, 'molho picante')
      .replace(/sauce tomate/gi, 'molho de tomate')
      .replace(/sauce oignons/gi, 'molho de cebola')
      .replace(/légumes frais/gi, 'legumes frescos')
      .replace(/épices locales/gi, 'especiarias locais');
  }

  if (lang === 'fon') {
    return text
      .replace(/accompagné de|avec/gi, 'kpó ... kpó')
      .replace(/sauce/gi, 'Nusúnnú')
      .replace(/piment/gi, 'Takin')
      .replace(/oignon/gi, 'Ayomá')
      .replace(/délicieux/gi, 'Víví tawun');
  }

  return text;
}

/**
 * Traduire un plat unitaire
 */
async function translateDish({ name, description = '', sourceLang = 'fr', targetLang = 'en' }) {
  if (sourceLang === targetLang) {
    return { translatedName: name, translatedDescription: description, fromCache: true };
  }

  // Vérifier le cache
  const cached = getFromCache(sourceLang, targetLang, name, description);
  if (cached) {
    return {
      translatedName: cached.name,
      translatedDescription: cached.description,
      fromCache: true
    };
  }

  const singleItem = [{ id: 1, name, description }];
  let results = null;

  // Essayer Gemini
  if (process.env.GEMINI_API_KEY) {
    results = await translateWithGemini(singleItem, sourceLang, targetLang);
  }

  // Fallback OpenAI
  if (!results && process.env.OPENAI_API_KEY) {
    results = await translateWithOpenAI(singleItem, sourceLang, targetLang);
  }

  // Fallback Moteur Culinaire Autonome
  let translatedName = '';
  let translatedDescription = '';

  if (results && results[0]) {
    translatedName = results[0].translatedName;
    translatedDescription = results[0].translatedDescription || '';
  } else {
    const fallback = translateWithCulinaryEngine({ name, description }, targetLang);
    translatedName = fallback.translatedName;
    translatedDescription = fallback.translatedDescription;
  }

  // Sauvegarder en cache
  saveToCache(sourceLang, targetLang, name, description, translatedName, translatedDescription);

  return {
    translatedName,
    translatedDescription,
    fromCache: false
  };
}

/**
 * Traduire une liste d'éléments (plats ou catégories) en lot
 */
async function translateBatch(items, optionsOrSource = {}, maybeTargetLang) {
  let sourceLang = 'fr';
  let targetLang = 'en';

  if (typeof optionsOrSource === 'string') {
    sourceLang = optionsOrSource || 'fr';
    targetLang = maybeTargetLang || 'en';
  } else if (optionsOrSource && typeof optionsOrSource === 'object') {
    sourceLang = optionsOrSource.sourceLang || 'fr';
    targetLang = optionsOrSource.targetLang || 'en';
  }

  if (!Array.isArray(items) || items.length === 0) return [];
  if (sourceLang === targetLang) {
    return items.map(it => ({
      id: it.id,
      translatedName: it.name,
      translatedDescription: it.description || '',
      fromCache: true
    }));
  }

  const finalResults = [];
  const missingInCache = [];

  // 1. Vérifier d'abord le cache pour chaque élément
  for (const it of items) {
    const cached = getFromCache(sourceLang, targetLang, it.name, it.description || '');
    if (cached) {
      finalResults.push({
        id: it.id,
        translatedName: cached.name,
        translatedDescription: cached.description,
        fromCache: true
      });
    } else {
      missingInCache.push(it);
    }
  }

  // Si tout était en cache, on retourne immédiatement
  if (missingInCache.length === 0) {
    return finalResults;
  }

  // 2. Traduire les manquants via API
  let apiResults = null;

  if (process.env.GEMINI_API_KEY) {
    apiResults = await translateWithGemini(missingInCache, sourceLang, targetLang);
  }

  if (!apiResults && process.env.OPENAI_API_KEY) {
    apiResults = await translateWithOpenAI(missingInCache, sourceLang, targetLang);
  }

  const apiMap = new Map();
  if (Array.isArray(apiResults)) {
    apiResults.forEach(r => apiMap.set(Number(r.id), r));
  }

  // 3. Compléter avec l'API ou le moteur autonome
  for (const it of missingInCache) {
    const match = apiMap.get(Number(it.id));
    let tName = '';
    let tDesc = '';

    if (match && match.translatedName) {
      tName = match.translatedName;
      tDesc = match.translatedDescription || '';
    } else {
      const fallback = translateWithCulinaryEngine(it, targetLang);
      tName = fallback.translatedName;
      tDesc = fallback.translatedDescription || '';
    }

    saveToCache(sourceLang, targetLang, it.name, it.description || '', tName, tDesc);

    finalResults.push({
      id: it.id,
      translatedName: tName,
      translatedDescription: tDesc,
      fromCache: false
    });
  }

  // Réordonner selon l'ordre initial
  const orderMap = new Map(items.map((it, idx) => [it.id, idx]));
  finalResults.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return finalResults;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  translateDish,
  translateBatch,
  getFromCache,
  saveToCache
};
