import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ChefHat, 
  Trash2, 
  Edit, 
  TrendingUp, 
  Package, 
  Clock, 
  List, 
  Scale, 
  Info,
  ChevronRight,
  Maximize2,
  Search,
  Camera,
  AlertTriangle,
  Check,
  ClipboardList
} from 'lucide-react';
import { dbService, convertUnits } from '../services/db';
import { Product, Recipe, RecipeIngredient, RecipePackaging } from '../types';
import { Drawer } from './Drawer';
import { RecipeScanner } from './RecipeScanner';

interface RecipesProps {
  initialTriggerAdd?: boolean;
  initialViewRecipeId?: string;
}

export const Recipes: React.FC<RecipesProps> = ({ initialTriggerAdd, initialViewRecipeId }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const settings = dbService.getSettings();

  // Recherche & Filtres
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // États du Drawer de Formulaire de Recette
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  // Valeurs du formulaire principal de Recette
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPortions, setFormPortions] = useState(10);
  const [formYieldQty, setFormYieldQty] = useState(1);
  const [formYieldUnit, setFormYieldUnit] = useState('pièce');
  const [formPrepTime, setFormPrepTime] = useState<number | undefined>(30);
  const [formUtensilsNotes, setFormUtensilsNotes] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Ingrédients dynamiques dans le formulaire
  const [formIngredients, setFormIngredients] = useState<Omit<RecipeIngredient, 'id' | 'recipeId'>[]>([]);
  // Emballages dynamiques dans le formulaire
  const [formPackagings, setFormPackagings] = useState<Omit<RecipePackaging, 'id' | 'recipeId'>[]>([]);

  // États de la vue de détail interactive
  const [selectedRecipeDetails, setSelectedRecipeDetails] = useState<Recipe | null>(null);
  const [detailsIngredients, setDetailsIngredients] = useState<RecipeIngredient[]>([]);
  const [detailsPackagings, setDetailsPackagings] = useState<RecipePackaging[]>([]);
  const [detailsCost, setDetailsCost] = useState<any>(null);

  // États du simulateur de prix interactif dans le panneau de détails
  const [simMargin, setSimMargin] = useState(60); // % de marge cible
  const [simSellPrice, setSimSellPrice] = useState(0); // Prix de vente simulé
  const [simSalesCount, setSimSalesCount] = useState(20); // Quantité vendue pour journée type

  // États de l'import par photo et portions cible
  const [isScanViewOpen, setIsScanViewOpen] = useState(false);
  const [portionsCible, setPortionsCible] = useState(1);
  const [copiedCourses, setCopiedCourses] = useState(false);

  const loadData = () => {
    setRecipes(dbService.getRecipes());
    setProducts(dbService.getProducts().filter(p => p.isActive));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Déclenchements initiaux
  useEffect(() => {
    if (initialTriggerAdd) {
      handleOpenAddForm();
    } else if (initialViewRecipeId) {
      const r = dbService.getRecipe(initialViewRecipeId);
      if (r) handleOpenDetails(r);
    }
  }, [initialTriggerAdd, initialViewRecipeId]);

  // Synchroniser le prix de vente simulé au chargement d'un détail de recette
  const handleOpenDetails = (recipe: Recipe) => {
    const costInfo = dbService.calculateRecipeCost(recipe.id);
    setSelectedRecipeDetails(recipe);
    setDetailsIngredients(dbService.getRecipeIngredients(recipe.id));
    setDetailsPackagings(dbService.getRecipePackagings(recipe.id));
    setDetailsCost(costInfo);

    // Initialiser les valeurs du simulateur
    setSimMargin(settings.defaultTargetMargin);
    setSimSellPrice(costInfo.suggestedSellingPrice);
    setPortionsCible(recipe.portions); // Portions cible par défaut
    setCopiedCourses(false);
  };

  // Mettre à jour le prix de vente quand la marge change dans la simulation
  const handleMarginChange = (margin: number) => {
    setSimMargin(margin);
    if (detailsCost && margin < 100) {
      const newPrice = detailsCost.costPerPortion / (1 - (margin / 100));
      setSimSellPrice(Number(newPrice.toFixed(2)));
    }
  };

  // Mettre à jour la marge quand le prix de vente change dans la simulation
  const handleSellPriceChange = (price: number) => {
    setSimSellPrice(price);
    if (detailsCost && price > 0) {
      const margin = ((price - detailsCost.costPerPortion) / price) * 100;
      setSimMargin(Number(margin.toFixed(0)));
    }
  };

  // Formulaire d'ajout
  const handleOpenAddForm = () => {
    setEditingRecipe(null);
    setFormName('');
    setFormCategory(settings.recipeCategories[0] || 'Tarte');
    setFormDescription('');
    setFormPortions(8);
    setFormYieldQty(1);
    setFormYieldUnit('pièce');
    setFormPrepTime(30);
    setFormUtensilsNotes('');
    setFormNotes('');
    setFormIsActive(true);
    setFormIngredients([]);
    setFormPackagings([]);
    setIsFormOpen(true);
  };

  // Formulaire d'édition
  const handleOpenEditForm = (recipe: Recipe, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRecipe(recipe);
    setFormName(recipe.name);
    setFormCategory(recipe.category);
    setFormDescription(recipe.description);
    setFormPortions(recipe.portions);
    setFormYieldQty(recipe.yieldQty);
    setFormYieldUnit(recipe.yieldUnit);
    setFormPrepTime(recipe.prepTimeMinutes);
    setFormUtensilsNotes(recipe.utensilsNotes || '');
    setFormNotes(recipe.notes || '');
    setFormIsActive(recipe.isActive);

    // Charger les ingrédients et emballages associés
    const ings = dbService.getRecipeIngredients(recipe.id).map(({ id, recipeId, ...rest }) => rest);
    const packs = dbService.getRecipePackagings(recipe.id).map(({ id, recipeId, ...rest }) => rest);
    
    setFormIngredients(ings);
    setFormPackagings(packs);
    setIsFormOpen(true);
  };

  // Ingrédients dynamiques dans le formulaire
  const handleAddIngredientLine = () => {
    const defaultProduct = products[0];
    if (!defaultProduct) return;
    setFormIngredients([...formIngredients, {
      productId: defaultProduct.id,
      qtyUsed: 100,
      unit: defaultProduct.unit === 'kg' ? 'g' : defaultProduct.unit // si kg on propose grammes par défaut pour la recette
    }]);
  };

  const handleRemoveIngredientLine = (index: number) => {
    setFormIngredients(formIngredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: string, value: any) => {
    const updated = [...formIngredients];
    updated[index] = { ...updated[index], [field]: value };
    
    // Si on change de produit, on adapte l'unité proposée
    if (field === 'productId') {
      const prod = products.find(p => p.id === value);
      if (prod) {
        updated[index].unit = prod.unit === 'kg' ? 'g' : prod.unit;
      }
    }

    setFormIngredients(updated);
  };

  // Emballages dynamiques dans le formulaire
  const handleAddPackagingLine = () => {
    // Proposer par défaut le premier produit de catégorie 'Emballage' ou taper à la main
    const embProduct = products.find(p => p.category.toLowerCase() === 'emballage');
    setFormPackagings([...formPackagings, {
      name: embProduct ? embProduct.name : 'Barquette Carton',
      qtyUsed: 1,
      costPerUnit: embProduct ? embProduct.avgPurchasePrice : 0.20
    }]);
  };

  const handleRemovePackagingLine = (index: number) => {
    setFormPackagings(formPackagings.filter((_, i) => i !== index));
  };

  const handlePackagingChange = (index: number, field: string, value: any) => {
    const updated = [...formPackagings];
    updated[index] = { ...updated[index], [field]: value };

    // Si on tape un nom qui matche un produit, on charge son prix moyen
    if (field === 'name') {
      const prod = products.find(p => p.name.toLowerCase() === value.toLowerCase() || p.id === value);
      if (prod) {
        updated[index].costPerUnit = prod.avgPurchasePrice;
      }
    }

    setFormPackagings(updated);
  };

  // Enregistrer la recette complète
  const handleSaveRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert("Veuillez donner un nom à la recette");
      return;
    }

    const recipeId = editingRecipe ? editingRecipe.id : 'R_' + Date.now();
    const newRecipe: Recipe = {
      id: recipeId,
      name: formName.trim(),
      category: formCategory,
      description: formDescription.trim(),
      portions: formPortions,
      yieldQty: formYieldQty,
      yieldUnit: formYieldUnit,
      stock: editingRecipe ? editingRecipe.stock : 0, // Conserver le stock produit fini existant
      prepTimeMinutes: formPrepTime,
      utensilsNotes: formUtensilsNotes.trim() || undefined,
      notes: formNotes.trim() || undefined,
      isActive: formIsActive
    };

    dbService.saveRecipe(newRecipe, formIngredients, formPackagings);
    setIsFormOpen(false);
    loadData();
    
    // Si on visualisait le détail, recharger le détail
    if (selectedRecipeDetails && selectedRecipeDetails.id === recipeId) {
      handleOpenDetails(newRecipe);
    }
  };

  // Supprimer une recette
  const handleDeleteRecipe = (id: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette recette et ses ingrédients ?")) {
      dbService.deleteRecipe(id);
      setSelectedRecipeDetails(null);
      loadData();
    }
  };

  // Filtrer la liste des recettes
  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === '' || r.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (isScanViewOpen) {
    return (
      <RecipeScanner
        onClose={() => setIsScanViewOpen(false)}
        onSave={(newRecipe, newIngredients, newPackagings) => {
          dbService.saveRecipe(newRecipe, newIngredients, newPackagings);
          setIsScanViewOpen(false);
          loadData();
        }}
        products={products}
        settings={settings}
      />
    );
  }

  return (
    <div>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Recettes & Coûts de Revient</h1>
          <p className="page-subtitle">Calculez le coût exact de vos plats et déterminez vos prix de vente conseillés</p>
        </div>
        <div className="actions-group" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setIsScanViewOpen(true)}>
            <Camera size={18} style={{ color: 'var(--color-primary)' }} />
            Numériser une recette
          </button>
          <button className="btn btn-primary" onClick={handleOpenAddForm}>
            <Plus size={18} />
            Créer une recette
          </button>
        </div>
      </div>

      {/* Recherche et filtrage */}
      <div className="card filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Rechercher une recette par nom..."
            className="form-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <select 
          className="select-filter"
          value={selectedCategory} 
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {settings.recipeCategories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Grille des recettes */}
      {filteredRecipes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-dark-light)' }}>
          <ChefHat size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <p>Aucune recette trouvée. Lancez-vous en cliquant sur "Créer une recette" !</p>
        </div>
      ) : (
        <div className="grid-cols-1-2-3">
          {filteredRecipes.map(r => {
            const costInfo = dbService.calculateRecipeCost(r.id);
            const isHighMargin = costInfo.marginPercent >= settings.defaultTargetMargin;
            
            return (
              <div 
                key={r.id} 
                className="card" 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderTop: `4px solid ${costInfo.marginPercent < 45 ? 'var(--color-danger)' : 'var(--color-secondary)'}`
                }}
                onClick={() => handleOpenDetails(r)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="badge badge-info">{r.category}</span>
                    <span className="badge badge-success" style={{ backgroundColor: 'var(--color-light)', color: 'var(--color-dark)' }}>
                      Stock fini : {r.stock} u
                    </span>
                  </div>
                  
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px' }}>{r.name}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {r.description || 'Aucune description.'}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--color-dark-light)', marginBottom: '16px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {r.prepTimeMinutes || 'N/C'} min
                    </span>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Scale size={12} /> {r.portions} portion(s)
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Coût / Port.</div>
                    <strong style={{ fontSize: '16px' }}>{costInfo.costPerPortion.toFixed(2)} {settings.currency}</strong>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Prix Vente Conseillé</div>
                    <strong style={{ fontSize: '16px', color: 'var(--color-secondary)' }}>
                      {costInfo.suggestedSellingPrice.toFixed(2)} {settings.currency}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- DRAWER FORMULAIRE (AJOUT / MODIFICATION DE RECETTE) --- */}
      <Drawer
        title={editingRecipe ? `Modifier ${editingRecipe.name}` : "Créer une recette"}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSaveRecipe}>Sauvegarder</button>
          </>
        }
      >
        <form onSubmit={handleSaveRecipe}>
          
          <h4 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', marginBottom: '12px' }}>
            Informations générales
          </h4>

          <div className="form-group">
            <label className="form-label">Nom du plat ou produit fini *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Ex: Tarte aux Framboises, Confiture d'Oranges"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Catégorie</label>
              <select className="form-input" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                {settings.recipeCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Temps de préparation (minutes)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                value={formPrepTime || ''}
                onChange={(e) => setFormPrepTime(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description succincte</label>
            <textarea
              className="form-input"
              style={{ height: '60px' }}
              placeholder="Ex: Pâte sablée croustillante avec des framboises fraîches..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre de portions obtenues (Rendement lot) *</label>
              <input
                type="number"
                min="1"
                className="form-input"
                required
                value={formPortions}
                onChange={(e) => setFormPortions(Number(e.target.value))}
              />
            </div>

            <div className="form-group" style={{ display: 'none' }}>
              {/* Rendement alternatif facultatif masqué pour simplifier */}
            </div>
          </div>

          {/* SECTION DES INGRÉDIENTS DYNAMIQUES */}
          <h4 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', marginTop: '24px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Ingrédients</span>
            <button type="button" className="btn btn-secondary" style={{ height: '28px', padding: '0 8px', fontSize: '11px' }} onClick={handleAddIngredientLine}>
              + Ajouter ingrédient
            </button>
          </h4>

          {formIngredients.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', fontStyle: 'italic', marginBottom: '16px' }}>
              Aucun ingrédient ajouté pour l'instant. Utilisez le bouton ci-dessus.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {formIngredients.map((ing, idx) => {
                const selectedProd = products.find(p => p.id === ing.productId);
                const avgPrice = selectedProd ? selectedProd.avgPurchasePrice : 0;
                
                // Calcul coût ligne à la volée dans le formulaire
                const convertedQty = selectedProd ? convertUnits(ing.qtyUsed, ing.unit, selectedProd.unit) : 0;
                const lineCost = convertedQty * avgPrice;

                return (
                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <select
                      className="form-input"
                      style={{ flex: 2, height: '38px', padding: '0 8px' }}
                      value={ing.productId}
                      onChange={(e) => handleIngredientChange(idx, 'productId', e.target.value)}
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      style={{ flex: 1, width: '60px', height: '38px', padding: '0 8px', textAlign: 'center' }}
                      required
                      min="0.001"
                      value={ing.qtyUsed}
                      onChange={(e) => handleIngredientChange(idx, 'qtyUsed', Number(e.target.value))}
                    />

                    <select
                      className="form-input"
                      style={{ width: '60px', height: '38px', padding: '0 4px' }}
                      value={ing.unit}
                      onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                    >
                      {settings.units.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    <span style={{ fontSize: '12px', fontWeight: '600', width: '50px', textAlign: 'right' }}>
                      {lineCost.toFixed(2)}€
                    </span>

                    <button
                      type="button"
                      className="btn btn-danger btn-icon-only"
                      style={{ height: '38px', width: '38px' }}
                      onClick={() => handleRemoveIngredientLine(idx)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* SECTION EMBALLAGES DYNAMIQUES */}
          <h4 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', marginTop: '24px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Emballages & Récipients (Sachets, pots, étiquettes...)</span>
            <button type="button" className="btn btn-secondary" style={{ height: '28px', padding: '0 8px', fontSize: '11px' }} onClick={handleAddPackagingLine}>
              + Ajouter emballage
            </button>
          </h4>

          {formPackagings.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', fontStyle: 'italic', marginBottom: '16px' }}>
              Aucun emballage ou contenant ajouté.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {formPackagings.map((pack, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  
                  {/* Soit ils tapent à la main, soit ils choisissent un produit */}
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 2, height: '38px', padding: '0 8px' }}
                    placeholder="Ex: Pot verre 375ml"
                    required
                    value={pack.name}
                    onChange={(e) => handlePackagingChange(idx, 'name', e.target.value)}
                    list="packaging-suggestions"
                  />
                  
                  <datalist id="packaging-suggestions">
                    {products.filter(p => p.category.toLowerCase() === 'emballage').map(p => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>

                  <input
                    type="number"
                    className="form-input"
                    style={{ width: '60px', height: '38px', padding: '0 8px', textAlign: 'center' }}
                    required
                    min="1"
                    value={pack.qtyUsed}
                    onChange={(e) => handlePackagingChange(idx, 'qtyUsed', Number(e.target.value))}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '80px' }}>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      style={{ width: '55px', height: '38px', padding: '0 4px', textAlign: 'center' }}
                      required
                      min="0"
                      value={pack.costPerUnit}
                      onChange={(e) => handlePackagingChange(idx, 'costPerUnit', Number(e.target.value))}
                    />
                    <span style={{ fontSize: '12px' }}>€/u</span>
                  </div>

                  <span style={{ fontSize: '12px', fontWeight: '600', width: '50px', textAlign: 'right' }}>
                    {(pack.qtyUsed * pack.costPerUnit).toFixed(2)}€
                  </span>

                  <button
                    type="button"
                    className="btn btn-danger btn-icon-only"
                    style={{ height: '38px', width: '38px' }}
                    onClick={() => handleRemovePackagingLine(idx)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* MATÉRIEL ET NOTES DE FABRICATION */}
          <h4 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', marginTop: '24px', marginBottom: '12px' }}>
            Ustentiles & Fabrication (Informatif)
          </h4>

          <div className="form-group">
            <label className="form-label">Ustensiles requis</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Robot pâtissier, moule à manquer, douille 12..."
              value={formUtensilsNotes}
              onChange={(e) => setFormUtensilsNotes(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Conseils de fabrication / notes</label>
            <textarea
              className="form-input"
              style={{ height: '80px' }}
              placeholder="Notes de cuisson, de mélange, tour de main..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>

        </form>
      </Drawer>

      {/* --- DRAWER DE DÉTAIL D'UNE RECETTE (INTERACTIF / PRESTATIONS DE CALCUL) --- */}
      <Drawer
        title={selectedRecipeDetails?.name || "Détails de la Recette"}
        isOpen={selectedRecipeDetails !== null}
        onClose={() => setSelectedRecipeDetails(null)}
      >
        {selectedRecipeDetails && detailsCost && (
          <div>
            <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <span className="badge badge-info">{selectedRecipeDetails.category}</span>
                <span style={{ fontSize: '12px', color: 'var(--color-dark-light)' }}>
                  Rendement : {selectedRecipeDetails.portions} portions ({selectedRecipeDetails.yieldQty} {selectedRecipeDetails.yieldUnit})
                </span>
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>{selectedRecipeDetails.name}</h2>
              {selectedRecipeDetails.description && (
                <p style={{ color: 'var(--color-dark-light)', fontSize: '13px', marginBottom: '16px' }}>{selectedRecipeDetails.description}</p>
              )}

              {/* Raccourci de production */}
              <button 
                type="button" 
                className="btn btn-success" 
                style={{ width: '100%', marginBottom: '16px' }}
                onClick={() => {
                  setSelectedRecipeDetails(null);
                  if (initialTriggerAdd) return; // évite boucle
                  // naviguer vers production
                  window.location.hash = 'Production'; // Simulé ou via state global
                  window.dispatchEvent(new Event('hashchange'));
                }}
              >
                Cuisiner / Fabriquer ce plat
              </button>

              {/* SÉLECTEUR DE PORTIONS CIBLE POUR MISE À L'ÉCHELLE */}
              <div style={{ padding: '12px', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', marginBottom: '16px', border: '1px dashed var(--color-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Scale size={16} /> Mise à l'échelle (portions) :</span>
                  <span style={{ fontSize: '15px', color: 'var(--color-primary)' }}>{portionsCible} parts</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max={Math.max(selectedRecipeDetails.portions * 4, 30)}
                  step="1"
                  value={portionsCible}
                  onChange={(e) => setPortionsCible(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--color-primary)', marginBottom: '8px', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--color-dark-light)' }}>
                  <span>Portions d'origine : {selectedRecipeDetails.portions} parts</span>
                  <span>Facteur : x{(portionsCible / selectedRecipeDetails.portions).toFixed(2)}</span>
                </div>
              </div>

              {/* GRILLE DES COÛTS FINANCIERS AJUSTÉS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                <div style={{ padding: '8px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Coût Lot Ajusté</div>
                  <strong style={{ fontSize: '14px' }}>{(detailsCost.totalCost * (portionsCible / selectedRecipeDetails.portions)).toFixed(2)} {settings.currency}</strong>
                </div>
                <div style={{ padding: '8px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Coût Unitaire</div>
                  <strong style={{ fontSize: '14px' }}>{detailsCost.costPerPortion.toFixed(2)} {settings.currency}</strong>
                </div>
                <div style={{ padding: '8px', backgroundColor: 'var(--color-secondary-light)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-secondary)' }}>Prix Conseillé</div>
                  <strong style={{ fontSize: '14px', color: 'var(--color-secondary)' }}>{detailsCost.suggestedSellingPrice.toFixed(2)} {settings.currency}</strong>
                </div>
              </div>
            </div>

            {/* SIMULATEUR DE PRIX & MARGES DYNAMIQUE */}
            <div className="recipe-simulator" style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <TrendingUp size={16} />
                Simulateur de vente & marge en direct
              </h4>

              {/* Curseur de marge */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600' }}>
                  <span>Marge souhaitée :</span>
                  <span style={{ color: 'var(--color-primary)' }}>{simMargin}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="5"
                  value={simMargin}
                  onChange={(e) => handleMarginChange(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Saisie prix de vente */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Prix de vente unitaire simulé ({settings.currency})</label>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  style={{ height: '40px' }}
                  value={simSellPrice || ''}
                  onChange={(e) => handleSellPriceChange(Number(e.target.value))}
                />
              </div>

              {/* Indicateurs de gains unitaires */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <div style={{ padding: '10px', backgroundColor: 'var(--color-white)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Bénéfice par portion</div>
                  <strong style={{ color: 'var(--color-secondary)', fontSize: '14px' }}>
                    +{(simSellPrice - detailsCost.costPerPortion).toFixed(2)} {settings.currency}
                  </strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'var(--color-white)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Bénéfice par Lot ({portionsCible} u)</div>
                  <strong style={{ color: 'var(--color-secondary)', fontSize: '14px' }}>
                    +{((simSellPrice - detailsCost.costPerPortion) * portionsCible).toFixed(2)} {settings.currency}
                  </strong>
                </div>
              </div>

              {/* Estimateur sur une journée de marché */}
              <div style={{ borderTop: '1px solid rgba(242, 85, 34, 0.1)', paddingTop: '12px' }}>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label className="form-label">Simuler pour une journée de marché (portions vendues)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    style={{ height: '36px' }}
                    value={simSalesCount}
                    onChange={(e) => setSimSalesCount(Number(e.target.value))}
                  />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Chiffre d'Affaires estimé :</span>
                  <strong>{(simSalesCount * simSellPrice).toFixed(2)} {settings.currency}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px' }}>
                  <span>Coût total de production :</span>
                  <span style={{ color: 'var(--color-danger)', fontWeight: '600' }}>{(simSalesCount * detailsCost.costPerPortion).toFixed(2)} {settings.currency}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '6px', borderTop: '1px dashed var(--color-border)', paddingTop: '6px' }}>
                  <span style={{ fontWeight: '700' }}>Bénéfice Net Estimé :</span>
                  <strong style={{ color: 'var(--color-secondary)', fontSize: '16px' }}>
                    {((simSellPrice - detailsCost.costPerPortion) * simSalesCount).toFixed(2)} {settings.currency}
                  </strong>
                </div>
              </div>

            </div>

            {/* ALERTE DE DISPONIBILITÉ DES STOCKS */}
            {(() => {
              const scaleFactor = portionsCible / selectedRecipeDetails.portions;
              let isFullyFeasible = true;
              let isPartiallyFeasible = false;
              let hasLinked = false;
              
              detailsIngredients.forEach(ri => {
                if (ri.productId) {
                  hasLinked = true;
                  const prod = products.find(p => p.id === ri.productId);
                  if (prod) {
                    const qtyOrig = ri.originalQtyUsed || ri.qtyUsed;
                    const qtyAjust = qtyOrig * scaleFactor;
                    const neededQty = convertUnits(qtyAjust, ri.unit, prod.unit);
                    if (prod.stock < neededQty) {
                      isFullyFeasible = false;
                      if (prod.stock > 0) isPartiallyFeasible = true;
                    }
                  }
                }
              });

              // Calcul portions max faisables
              let maxPortions = Infinity;
              detailsIngredients.forEach(ri => {
                if (ri.productId) {
                  const prod = products.find(p => p.id === ri.productId);
                  if (prod) {
                    const qtyOrig = ri.originalQtyUsed || ri.qtyUsed;
                    const qtyPerPortion = convertUnits(qtyOrig, ri.unit, prod.unit) / selectedRecipeDetails.portions;
                    if (qtyPerPortion > 0) {
                      const maxForThis = Math.floor(prod.stock / qtyPerPortion);
                      if (maxForThis < maxPortions) maxPortions = maxForThis;
                    }
                  }
                }
              });
              const displayMaxPortions = maxPortions === Infinity ? 'N/A' : maxPortions;

              return (
                <div style={{ marginBottom: '20px' }}>
                  {hasLinked && (
                    <div 
                      style={{ 
                        padding: '12px', 
                        borderRadius: 'var(--radius-md)', 
                        fontSize: '13px',
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '6px',
                        backgroundColor: isFullyFeasible ? 'var(--color-secondary-light)' : (isPartiallyFeasible || (maxPortions !== Infinity && maxPortions > 0) ? 'var(--color-warning-light)' : 'var(--color-danger-light)'),
                        color: isFullyFeasible ? 'var(--color-secondary)' : (isPartiallyFeasible || (maxPortions !== Infinity && maxPortions > 0) ? 'var(--color-warning)' : 'var(--color-danger)'),
                        border: '1px solid rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                        {isFullyFeasible ? <Check size={18} /> : <AlertTriangle size={18} />}
                        <span>
                          {isFullyFeasible 
                            ? `Recette réalisable (${portionsCible} parts en stock !)` 
                            : ((maxPortions !== Infinity && maxPortions > 0) 
                              ? `Partiellement faisable (${displayMaxPortions} parts max avec vos stocks)` 
                              : `Stocks insuffisants (0 part faisable)`)}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.9 }}>
                        Quantité maximale de parts faisables avec le stock actuel : <strong>{displayMaxPortions} parts</strong>.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* LISTE DES INGRÉDIENTS DÉTAILLÉS AJUSTÉS */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <List size={16} />
                Ingrédients et stocks requis ({detailsIngredients.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {detailsIngredients.map(ri => {
                  const prod = products.find(p => p.id === ri.productId);
                  const qtyOrig = ri.originalQtyUsed || ri.qtyUsed;
                  const qtyAjust = qtyOrig * (portionsCible / selectedRecipeDetails.portions);
                  
                  const costLine = prod 
                    ? convertUnits(qtyAjust, ri.unit, prod.unit) * prod.avgPurchasePrice
                    : qtyAjust * (ri.customCostPerUnit || 0);

                  // Calcul stock et écart
                  let stockStatus = 'unlinked';
                  let stockDetail = '';
                  if (ri.productId && prod) {
                    const needed = convertUnits(qtyAjust, ri.unit, prod.unit);
                    if (prod.stock >= needed) {
                      stockStatus = 'ok';
                      stockDetail = `En stock (${prod.stock.toFixed(1)} ${prod.unit})`;
                    } else if (prod.stock > 0) {
                      stockStatus = 'partial';
                      stockDetail = `Insuffisant (Stock: ${prod.stock.toFixed(1)}, Manque: ${(needed - prod.stock).toFixed(1)} ${prod.unit})`;
                    } else {
                      stockStatus = 'empty';
                      stockDetail = `Rupture (Requis: ${needed.toFixed(1)} ${prod.unit})`;
                    }
                  }

                  return (
                    <div 
                      key={ri.id} 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '4px',
                        padding: '10px', 
                        backgroundColor: 'var(--color-light)', 
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                        <span>{prod?.name || ri.customName || 'Ingrédient'}</span>
                        <strong>{costLine.toFixed(2)}€</strong>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                        <span style={{ color: 'var(--color-dark-light)' }}>
                          {qtyOrig} {ri.unit} ➔ <strong style={{ color: 'var(--color-primary)' }}>{qtyAjust.toFixed(1)} {ri.unit}</strong>
                        </span>

                        {/* Badge de stock */}
                        {stockStatus === 'ok' && <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>{stockDetail}</span>}
                        {stockStatus === 'partial' && <span className="badge badge-warning" style={{ fontSize: '10px', padding: '2px 6px', color: 'var(--color-warning)', backgroundColor: 'var(--color-warning-light)' }}>{stockDetail}</span>}
                        {stockStatus === 'empty' && <span className="badge badge-danger" style={{ fontSize: '10px', padding: '2px 6px' }}>{stockDetail}</span>}
                        {stockStatus === 'unlinked' && <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: 'rgba(0,0,0,0.06)', color: 'var(--color-dark-light)' }}>Non suivi en stock</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LISTE DES EMBALLAGES DÉTAILLÉS AJUSTÉS */}
            {detailsPackagings.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Package size={16} />
                  Emballages & Contenants
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {detailsPackagings.map(rp => (
                    <div key={rp.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 8px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-sm)' }}>
                      <span>{rp.name}</span>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <span style={{ color: 'var(--color-dark-light)' }}>{(rp.qtyUsed * (portionsCible / selectedRecipeDetails.portions)).toFixed(1)} u</span>
                        <strong style={{ width: '50px', textAlign: 'right' }}>{(rp.qtyUsed * (portionsCible / selectedRecipeDetails.portions) * rp.costPerUnit).toFixed(2)}€</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LISTE DES INGRÉDIENTS MANQUANTS / LISTE DE COURSES */}
            {(() => {
              const scaleFactor = portionsCible / selectedRecipeDetails.portions;
              const missingList: { name: string; qty: number; unit: string }[] = [];
              
              detailsIngredients.forEach(ri => {
                if (ri.productId) {
                  const prod = products.find(p => p.id === ri.productId);
                  if (prod) {
                    const qtyOrig = ri.originalQtyUsed || ri.qtyUsed;
                    const qtyAjust = qtyOrig * scaleFactor;
                    const needed = convertUnits(qtyAjust, ri.unit, prod.unit);
                    if (prod.stock < needed) {
                      const deficit = needed - prod.stock;
                      const deficitRecipeUnit = convertUnits(deficit, prod.unit, ri.unit);
                      missingList.push({
                        name: prod.name,
                        qty: deficitRecipeUnit,
                        unit: ri.unit
                      });
                    }
                  }
                }
              });

              if (missingList.length === 0) return null;

              return (
                <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid var(--color-danger)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <ClipboardList size={16} />
                    Ingrédients manquants (Liste de courses)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                    {missingList.map((m, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-dark)' }}>
                        <span>• {m.name}</span>
                        <strong style={{ color: 'var(--color-danger)' }}>Acheter : {m.qty.toFixed(1)} {m.unit}</strong>
                      </div>
                    ))}
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: '100%', height: '32px', fontSize: '12px', padding: 0 }}
                    onClick={() => {
                      const text = missingList.map(m => `- ${m.name} : ${m.qty.toFixed(1)} ${m.unit}`).join('\n');
                      navigator.clipboard.writeText(`Liste de courses pour ${selectedRecipeDetails.name} (${portionsCible} portions) :\n${text}`);
                      setCopiedCourses(true);
                      setTimeout(() => setCopiedCourses(false), 2000);
                    }}
                  >
                    {copiedCourses ? '✅ Liste copiée !' : '📋 Copier la liste de courses'}
                  </button>
                </div>
              );
            })()}

            {/* USTENSILLES & CONSEILS */}
            {selectedRecipeDetails.utensilsNotes && (
              <div style={{ marginBottom: '16px', padding: '10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>🍳 Matériel & Ustensiles :</strong>
                <span style={{ color: 'var(--color-dark-light)' }}>{selectedRecipeDetails.utensilsNotes}</span>
              </div>
            )}

            {selectedRecipeDetails.notes && (
              <div style={{ padding: '10px', backgroundColor: 'var(--color-light)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontStyle: 'italic', color: 'var(--color-dark-light)' }}>
                <strong>💡 Astuce de fabrication :</strong><br/>
                {selectedRecipeDetails.notes}
              </div>
            )}

            {/* ACTIONS FOOTER */}
            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--color-border)', marginTop: '24px', paddingTop: '16px' }}>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1 }}
                onClick={(e) => handleOpenEditForm(selectedRecipeDetails, e)}
              >
                Modifier Recette
              </button>
              <button 
                className="btn btn-danger" 
                onClick={() => handleDeleteRecipe(selectedRecipeDetails.id)}
              >
                Supprimer
              </button>
            </div>

          </div>
        )}
      </Drawer>
    </div>
  );
};
