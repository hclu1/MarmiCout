import React, { useState, useRef } from 'react';
import { parseDecimalInput } from '../utils';
import { Camera, Upload, RefreshCw, Check, ArrowLeft, Trash2, Link as LinkIcon, Info, FileText } from 'lucide-react';
import { Product, Purchase, Store, Settings } from '../types';
import { dbService } from '../services/db';

interface InvoiceScannerProps {
  onClose: () => void;
  onSave: (purchases: Omit<Purchase, 'id'>[]) => void;
  products: Product[];
  stores: Store[];
  settings: Settings;
}

// Factures de démonstration pour simuler le scanneur de manière réaliste
const MOCK_INVOICES = [
  {
    id: 'inv_metro',
    storeName: 'Metro Lyon',
    date: new Date().toISOString().split('T')[0],
    items: [
      { name: 'Farine de Blé T55', qty: 25, unitPrice: 1.20, unit: 'kg' },
      { name: 'Sucre en Poudre', qty: 10, unitPrice: 1.45, unit: 'kg' },
      { name: 'Pots en Verre 375ml', qty: 48, unitPrice: 0.72, unit: 'pièce' },
      { name: 'Barquettes Carton 28cm', qty: 100, unitPrice: 0.18, unit: 'pièce' }
    ]
  },
  {
    id: 'inv_biocoop',
    storeName: 'Biocoop La Source',
    date: new Date().toISOString().split('T')[0],
    items: [
      { name: 'Pommes Golden des Alpes', qty: 15, unitPrice: 2.10, unit: 'kg' },
      { name: 'Abricots du Roussillon', qty: 10, unitPrice: 3.50, unit: 'kg' }
    ]
  },
  {
    id: 'inv_grandfrais',
    storeName: 'Grand Frais',
    date: new Date().toISOString().split('T')[0],
    items: [
      { name: 'Beurre Doux Gastronomique', qty: 6, unitPrice: 7.90, unit: 'kg' },
      { name: 'Lait Demi-Écrémé', qty: 12, unitPrice: 0.95, unit: 'l' }
    ]
  }
];

