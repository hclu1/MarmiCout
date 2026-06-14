import { Recipe, RecipeIngredient } from '../types';

const BASE_URL = 'https://www.themealdb.com/api/json/v1/1/';

export interface MappedRecipeResult {
  recipe: Recipe;
  ingredients: Omit<RecipeIngredient, 'id' | 'recipeId'>[];
}

/**
 * Analyse la chaîne de mesure (ex: "1 1/2 cups", "250g", "3 pieces") 
 * pour en extraire une quantité numérique et une unité reconnue par MarmiCout.
 */
export function parseMeasure(measureStr: string): { qty: number; unit: string; displaySuffix?: string } {
  const cleaned = measureStr.trim().toLowerCase();
  if (!cleaned) return { qty: 1, unit: 'pièce' };

  let qty = 1;
  
  // 1. Chercher les fractions comme "1 1/2" ou "1/2" ou "3/4"
  const fractionMatch = cleaned.match(/(?:(\d+)\s+)?(\d+)\/(\d+)/);
  if (fractionMatch) {
    const whole = fractionMatch[1] ? parseInt(fractionMatch[1], 10) : 0;
    const num = parseInt(fractionMatch[2], 10);
    const den = parseInt(fractionMatch[3], 10);
    qty = whole + (num / den);
  } else {
    // 2. Chercher les décimaux ou entiers normaux
    const numberMatch = cleaned.match(/^([\d,.]+)/);
    if (numberMatch) {
      qty = parseFloat(numberMatch[1].replace(',', '.'));
    }
  }
  if (isNaN(qty) || qty <= 0) qty = 1;

  // 3. Détecter l'unité de destination
  let unit = 'pièce';
  let displaySuffix = '';

  if (cleaned.includes('kg') || cleaned.includes('kilo')) {
    unit = 'kg';
  } else if (cleaned.includes('ml')) {
    unit = 'ml';
  } else if (cleaned.includes('cl')) {
    unit = 'cl';
  } else if (cleaned.match(/\b(g|gramme[s]?)\b/)) {
    unit = 'g';
  } else if (cleaned.match(/\b(l|litre[s]?|liter[s]?)\b/)) {
    unit = 'l';
  } else if (cleaned.includes('sachet') || cleaned.includes('pack') || cleaned.includes('packet')) {
    unit = 'sachet';
  } else {
    // Extraction de l'unité textuelle non standard (ex. tasse, cuillère)
    const nonDigits = cleaned.replace(/[\d,.\/\s]+/g, '').trim();
    if (
      nonDigits && 
      nonDigits !== 'whole' && 
      nonDigits !== 'pieces' && 
      nonDigits !== 'piece' && 
      nonDigits !== 'u' && 
      nonDigits !== 'unit' &&
      nonDigits !== 'units'
    ) {
      displaySuffix = nonDigits;
    }
  }

  return { qty, unit, displaySuffix };
}

/**
 * Traduit et formate l'unité non-standard extraite pour l'affichage en français.
 */
function translateSuffix(suffix: string): string {
  const s = suffix.toLowerCase();
  if (s === 'tsp' || s === 'teaspoon' || s === 'teaspoons') return 'c. à café';
  if (s === 'tbsp' || s === 'tablespoon' || s === 'tablespoons') return 'c. à soupe';
  if (s === 'cup' || s === 'cups') return 'tasse';
  if (s === 'pinch' || s === 'pinches') return 'pincée';
  if (s === 'can' || s === 'cans') return 'boîte';
  if (s === 'slice' || s === 'slices') return 'tranche';
  if (s === 'dash' || s === 'dashes') return 'trait';
  if (s === 'clove' || s === 'cloves') return 'gousse';
  if (s === 'sprig' || s === 'sprigs') return 'brin';
  if (s === 'bulb' || s === 'bulbs') return 'bulbe';
  return suffix; // Garde tel quel si inconnu
}

export const AREA_TRANSLATIONS: Record<string, string> = {
  'american': 'Américain',
  'british': 'Britannique',
  'canadian': 'Canadien',
  'chinese': 'Chinois',
  'croatian': 'Croate',
  'dutch': 'Néerlandais',
  'egyptian': 'Égyptien',
  'filipino': 'Philippin',
  'french': 'Français',
  'greek': 'Grec',
  'indian': 'Indien',
  'irish': 'Irlandais',
  'italian': 'Italien',
  'jamaican': 'Jamaïcain',
  'japanese': 'Japonais',
  'kenyan': 'Kényan',
  'malaysian': 'Malaisien',
  'mexican': 'Mexicain',
  'moroccan': 'Marocain',
  'polish': 'Polonais',
  'portuguese': 'Portugais',
  'russian': 'Russe',
  'spanish': 'Espagnol',
  'thai': 'Thaïlandais',
  'tunisian': 'Tunisien',
  'turkish': 'Turc',
  'unknown': 'Inconnu',
  'vietnamese': 'Vietnamien'
};

