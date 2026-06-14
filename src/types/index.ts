export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  unit: string; // e.g. 'kg', 'g', 'l', 'ml', 'pièce', 'sachet'
  brand: string;
  format: string; // e.g. "1 kg", "500 g", "75 cl", "Unité"
  stock: number; // Quantité de stock dans l'unité principale du produit
  minStockAlert: number;
  avgPurchasePrice: number; // Prix moyen d'achat unitaire
  mainStoreId: string;
  notes: string;
  isActive: boolean;
  photo?: string;
}

export interface Purchase {
  id: string;
  date: string;
  productId: string;
  qty: number; // quantité achetée dans l'unité principale
  unit: string;
  pricePaid: number; // Prix total payé
  unitPrice: number; // Prix unitaire calculé (pricePaid / qty)
  storeId: string;
  batchNo?: string;
  expiryDate?: string;
  notes?: string;
}

export interface Store {
  id: string;
  name: string;
  type: string; // e.g. 'Supermarché', 'Grossiste', 'Producteur local', 'Autre'
  address?: string;
  phone?: string;
  notes?: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  productId?: string; // ID du produit lié au stock (facultatif)
  customName?: string; // Nom textuel si l'ingrédient n'est pas lié au stock
  qtyUsed: number; // quantité utilisée (ajustée)
  unit: string; // unité d'utilisation
  originalQtyUsed?: number; // quantité de la recette d'origine
  customCostPerUnit?: number; // coût estimé par unité (pour les non-liés)
}

export interface RecipePackaging {
  id: string;
  recipeId: string;
  name: string; // e.g. 'Barquette', 'Pot de verre', 'Sachet plastique'
  qtyUsed: number;
  costPerUnit: number;
}

export interface Recipe {
  id: string;
  name: string;
  category: string;
  description: string;
  portions: number; // Nombre de portions obtenues (ex: 8 parts)
  yieldQty: number; // Rendement total (ex: 1.2)
  yieldUnit: string; // Unité du rendement (ex: kg, pièce)
  stock: number; // Portions ou unités de produit fini en stock
  prepTimeMinutes?: number;
  utensilsNotes?: string; // Matériel/ustensiles requis (à titre informatif)
  notes?: string;
  isActive: boolean;
  photo?: string;
  originalPortions?: number; // Nombre de portions de la recette d'origine
  sourceImage?: string; // Image base64 ou URL de la recette photo
  rawExtractedText?: string; // Texte brut extrait
}

export interface Production {
  id: string;
  date: string;
  recipeId: string;
  portionsProduced: number; // Nombre de portions ou unités réellement produites
  notes?: string;
  calculatedCost: number; // Coût réel calculé lors de la fabrication
}

export interface Sale {
  id: string;
  date: string;
  itemId: string; // ID du produit ou de la recette vendue
  itemType: 'RECIPE' | 'PRODUCT';
  qtySold: number;
  unitPrice: number;
  location: string; // e.g. 'Marché', 'Commande', 'Domicile', 'Autre'
  notes?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  qty: number; // positif pour entrée, négatif pour sortie
  type: 'ACHAT' | 'PRODUCTION_CONSOMMATION' | 'VENTE_DIRECTE' | 'AJUSTEMENT';
  refId: string; // ID de l'achat, de la production, de la vente, ou 'MANUAL'
  notes?: string;
}

export interface Settings {
  businessName: string;
  currency: string;
  defaultTargetMargin: number; // ex: 60 (pour 60%)
  categories: string[];
  recipeCategories: string[];
  units: string[];
  salesLocations: string[];
  defaultMinStockAlert: number;
  googleSheetId?: string;
  googleSheetLink?: string;
  googleWebAppUrl?: string;
}
