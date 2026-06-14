import React, { useMemo, useState } from 'react';
import {
  ShoppingCart,
  Check,
  AlertTriangle,
  HelpCircle,
  Copy,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  X
} from 'lucide-react';
import { Recipe } from '../types';
import { dbService, convertUnits } from '../services/db';

interface RecipeSelection {
  recipe: Recipe;
  portions: number;
}

interface ShoppingListDrawerProps {
  selections: RecipeSelection[];
  isOpen: boolean;
  onClose: () => void;
}

interface ShoppingItem {
  productId: string;
  productName: string;
  productUnit: string;
  needed: number;       // Total needed (in product's unit)
  inStock: number;      // Current stock
  toOrder: number;      // max(0, needed - inStock)
  estimatedCost: number;
  avgPurchasePrice: number;
  fromRecipes: string[]; // Names of recipes using this ingredient
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
  onClose
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);

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

    // Sort: most expensive first in toOrder
    toOrderItems.sort((a, b) => b.estimatedCost - a.estimatedCost);

    // Build custom items from the map keys
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
              Liste de courses
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

        {/* Recettes planifiées */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-light)',
          fontSize: '12px',
          color: 'var(--color-dark-light)'
        }}>
          <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--color-dark)' }}>Recettes planifiées :</strong>
          {selections.map(({ recipe, portions }) => (
            <div key={recipe.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>• {recipe.name}</span>
              <span style={{ fontWeight: '600' }}>{portions} portion(s)</span>
            </div>
          ))}
        </div>

        {/* Contenu scrollable */}
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

        {/* Footer avec action */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          gap: '10px'
        }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, height: '46px' }}
            onClick={handleCopyText}
          >
            {copiedText ? <CheckCheck size={18} /> : <Copy size={18} />}
            {copiedText ? 'Copié !' : 'Copier la liste'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ height: '46px', padding: '0 20px' }}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </>
  );
};
