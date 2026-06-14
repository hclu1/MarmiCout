import React, { useState, useEffect } from 'react';
import { 
  Plus,
  Search,
  Barcode,
  Edit,
  History,
  Archive,
  ArrowRightLeft
} from 'lucide-react';
import { dbService } from '../services/db';
import { Product, Store, StockMovement, Purchase } from '../types';
import { Drawer } from './Drawer';
import { BarcodeScanner } from './BarcodeScanner';
import { LookupResult } from '../services/barcodeLookupService';

interface ProductsProps {
  initialTriggerAdd?: boolean;
  onNavigate?: (tab: string, extraData?: Record<string, unknown>) => void;
}

export const Products: React.FC<ProductsProps> = ({ initialTriggerAdd, onNavigate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const settings = dbService.getSettings();

  // États de recherche et filtrage
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStockFilter, setSelectedStockFilter] = useState('');

  // États du Drawer de Formulaire
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Valeurs du formulaire
  const [formBarcode, setFormBarcode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formFormat, setFormFormat] = useState('');
  const [formStock, setFormStock] = useState(0);
  const [formMinStock, setFormMinStock] = useState(settings.defaultMinStockAlert);
  const [formAvgPrice, setFormAvgPrice] = useState(0);
  const [formMainStore, setFormMainStore] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // État du scanneur dans le formulaire
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // État du Drawer de Détail / Historique
  const [selectedProductDetails, setSelectedProductDetails] = useState<Product | null>(null);
  const [stockHistory, setStockHistory] = useState<StockMovement[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);

  // Charger les données au montage
  const loadData = () => {
    setProducts(dbService.getProducts());
    setStores(dbService.getStores());
  };

  // Ouvrir le formulaire en mode Ajout
  const handleOpenAddForm = () => {
    setEditingProduct(null);
    setFormBarcode('');
    setFormName('');
    setFormCategory(settings.categories[0] || '');
    setFormUnit(settings.units[0] || 'kg');
    setFormBrand('');
    setFormFormat('Unité');
    setFormStock(0);
    setFormMinStock(settings.defaultMinStockAlert);
    setFormAvgPrice(0);
    setFormMainStore(stores[0]?.id || '');
    setFormNotes('');
    setFormIsActive(true);
    setIsFormOpen(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    if (initialTriggerAdd) {
      handleOpenAddForm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTriggerAdd]);

  // Ouvrir le formulaire en mode Édition
  const handleOpenEditForm = (prod: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct(prod);
    setFormBarcode(prod.barcode);
    setFormName(prod.name);
    setFormCategory(prod.category);
    setFormUnit(prod.unit);
    setFormBrand(prod.brand);
    setFormFormat(prod.format);
    setFormStock(prod.stock);
    setFormMinStock(prod.minStockAlert);
    setFormAvgPrice(prod.avgPurchasePrice);
    setFormMainStore(prod.mainStoreId);
    setFormNotes(prod.notes);
    setFormIsActive(prod.isActive);
    setIsFormOpen(true);
  };

  // Ouvrir le panneau de détails
  const handleOpenDetails = (prod: Product) => {
    setSelectedProductDetails(prod);
    setStockHistory(dbService.getProductStockMovements(prod.id));
    setPurchaseHistory(dbService.getProductPurchaseHistory(prod.id));
  };

  // Enregistrer le produit (Ajout ou Édition)
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const updatedProduct: Product = {
      id: editingProduct ? editingProduct.id : 'P_' + Date.now(),
      barcode: formBarcode.trim(),
      name: formName.trim(),
      category: formCategory,
      unit: formUnit,
      brand: formBrand.trim(),
      format: formFormat.trim(),
      stock: formStock,
      minStockAlert: formMinStock,
      avgPurchasePrice: formAvgPrice,
      mainStoreId: formMainStore,
      notes: formNotes.trim(),
      isActive: formIsActive
    };

    dbService.saveProduct(updatedProduct);
    
    // Si c'est un nouveau produit et qu'il y a un stock initial > 0, on enregistre un mouvement de stock
    if (!editingProduct && formStock > 0) {
      dbService.addStockMovement({
        id: 'SM_' + Date.now(),
        date: new Date().toISOString().split('T')[0],
        productId: updatedProduct.id,
        qty: formStock,
        type: 'AJUSTEMENT',
        refId: 'MANUAL',
        notes: 'Stock initial renseigné à la création'
      });
    }

    setIsFormOpen(false);
    loadData();
  };

  // Traiter le scan de code-barres dans le formulaire avec recherche locale et externe
  const handleBarcodeScanned = (barcode: string, result: LookupResult) => {
    setIsScannerOpen(false);
    
    if (result.state === 'local_found' && result.localProduct) {
      alert(`Ce code-barres est déjà attribué au produit existant : ${result.localProduct.name}. Modification en cours.`);
      handleOpenEditForm(result.localProduct, { stopPropagation: () => {} } as unknown as React.MouseEvent);
    } else if (result.state === 'external_found' && result.externalProduct) {
      setFormBarcode(result.externalProduct.barcode);
      setFormName(result.externalProduct.name);
      setFormBrand(result.externalProduct.brand);
      setFormFormat(result.externalProduct.format);
      if (result.externalProduct.notes) {
        setFormNotes(result.externalProduct.notes);
      } else {
        setFormNotes('Produit importé via recherche de code-barres externe.');
      }
      
      // Essayer de mapper la catégorie externe de manière floue avec nos catégories internes
      if (result.externalProduct.category) {
        const extCat = result.externalProduct.category.toLowerCase();
        const matchedCat = settings.categories.find(c => 
          extCat.includes(c.toLowerCase()) || c.toLowerCase().includes(extCat)
        );
        if (matchedCat) {
          setFormCategory(matchedCat);
        } else {
          setFormCategory(settings.categories[0] || '');
        }
      }
    } else {
      // Produit non trouvé ou erreur réseau : préremplir le code-barres pour création manuelle
      setFormBarcode(barcode);
      setFormName('');
      setFormBrand('');
      setFormFormat('Unité');
      setFormNotes('');
      if (result.state === 'error' && result.error) {
        alert(result.error);
      }
    }
  };

  // Filtrer les produits
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.barcode.includes(searchQuery);
    
    const matchesCategory = selectedCategory === '' || p.category === selectedCategory;
    
    let matchesStock = true;
    if (selectedStockFilter === 'rupture') {
      matchesStock = p.stock === 0;
    } else if (selectedStockFilter === 'faible') {
      matchesStock = p.stock > 0 && p.stock <= p.minStockAlert;
    } else if (selectedStockFilter === 'ok') {
      matchesStock = p.stock > p.minStockAlert;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  return (
    <div>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Ingrédients & Produits</h1>
          <p className="page-subtitle">Gérez vos matières premières, emballages et stocks</p>
        </div>
        <div className="actions-group">
          <button className="btn btn-primary" onClick={handleOpenAddForm}>
            <Plus size={18} />
            Ajouter un produit
          </button>
        </div>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div className="card filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Rechercher par nom, marque ou code-barres..."
            className="form-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '380px' }}>
          <select 
            className="select-filter" 
            style={{ flex: 1 }}
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">Toutes les catégories</option>
            {settings.categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select 
            className="select-filter" 
            style={{ flex: 1 }}
            value={selectedStockFilter} 
            onChange={(e) => setSelectedStockFilter(e.target.value)}
          >
            <option value="">Tous les stocks</option>
            <option value="rupture">En rupture (0)</option>
            <option value="faible">Stock faible</option>
            <option value="ok">Stock suffisant</option>
          </select>
        </div>
      </div>

      {/* Liste des Produits */}
      {filteredProducts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-dark-light)' }}>
          <Archive size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <p>Aucun produit trouvé avec ces critères de recherche.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table adaptive-table-wrap">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Catégorie</th>
                <th>Stock Actuel</th>
                <th>Seuil Alerte</th>
                <th>Prix d'Achat Moyen</th>
                <th>Fournisseur Habituel</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const store = stores.find(s => s.id === p.mainStoreId);
                const isLowStock = p.stock <= p.minStockAlert;
                
                return (
                  <tr 
                    key={p.id} 
                    style={{ cursor: 'pointer', opacity: p.isActive ? 1 : 0.6 }}
                    onClick={() => handleOpenDetails(p)}
                  >
                    <td data-label="Produit">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '600' }}>{p.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>
                          {p.brand ? `${p.brand} • ` : ''}{p.format}
                          {p.barcode ? ` • Code: ${p.barcode}` : ''}
                        </span>
                      </div>
                    </td>
                    <td data-label="Catégorie">
                      <span className="badge badge-info" style={{ backgroundColor: 'var(--color-light)', color: 'var(--color-dark)' }}>
                        {p.category}
                      </span>
                    </td>
                    <td data-label="Stock Actuel">
                      <span className={`badge ${p.stock === 0 ? 'badge-danger' : isLowStock ? 'badge-warning' : 'badge-success'}`}>
                        {p.stock.toFixed(2)} {p.unit}
                      </span>
                    </td>
                    <td data-label="Seuil Alerte">
                      {p.minStockAlert} {p.unit}
                    </td>
                    <td data-label="Prix d'Achat Moyen">
                      {p.avgPurchasePrice.toFixed(2)} {settings.currency} / {p.unit}
                    </td>
                    <td data-label="Fournisseur">
                      {store ? store.name : 'Non défini'}
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-secondary btn-icon-only" 
                          style={{ height: '36px', width: '36px' }}
                          onClick={(e) => handleOpenEditForm(p, e)}
                          title="Modifier"
                        >
                          <Edit size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- DRAWER FORMULAIRE (AJOUT / MODIFICATION) --- */}
      <Drawer
        title={editingProduct ? "Modifier le produit" : "Ajouter un produit"}
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setIsScannerOpen(false);
        }}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSaveProduct}>Enregistrer</button>
          </>
        }
      >
        <form onSubmit={handleSaveProduct}>
          {/* Scanner Intégration */}
          <div style={{ marginBottom: '20px', padding: '12px', border: '1px dashed var(--color-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isScannerOpen ? '12px' : 0 }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-primary)' }}>
                {formBarcode ? `Code-barres associé : ${formBarcode}` : 'Aucun code-barres associé'}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                onClick={() => setIsScannerOpen(!isScannerOpen)}
              >
                <Barcode size={14} style={{ marginRight: '6px' }} />
                {isScannerOpen ? 'Masquer scanner' : 'Scanner Code'}
              </button>
            </div>
            
            {isScannerOpen && (
              <div style={{ marginTop: '12px' }}>
                <BarcodeScanner
                  onScan={handleBarcodeScanned}
                  onClose={() => setIsScannerOpen(false)}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Nom du produit/ingrédient *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Ex: Farine de Blé T55 Bio"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Catégorie</label>
              <select className="form-input" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                {settings.categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Marque</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Daddy, Francine"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Format / Conditionnement</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Paquet 1kg, Bouteille 75cl, Vrac"
                value={formFormat}
                onChange={(e) => setFormFormat(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Unité de gestion du stock *</label>
              <select className="form-input" value={formUnit} onChange={(e) => setFormUnit(e.target.value)}>
                {settings.units.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stock initial ({formUnit})</label>
              <input
                type="number"
                step="any"
                className="form-input"
                value={formStock}
                onChange={(e) => setFormStock(Number(e.target.value))}
                disabled={editingProduct !== null} // Désactivé en édition (doit passer par Achat ou Ajustement)
              />
            </div>

            <div className="form-group">
              <label className="form-label">Seuil d'alerte stock bas</label>
              <input
                type="number"
                step="any"
                className="form-input"
                value={formMinStock}
                onChange={(e) => setFormMinStock(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prix d'achat moyen ({settings.currency} / {formUnit})</label>
              <input
                type="number"
                step="any"
                className="form-input"
                value={formAvgPrice}
                onChange={(e) => setFormAvgPrice(Number(e.target.value))}
                disabled={editingProduct !== null} // En édition, c'est calculé via les achats
              />
            </div>

            <div className="form-group">
              <label className="form-label">Magasin / Fournisseur habituel</label>
              <select className="form-input" value={formMainStore} onChange={(e) => setFormMainStore(e.target.value)}>
                <option value="">Aucun</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes facultatives</label>
            <textarea
              className="form-input"
              placeholder="Ex: À conserver au sec..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <input
              type="checkbox"
              id="isActive"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
              style={{ width: '20px', height: '20px' }}
            />
            <label className="form-label" htmlFor="isActive" style={{ cursor: 'pointer', marginBottom: 0 }}>
              Produit Actif (disponible pour les recettes et achats)
            </label>
          </div>
        </form>
      </Drawer>

      {/* --- DRAWER DE DÉTAIL & HISTORIQUE D'UN PRODUIT --- */}
      <Drawer
        title={selectedProductDetails?.name || "Détails du produit"}
        isOpen={selectedProductDetails !== null}
        onClose={() => setSelectedProductDetails(null)}
      >
        {selectedProductDetails && (
          <div>
            <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                <span className="badge badge-info">{selectedProductDetails.category}</span>
                <span style={{ fontSize: '13px', color: 'var(--color-dark-light)' }}>
                  Code : {selectedProductDetails.barcode || 'Aucun'}
                </span>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>{selectedProductDetails.name}</h2>
              <p style={{ color: 'var(--color-dark-light)', fontSize: '14px', marginBottom: '16px' }}>
                Marque: {selectedProductDetails.brand || 'Non spécifiée'} • Format: {selectedProductDetails.format}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>Stock actuel</div>
                  <strong style={{ fontSize: '18px' }}>{selectedProductDetails.stock.toFixed(2)} {selectedProductDetails.unit}</strong>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>Coût unitaire moyen</div>
                  <strong style={{ fontSize: '18px' }}>{selectedProductDetails.avgPurchasePrice.toFixed(2)} {settings.currency}</strong>
                </div>
              </div>

              {selectedProductDetails.notes && (
                <div style={{ marginTop: '16px', fontSize: '13px', fontStyle: 'italic', color: 'var(--color-dark-light)' }}>
                  Notes : {selectedProductDetails.notes}
                </div>
              )}
            </div>

            {/* Onglets / Liste des Historiques */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowRightLeft size={16} />
                Mouvements de stock récents
              </h3>
              
              {stockHistory.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', padding: '10px 0' }}>Aucun mouvement enregistré pour le moment.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {stockHistory.map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid var(--color-border)', fontSize: '12px' }}>
                      <div>
                        <strong>{m.type}</strong>
                        <div style={{ color: 'var(--color-dark-light)' }}>{m.date} • {m.notes}</div>
                      </div>
                      <strong style={{ color: m.qty > 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>
                        {m.qty > 0 ? `+${m.qty.toFixed(2)}` : m.qty.toFixed(2)} {selectedProductDetails.unit}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={16} />
                Historique des achats
              </h3>
              
              {purchaseHistory.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', padding: '10px 0' }}>Aucun achat enregistré pour ce produit.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {purchaseHistory.map(p => {
                    const st = stores.find(s => s.id === p.storeId);
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid var(--color-border)', fontSize: '12px' }}>
                        <div>
                          <strong>{st ? st.name : 'Magasin inconnu'}</strong>
                          <div style={{ color: 'var(--color-dark-light)' }}>{p.date} • {p.qty} {p.unit} achetés</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong>{p.pricePaid.toFixed(2)} {settings.currency}</strong>
                          <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>{(p.pricePaid / p.qty).toFixed(2)} / u</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={() => {
                  setSelectedProductDetails(null);
                  if (onNavigate) {
                    onNavigate('Achats', { prefillProductId: selectedProductDetails.id });
                  }
                }}
              >
                Approvisionner (+ Achat)
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
