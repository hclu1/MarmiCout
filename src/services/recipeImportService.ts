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

/**
 * Transforme le modèle brut TheMealDB vers le format interne de l'application
 */
export function mapTheMealDBToRecipe(meal: any): MappedRecipeResult {
  const recipeId = 'R_API_' + meal.idMeal;

  const recipe: Recipe = {
    id: recipeId,
    name: meal.strMeal.trim(),
    category: meal.strCategory || 'Autre',
    description: meal.strInstructions 
      ? `Recette d'origine ${meal.strArea || 'internationale'}. ${meal.strInstructions.substring(0, 120)}...`
      : `Recette d'origine ${meal.strArea || 'internationale'}.`,
    portions: 4, // Rendement standard par défaut
    yieldQty: 1,
    yieldUnit: 'pièce',
    stock: 0,
    prepTimeMinutes: 30, // Estimation par défaut
    notes: `Catégorie originale : ${meal.strCategory || 'N/A'}\nCuisine : ${meal.strArea || 'N/A'}`,
    isActive: true,
    photo: meal.strMealThumb || undefined,
    sourceImage: meal.strMealThumb || undefined,
    externalId: meal.idMeal,
    videoUrl: meal.strYoutube || undefined,
    sourceUrl: meal.strSource || undefined,
    rawExtractedText: `Recette importée depuis TheMealDB.\nOrigine : ${meal.strArea}\nYouTube : ${meal.strYoutube || 'Aucun'}\nSite web : ${meal.strSource || 'Aucun'}`
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
