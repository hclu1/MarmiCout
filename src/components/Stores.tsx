import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Store as StoreIcon, 
  Trash2, 
  Edit, 
  MapPin, 
  Phone, 
  History
} from 'lucide-react';
import { dbService } from '../services/db';
import { Store, Purchase } from '../types';
import { Drawer } from './Drawer';

export const Stores: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const settings = dbService.getSettings();

  // États du Drawer de Formulaire de Magasin
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  // Valeurs du formulaire
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('Supermarché');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Magasin sélectionné pour voir son historique
  const [selectedStoreHistory, setSelectedStoreHistory] = useState<Store | null>(null);

  const loadData = () => {
    setStores(dbService.getStores());
    setPurchases(dbService.getPurchases());
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const handleOpenAddForm = () => {
    setEditingStore(null);
    setFormName('');
    setFormType('Supermarché');
    setFormAddress('');
    setFormPhone('');
    setFormNotes('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (st: Store, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStore(st);
    setFormName(st.name);
    setFormType(st.type);
    setFormAddress(st.address || '');
    setFormPhone(st.phone || '');
    setFormNotes(st.notes || '');
    setIsFormOpen(true);
  };

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const newStore: Store = {
      id: editingStore ? editingStore.id : 'S_' + Date.now(),
      name: formName.trim(),
      type: formType,
      address: formAddress.trim() || undefined,
      phone: formPhone.trim() || undefined,
      notes: formNotes.trim() || undefined
    };

    dbService.saveStore(newStore);
    setIsFormOpen(false);
    loadData();
  };

  const handleDeleteStore = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Vérifier s'il y a des achats liés
    const linkedPurchases = purchases.filter(p => p.storeId === id);
    if (linkedPurchases.length > 0) {
      alert(`Impossible de supprimer ce magasin car il est associé à ${linkedPurchases.length} achat(s). Supprimez d'abord les achats liés.`);
      return;
    }

    if (window.confirm("Supprimer ce magasin ?")) {
      dbService.deleteStore(id);
      loadData();
    }
  };

  // Calculer les dépenses par magasin
  const getStoreExpenses = (storeId: string) => {
    return purchases
      .filter(p => p.storeId === storeId)
      .reduce((acc, p) => acc + p.pricePaid, 0);
  };

  const getStorePurchasesCount = (storeId: string) => {
    return purchases.filter(p => p.storeId === storeId).length;
  };

  return (
    <div>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fournisseurs & Magasins</h1>
          <p className="page-subtitle">Gérez les lieux d'achat de vos matières premières et suivez vos dépenses</p>
        </div>
        <div className="actions-group">
          <button className="btn btn-primary" onClick={handleOpenAddForm}>
            <Plus size={18} />
            Ajouter un fournisseur
          </button>
        </div>
      </div>

      {/* Grille des magasins */}
      {stores.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-dark-light)' }}>
          <StoreIcon size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <p>Aucun fournisseur enregistré. Cliquez sur "Ajouter un fournisseur" pour commencer.</p>
        </div>
      ) : (
        <div className="grid-cols-1-2-3">
          {stores.map(st => {
            const totalSpent = getStoreExpenses(st.id);
            const purchasesCount = getStorePurchasesCount(st.id);
            
            return (
              <div 
                key={st.id} 
                className="card" 
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setSelectedStoreHistory(st)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="badge badge-info">{st.type}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ height: '28px', width: '28px', padding: 0 }}
                        onClick={(e) => handleOpenEditForm(st, e)}
                        title="Modifier"
                      >
                        <Edit size={12} />
                      </button>
                      <button 
                        className="btn btn-danger" 
                        style={{ height: '28px', width: '28px', padding: 0, backgroundColor: 'var(--color-danger-light)' }}
                        onClick={(e) => handleDeleteStore(st.id, e)}
                        title="Supprimer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>{st.name}</h3>

                  {st.address && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-dark-light)', marginBottom: '4px' }}>
                      <MapPin size={12} />
                      <span>{st.address}</span>
                    </div>
                  )}

                  {st.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-dark-light)', marginBottom: '12px' }}>
                      <Phone size={12} />
                      <span>{st.phone}</span>
                    </div>
                  )}

                  {st.notes && (
                    <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', fontStyle: 'italic', marginTop: '8px' }}>
                      {st.notes}
                    </p>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Dépenses totales</div>
                    <strong style={{ fontSize: '16px', color: 'var(--color-primary)' }}>
                      {totalSpent.toFixed(2)} {settings.currency}
                    </strong>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Achats effectués</div>
                    <strong style={{ fontSize: '16px' }}>{purchasesCount} fois</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- DRAWER FORMULAIRE (AJOUT / MODIFICATION DE MAGASIN) --- */}
      <Drawer
        title={editingStore ? "Modifier le fournisseur" : "Ajouter un fournisseur"}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSaveStore}>Enregistrer</button>
          </>
        }
      >
        <form onSubmit={handleSaveStore}>
          <div className="form-group">
            <label className="form-label">Nom du fournisseur *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Ex: Biocoop la Source, Metro, Super U"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Type d'établissement</label>
            <select className="form-input" value={formType} onChange={(e) => setFormType(e.target.value)}>
              <option value="Supermarché">Supermarché</option>
              <option value="Grossiste">Grossiste / Distributeur</option>
              <option value="Producteur local">Producteur local / Direct ferme</option>
              <option value="Marché">Marché de producteurs</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Adresse postale (facultatif)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: 15 Rue de la République..."
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Téléphone (facultatif)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: 06 12 34 56 78"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes et commentaires</label>
            <textarea
              className="form-input"
              placeholder="Ex: Fermé le lundi, bon rayon fruits..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
        </form>
      </Drawer>

      {/* --- DRAWER HISTORIQUE DU MAGASIN --- */}
      <Drawer
        title={selectedStoreHistory?.name || "Historique"}
        isOpen={selectedStoreHistory !== null}
        onClose={() => setSelectedStoreHistory(null)}
      >
        {selectedStoreHistory && (
          <div>
            <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '20px' }}>
              <span className="badge badge-info" style={{ marginBottom: '8px' }}>{selectedStoreHistory.type}</span>
              <h2 style={{ fontSize: '20px', fontWeight: '700' }}>{selectedStoreHistory.name}</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                <div style={{ padding: '10px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Volume d'achat</div>
                  <strong style={{ fontSize: '16px' }}>
                    {getStoreExpenses(selectedStoreHistory.id).toFixed(2)} {settings.currency}
                  </strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-dark-light)' }}>Nombre de tickets</div>
                  <strong style={{ fontSize: '16px' }}>
                    {getStorePurchasesCount(selectedStoreHistory.id)} transactions
                  </strong>
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={16} />
              Derniers achats effectués ici
            </h3>

            {purchases.filter(p => p.storeId === selectedStoreHistory.id).length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', fontStyle: 'italic' }}>Aucun achat encore effectué chez ce fournisseur.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {purchases
                  .filter(p => p.storeId === selectedStoreHistory.id)
                  .map(p => {
                    const prod = dbService.getProduct(p.productId);
                    return (
                      <div 
                        key={p.id} 
                        style={{ 
                          padding: '10px', 
                          borderBottom: '1px solid var(--color-border)', 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          fontSize: '13px'
                        }}
                      >
                        <div>
                          <strong>{prod ? prod.name : 'Produit inconnu'}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>{p.date} • {p.qty} {p.unit}</div>
                        </div>
                        <strong style={{ fontSize: '14px' }}>
                          {p.pricePaid.toFixed(2)} {settings.currency}
                        </strong>
                      </div>
                    );
                  })
                }
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
