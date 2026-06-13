import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  DollarSign, 
  Trash2, 
  Calendar, 
  MapPin, 
  TrendingUp, 
  PieChart, 
  List,
  Store
} from 'lucide-react';
import { dbService } from '../services/db';
import { Product, Recipe, Sale } from '../types';
import { Drawer } from './Drawer';

interface SalesProps {
  initialTriggerAdd?: boolean;
}

export const Sales: React.FC<SalesProps> = ({ initialTriggerAdd }) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const settings = dbService.getSettings();

  // Sous-onglets de la vue : 'list' ou 'reports'
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'reports'>('list');

  // États du Drawer de Formulaire de Vente
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Valeurs du formulaire de Vente
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formItemType, setFormItemType] = useState<'RECIPE' | 'PRODUCT'>('RECIPE');
  const [formItemId, setFormItemId] = useState('');
  const [formQty, setFormQty] = useState(1);
  const [formUnitPrice, setFormUnitPrice] = useState(0);
  const [formLocation, setFormLocation] = useState(settings.salesLocations[0] || 'Marché');
  const [formNotes, setFormNotes] = useState('');

  // Charger les données
  const loadData = () => {
    setSales(dbService.getSales().sort((a, b) => b.date.localeCompare(a.date)));
    setRecipes(dbService.getRecipes());
    setProducts(dbService.getProducts().filter(p => p.isActive));
  };

  useEffect(() => {
    loadData();
    if (initialTriggerAdd) {
      handleOpenAddForm();
    }
  }, [initialTriggerAdd]);

  // Pré-remplir le prix unitaire conseillé lorsqu'on change d'article
  useEffect(() => {
    if (formItemId) {
      if (formItemType === 'RECIPE') {
        const costInfo = dbService.calculateRecipeCost(formItemId);
        setFormUnitPrice(costInfo.suggestedSellingPrice);
        
        // Suggérer la quantité en stock disponible
        const recipeObj = recipes.find(r => r.id === formItemId);
        if (recipeObj) {
          setFormQty(1);
        }
      } else {
        const prod = products.find(p => p.id === formItemId);
        if (prod) {
          // Si c'est un ingrédient brut revendu, marge de 30% ou son prix d'achat * 1.5
          setFormUnitPrice(Number((prod.avgPurchasePrice * 1.5).toFixed(2)));
          setFormQty(1);
        }
      }
    }
  }, [formItemId, formItemType, recipes, products]);

  // Lorsqu'on change de type d'article (recette vs produit brut), réinitialiser la liste d'ID
  useEffect(() => {
    if (formItemType === 'RECIPE') {
      setFormItemId(recipes[0]?.id || '');
    } else {
      setFormItemId(products[0]?.id || '');
    }
  }, [formItemType, recipes, products]);

  const handleOpenAddForm = () => {
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormItemType('RECIPE');
    setFormItemId(recipes[0]?.id || '');
    setFormQty(1);
    setFormLocation(settings.salesLocations[0] || 'Marché');
    setFormNotes('');
    setIsFormOpen(true);
  };

  const handleSaveSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formItemId) {
      alert("Veuillez sélectionner un article à vendre");
      return;
    }
    if (formQty <= 0) {
      alert("La quantité doit être supérieure à 0");
      return;
    }
    if (formUnitPrice < 0) {
      alert("Le prix unitaire ne peut pas être négatif");
      return;
    }

    // Alerte si vente supérieure au stock fini
    if (formItemType === 'RECIPE') {
      const rec = recipes.find(r => r.id === formItemId);
      if (rec && rec.stock < formQty) {
        const confirmText = `Le stock de produit fini pour la recette "${rec.name}" est insuffisant (Disponible: ${rec.stock}, Demandé: ${formQty}).\n\nSouhaitez-vous quand même enregistrer la vente ? (Le stock passera à 0).`;
        if (!window.confirm(confirmText)) return;
      }
    } else {
      const prod = products.find(p => p.id === formItemId);
      if (prod && prod.stock < formQty) {
        const confirmText = `Le stock pour l'ingrédient "${prod.name}" est insuffisant (Disponible: ${prod.stock} ${prod.unit}, Demandé: ${formQty} ${prod.unit}).\n\nSouhaitez-vous quand même enregistrer la vente ?`;
        if (!window.confirm(confirmText)) return;
      }
    }

    const newSale: Sale = {
      id: 'V_' + Date.now(),
      date: formDate,
      itemId: formItemId,
      itemType: formItemType,
      qtySold: formQty,
      unitPrice: formUnitPrice,
      location: formLocation,
      notes: formNotes.trim() || undefined
    };

    dbService.addSale(newSale);
    setIsFormOpen(false);
    loadData();
  };

  const handleDeleteSale = (id: string) => {
    if (window.confirm("Supprimer cette vente ? Le stock associé sera recrédité.")) {
      dbService.deleteSale(id);
      loadData();
    }
  };

  // --- STATISTIQUES FINANCIÈRES GLOBALES ---
  const totalRevenue = sales.reduce((acc, s) => acc + (s.qtySold * s.unitPrice), 0);
  
  let totalCost = 0;
  sales.forEach(s => {
    if (s.itemType === 'RECIPE') {
      const costInfo = dbService.calculateRecipeCost(s.itemId);
      totalCost += s.qtySold * costInfo.costPerPortion;
    } else {
      const prod = products.find(p => p.id === s.itemId);
      if (prod) {
        totalCost += s.qtySold * prod.avgPurchasePrice;
      }
    }
  });
  const totalProfit = totalRevenue - totalCost;

  // --- REGROUPEMENTS POUR LES RAPPORTS ---
  
  // 1. Ventes par journée de vente (Date)
  const salesByDateMap = new Map<string, { date: string; revenue: number; cost: number; qty: number }>();
  sales.forEach(s => {
    let itemCost = 0;
    if (s.itemType === 'RECIPE') {
      itemCost = dbService.calculateRecipeCost(s.itemId).costPerPortion;
    } else {
      itemCost = (products.find(p => p.id === s.itemId)?.avgPurchasePrice) || 0;
    }

    const current = salesByDateMap.get(s.date) || { date: s.date, revenue: 0, cost: 0, qty: 0 };
    current.revenue += s.qtySold * s.unitPrice;
    current.cost += s.qtySold * itemCost;
    current.qty += s.qtySold;
    salesByDateMap.set(s.date, current);
  });
  const salesByDate = Array.from(salesByDateMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  // 2. Ventes par lieu de vente (Location)
  const salesByLocMap = new Map<string, { location: string; revenue: number; cost: number; qty: number }>();
  sales.forEach(s => {
    let itemCost = 0;
    if (s.itemType === 'RECIPE') {
      itemCost = dbService.calculateRecipeCost(s.itemId).costPerPortion;
    } else {
      itemCost = (products.find(p => p.id === s.itemId)?.avgPurchasePrice) || 0;
    }

    const current = salesByLocMap.get(s.location) || { location: s.location, revenue: 0, cost: 0, qty: 0 };
    current.revenue += s.qtySold * s.unitPrice;
    current.cost += s.qtySold * itemCost;
    current.qty += s.qtySold;
    salesByLocMap.set(s.location, current);
  });
  const salesByLoc = Array.from(salesByLocMap.values()).sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Ventes & Bénéfices</h1>
          <p className="page-subtitle">Enregistrez vos encaissements et analysez vos marges réelles</p>
        </div>
        <div className="actions-group">
          <button className="btn btn-primary" onClick={handleOpenAddForm}>
            <Plus size={18} />
            Enregistrer une vente
          </button>
        </div>
      </div>

      {/* Cartes financières synthétiques de la page Ventes */}
      <div className="grid-cols-1-2-3" style={{ marginBottom: '24px' }}>
        <div className="card metric-card" style={{ borderLeft: '4px solid var(--color-secondary)' }}>
          <div className="metric-icon-box" style={{ backgroundColor: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
            <DollarSign size={24} />
          </div>
          <div className="metric-data">
            <span className="metric-value">{totalRevenue.toFixed(2)} {settings.currency}</span>
            <span className="metric-label">Recettes totales</span>
          </div>
        </div>

        <div className="card metric-card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div className="metric-icon-box" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="metric-data">
            <span className="metric-value" style={{ color: totalProfit >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>
              {totalProfit.toFixed(2)} {settings.currency}
            </span>
            <span className="metric-label">Bénéfice net estimé</span>
          </div>
        </div>

        <div className="card metric-card" style={{ borderLeft: '4px solid var(--color-dark-light)' }}>
          <div className="metric-icon-box" style={{ backgroundColor: 'var(--color-light)', color: 'var(--color-dark)' }}>
            <PieChart size={24} />
          </div>
          <div className="metric-data">
            <span className="metric-value">
              {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(0) : '0'}%
            </span>
            <span className="metric-label">Marge moyenne constatée</span>
          </div>
        </div>
      </div>

      {/* Système d'onglets locaux */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', marginBottom: '20px', paddingBottom: '2px' }}>
        <button 
          className={`btn ${activeSubTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ height: '36px', borderRadius: 'var(--radius-sm)' }}
          onClick={() => setActiveSubTab('list')}
        >
          <List size={16} />
          Historique
        </button>
        <button 
          className={`btn ${activeSubTab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ height: '36px', borderRadius: 'var(--radius-sm)' }}
          onClick={() => setActiveSubTab('reports')}
        >
          <PieChart size={16} />
          Synthèses par jour & lieu
        </button>
      </div>

      {/* --- SOUS-VUE : HISTORIQUE CHRONOLOGIQUE --- */}
      {activeSubTab === 'list' && (
        <div className="table-container">
          {sales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-dark-light)' }}>
              <DollarSign size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p>Aucune vente enregistrée. Cochez "Enregistrer une vente" pour commencer.</p>
            </div>
          ) : (
            <table className="custom-table adaptive-table-wrap">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Article Vendu</th>
                  <th>Quantité</th>
                  <th>Prix Unitaire</th>
                  <th>Total Vente</th>
                  <th>Marge Est.</th>
                  <th>Lieu</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => {
                  let name = 'Inconnu';
                  let unitLabel = 'u';
                  let cost = 0;
                  
                  if (s.itemType === 'RECIPE') {
                    const rec = recipes.find(r => r.id === s.itemId);
                    name = rec ? rec.name : 'Recette supprimée';
                    cost = dbService.calculateRecipeCost(s.itemId).costPerPortion;
                  } else {
                    const prod = products.find(p => p.id === s.itemId);
                    name = prod ? prod.name : 'Ingrédient supprimé';
                    unitLabel = prod ? prod.unit : 'u';
                    cost = prod ? prod.avgPurchasePrice : 0;
                  }

                  const saleCost = s.qtySold * cost;
                  const saleRev = s.qtySold * s.unitPrice;
                  const profit = saleRev - saleCost;
                  const marginPercent = saleRev > 0 ? (profit / saleRev) * 100 : 0;

                  return (
                    <tr key={s.id}>
                      <td data-label="Date">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={14} style={{ color: 'var(--color-dark-light)' }} />
                          <span>{s.date}</span>
                        </div>
                      </td>
                      <td data-label="Article" style={{ fontWeight: '600' }}>
                        {name}
                        {s.notes && (
                          <div style={{ fontSize: '10px', color: 'var(--color-dark-light)', fontWeight: 'normal' }}>
                            {s.notes}
                          </div>
                        )}
                      </td>
                      <td data-label="Quantité">
                        {s.qtySold} {unitLabel}
                      </td>
                      <td data-label="Prix Unitaire">
                        {s.unitPrice.toFixed(2)} {settings.currency}
                      </td>
                      <td data-label="Total" style={{ fontWeight: '700' }}>
                        {saleRev.toFixed(2)} {settings.currency}
                      </td>
                      <td data-label="Marge Est.">
                        <span className={`badge ${marginPercent >= settings.defaultTargetMargin ? 'badge-success' : 'badge-warning'}`}>
                          {marginPercent.toFixed(0)}% (+{profit.toFixed(1)}€)
                        </span>
                      </td>
                      <td data-label="Lieu">
                        <span className="badge badge-info" style={{ backgroundColor: 'var(--color-light)', color: 'var(--color-dark)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          <MapPin size={10} />
                          {s.location}
                        </span>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-danger btn-icon-only" 
                          style={{ height: '36px', width: '36px' }}
                          onClick={() => handleDeleteSale(s.id)}
                          title="Supprimer la vente"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* --- SOUS-VUE : SYNTHÈSES ET RAPPORTS --- */}
      {activeSubTab === 'reports' && (
        <div className="grid-cols-details">
          
          {/* Synthèse par Journée de Vente */}
          <div className="card">
            <h3 className="card-title">
              <span>📅 Bénéfices par Journée de vente</span>
              <span style={{ fontSize: '12px', color: 'var(--color-dark-light)', fontWeight: 'normal' }}>Jours récents</span>
            </h3>

            {salesByDate.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-dark-light)', padding: '20px' }}>Aucune donnée à analyser.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {salesByDate.map(day => {
                  const profit = day.revenue - day.cost;
                  const marginPercent = day.revenue > 0 ? (profit / day.revenue) * 100 : 0;
                  
                  return (
                    <div 
                      key={day.date} 
                      style={{ 
                        padding: '16px', 
                        border: '1px solid var(--color-border)', 
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '15px' }}>{day.date}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--color-dark-light)', marginTop: '2px' }}>
                          {day.qty} article(s) vendu(s) • Marge globale : {marginPercent.toFixed(0)}%
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '700', color: 'var(--color-dark)', fontSize: '15px' }}>
                          CA: {day.revenue.toFixed(2)} {settings.currency}
                        </div>
                        <span 
                          className={`badge ${marginPercent >= settings.defaultTargetMargin ? 'badge-success' : 'badge-warning'}`}
                          style={{ fontSize: '11px', marginTop: '2px', display: 'inline-block' }}
                        >
                          Bénéfice : +{profit.toFixed(2)} {settings.currency}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Synthèse par Lieu de Vente */}
          <div className="card">
            <h3 className="card-title">
              <span>📍 Bénéfices par Lieu de vente</span>
            </h3>

            {salesByLoc.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-dark-light)', padding: '20px' }}>Aucune donnée.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {salesByLoc.map(loc => {
                  const profit = loc.revenue - loc.cost;
                  const marginPercent = loc.revenue > 0 ? (profit / loc.revenue) * 100 : 0;
                  
                  return (
                    <div 
                      key={loc.location} 
                      style={{ 
                        padding: '12px 14px', 
                        border: '1px solid var(--color-border)', 
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-light)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>
                        <span>{loc.location}</span>
                        <span>{loc.revenue.toFixed(2)} {settings.currency}</span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-dark-light)' }}>
                        <span>Ventes: {loc.qty} u</span>
                        <span style={{ color: 'var(--color-secondary)', fontWeight: '600' }}>
                          Profit: +{profit.toFixed(2)} {settings.currency} ({marginPercent.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* --- DRAWER FORMULAIRE ENREGISTRER UNE VENTE --- */}
      <Drawer
        title="Enregistrer une vente"
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSaveSale} disabled={!formItemId}>Valider la vente</button>
          </>
        }
      >
        <form onSubmit={handleSaveSale}>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date de vente</label>
              <input
                type="date"
                className="form-input"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Canal / Lieu de vente</label>
              <select className="form-input" required value={formLocation} onChange={(e) => setFormLocation(e.target.value)}>
                {settings.salesLocations.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Type d'article vendu</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ flex: 1, height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', backgroundColor: formItemType === 'RECIPE' ? 'var(--color-primary-light)' : 'transparent', borderColor: formItemType === 'RECIPE' ? 'var(--color-primary)' : 'var(--color-border)', fontWeight: '600', color: formItemType === 'RECIPE' ? 'var(--color-primary)' : 'inherit' }}>
                <input 
                  type="radio" 
                  name="itemType" 
                  value="RECIPE" 
                  checked={formItemType === 'RECIPE'} 
                  onChange={() => setFormItemType('RECIPE')} 
                  style={{ display: 'none' }}
                />
                Plat / Recette
              </label>

              <label style={{ flex: 1, height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', backgroundColor: formItemType === 'PRODUCT' ? 'var(--color-primary-light)' : 'transparent', borderColor: formItemType === 'PRODUCT' ? 'var(--color-primary)' : 'var(--color-border)', fontWeight: '600', color: formItemType === 'PRODUCT' ? 'var(--color-primary)' : 'inherit' }}>
                <input 
                  type="radio" 
                  name="itemType" 
                  value="PRODUCT" 
                  checked={formItemType === 'PRODUCT'} 
                  onChange={() => setFormItemType('PRODUCT')} 
                  style={{ display: 'none' }}
                />
                Ingrédient brut
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Article vendu *</label>
            {formItemType === 'RECIPE' ? (
              recipes.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--color-danger)' }}>Aucune recette créée.</p>
              ) : (
                <select className="form-input" required value={formItemId} onChange={(e) => setFormItemId(e.target.value)}>
                  <option value="" disabled>Choisir un plat...</option>
                  {recipes.map(r => (
                    <option key={r.id} value={r.id}>{r.name} (En stock fini : {r.stock} u)</option>
                  ))}
                </select>
              )
            ) : (
              products.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--color-danger)' }}>Aucun ingrédient brut.</p>
              ) : (
                <select className="form-input" required value={formItemId} onChange={(e) => setFormItemId(e.target.value)}>
                  <option value="" disabled>Choisir un ingrédient brut...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Format: {p.format} - Stock: {p.stock} {p.unit})</option>
                  ))}
                </select>
              )
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Quantité vendue</label>
              <input
                type="number"
                min="1"
                className="form-input"
                required
                value={formQty}
                onChange={(e) => setFormQty(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Prix de vente unitaire ({settings.currency})</label>
              <input
                type="number"
                step="any"
                className="form-input"
                required
                min="0.01"
                value={formUnitPrice}
                onChange={(e) => setFormUnitPrice(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Somme totale calculée en direct */}
          {formItemId && (
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '16px' }}>
              <span style={{ color: 'var(--color-dark-light)' }}>Encaissement total :</span>
              <strong>{(formQty * formUnitPrice).toFixed(2)} {settings.currency}</strong>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Notes (nom du client, etc.)</label>
            <textarea
              className="form-input"
              style={{ height: '60px' }}
              placeholder="Ex: Commande spéciale de M. Dupont..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>

        </form>
      </Drawer>
    </div>
  );
};
