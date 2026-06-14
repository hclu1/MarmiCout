import React, { useState, useEffect } from 'react';
import {
  Plus,
  Sparkles,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChefHat
} from 'lucide-react';
import { dbService, convertUnits } from '../services/db';
import { Product, Recipe, Production } from '../types';
import { Drawer } from './Drawer';

interface ProductionsProps {
  initialTriggerAdd?: boolean;
}

export const Productions: React.FC<ProductionsProps> = ({ initialTriggerAdd }) => {
  const [productions, setProductions] = useState<Production[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const settings = dbService.getSettings();

  // États du Drawer de Formulaire de Production
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Valeurs du formulaire de Production
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formRecipeId, setFormRecipeId] = useState('');
  const [formPortions, setFormPortions] = useState(10);
  const [formNotes, setFormNotes] = useState('');

  // Aperçu de la faisabilité (stocks requis vs stock actuel)
  const [feasibility, setFeasibility] = useState<{
    isFeasible: boolean;
    missingIngredients: string[];
    ingredientsUsed: { name: string; required: number; available: number; unit: string }[];
  }>({ isFeasible: true, missingIngredients: [], ingredientsUsed: [] });

  const loadData = () => {
    setProductions(dbService.getProductions().sort((a, b) => b.date.localeCompare(a.date)));
    setRecipes(dbService.getRecipes().filter(r => r.isActive));
    setProducts(dbService.getProducts());
  };

  const handleOpenAddForm = () => {
    const activeRecipes = dbService.getRecipes().filter(r => r.isActive);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormRecipeId(activeRecipes[0]?.id || '');
    setFormPortions(activeRecipes[0]?.portions || 8);
    setFormNotes('');
    setIsFormOpen(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    if (initialTriggerAdd) {
      handleOpenAddForm();
    }
  }, [initialTriggerAdd]);

  // Re-calculer le nombre de portions suggéré lorsqu'on change de recette
  useEffect(() => {
    if (formRecipeId) {
      const selected = recipes.find(r => r.id === formRecipeId);
      if (selected) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormPortions(selected.portions);
      }
    }
  }, [formRecipeId, recipes]);

  // Évaluer la faisabilité en temps réel pendant qu'on saisit la production
  useEffect(() => {
    if (!formRecipeId || formPortions <= 0) return;

    const recipe = recipes.find(r => r.id === formRecipeId);
    if (!recipe) return;

    const ingredients = dbService.getRecipeIngredients(formRecipeId);
    const packagings = dbService.getRecipePackagings(formRecipeId);
    
    const factor = formPortions / recipe.portions;
    const missingIngredients: string[] = [];
    const ingredientsUsed: typeof feasibility.ingredientsUsed = [];
    let isFeasible = true;

    // 1. Évaluer les ingrédients
    ingredients.forEach(ing => {
      const prod = products.find(p => p.id === ing.productId);
      if (prod) {
        const qtyNeeded = convertUnits(ing.qtyUsed * factor, ing.unit, prod.unit);
        const hasEnough = prod.stock >= qtyNeeded;
        
        if (!hasEnough) {
          isFeasible = false;
          missingIngredients.push(`${prod.name} (Manque: ${(qtyNeeded - prod.stock).toFixed(2)} ${prod.unit})`);
        }

        ingredientsUsed.push({
          name: prod.name,
          required: qtyNeeded,
          available: prod.stock,
          unit: prod.unit
        });
      }
    });

    // 2. Évaluer les emballages
    packagings.forEach(pack => {
      const prod = products.find(p => p.name.toLowerCase() === pack.name.toLowerCase());
      if (prod) {
        const qtyNeeded = pack.qtyUsed * factor;
        const hasEnough = prod.stock >= qtyNeeded;

        if (!hasEnough) {
          isFeasible = false;
          missingIngredients.push(`${prod.name} (Manque: ${qtyNeeded - prod.stock} pièces)`);
        }

        ingredientsUsed.push({
          name: prod.name,
          required: qtyNeeded,
          available: prod.stock,
          unit: prod.unit
        });
      }
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeasibility({ isFeasible, missingIngredients, ingredientsUsed });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formRecipeId, formPortions, products, recipes]);

  // Valider et enregistrer la fabrication
  const handleSaveProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRecipeId) return;

    const recipe = recipes.find(r => r.id === formRecipeId);
    if (!recipe) return;

    // Calculer le coût de la production
    const costInfo = dbService.calculateRecipeCost(formRecipeId);
    const factor = formPortions / recipe.portions;
    const calculatedCost = costInfo.totalCost * factor;

    const newProd: Production = {
      id: 'PR_' + Date.now(),
      date: formDate,
      recipeId: formRecipeId,
      portionsProduced: formPortions,
      notes: formNotes.trim() || undefined,
      calculatedCost: Number(calculatedCost.toFixed(2))
    };

    const result = dbService.addProduction(newProd);

    if (result.success) {
      setIsFormOpen(false);
      loadData();
    } else {
      alert(result.error || "Erreur de production");
    }
  };

  return (
    <div>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Productions & Fabrications</h1>
          <p className="page-subtitle">Déclarez vos séances de cuisine, déduisez vos stocks et suivez vos coûts réels</p>
        </div>
        <div className="actions-group">
          <button className="btn btn-primary" onClick={handleOpenAddForm}>
            <Plus size={18} />
            Déclarer une fabrication
          </button>
        </div>
      </div>

      {/* Liste de l'historique des productions */}
      <div className="table-container">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Historique des fabrications</h3>
          <span className="badge badge-info">{productions.length} lot(s) produit(s)</span>
        </div>

        {productions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-dark-light)' }}>
            <Sparkles size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>Aucune fabrication enregistrée pour le moment. Cliquez sur "Déclarer une fabrication".</p>
          </div>
        ) : (
          <table className="custom-table adaptive-table-wrap">
            <thead>
              <tr>
                <th>Date</th>
                <th>Recette cuisinée</th>
                <th>Quantité produite</th>
                <th>Coût réel du lot</th>
                <th>Coût par portion</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {productions.map(p => {
                const recipe = dbService.getRecipe(p.recipeId);
                const costPerUnit = p.portionsProduced > 0 ? p.calculatedCost / p.portionsProduced : 0;
                
                return (
                  <tr key={p.id}>
                    <td data-label="Date">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={14} style={{ color: 'var(--color-dark-light)' }} />
                        <span>{p.date}</span>
                      </div>
                    </td>
                    <td data-label="Recette" style={{ fontWeight: '600' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ChefHat size={14} style={{ color: 'var(--color-primary)' }} />
                        <span>{recipe ? recipe.name : 'Recette supprimée'}</span>
                      </div>
                    </td>
                    <td data-label="Quantité">
                      {p.portionsProduced} portion(s)
                    </td>
                    <td data-label="Coût Lot" style={{ fontWeight: '600', color: 'var(--color-danger)' }}>
                      {p.calculatedCost.toFixed(2)} {settings.currency}
                    </td>
                    <td data-label="Coût Unit.">
                      {costPerUnit.toFixed(2)} {settings.currency} / u
                    </td>
                    <td data-label="Notes" style={{ fontStyle: 'italic', fontSize: '13px', color: 'var(--color-dark-light)' }}>
                      {p.notes || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* --- DRAWER D'AJOUT DE FABRICATION --- */}
      <Drawer
        title="Enregistrer une production"
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Annuler</button>
            <button 
              className="btn btn-primary" 
              onClick={handleSaveProduction}
              disabled={!feasibility.isFeasible || !formRecipeId}
            >
              Lancer la production
            </button>
          </>
        }
      >
        {recipes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-dark-light)' }}>
            <AlertTriangle size={36} style={{ color: 'var(--color-warning)', margin: '0 auto 12px' }} />
            <p>Veuillez d'abord créer au moins une recette active pour pouvoir déclarer une production.</p>
          </div>
        ) : (
          <form onSubmit={handleSaveProduction}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date de fabrication</label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Recette à cuisiner *</label>
                <select 
                  className="form-input" 
                  required 
                  value={formRecipeId} 
                  onChange={(e) => setFormRecipeId(e.target.value)}
                >
                  {recipes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Quantité réelle produite (nombre de portions ou parts) *</label>
              <input
                type="number"
                min="1"
                className="form-input"
                required
                value={formPortions}
                onChange={(e) => setFormPortions(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notes de fabrication (facultatif)</label>
              <textarea
                className="form-input"
                placeholder="Ex: Température extérieure élevée, cuisson impeccable..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            {/* --- RAPPORT DE FAISABILITE & IMPACT STOCK --- */}
            <h4 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', marginTop: '20px', marginBottom: '12px' }}>
              Disponibilité des ingrédients & emballages
            </h4>

            {/* Alerte si stocks insuffisants */}
            {!feasibility.isFeasible && (
              <div className="card" style={{ backgroundColor: 'var(--color-danger-light)', borderColor: 'rgba(255, 75, 75, 0.2)', color: 'var(--color-danger)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '16px' }}>
                <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Stock insuffisant !</strong> Impossible de lancer la fabrication. Ingrédients manquants :
                  <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
                    {feasibility.missingIngredients.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {feasibility.isFeasible && formRecipeId && (
              <div className="card" style={{ backgroundColor: 'var(--color-secondary-light)', borderColor: 'rgba(50, 180, 100, 0.2)', color: 'var(--color-secondary)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
                <span>Tous les ingrédients et emballages requis sont disponibles en stock !</span>
              </div>
            )}

            {/* Liste des ingrédients prélevés */}
            {formRecipeId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                {feasibility.ingredientsUsed.map((ing, idx) => {
                  const hasEnough = ing.available >= ing.required;
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        padding: '6px 8px', 
                        backgroundColor: 'var(--color-light)', 
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: hasEnough ? 'inherit' : 'var(--color-danger)'
                      }}
                    >
                      <strong>{ing.name}</strong>
                      <div>
                        <span>Requis : <strong>{ing.required.toFixed(2)} {ing.unit}</strong></span>
                        <span style={{ marginLeft: '12px', color: 'var(--color-dark-light)' }}>
                          (En stock : {ing.available.toFixed(2)} {ing.unit})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </form>
        )}
      </Drawer>
    </div>
  );
};