export function translateAreaToFrench(area: string): string {
  if (!area) return '';
  const key = area.toLowerCase().trim();
  return AREA_TRANSLATIONS[key] || area;
}

export const CATEGORY_TRANSLATIONS: Record<string, string> = {
  'beef': 'Bœuf',
  'chicken': 'Poulet',
  'dessert': 'Dessert',
  'lamb': 'Agneau',
  'miscellaneous': 'Divers',
  'pasta': 'Pâtes',
  'pork': 'Porc',
  'seafood': 'Fruits de mer',
  'side': 'Accompagnement',
  'starter': 'Entrée',
  'vegan': 'Végétalien',
  'vegetarian': 'Végétarien',
  'goat': 'Chèvre',
  'breakfast': 'Petit Déjeuner'
};

export function translateCategoryFilterToFrench(category: string): string {
  if (!category) return '';
  const key = category.toLowerCase().trim();
  return CATEGORY_TRANSLATIONS[key] || category;
}

export function translateCategoryToFrench(category: string): string {
  const cat = category.toLowerCase().trim();
  if (['beef', 'chicken', 'pork', 'lamb', 'goat', 'pasta', 'seafood', 'vegetarian', 'vegan', 'side', 'starter', 'breakfast'].includes(cat)) {
    return 'Plat Cuisiné';
  }
  if (cat === 'dessert') {
    return 'Gâteau';
  }
  return 'Autre';
}

