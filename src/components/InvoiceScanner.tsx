import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { parseDecimalInput } from '../utils';
import { Camera, Upload, RefreshCw, Check, ArrowLeft, Trash2, Link as LinkIcon, Info, FileText } from 'lucide-react';
import { Product, Purchase, Store, Settings } from '../types';
import { dbService } from '../services/db';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface InvoiceScannerProps {
  onClose: () => void;
  onSave: (purchases: Omit<Purchase, 'id'>[]) => void;
  products: Product[];
  stores: Store[];
  settings: Settings;
}

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

  // Parser textuel pour les fichiers texte, PDF ou le résultat de l'OCR d'une photo
  const parseInvoiceFromText = (rawText: string): {
    storeName: string;
    date: string;
    items: { name: string; qty: number; unitPrice: number; unit: string }[];
  } => {
    // Nettoyage du texte brut (espaces insécables et doublés fréquents en sortie OCR)
    const text = rawText.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ');
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

    // Mots-clés de lignes à ignorer : en-têtes, mentions légales, totaux, coordonnées...
    // (tout ce qui n'est pas une ligne "produit / quantité / prix")
    const EXCLUDE_KEYWORDS = [
      'total', 'sous-total', 'sous total', 'tva', 'ttc', 'ht ', ' ht', 'siret', 'siren',
      'tel', 'tél', 'fax', 'email', 'e-mail', 'iban', 'bic', 'rib', 'adresse', 'cedex',
      'page', 'facture n', 'n° facture', 'numéro de facture', 'référence', 'reference',
      'client', 'livraison', 'règlement', 'reglement', 'paiement', 'échéance', 'echeance',
      'remise', 'escompte', 'capital', 'rcs', 'naf', 'ape', 'code postal', 'www.', 'http',
      'bon de commande', 'devis', 'conditions', 'merci'
    ];

    // Écarte les lignes qui ne peuvent pas être une ligne d'article : en-têtes/légal,
    // ou lignes quasi entièrement numériques (SIRET, téléphone, IBAN, code postal...)
    const isExcludedLine = (line: string): boolean => {
      const lower = line.toLowerCase();
      if (EXCLUDE_KEYWORDS.some(k => lower.includes(k))) return true;
      const compact = line.replace(/\s/g, '');
      const digitsOnly = compact.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 8 && digitsOnly.length / compact.length > 0.6) return true;
      if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(line.trim())) return true;
      return false;
    };

    // Une ligne d'article plausible a un nom lisible (au moins un mot de 2 lettres),
    // une quantité et un prix dans des bornes réalistes pour une facture d'épicerie/traiteur.
    const isPlausibleItem = (name: string, qty: number, price: number): boolean => {
      if (!/[a-zA-ZÀ-ÿ]{2,}/.test(name)) return false;
      if (!isFinite(qty) || qty <= 0 || qty > 9999) return false;
      if (!isFinite(price) || price <= 0 || price > 99999) return false;
      return true;
    };

    const normalizeUnit = (raw: string | undefined): string => {
      const unit = (raw || 'pièce').trim().toLowerCase();
      if (unit.startsWith('kg')) return 'kg';
      if (unit.startsWith('g')) return 'g';
      if (unit.startsWith('l')) return 'l';
      if (unit.startsWith('ml')) return 'ml';
      if (unit.startsWith('cl')) return 'cl';
      return 'pièce';
    };

    // Format A (le plus courant sur une vraie facture fournisseur) :
    // [Nom] [Qté] [Unité?] [Prix Unitaire] [Montant total]
    // Exemple : "Farine T55 25 kg 1,20 30,00" → qté 25 kg à 1,20€/kg (30,00€ au total)
    const lineItemRegexWithTotal = /^([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s'-]{1,60}?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|pièce|pièces|sachet|u|unit|units)?\s+(\d+[.,]\d{2})\s+\d+[.,]\d{2}\s*(?:€|\$|EUR)?$/i;

    // Format B (une seule valeur monétaire) : [Nom] [Qté] [Unité?] [Montant total de la ligne]
    // Exemple : "2x Pot en verre 24.50" → le prix détecté est divisé par la quantité
    const lineItemRegexTotalOnly = /^([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s'-]{1,60}?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|pièce|pièces|sachet|u|unit|units)?\s+(\d+[.,]\d{2})\s*(?:€|\$|EUR)?$/i;

    // Format Supermarché avec Quantité (ex: "T 2 X MILKA CHOCO PAUSE 2.85 EUR 5.70 EUR")
    const supermarketQtyRegex = /^(?:[A-Za-z*]\s+)?(\d+(?:[.,]\d+)?)\s*[xX]\s+([a-zA-ZÀ-ÿ0-9\s'\-#&]+?)\s+(\d+[.,]\d{2})(?:\s*(?:EUR|€|E))?\s+(\d+[.,]\d{2})(?:\s*(?:EUR|€|E))?$/i;

    // Format Supermarché sans Quantité (ex: "T #MPG CARPACCIO CHA 6.20 EUR")
    const supermarketSingleRegex = /^(?:[A-Za-z*]\s+)?([a-zA-ZÀ-ÿ#][a-zA-ZÀ-ÿ0-9\s'\-#&]+?)\s+(\d+[.,]\d{2})(?:\s*(?:EUR|€|E))?$/i;

    lines.forEach(line => {
      if (isExcludedLine(line)) return;

      let matched = false;

      const matchWithTotal = line.match(lineItemRegexWithTotal);
      if (matchWithTotal) {
        const name = matchWithTotal[1].trim();
        const qty = parseFloat(matchWithTotal[2].replace(',', '.'));
        const unit = normalizeUnit(matchWithTotal[3]);
        const unitPrice = parseFloat(matchWithTotal[4].replace(',', '.'));

        if (isPlausibleItem(name, qty, unitPrice)) {
          items.push({ name, qty, unitPrice, unit });
          matched = true;
        }
      }

      if (!matched) {
        const matchTotalOnly = line.match(lineItemRegexTotalOnly);
        if (matchTotalOnly) {
          const name = matchTotalOnly[1].trim();
          const qty = parseFloat(matchTotalOnly[2].replace(',', '.'));
          const unit = normalizeUnit(matchTotalOnly[3]);
          const total = parseFloat(matchTotalOnly[4].replace(',', '.'));
          const unitPrice = Number((total / qty).toFixed(4));

          if (isPlausibleItem(name, qty, unitPrice)) {
            items.push({ name, qty, unitPrice, unit });
            matched = true;
          }
        }
      }

      if (!matched) {
        const matchSupermarketQty = line.match(supermarketQtyRegex);
        if (matchSupermarketQty) {
          const qty = parseFloat(matchSupermarketQty[1].replace(',', '.'));
          const name = matchSupermarketQty[2].trim();
          const unitPrice = parseFloat(matchSupermarketQty[3].replace(',', '.'));
          if (isPlausibleItem(name, qty, unitPrice)) {
            items.push({ name, qty, unitPrice, unit: 'pièce' });
            matched = true;
          }
        }
      }

      if (!matched) {
        const matchSupermarketSingle = line.match(supermarketSingleRegex);
        if (matchSupermarketSingle) {
          const name = matchSupermarketSingle[1].trim();
          const qty = 1;
          const unitPrice = parseFloat(matchSupermarketSingle[2].replace(',', '.'));
          if (isPlausibleItem(name, qty, unitPrice)) {
            items.push({ name, qty, unitPrice, unit: 'pièce' });
            matched = true;
          }
        }
      }
    });

    // Si aucune ligne n'a été détectée avec la regex stricte, utiliser un algorithme de secours
    // plus souple, mais qui exige tout de même un prix au format monétaire (ex: 12,50) pour
    // ne pas confondre une date, un code ou un numéro de téléphone avec un article.
    if (items.length === 0) {
      lines.forEach(line => {
        if (isExcludedLine(line)) return;

        const numbers = line.match(/\d+(?:[.,]\d+)?/g);
        const hasMonetaryValue = /\d+[.,]\d{2}(?!\d)/.test(line);
        if (numbers && numbers.length >= 2 && hasMonetaryValue) {
          // Supposons que le dernier nombre est le prix total et le premier est la quantité
          const qty = parseFloat(numbers[0].replace(',', '.'));
          const totalPaid = parseFloat(numbers[numbers.length - 1].replace(',', '.'));
          const namePart = line.replace(/\d+(?:[.,]\d+)?/g, '').replace(/[€$]/g, '').trim();

          if (isPlausibleItem(namePart, qty, totalPaid)) {
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

  // Termine l'analyse d'une facture : parse le texte extrait (OCR, PDF ou .txt)
  // et tente de relier chaque ligne détectée à un produit du stock.
  const finishAnalysis = (fileName: string, text: string, imageBase64: string | null, ocrConfidence: number | null) => {
    const parsed = parseInvoiceFromText(text);

    const matchedStore = stores.find(s => s.name.toLowerCase().includes(parsed.storeName.toLowerCase()));
    setInvoiceStoreId(matchedStore ? matchedStore.id : (stores[0]?.id || ''));
    setInvoiceDate(parsed.date);
    setInvoiceNotes(`Facture importée depuis ${fileName}`);
    setSourceImage(imageBase64);
    if (ocrConfidence !== null) setConfidence(Math.round(ocrConfidence));

    const mapped = parsed.items.map(item => ({
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      unit: item.unit,
      productId: autoMapProduct(item.name)
    }));

    if (mapped.length === 0) {
      alert("Aucune ligne d'article n'a pu être détectée automatiquement sur cette facture. Vous pouvez les ajouter manuellement ci-dessous avec le bouton \"Ajouter une ligne\".");
    }

    setExtractedItems(mapped);
    setStep('validating');
  };

  // Lecture réelle d'une photo de facture par OCR (reconnaissance de texte locale, dans le navigateur)
  const analyzeImage = async (file: File) => {
    setStep('analyzing');
    setConfidence(0);

    const base64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    try {
      const worker = await createWorker('fra', undefined, {
        logger: m => {
          if (typeof m.progress === 'number') setConfidence(Math.round(m.progress * 100));
        }
      });
      const { data } = await worker.recognize(base64);
      await worker.terminate();
      finishAnalysis(file.name, data.text, base64, data.confidence);
    } catch (err) {
      console.error('Erreur OCR', err);
      alert("La lecture automatique (OCR) de la photo a échoué. Réessayez avec une photo plus nette, bien cadrée, à plat et sans reflet.");
      setStep('idle');
    }
  };

  // Extraction du texte intégré d'un PDF de facture (factures numériques envoyées par email)
  const analyzePdf = async (file: File) => {
    setStep('analyzing');
    setConfidence(0);
    setSourceImage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n';
        setConfidence(Math.round((i / pdf.numPages) * 100));
      }

      if (fullText.trim().length < 20) {
        alert("Ce PDF semble être une image scannée sans texte intégré : la lecture automatique n'est pas possible sur ce type de fichier. Prenez plutôt une photo de la facture avec l'appareil photo.");
        setStep('idle');
        return;
      }

      finishAnalysis(file.name, fullText, null, 100);
    } catch (err) {
      console.error('Erreur extraction PDF', err);
      alert("Impossible de lire ce fichier PDF.");
      setStep('idle');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setStep('analyzing');
        setSourceImage(null);
        setConfidence(100);
        finishAnalysis(file.name, text, null, null);
      };
      reader.readAsText(file);
    } else if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
      void analyzePdf(file);
    } else if (file.type.startsWith('image/')) {
      void analyzeImage(file);
    } else {
      alert("Format de fichier non supporté. Veuillez importer une image, un fichier PDF ou un fichier texte (.txt).");
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
              Prend en charge les photos (JPEG, PNG), documents PDF (.pdf) ou fichiers textes de facture (.txt)
            </p>
            <button type="button" className="btn btn-secondary">
              Parcourir mes fichiers
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.txt,.pdf"
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
                <strong>Lecture automatique (OCR) :</strong> pour une photo, cadrez la facture bien à plat, sans reflet ni flou, pour une meilleure reconnaissance. Les PDF envoyés par email sont lus directement s'ils contiennent du texte. Vérifiez toujours les lignes détectées ci-dessous avant de valider.
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
