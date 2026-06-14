import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ShoppingCart, 
  Barcode, 
  Trash2, 
  Calendar, 
  AlertTriangle 
} from 'lucide-react';
import { dbService } from '../services/db';
import { Product, Purchase, Store } from '../types';
import { Drawer } from './Drawer';
import { BarcodeScanner } from './BarcodeScanner';
import { LookupResult } from '../services/barcodeLookupService';

interface PurchasesProps {
  initialTriggerScan?: boolean;
  initialPrefillProductId?: string;
}

export const Purchases: React.FC<PurchasesProps> = ({ initialTriggerScan, initialPrefillProductId }) => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const settings = dbService.getSettings();

  // État du Drawer de Formulaire d'Achat
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Valeurs du formulaire d'achat
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formProductId, setFormProductId] = useState('');
  const [formQty, setFormQty] = useState(1);
  const [formUnit, setFormUnit] = useState('kg');
  const [formPricePaid, setFormPricePaid] = useState(0);
  const [formStoreId, setFormStoreId] = useState('');
  const [formBatchNo, setFormBatchNo] = useState('');
  const [formExpiryDate, setFormExpiryDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // État du Drawer de Création Rapide de Produit (si code-barres inconnu)
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);
  const [quickBarcode, setQuickBarcode] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickCategory, setQuickCategory] = useState(settings.categories[0] || '');
  const [quickUnit, setQuickUnit] = useState(settings.units[0] || 'kg');
  const [quickBrand, setQuickBrand] = useState('');
  const [quickFormat, setQuickFormat] = useState('Unité');

  const loadData = () => {
    setPurchases(dbService.getPurchases().sort((a, b) => b.date.localeCompare(a.date)));
    setProducts(dbService.getProducts().filter(p => p.isActive));
    setStores(dbService.getStores());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Déclencher le scanneur ou le préremplissage initial
  useEffect(() => {
    if (initialTriggerScan) {
      handleOpenAddForm();
      setIsScannerOpen(true);
    } else if (initialPrefillProductId) {
      handleOpenAddForm();
      setFormProductId(initialPrefillProductId);
      const prod = dbService.getProduct(initialPrefillProductId);
      if (prod) {
        setFormUnit(prod.unit);
        if (prod.mainStoreId) setFormStoreId(prod.mainStoreId);
      }
    }
  }, [initialTriggerScan, initialPrefillProductId]);

  // Pré-remplir l'unité lorsqu'on change de produit dans le formulaire d'achat
  useEffect(() => {
    if (formProductId) {
      const prod = products.find(p => p.id === formProductId);
      if (prod) {
        setFormUnit(prod.unit);
        if (prod.mainStoreId && !formStoreId) {
          setFormStoreId(prod.mainStoreId);
        }
      }
    }
  }, [formProductId, products]);

  const handleOpenAddForm = () => {
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormProductId(products[0]?.id || '');
    setFormQty(1);
    setFormPricePaid(0);
    setFormStoreId(stores[0]?.id || '');
    setFormBatchNo('');
    setFormExpiryDate('');
    setFormNotes('');
    setIsFormOpen(true);
  };

  // Traiter un scan de code-barres avec recherche locale et externe
  const handleBarcodeScanned = (barcode: string, result: LookupResult) => {
    setIsScannerOpen(false);
    
    // Rechercher si le produit existe localement
    if (result.state === 'local_found' && result.localProduct) {
      setFormProductId(result.localProduct.id);
      setFormUnit(result.localProduct.unit);
      if (result.localProduct.mainStoreId) {
        setFormStoreId(result.localProduct.mainStoreId);
      }
    } else if (result.state === 'external_found' && result.externalProduct) {
      // Produit trouvé à l'externe : préremplir le Drawer de création rapide
      setQuickBarcode(result.externalProduct.barcode);
      setQuickName(result.externalProduct.name);
      setQuickBrand(result.externalProduct.brand);
      setQuickFormat(result.externalProduct.format);
      
      // Mappage flou de la catégorie
      let category = settings.categories[0] || '';
      if (result.externalProduct.category) {
        const extCat = result.externalProduct.category.toLowerCase();
        const matched = settings.categories.find(c => 
          extCat.includes(c.toLowerCase()) || c.toLowerCase().includes(extCat)
        );
        if (matched) category = matched;
      }
      setQuickCategory(category);
      setQuickUnit(settings.units[0] || 'kg');
      setIsQuickProductOpen(true);
    } else {
      // Produit non répertorié ou erreur réseau : préremplir uniquement le code-barres
      setQuickBarcode(barcode);
      setQuickName('');
      setQuickBrand('');
      setQuickFormat('Unité');
      setQuickCategory(settings.categories[0] || '');
      setQuickUnit(settings.units[0] || 'kg');
      setIsQuickProductOpen(true);
      if (result.state === 'error' && result.error) {
        alert(result.error);
      }
    }
  };

  // Enregistrer le produit rapide puis l'associer au formulaire d'achat
  const handleSaveQuickProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;

    const newProd: Product = {
      id: 'P_' + Date.now(),
      barcode: quickBarcode,
      name: quickName.trim(),
      category: quickCategory,
      unit: quickUnit,
      brand: quickBrand.trim(),
      format: quickFormat.trim(),
      stock: 0,
      minStockAlert: settings.defaultMinStockAlert,
      avgPurchasePrice: 0,
      mainStoreId: formStoreId || (stores[0]?.id || ''),
      notes: 'Créé via scan rapide code-barres',
      isActive: true
    };

    dbService.saveProduct(newProd);
    
    // Mettre à jour l'état local et pré-remplir l'achat avec ce produit
    const updatedProducts = dbService.getProducts().filter(p => p.isActive);
    setProducts(updatedProducts);
    setFormProductId(newProd.id);
    setFormUnit(newProd.unit);
    setIsQuickProductOpen(false);
  };

  // Enregistrer l'achat complet
  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProductId) {
      alert("Veuillez sélectionner ou scanner un produit");
      return;
    }
    if (formQty <= 0) {
      alert("La quantité doit être supérieure à 0");
      return;
    }
    if (formPricePaid <= 0) {
      alert("Le prix payé doit être supérieur à 0");
      return;
    }

    const newPurchase: Purchase = {
      id: 'A_' + Date.now(),
      date: formDate,
      productId: formProductId,
      qty: formQty,
      unit: formUnit,
      pricePaid: formPricePaid,
      unitPrice: Number((formPricePaid / formQty).toFixed(4)),
      storeId: formStoreId,
      batchNo: formBatchNo.trim() || undefined,
      expiryDate: formExpiryDate || undefined,
      notes: formNotes.trim() || undefined
    };

    dbService.addPurchase(newPurchase);
    setIsFormOpen(false);
    loadData();
  };

  // Supprimer un achat
  const handleDeletePurchase = (id: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet achat ? Le stock associé sera déduit.")) {
      dbService.deletePurchase(id);
      loadData();
    }
  };

  const calculatedUnitPrice = formQty > 0 ? (formPricePaid / formQty).toFixed(2) : '0.00';

  return (
    <div>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Achats & Approvisionnement</h1>
          <p className="page-subtitle">Enregistrez vos factures et réapprovisionnez votre stock</p>
        </div>
        <div className="actions-group">
          <button className="btn btn-primary" onClick={handleOpenAddForm}>
            <Plus size={18} />
            Enregistrer un achat
          </button>
        </div>
      </div>

      {/* Liste des achats récents */}
      <div className="table-container">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Derniers achats enregistrés</h3>
          <span className="badge badge-info">{purchases.length} transaction(s)</span>
        </div>

        {purchases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-dark-light)' }}>
            <ShoppingCart size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>Aucun achat enregistré. Cliquez sur "Enregistrer un achat" pour commencer.</p>
          </div>
        ) : (
          <table className="custom-table adaptive-table-wrap">
            <thead>
              <tr>
                <th>Date</th>
                <th>Produit</th>
                <th>Quantité</th>
                <th>Prix Total</th>
                <th>Prix Unitaire</th>
                <th>Magasin</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => {
                const prod = dbService.getProduct(p.productId);
                const store = stores.find(s => s.id === p.storeId);
                
                return (
                  <tr key={p.id}>
                    <td data-label="Date">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={14} style={{ color: 'var(--color-dark-light)' }} />
                        <span>{p.date}</span>
                      </div>
                    </td>
                    <td data-label="Produit" style={{ fontWeight: '600' }}>
                      {prod ? prod.name : 'Produit inconnu'}
                      {p.batchNo && (
                        <div style={{ fontSize: '10px', color: 'var(--color-dark-light)', fontWeight: 'normal' }}>
                          Lot: {p.batchNo} {p.expiryDate ? `• DLUO: ${p.expiryDate}` : ''}
                        </div>
                      )}
                    </td>
                    <td data-label="Quantité">
                      {p.qty} {p.unit}
                    </td>
                    <td data-label="Prix Total" style={{ fontWeight: '600', color: 'var(--color-dark)' }}>
                      {p.pricePaid.toFixed(2)} {settings.currency}
                    </td>
                    <td data-label="Prix Unitaire">
                      {p.unitPrice.toFixed(2)} {settings.currency} / {p.unit}
                    </td>
                    <td data-label="Magasin">
                      {store ? store.name : 'Inconnu'}
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <button 
                        className="btn btn-danger btn-icon-only" 
                        style={{ height: '36px', width: '36px' }}
                        onClick={() => handleDeletePurchase(p.id)}
                        title="Supprimer l'achat"
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

      {/* --- DRAWER D'AJOUT D'ACHAT --- */}
      <Drawer
        title="Nouvel Achat"
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setIsScannerOpen(false);
        }}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSavePurchase}>Valider l'achat</button>
          </>
        }
      >
        <form onSubmit={handleSavePurchase}>
          
          {/* Scanner de Code-barres */}
          <div style={{ marginBottom: '20px', padding: '12px', border: '1px dashed var(--color-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isScannerOpen ? '12px' : 0 }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Barcode size={16} />
                Scan rapide de l'article
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                onClick={() => setIsScannerOpen(!isScannerOpen)}
              >
                {isScannerOpen ? 'Masquer' : 'Scanner Code-barres'}
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

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date de l'achat</label>
              <input
                type="date"
                className="form-input"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Magasin / Fournisseur</label>
              <select className="form-input" required value={formStoreId} onChange={(e) => setFormStoreId(e.target.value)}>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Produit / Ingrédient acheté *</label>
            <select className="form-input" required value={formProductId} onChange={(e) => setFormProductId(e.target.value)}>
              <option value="" disabled>Sélectionner un produit...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.brand || 'Sans marque'} - Stock: {p.stock} {p.unit})</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Quantité achetée</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  style={{ flex: 1 }}
                  required
                  min="0.01"
                  value={formQty}
                  onChange={(e) => setFormQty(Number(e.target.value))}
                />
                <span className="form-input" style={{ width: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-light)', border: '1px solid var(--color-border)' }}>
                  {formUnit}
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Prix Total Payé ({settings.currency}) *</label>
              <input
                type="number"
                step="any"
                className="form-input"
                required
                min="0.01"
                value={formPricePaid}
                onChange={(e) => setFormPricePaid(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Prix unitaire calculé en temps réel */}
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '16px' }}>
            <span style={{ color: 'var(--color-dark-light)' }}>Prix unitaire calculé :</span>
            <strong>{calculatedUnitPrice} {settings.currency} / {formUnit}</strong>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Numéro de lot (facultatif)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: LOT-2026-A"
                value={formBatchNo}
                onChange={(e) => setFormBatchNo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Date limite / DLUO (facultatif)</label>
              <input
                type="date"
                className="form-input"
                value={formExpiryDate}
                onChange={(e) => setFormExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes de l'achat</label>
            <textarea
              className="form-input"
              placeholder="Notes complémentaires..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>

        </form>
      </Drawer>

      {/* --- DRAWER DE CRÉATION RAPIDE DE PRODUIT SI CODE-BARRES INCONNU --- */}
      <Drawer
        title="Créer rapidement le produit"
        isOpen={isQuickProductOpen}
        onClose={() => setIsQuickProductOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsQuickProductOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSaveQuickProduct}>Créer & Sélectionner</button>
          </>
        }
      >
        <div className="card" style={{ backgroundColor: 'var(--color-warning-light)', borderColor: 'rgba(242, 185, 34, 0.2)', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
          <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
          <span>Le code-barres <strong>{quickBarcode}</strong> ne correspond à aucun produit. Créez-le rapidement ci-dessous.</span>
        </div>

        <form onSubmit={handleSaveQuickProduct}>
          <div className="form-group">
            <label className="form-label">Code-barres</label>
            <input type="text" className="form-input" value={quickBarcode} disabled />
          </div>

          <div className="form-group">
            <label className="form-label">Nom du produit/ingrédient *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Ex: Purée de fraise 1kg"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Marque</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Lu, Francine"
                value={quickBrand}
                onChange={(e) => setQuickBrand(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Format / Conditionnement</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Bouteille 75cl, Paquet 1kg"
                value={quickFormat}
                onChange={(e) => setQuickFormat(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Catégorie</label>
              <select className="form-input" value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)}>
                {settings.categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Unité de stock *</label>
              <select className="form-input" value={quickUnit} onChange={(e) => setQuickUnit(e.target.value)}>
                {settings.units.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Drawer>
    </div>
  );
};
