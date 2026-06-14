import { Product } from '../types';
import { dbService } from './db';

export interface ExternalProductData {
  barcode: string;
  name: string;
  brand: string;
  format: string;
  photo?: string;
  notes?: string;
  category?: string;
  source: string;
}

export interface LookupResult {
  state: 'local_found' | 'external_found' | 'not_found' | 'error';
  localProduct?: Product;
  externalProduct?: ExternalProductData;
  error?: string;
}

export interface BarcodeProvider {
  name: string;
  lookup(barcode: string): Promise<ExternalProductData | null>;
}

/**
 * Fournisseur API de recherche de produit alimentaire via Open Food Facts
 */
class OpenFoodFactsProvider implements BarcodeProvider {
  name = 'Open Food Facts';
  
  async lookup(barcode: string): Promise<ExternalProductData | null> {
    try {
      // API v2 de Open Food Facts avec suffixe .json
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'MarmiCout - Web - Version 1.0 - https://github.com/hclu1/MarmiCout'
        }
      });
      
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Erreur HTTP Open Food Facts : ${res.status}`);
      }
      
      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        return null;
      }
      
      const p = data.product;
      const name = p.product_name_fr || p.product_name || '';
      if (!name) return null;
      
      const brand = p.brands || '';
      const format = p.quantity || 'Unité';
      const photo = p.image_front_url || p.image_url || undefined;
      const ingredients = p.ingredients_text_fr || p.ingredients_text || '';
      const notes = ingredients ? `Ingrédients : ${ingredients.substring(0, 150)}${ingredients.length > 150 ? '...' : ''}` : undefined;
      
      // Essayer d'extraire la première catégorie pour aider au mappage local
      const category = p.categories ? p.categories.split(',')[0].trim() : undefined;

      return {
        barcode,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        brand,
        format,
        photo,
        notes,
        category,
        source: this.name
      };
    } catch (err) {
      console.error('Erreur OpenFoodFactsProvider lookup:', err);
      throw err;
    }
  }
}

// Liste ordonnée de fournisseurs externes (architecture extensible)
const providers: BarcodeProvider[] = [
  new OpenFoodFactsProvider()
];

export const barcodeLookupService = {
  /**
   * Recherche un produit par son code-barres de manière séquentielle :
   * 1. Dans la base locale Produits.
   * 2. Dans les APIs externes (comme Open Food Facts).
   */
  async lookupBarcode(barcode: string): Promise<LookupResult> {
    const cleaned = barcode.trim();
    if (!cleaned) {
      return { state: 'not_found' };
    }

    // 1. Recherche dans la base de données locale
    try {
      const local = dbService.getProductByBarcode(cleaned);
      if (local) {
        return { state: 'local_found', localProduct: local };
      }
    } catch (err) {
      console.error('Erreur lookup local :', err);
    }

    // 2. Recherche dans les fournisseurs externes
    let lastError: any = null;
    for (const provider of providers) {
      try {
        const extData = await provider.lookup(cleaned);
        if (extData) {
          return { state: 'external_found', externalProduct: extData };
        }
      } catch (err) {
        console.warn(`Fournisseur ${provider.name} a échoué pour le code ${cleaned}:`, err);
        lastError = err;
      }
    }

    // Si une erreur réseau est survenue lors de l'accès aux fournisseurs
    if (lastError) {
      return { 
        state: 'error', 
        error: 'Impossible de se connecter à la base externe. Veuillez créer le produit manuellement.'
      };
    }

    return { state: 'not_found' };
  }
};
