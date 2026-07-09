import React, { useMemo, useState } from 'react';
import { parseDecimalInput } from '../utils';
import {
  ShoppingCart,
  Check,
  AlertTriangle,
  HelpCircle,
  Copy,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  X,
  FileSpreadsheet,
  ChefHat,
  PackageCheck
} from 'lucide-react';
import { Recipe, Production } from '../types';
import { dbService, convertUnits } from '../services/db';

interface RecipeSelection {
  recipe: Recipe;
  portions: number;
}

interface ShoppingListDrawerProps {
  selections: RecipeSelection[];
  isOpen: boolean;
  onClose: () => void;
  /** Appelé après une production réussie — recharger les données + vider les sélections */
  onCookDone?: () => void;
  /** Mettre à jour les portions d'une recette directement depuis cette fenêtre */
  onUpdatePortions?: (recipeId: string, portions: number) => void;
}

interface ShoppingItem {
  productId: string;
  productName: string;
  productUnit: string;
  needed: number;
  inStock: number;
  toOrder: number;
  estimatedCost: number;
  avgPurchasePrice: number;
  fromRecipes: string[];
}

interface CustomItem {
  name: string;
  totalQty: number;
  unit: string;
  fromRecipes: string[];
}

export const ShoppingListDrawer: React.FC<ShoppingListDrawerProps> = ({
  selections,
  isOpen,
  onClose,
  onCookDone,
  onUpdatePortions
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);

  // États du flux cuisine
  type CookState = 'idle' | 'confirming' | 'done';
  const [cookingState, setCookingState] = useState<CookState>('idle');
  const [cookResults, setCookResults] = useState<{ recipeName: string; success: boolean; error?: string }[]>([]);

  const settings = dbService.getSettings();

  const { toOrderItems, availableItems, customItems, totalEstimatedCost } = useMemo(() => {
    if (!selections.length) {
      return { toOrderItems: [], availableItems: [], customItems: [], totalEstimatedCost: 0 };
    }

    const productNeeds = new Map<string, { needed: number; fromRecipes: string[] }>();
    const customNeeds = new Map<string, { totalQty: number; unit: string; fromRecipes: string[] }>();

    for (const { recipe, portions } of selections) {
      const factor = portions / (recipe.portions || 1);
      const ingredients = dbService.getRecipeIngredients(recipe.id);

      for (const ing of ingredients) {
        if (ing.productId) {
          const product = dbService.getProduct(ing.productId);
          if (!product) continue;

          const qtyNeeded = convertUnits(ing.qtyUsed * factor, ing.unit, product.unit);
          const existing = productNeeds.get(ing.productId);
          if (existing) {
            existing.needed += qtyNeeded;
            if (!existing.fromRecipes.includes(recipe.name)) {
              existing.fromRecipes.push(recipe.name);
            }
          } else {
            productNeeds.set(ing.productId, {
              needed: qtyNeeded,
              fromRecipes: [recipe.name]
            });
          }
        } else if (ing.customName) {
          const key = `${ing.customName.toLowerCase().trim()}_${ing.unit}`;
          const qtyNeeded = ing.qtyUsed * factor;
          const existing = customNeeds.get(key);
          if (existing) {
            existing.totalQty += qtyNeeded;
            if (!existing.fromRecipes.includes(recipe.name)) {
              existing.fromRecipes.push(recipe.name);
            }
          } else {
            customNeeds.set(key, {
              totalQty: qtyNeeded,
              unit: ing.unit,
              fromRecipes: [recipe.name]
            });
          }
        }
      }
    }

    const toOrderItems: ShoppingItem[] = [];
    const availableItems: ShoppingItem[] = [];

    for (const [productId, { needed, fromRecipes }] of productNeeds.entries()) {
      const product = dbService.getProduct(productId);
      if (!product) continue;

      const toOrder = Math.max(0, needed - product.stock);
      const item: ShoppingItem = {
        productId,
        productName: product.name,
        productUnit: product.unit,
        needed: Math.round(needed * 1000) / 1000,
        inStock: product.stock,
        toOrder: Math.round(toOrder * 1000) / 1000,
        estimatedCost: toOrder * product.avgPurchasePrice,
        avgPurchasePrice: product.avgPurchasePrice,
        fromRecipes
      };

      if (toOrder > 0) {
        toOrderItems.push(item);
      } else {
        availableItems.push(item);
      }
    }

    toOrderItems.sort((a, b) => b.estimatedCost - a.estimatedCost);

    const customItemsFinal: CustomItem[] = [];
    for (const [key, val] of customNeeds.entries()) {
      const name = key.replace(/_[^_]+$/, '');
      customItemsFinal.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        totalQty: Math.round(val.totalQty * 1000) / 1000,
        unit: val.unit,
        fromRecipes: val.fromRecipes
      });
    }

    const totalEstimatedCost = toOrderItems.reduce((sum, item) => sum + item.estimatedCost, 0);

    return { toOrderItems, availableItems, customItems: customItemsFinal, totalEstimatedCost };
  }, [selections]);

  // --- Copier la liste en texte ---
  const handleCopyText = () => {
    const lines: string[] = [];
    lines.push('🛒 LISTE DE COURSES — MarmiCout');
    lines.push(`📅 ${new Date().toLocaleDateString('fr-FR')}`);
    lines.push('');

    if (selections.length > 0) {
      lines.push('📋 Recettes planifiées :');
      selections.forEach(({ recipe, portions }) => {
        lines.push(`  • ${recipe.name} — ${portions} portion(s)`);
      });
      lines.push('');
    }

    if (toOrderItems.length > 0) {
      lines.push('🛒 À ACHETER :');
      toOrderItems.forEach(item => {
        lines.push(
          `  □ ${item.productName} — ${item.toOrder} ${item.productUnit}` +
          (item.estimatedCost > 0 ? ` (~${item.estimatedCost.toFixed(2)}${settings.currency})` : '')
        );
      });
      lines.push('');
    }

    if (customItems.length > 0) {
      lines.push('❓ Ingrédients non gérés en stock :');
      customItems.forEach(item => {
        lines.push(`  □ ${item.name} — ${item.totalQty} ${item.unit}`);
      });
      lines.push('');
    }

    if (toOrderItems.length > 0) {
      lines.push(`💰 Coût estimé des achats : ${totalEstimatedCost.toFixed(2)}${settings.currency}`);
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    });
  };

  // --- Exporter en CSV (compatible Excel) ---
  const handleExportCsv = () => {
    const bom = '\uFEFF'; // BOM UTF-8 pour Excel
    const lines: string[] = [];

    lines.push('RECETTES PLANIFIÉES');
    lines.push('Recette,Portions cible');
    selections.forEach(({ recipe, portions }) => {
      lines.push(`"${recipe.name}",${portions}`);
    });
    lines.push('');

    if (toOrderItems.length > 0) {
      lines.push('INGRÉDIENTS À ACHETER');
      lines.push('Ingrédient,Qté à commander,Unité,En stock,Besoin total,Coût estimé');
      toOrderItems.forEach(item => {
        lines.push(
          `"${item.productName}",${item.toOrder},"${item.productUnit}",${item.inStock},${item.needed},${item.estimatedCost.toFixed(2)}`
        );
      });
      lines.push('');
    }

    if (availableItems.length > 0) {
      lines.push('DÉJÀ EN STOCK');
      lines.push('Ingrédient,Besoin,Stock actuel,Unité');
      availableItems.forEach(item => {
        lines.push(`"${item.productName}",${item.needed},${item.inStock},"${item.productUnit}"`);
      });
      lines.push('');
    }

    if (customItems.length > 0) {
      lines.push('À VÉRIFIER MANUELLEMENT');
      lines.push('Ingrédient,Quantité,Unité');
      customItems.forEach(item => {
        lines.push(`"${item.name}",${item.totalQty},"${item.unit}"`);
      });
    }

    const csvContent = bom + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MarmiCout_ListeCourses_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Cuisiner : créer les productions et déduire les stocks ---
  const handleCook = () => {
    const today = new Date().toISOString().split('T')[0];
    const results: { recipeName: string; success: boolean; error?: string }[] = [];

    for (const { recipe, portions } of selections) {
      const costInfo = dbService.calculateRecipeCost(recipe.id);
      const factor = portions / (recipe.portions || 1);
      const calculatedCost = costInfo.totalCost * factor;

      const prod: Production = {
        id: 'PR_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        date: today,
        recipeId: recipe.id,
        portionsProduced: portions,
        calculatedCost: Number(calculatedCost.toFixed(2))
      };

      const result = dbService.addProduction(prod);
      results.push({
        recipeName: recipe.name,
        success: result.success,
        error: result.error
      });
    }

    setCookResults(results);
    setCookingState('done');

    // Si au moins une production a réussi → recharger + vider les sélections
    if (results.some(r => r.success) && onCookDone) {
      onCookDone();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 900,
          backdropFilter: 'blur(2px)'
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 'min(540px, 100vw)',
        backgroundColor: 'var(--color-white)',
        zIndex: 901,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.15)',
        animation: 'slideIn 0.25s ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: 'var(--color-primary-light)'
        }}>
          <ShoppingCart size={24} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-dark)', margin: 0 }}>
              {cookingState === 'confirming' ? 'Confirmer la production' : cookingState === 'done' ? 'Production terminée' : 'Liste de courses'}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--color-dark-light)', margin: 0, marginTop: '2px' }}>
              {selections.length} recette(s) — {selections.reduce((s, x) => s + x.portions, 0)} portion(s) total
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-icon-only"
            onClick={onClose}
            style={{ height: '36px', width: '36px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Récapitulatif recettes avec portions éditables */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-light)',
          fontSize: '12px',
          color: 'var(--color-dark-light)'
        }}>
          <strong style={{ display: 'block', marginBottom: '6px', color: 'var(--color-dark)' }}>Recettes — ajustez les portions ici :</strong>
          {selections.map(({ recipe, portions }) => (
            <div key={recipe.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', gap: '8px' }}>
              <span style={{ flex: 1, fontWeight: '600', color: 'var(--color-dark)' }}>• {recipe.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <input
                  type="number"
                  min="1"
                  value={portions}
                  onChange={e => onUpdatePortions?.(recipe.id, Math.max(1, parseDecimalInput(e.target.value)))}
                  style={{
                    width: '68px',
                    height: '30px',
                    border: '2px solid var(--color-primary)',
                    borderRadius: '6px',
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: '700',
                    color: 'var(--color-primary)',
                    padding: '0 4px',
                    backgroundColor: '#fff'
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>port.</span>
              </div>
            </div>
          ))}
          <p style={{ fontSize: '10px', color: 'var(--color-dark-light)', marginTop: '6px', fontStyle: 'italic' }}>
            ↑ Changez le nombre de portions — la liste se recalcule instantanément.
          </p>
        </div>

        {/* ── ÉTAT NORMAL : liste de courses ── */}
        {cookingState === 'idle' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

            {/* Total estimé */}
            {toOrderItems.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                backgroundColor: 'var(--color-warning-light)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(242, 185, 34, 0.3)',
                marginBottom: '20px'
              }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-dark)' }}>
                  💰 Coût estimé des achats
                </span>
                <strong style={{ fontSize: '18px', color: 'var(--color-primary)' }}>
                  ~{totalEstimatedCost.toFixed(2)}{settings.currency}
                </strong>
              </div>
            )}

            {/* Section À ACHETER */}
            {toOrderItems.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--color-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <ShoppingCart size={14} />
                  À acheter ({toOrderItems.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {toOrderItems.map(item => (
                    <div
                      key={item.productId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 14px',
                        backgroundColor: 'var(--color-danger-light)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(255, 75, 75, 0.15)'
                      }}
                    >
                      <div style={{
                        width: '32px', height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-danger)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <AlertTriangle size={16} style={{ color: '#fff' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--color-dark)', marginBottom: '2px' }}>
                          {item.productName}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>
                          Besoin : {item.needed} {item.productUnit} • Stock : {item.inStock} {item.productUnit}
                        </div>
                        {item.fromRecipes.length > 0 && (
                          <div style={{ fontSize: '10px', color: 'var(--color-dark-light)', marginTop: '2px' }}>
                            Pour : {item.fromRecipes.join(', ')}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--color-danger)' }}>
                          {item.toOrder} {item.productUnit}
                        </div>
                        {item.estimatedCost > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>
                            ~{item.estimatedCost.toFixed(2)}{settings.currency}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section Ingrédients non liés */}
            {customItems.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--color-warning)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <HelpCircle size={14} />
                  Non gérés en stock ({customItems.length})
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--color-dark-light)', marginBottom: '8px', fontStyle: 'italic' }}>
                  Ces ingrédients ne sont pas liés à vos produits en stock — à vérifier manuellement.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {customItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        backgroundColor: 'var(--color-warning-light)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(242, 185, 34, 0.2)'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: '600', fontSize: '13px' }}>
                          <HelpCircle size={12} style={{ marginRight: '6px', color: 'var(--color-warning)' }} />
                          {item.name}
                        </span>
                        {item.fromRecipes.length > 0 && (
                          <div style={{ fontSize: '10px', color: 'var(--color-dark-light)', marginTop: '2px' }}>
                            Pour : {item.fromRecipes.join(', ')}
                          </div>
                        )}
                      </div>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-dark)' }}>
                        {item.totalQty} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section En stock */}
            {availableItems.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: 'var(--color-secondary)',
                    padding: '0 0 10px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                  onClick={() => setShowAvailable(v => !v)}
                >
                  {showAvailable ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Check size={14} />
                  Déjà en stock ({availableItems.length})
                </button>

                {showAvailable && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {availableItems.map(item => (
                      <div
                        key={item.productId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          backgroundColor: 'rgba(74, 155, 120, 0.06)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(74, 155, 120, 0.15)'
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-dark)' }}>
                            ✅ {item.productName}
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--color-dark-light)', marginTop: '2px' }}>
                            Besoin : {item.needed} {item.productUnit} • Stock : {item.inStock} {item.productUnit}
                          </div>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--color-secondary)', fontWeight: '600' }}>
                          OK
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Si rien à acheter et rien de non géré */}
            {toOrderItems.length === 0 && customItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Check size={48} style={{ margin: '0 auto 16px', color: 'var(--color-secondary)', opacity: 0.7 }} />
                <p style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-secondary)' }}>
                  Vous avez tout en stock ! 🎉
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', marginTop: '8px' }}>
                  Tous les ingrédients liés sont disponibles en quantité suffisante.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── ÉTAT CONFIRMATION ── */}
        {cookingState === 'confirming' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <ChefHat size={48} style={{ color: 'var(--color-primary)', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', maxWidth: '320px', margin: '0 auto' }}>
                En confirmant, les ingrédients de chaque recette seront
                <strong> immédiatement déduits</strong> de vos stocks et les productions seront enregistrées.
              </p>
            </div>

            {/* Récap des productions à lancer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {selections.map(({ recipe, portions }) => {
                const costInfo = dbService.calculateRecipeCost(recipe.id);
                const factor = portions / (recipe.portions || 1);
                const cost = costInfo.totalCost * factor;
                return (
                  <div key={recipe.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 16px',
                    backgroundColor: 'var(--color-primary-light)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(99, 102, 241, 0.2)'
                  }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px' }}>{recipe.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-dark-light)', marginTop: '2px' }}>
                        Coût estimé du lot : {cost.toFixed(2)} {settings.currency}
                      </div>
                    </div>
                    <span style={{ color: 'var(--color-primary)', fontWeight: '700', fontSize: '16px' }}>
                      {portions} port.
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Avertissement si manque de stock */}
            {toOrderItems.length > 0 && (
              <div style={{
                display: 'flex',
                gap: '10px',
                padding: '12px 14px',
                backgroundColor: 'var(--color-warning-light)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(242, 185, 34, 0.3)',
                fontSize: '12px',
                color: 'var(--color-dark)'
              }}>
                <AlertTriangle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                <span>
                  <strong>Attention :</strong> Certains ingrédients sont en stock insuffisant. Les recettes concernées seront bloquées lors de la production.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── ÉTAT RÉSULTATS ── */}
        {cookingState === 'done' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <PackageCheck size={48} style={{ color: 'var(--color-secondary)', margin: '0 auto 12px', display: 'block' }} />
              <h3 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '4px' }}>Productions terminées</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-dark-light)' }}>
                {cookResults.filter(r => r.success).length} réussie(s) · {cookResults.filter(r => !r.success).length} échouée(s)
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cookResults.map((r, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: r.success ? 'var(--color-secondary-light)' : 'var(--color-danger-light)',
                  border: `1px solid ${r.success ? 'rgba(50,180,100,0.3)' : 'rgba(255,75,75,0.2)'}`
                }}>
                  <span style={{ fontSize: '22px', lineHeight: 1 }}>{r.success ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>{r.recipeName}</div>
                    {r.success && (
                      <div style={{ fontSize: '12px', color: 'var(--color-secondary)' }}>
                        Stock déduit et production enregistrée avec succès.
                      </div>
                    )}
                    {r.error && (
                      <div style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
                        {r.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FOOTER DYNAMIQUE ── */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          {cookingState === 'idle' && (
            <>
              {/* Bouton principal : Cuisiner */}
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, height: '46px', minWidth: '160px' }}
                onClick={() => setCookingState('confirming')}
              >
                <ChefHat size={18} />
                Cuisiner &amp; déduire du stock
              </button>

              {/* Export Excel (CSV) */}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '46px', padding: '0 14px' }}
                onClick={handleExportCsv}
                title="Exporter vers Excel (.csv)"
              >
                <FileSpreadsheet size={18} />
              </button>

              {/* Copier texte */}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '46px', padding: '0 14px' }}
                onClick={handleCopyText}
                title="Copier la liste en texte"
              >
                {copiedText ? <CheckCheck size={18} /> : <Copy size={18} />}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '46px', padding: '0 20px' }}
                onClick={onClose}
              >
                Fermer
              </button>
            </>
          )}

          {cookingState === 'confirming' && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '46px', padding: '0 20px' }}
                onClick={() => setCookingState('idle')}
              >
                ← Retour
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, height: '46px' }}
                onClick={handleCook}
              >
                <PackageCheck size={18} />
                Confirmer &amp; déduire du stock
              </button>
            </>
          )}

          {cookingState === 'done' && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1, height: '46px' }}
              onClick={onClose}
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </>
  );
};