function chunkText(text: string, maxChunkSize: number = 400): string[] {
  const paragraphs = text.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (!para.trim()) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      chunks.push('');
      continue;
    }

    if (para.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      const sentences = para.match(/[^.!?]+[.!?]+(\s|$)/g) || [para];
      for (const sentence of sentences) {
        if (sentence.length > maxChunkSize) {
          const words = sentence.split(' ');
          let wordChunk = '';
          for (const word of words) {
            if ((wordChunk + ' ' + word).length > maxChunkSize) {
              chunks.push(wordChunk.trim());
              wordChunk = word;
            } else {
              wordChunk = wordChunk ? wordChunk + ' ' + word : word;
            }
          }
          if (wordChunk) {
            currentChunk = wordChunk;
          }
        } else {
          if ((currentChunk + ' ' + sentence).length > maxChunkSize) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
          }
        }
      }
    } else {
      if ((currentChunk + '\n' + para).length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = para;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n' + para : para;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function translateText(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  
  const chunks = chunkText(text, 400);
  const translatedChunks = await Promise.all(
    chunks.map(async (chunk) => {
      if (!chunk.trim()) return chunk;
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|fr&de=marmicout-app@gmail.com`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        if (data.responseData && data.responseData.translatedText) {
          return data.responseData.translatedText;
        }
        return chunk;
      } catch (err) {
        console.warn(`Translation failed for chunk: "${chunk}"`, err);
        return chunk;
      }
    })
  );
  
  return translatedChunks.join('\n');
}

export async function translateIngredients(ingredients: Omit<RecipeIngredient, 'id' | 'recipeId'>[]): Promise<Omit<RecipeIngredient, 'id' | 'recipeId'>[]> {
  if (ingredients.length === 0) return ingredients;
  
  const names = ingredients.map(ing => ing.customName || '');
  const joinedNames = names.join(' | ');
  
  try {
    const translatedJoined = await translateText(joinedNames);
    const splitNames = translatedJoined.split(/\s*\|\s*/);
    
    if (splitNames.length === ingredients.length) {
      return ingredients.map((ing, idx) => ({
        ...ing,
        customName: splitNames[idx].trim()
      }));
    } else {
      console.warn("Batch ingredient translation length mismatch. Translating individually...");
      const translatedList = await Promise.all(
        ingredients.map(async (ing) => {
          if (!ing.customName) return ing;
          const translatedName = await translateText(ing.customName);
          return {
            ...ing,
            customName: translatedName.trim()
          };
        })
      );
      return translatedList;
    }
  } catch (err) {
    console.error("Failed to translate ingredients:", err);
    return ingredients;
  }
}

/**
 * Transforme le modèle brut TheMealDB vers le format interne de l'application
 */
export function mapTheMealDBToRecipe(meal: any): MappedRecipeResult {
  const recipeId = 'R_API_' + meal.idMeal;

  const recipe: Recipe = {
    id: recipeId,
    name: meal.strMeal.trim(),
    category: translateCategoryToFrench(meal.strCategory || 'Autre'),
    description: meal.strInstructions 
      ? `Recette d'origine ${translateAreaToFrench(meal.strArea) || 'internationale'}. ${meal.strInstructions.substring(0, 120)}...`
      : `Recette d'origine ${translateAreaToFrench(meal.strArea) || 'internationale'}.`,
    portions: 4, // Rendement standard par défaut
    yieldQty: 1,
    yieldUnit: 'pièce',
    stock: 0,
    prepTimeMinutes: 30, // Estimation par défaut
    notes: `Catégorie originale : ${meal.strCategory || 'N/A'}\nCuisine : ${translateAreaToFrench(meal.strArea) || 'N/A'}`,
    isActive: true,
    photo: meal.strMealThumb || undefined,
    sourceImage: meal.strMealThumb || undefined,
    externalId: meal.idMeal,
    videoUrl: meal.strYoutube || undefined,
    sourceUrl: meal.strSource || undefined,
    rawExtractedText: `Recette importée depuis TheMealDB.\nOrigine : ${translateAreaToFrench(meal.strArea)}\nYouTube : ${meal.strYoutube || 'Aucun'}\nSite web : ${meal.strSource || 'Aucun'}`
  };

  const ingredients: Omit<RecipeIngredient, 'id' | 'recipeId'>[] = [];

  // Parcourir les 20 couples ingrédients/mesures possibles
  for (let i = 1; i <= 20; i++) {
    const ingName = meal[`strIngredient${i}`];
    const ingMeasure = meal[`strMeasure${i}`];

    if (ingName && ingName.trim()) {
      const cleanIngName = ingName.trim();
      const cleanMeasure = ingMeasure ? ingMeasure.trim() : '';

      const { qty, unit, displaySuffix } = parseMeasure(cleanMeasure);

      let finalCustomName = cleanIngName;
      if (displaySuffix) {
        finalCustomName = `${cleanIngName} (${translateSuffix(displaySuffix)})`;
      }

      ingredients.push({
        customName: finalCustomName.charAt(0).toUpperCase() + finalCustomName.slice(1),
        qtyUsed: qty,
        unit: unit,
        originalQtyUsed: qty,
        customCostPerUnit: 0
      });
    }
  }

  return { recipe, ingredients };
}

export const recipeImportService = {
  /**
   * Recherche des recettes par mot-clé (nom)
   */
  async searchRecipesByName(query: string): Promise<any[]> {
    try {
      const res = await fetch(`${BASE_URL}search.php?s=${encodeURIComponent(query)}`);
      const data = await res.json();
      return data.meals || [];
    } catch (err) {
      console.error('Erreur searchRecipesByName:', err);
      throw new Error("Impossible de se connecter à TheMealDB.");
    }
  },

  /**
   * Récupère le détail d'une recette par son identifiant unique
   */
  async getRecipeDetailsById(idMeal: string): Promise<any | null> {
    try {
      const res = await fetch(`${BASE_URL}lookup.php?i=${idMeal}`);
      const data = await res.json();
      return data.meals && data.meals.length > 0 ? data.meals[0] : null;
    } catch (err) {
      console.error('Erreur getRecipeDetailsById:', err);
      throw new Error("Impossible de charger les détails de la recette.");
    }
  },

  /**
   * Obtient une recette aléatoire
   */
  async getRandomRecipe(): Promise<any | null> {
    try {
      const res = await fetch(`${BASE_URL}random.php`);
      const data = await res.json();
      return data.meals && data.meals.length > 0 ? data.meals[0] : null;
    } catch (err) {
      console.error('Erreur getRandomRecipe:', err);
      throw new Error("Erreur de récupération d'une recette aléatoire.");
    }
  },

  /**
   * Récupère toutes les catégories disponibles
   */
  async getCategories(): Promise<any[]> {
    try {
      const res = await fetch(`${BASE_URL}categories.php`);
      const data = await res.json();
      return data.categories || [];
    } catch (err) {
      console.error('Erreur getCategories:', err);
      return [];
    }
  },

  /**
   * Récupère toutes les origines (zones géographiques)
   */
  async getAreas(): Promise<string[]> {
    try {
      const res = await fetch(`${BASE_URL}list.php?a=list`);
      const data = await res.json();
      return data.meals ? data.meals.map((m: any) => m.strArea) : [];
    } catch (err) {
      console.error('Erreur getAreas:', err);
      return [];
    }
  },

  /**
   * Filtre les recettes par catégorie
   */
  async filterByCategory(category: string): Promise<any[]> {
    try {
      const res = await fetch(`${BASE_URL}filter.php?c=${encodeURIComponent(category)}`);
      const data = await res.json();
      return data.meals || [];
    } catch (err) {
      console.error('Erreur filterByCategory:', err);
      return [];
    }
  },

  /**
   * Filtre les recettes par origine
   */
  async filterByArea(area: string): Promise<any[]> {
    try {
      const res = await fetch(`${BASE_URL}filter.php?a=${encodeURIComponent(area)}`);
      const data = await res.json();
      return data.meals || [];
    } catch (err) {
      console.error('Erreur filterByArea:', err);
      return [];
    }
  }
};