export const InvoiceScanner: React.FC<InvoiceScannerProps> = ({ onClose, onSave, products, stores, settings }) => {
  const [step, setStep] = useState<'idle' | 'analyzing' | 'validating'>('idle');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Informations globales de la facture extraite
  const [invoiceStoreId, setInvoiceStoreId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Lignes de facture extraites
  const [extractedItems, setExtractedItems] = useState<{
    name: string;
    qty: number;
    unitPrice: number;
    unit: string;
    productId: string; // ID du produit s'il est lié au stock, "" sinon
  }[]>([]);

  // Mappage automatique d'ingrédients/produits par nom
  const autoMapProduct = (name: string): string => {
    const normal = name.toLowerCase().trim();
    
    // Recherche de correspondances par mot clé
    if (normal.includes('farine')) return products.find(p => p.name.toLowerCase().includes('farine'))?.id || '';
    if (normal.includes('sucre')) return products.find(p => p.name.toLowerCase().includes('sucre'))?.id || '';
    if (normal.includes('beurre')) return products.find(p => p.name.toLowerCase().includes('beurre'))?.id || '';
    if (normal.includes('pomme')) return products.find(p => p.name.toLowerCase().includes('pomme'))?.id || '';
    if (normal.includes('oeuf') || normal.includes('œuf')) return products.find(p => p.name.toLowerCase().includes('oeuf') || p.name.toLowerCase().includes('œuf'))?.id || '';
    if (normal.includes('lait')) return products.find(p => p.name.toLowerCase().includes('lait'))?.id || '';
    if (normal.includes('pot')) return products.find(p => p.name.toLowerCase().includes('pot'))?.id || '';
    if (normal.includes('barquette')) return products.find(p => p.name.toLowerCase().includes('barquette'))?.id || '';
    if (normal.includes('abricot')) return products.find(p => p.name.toLowerCase().includes('abricot'))?.id || '';

    // Recherche floue par similarité de nom
    const matched = products.find(p => p.name.toLowerCase().includes(normal) || normal.includes(p.name.toLowerCase()));
    return matched ? matched.id : '';
  };

  // Simuler le processus d'analyse OCR de la facture
  const launchOCR = (mockData: typeof MOCK_INVOICES[0], imageBase64: string | null) => {
    setStep('analyzing');
    setSourceImage(imageBase64);
    
    let currentConf = 0;
    const interval = setInterval(() => {
      currentConf += 6;
      if (currentConf >= 96) {
        currentConf = 96;
        clearInterval(interval);
      }
      setConfidence(currentConf);
    }, 80);

    setTimeout(() => {
      clearInterval(interval);
      setConfidence(96);

      // Trouver le magasin correspondant
      const matchedStore = stores.find(s => s.name.toLowerCase().includes(mockData.storeName.toLowerCase()));
      setInvoiceStoreId(matchedStore ? matchedStore.id : (stores[0]?.id || ''));
      setInvoiceDate(mockData.date);
      setInvoiceNotes(`Facture importée automatiquement via scanner (${mockData.storeName})`);

      // Mapper les lignes d'articles et faire les liaisons automatiques avec le stock
      const mapped = mockData.items.map(item => {
        const matchedProductId = autoMapProduct(item.name);
        return {
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          unit: item.unit,
          productId: matchedProductId
        };
      });

      setExtractedItems(mapped);
      setStep('validating');
    }, 1500);
  };

  // Parser textuel pour les fichiers texte ou docx de factures
  const parseInvoiceFromText = (text: string): {
    storeName: string;
    date: string;
    items: { name: string; qty: number; unitPrice: number; unit: string }[];
  } => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const items: { name: string; qty: number; unitPrice: number; unit: string }[] = [];
    let storeName = stores[0]?.name || "Fournisseur Inconnu";
    let date = new Date().toISOString().split('T')[0];

    // Recherche de date dans le texte (format DD/MM/YYYY ou YYYY-MM-DD)
    const dateRegex = /(\d{2})[/-](\d{2})[/-](\d{4})|(\d{4})[-/](\d{2})[-/](\d{2})/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
      if (dateMatch[1]) {
        date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      } else {
        date = `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}`;
      }
    }

    // Tenter de deviner le fournisseur à partir du nom
    for (const store of stores) {
      if (text.toLowerCase().includes(store.name.toLowerCase())) {
        storeName = store.name;
        break;
      }
    }

    // Parser chaque ligne pour détecter des formats d'articles : [Nom] [Qté/Nombre] [Prix]
    // Exemple : "Farine T55 10 kg 15.00" ou "2x Pot en verre 24.50"
    const lineItemRegex = /^([a-zA-ZÀ-ÿ0-9\s'-]+?)\s+(\d+)\s*(kg|g|l|ml|cl|pièce|pièces|sachet|u|unit|units)?\s+([\d,.]+)\s*(?:€|\$|EUR)?$/i;

    lines.forEach(line => {
      const match = line.match(lineItemRegex);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        let unit = match[3] || 'pièce';
        const price = parseFloat(match[4].replace(',', '.'));

        // Normaliser les unités
        unit = unit.trim().toLowerCase();
        if (unit.startsWith('kg')) unit = 'kg';
        else if (unit.startsWith('g')) unit = 'g';
        else if (unit.startsWith('l')) unit = 'l';
        else if (unit.startsWith('ml')) unit = 'ml';
        else if (unit.startsWith('cl')) unit = 'cl';
        else unit = 'pièce';

        if (!isNaN(qty) && !isNaN(price) && qty > 0) {
          items.push({
            name,
            qty,
            unitPrice: Number((price / qty).toFixed(4)),
            unit
          });
        }
      }
    });

    // Si aucune ligne n'a été détectée avec la regex stricte, utiliser un algorithme de secours plus souple
    if (items.length === 0) {
      lines.forEach(line => {
        if (line.toLowerCase().includes('total') || line.toLowerCase().includes('facture')) return;
        const numbers = line.match(/[\d,.]+/g);
        if (numbers && numbers.length >= 2) {
          // Supposons que le dernier nombre est le prix total et le premier est la quantité
          const qty = parseFloat(numbers[0].replace(',', '.'));
          const totalPaid = parseFloat(numbers[numbers.length - 1].replace(',', '.'));
          const namePart = line.replace(/[\d,.]+/g, '').replace(/[€$]/g, '').trim();

          if (!isNaN(qty) && !isNaN(totalPaid) && qty > 0 && namePart.length > 2) {
            items.push({
              name: namePart,
              qty,
              unitPrice: Number((totalPaid / qty).toFixed(4)),
              unit: 'pièce'
            });
          }
        }
      });
    }

    return { storeName, date, items };
  };

  const launchFileAnalysis = (fileName: string, text: string) => {
    setStep('analyzing');
    setSourceImage(null);
    setConfidence(0);

    let currentConf = 0;
    const interval = setInterval(() => {
      currentConf += 10;
      if (currentConf >= 95) {
        currentConf = 95;
        clearInterval(interval);
      }
      setConfidence(currentConf);
    }, 70);

    setTimeout(() => {
      clearInterval(interval);
      setConfidence(95);

      const parsed = parseInvoiceFromText(text);

      const matchedStore = stores.find(s => s.name.toLowerCase().includes(parsed.storeName.toLowerCase()));
      setInvoiceStoreId(matchedStore ? matchedStore.id : (stores[0]?.id || ''));
      setInvoiceDate(parsed.date);
      setInvoiceNotes(`Facture importée depuis le fichier ${fileName}`);

      const mapped = parsed.items.map(item => {
        const matchedProductId = autoMapProduct(item.name);
        return {
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          unit: item.unit,
          productId: matchedProductId
        };
      });

      setExtractedItems(mapped);
      setStep('validating');
    }, 1200);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        launchFileAnalysis(file.name, text);
      };
      reader.readAsText(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        // Choisir une facture de démonstration au hasard pour la simulation
        const randomInvoice = MOCK_INVOICES[Math.floor(Math.random() * MOCK_INVOICES.length)];
        launchOCR(randomInvoice, base64);
      };
      reader.readAsDataURL(file);
    } else {
      alert("Format de fichier non supporté. Veuillez importer une image (facture photographiée) ou un fichier texte (.txt).");
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRowChange = (index: number, field: string, value: string | number) => {
    const updated = [...extractedItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Si on change de produit, on récupère son unité de mesure par défaut
    if (field === 'productId' && value !== '') {
      const prod = products.find(p => p.id === value);
      if (prod) {
        updated[index].unit = prod.unit;
      }
    }
    setExtractedItems(updated);
  };

  const handleRemoveRow = (index: number) => {
    setExtractedItems(extractedItems.filter((_, i) => i !== index));
  };

  const handleAddRow = () => {
    setExtractedItems([...extractedItems, {
      name: 'Nouvel article',
      qty: 1,
      unitPrice: 0,
      unit: 'pièce',
      productId: ''
    }]);
  };

  const handleValidate = () => {
    // Vérifier si toutes les lignes ont bien un produit associé
    const unlinkedCount = extractedItems.filter(item => !item.productId).length;
    if (unlinkedCount > 0) {
      if (!window.confirm(`Il y a ${unlinkedCount} ligne(s) non associée(s) à des produits de votre stock. Elles seront ignorées lors de l'enregistrement. Voulez-vous continuer ?`)) {
        return;
      }
    }

    const finalPurchases: Omit<Purchase, 'id'>[] = extractedItems
      .filter(item => item.productId !== '')
      .map(item => ({
        date: invoiceDate,
        productId: item.productId,
        qty: item.qty,
        unit: item.unit,
        pricePaid: Number((item.qty * item.unitPrice).toFixed(2)),
        unitPrice: item.unitPrice,
        storeId: invoiceStoreId,
        notes: invoiceNotes
      }));

    if (finalPurchases.length === 0) {
      alert("Aucun produit lié. Aucun achat n'a été enregistré.");
      return;
    }

    onSave(finalPurchases);
  };

  const totalInvoiceAmount = extractedItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);

  return (
    <div style={{ padding: '4px' }}>
      {/* ── ETAPE DE DEPOT (IDLE) ── */}
      {step === 'idle' && (
        <div style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div
            onClick={triggerFileInput}
            style={{
              border: '3px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '40px 20px',
              backgroundColor: 'var(--color-light)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: '20px'
            }}
          >
            <Upload size={48} style={{ color: 'var(--color-dark-light)', margin: '0 auto 16px', opacity: 0.6 }} />
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>
              Glissez-déposez la facture ici
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', marginBottom: '20px' }}>
              Prend en charge les photos (JPEG, PNG) ou fichiers textes de facture (.txt)
            </p>
            <button type="button" className="btn btn-secondary">
              Parcourir mes fichiers
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.txt"
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              <ArrowLeft size={16} /> Retour
            </button>
          </div>

          <div className="card" style={{ marginTop: '24px', backgroundColor: 'var(--color-primary-light)', borderColor: 'rgba(99, 102, 241, 0.15)', textAlign: 'left' }}>
            <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
              <Info size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Simulation OCR :</strong> Pour ce test, si tu importes n'importe quel fichier image ou photo, l'application simulera le scan de factures réalistes de nos fournisseurs de démo (Metro, Biocoop, Grand Frais) pour te montrer comment les produits sont reliés au stock.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ETAPE D'ANALYSE (ANALYZING) ── */}
      {step === 'analyzing' && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <RefreshCw size={40} className="spin" style={{ color: 'var(--color-primary)', margin: '0 auto 20px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
            Analyse de la facture par IA / OCR...
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', marginBottom: '24px' }}>
            Lecture des lignes d'articles, quantités et prix
          </p>

          <div style={{ maxWidth: '280px', margin: '0 auto', backgroundColor: 'var(--color-border)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${confidence}%`,
              height: '100%',
              backgroundColor: 'var(--color-primary)',
              transition: 'width 0.1s ease'
            }} />
          </div>
          <span style={{ display: 'block', fontSize: '12px', color: 'var(--color-primary)', fontWeight: 'bold', marginTop: '8px' }}>
            Confiance de lecture : {confidence}%
          </span>

          {sourceImage && (
            <div style={{ marginTop: '24px', opacity: 0.5 }}>
              <img
                src={sourceImage}
                alt="Aperçu de la facture"
                style={{ maxHeight: '120px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── ETAPE DE VALIDATION (VALIDATING) ── */}
      {step === 'validating' && (
        <div>
          {/* Header de la facture */}
          <div className="card" style={{ marginBottom: '20px', backgroundColor: 'var(--color-light)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
              En-tête de facture extrait
            </h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fournisseur</label>
                <select
                  className="form-input"
                  value={invoiceStoreId}
                  onChange={e => setInvoiceStoreId(e.target.value)}
                >
                  <option value="">-- Non spécifié --</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Date d'achat</label>
                <input
                  type="date"
                  className="form-input"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '10px' }}>
              <label className="form-label">Notes / Référence de facture</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Facture N° 12345"
                value={invoiceNotes}
                onChange={e => setInvoiceNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Lignes d'articles */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Articles détectés sur la facture</h4>
            <button className="btn btn-secondary" onClick={handleAddRow} style={{ padding: '4px 10px', fontSize: '12px' }}>
              + Ajouter une ligne
            </button>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-dark-light)' }}>
                  <th style={{ padding: '8px' }}>Libellé Facture</th>
                  <th style={{ padding: '8px', width: '70px', textAlign: 'right' }}>Quantité</th>
                  <th style={{ padding: '8px', width: '80px', textAlign: 'right' }}>P.U. (€)</th>
                  <th style={{ padding: '8px', width: '80px', textAlign: 'right' }}>Total (€)</th>
                  <th style={{ padding: '8px' }}>Liaison avec le Stock *</th>
                  <th style={{ padding: '8px', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {extractedItems.map((item, idx) => {
                  const lineTotal = item.qty * item.unitPrice;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: idx % 2 === 0 ? 'var(--color-light)' : 'transparent' }}>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ height: '30px', fontSize: '12px', padding: '0 8px' }}
                          value={item.name}
                          onChange={e => handleRowChange(idx, 'name', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          style={{ height: '30px', fontSize: '12px', padding: '0 4px', textAlign: 'right' }}
                          value={item.qty}
                          onChange={e => handleRowChange(idx, 'qty', parseDecimalInput(e.target.value))}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          style={{ height: '30px', fontSize: '12px', padding: '0 4px', textAlign: 'right' }}
                          value={item.unitPrice}
                          onChange={e => handleRowChange(idx, 'unitPrice', parseDecimalInput(e.target.value))}
                        />
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>
                        {lineTotal.toFixed(2)} €
                      </td>
                      <td style={{ padding: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <select
                            className="form-input"
                            style={{ height: '30px', fontSize: '12px', padding: '0 4px', borderColor: item.productId ? 'var(--color-secondary)' : 'var(--color-warning)' }}
                            value={item.productId}
                            onChange={e => handleRowChange(idx, 'productId', e.target.value)}
                          >
                            <option value="">-- Ignorer (non lié au stock) --</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>
                          {item.productId ? (
                            <span title="Lié au stock" style={{ color: 'var(--color-secondary)' }}><Check size={16} /></span>
                          ) : (
                            <span title="Non géré en stock" style={{ color: 'var(--color-warning)' }}><LinkIcon size={14} /></span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
            <span style={{ fontWeight: '600' }}>Montant total de la facture</span>
            <strong style={{ fontSize: '16px', color: 'var(--color-primary)' }}>{totalInvoiceAmount.toFixed(2)} €</strong>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setStep('idle')}>
              ← Choisir un autre fichier
            </button>
            <button className="btn btn-primary" onClick={handleValidate}>
              <Check size={16} /> Valider l'entrée en stock
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
