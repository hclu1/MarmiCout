import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { parseDecimalInput } from '../utils';
import { Camera, Upload, RefreshCw, Check, ArrowLeft, Trash2, Link as LinkIcon, Info, FileText, Plus } from 'lucide-react';
import { Product, Purchase, Store, Settings } from '../types';
import { dbService } from '../services/db';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface InvoiceScannerProps {
  onClose: () => void;
  onSave: (purchases: Omit<Purchase, 'id'>[]) => void;
  products: Product[];
  stores: Store[];
  settings: Settings;
  useMindee?: boolean;
}

export const InvoiceScanner: React.FC<InvoiceScannerProps> = ({ onClose, onSave, products, stores, settings, useMindee = false }) => {
  const [step, setStep] = useState<'idle' | 'analyzing' | 'validating'>('idle');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Bulle d'aide
  const [showTip, setShowTip] = useState(() => localStorage.getItem('marmicout_hide_scanner_tip') !== 'true');

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
    console.groupCollapsed('--- DÉBUG SCANNER FACTURE ---');
    console.log('Texte brut reçu:\n', text);
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
      'bon de commande', 'devis', 'conditions', 'merci', 'carte', 'tr eligible', 'tr éligible',
      'reste a payer', 'reste à payer', 'espèces', 'especes', 'monnaie', 'rendu', 'cb', 
      'visa', 'mastercard', 'solde', 'ticket', 'avoir', 'net a payer', 'net à payer',
      'jotal', 'ir eligible', 'ir éligible', 'taux', 't.v.a', 't.v.a.', 'montant', 'article', 'articles', 'nombre d', 'nombre', 'c.b.', 'c.b', 'carte bancaire', 'promotion', 'paye', 'facture', 'date', 'heure', 'tva '
    ];

    // Écarte les lignes qui ne peuvent pas être une ligne d'article : en-têtes/légal,
    // ou lignes quasi entièrement numériques (SIRET, téléphone, IBAN, code postal...)
    const isExcludedLine = (line: string): boolean => {
      const lower = line.toLowerCase();
      // On utilise \b pour rechercher des mots entiers, afin d'éviter que "HARIBO" soit exclu à cause de "rib"
      if (EXCLUDE_KEYWORDS.some(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower))) {
        return true;
      }
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



    // Format A (Factures fournisseurs type Metro) :
    // Exemple : "Farine T55 25 kg 1,20 30,00"
    const lineItemRegexWithTotal = /^([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s'-]{1,60}?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|pièce|pièces|sachet|u|unit|units)?\s+(\d+[.,]\d{2})\s+\d+[.,]\d{2}\s*(?:€|\$|EUR)?$/i;

    // Format B (Une seule valeur monétaire) : 
    // Exemple : "2x Pot en verre 24.50"
    const lineItemRegexTotalOnly = /^([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s'-]{1,60}?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|pièce|pièces|sachet|u|unit|units)?\s+(\d+[.,]\d{2})\s*(?:€|\$|EUR)?$/i;

    // Format Supermarché avec Quantité (ex: "T 2 X MILKA" ou "T2 X BRASSE SKYR")
    // On accepte 'x', 'X' ou '*' comme multiplicateur
    const supermarketQtyRegex = /^(?:[A-Za-z*0-9#]\s*)?(\d+(?:[.,]\d+)?)\s*[xX*]\s+([a-zA-ZÀ-ÿ0-9\s'\-#&/%.,*]+?)\s+(\d+[.,]\d{2})(?:\s*(?:EUR|€|E))?\s+(\d+[.,]\d{2})(?:\s*(?:EUR|€|E))?\s*[^0-9]*$/i;

    lines.forEach((line, index) => {
      console.log(`\n[Ligne ${index + 1}] "${line}"`);
      if (isExcludedLine(line)) {
        console.log(`  -> ❌ Ignorée (mot clé exclu ou ligne non valide)`);
        return;
      }

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
          console.log(`  -> ✅ Match Format A (Fournisseur): Produit="${name}", Qte=${qty}, PrixU=${unitPrice}€`);
        } else {
          console.log(`  -> ❌ Format A détecté mais valeurs invalides (Nom="${name}", Qte=${qty}, PrixU=${unitPrice})`);
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
            console.log(`  -> ✅ Match Format B (Prix Total Uniquement): Produit="${name}", Qte=${qty}, PrixU=${unitPrice}€`);
          } else {
            console.log(`  -> ❌ Format B détecté mais valeurs invalides (Nom="${name}", Qte=${qty}, PrixU=${unitPrice})`);
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
            console.log(`  -> ✅ Match Format Supermarché: Produit="${name}", Qte=${qty}, PrixU=${unitPrice}€`);
          } else {
            console.log(`  -> ❌ Format Supermarché détecté mais valeurs invalides (Nom="${name}", Qte=${qty}, PrixU=${unitPrice})`);
          }
        }
      }

      if (!matched) {
        // Format C (très permissif, idéal pour OCR capricieux comme Auchan)
        // Gère les tirets, étoiles au début, espaces dans les prix (0, 75)
        const veryPermissive = /^[*X]?\s*([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s'\.\-]{2,40}?)(?:\s+([\d.,*X\s]+))?\s+[\.]*\s*(\d+)\s*[.,]\s*(\d{2})\s*(?:€|\$|EUR)?$/i;
        const matchPermissive = line.match(veryPermissive);
        if (matchPermissive) {
          let name = matchPermissive[1].trim();
          let middlePart = matchPermissive[2] ? matchPermissive[2].trim() : '';
          let qty = 1;
          const total = parseFloat(`${matchPermissive[3]}.${matchPermissive[4]}`);

          // Si le texte du milieu ressemble à une quantité et un prix unitaire collés (ex: "29,55" ou "2 *2.35")
          if (middlePart) {
             const qtyMatch = middlePart.match(/^(\d+)/);
             if (qtyMatch) {
                const possibleQty = parseInt(qtyMatch[1], 10);
                if (possibleQty > 1 && possibleQty < 100) {
                   qty = possibleQty;
                }
             }
          }

          // Nettoyage des petites erreurs OCR à la fin du nom
          name = name.replace(/ Ho\.$/, '').replace(/ SE\.$/, '').replace(/ NUL\.$/, '').trim();
          
          if (isPlausibleItem(name, qty, total)) {
            items.push({ name, qty, unitPrice: Number((total/qty).toFixed(2)), unit: 'pièce' });
            matched = true;
            console.log(`  -> ✅ Match Format C (Permissif Auchan): Produit="${name}", Qte=${qty}, PrixTotal=${total}€`);
          }
        }
      }

      if (!matched) {
        // Algorithme de secours Mathématique (si les regex échouent)
        // Astuces de réparation OCR :
        // 1. Recréer la virgule si perdue (ex: "3 99" -> "3.99")
        // 2. Supprimer les espaces accidentels après la virgule (ex: "0, 75" -> "0.75")
        let patchedLine = line.replace(/(\d+)\s(\d{2})(?!\d)/g, '$1.$2');
        patchedLine = patchedLine.replace(/(\d+)[.,]\s+(\d{1,2})(?!\d)/g, '$1.$2');
        const cleanedForMath = patchedLine.replace(/[€$]|EUR/gi, '');
        const numbersMatch = cleanedForMath.match(/\d+(?:[.,]\d+)?/g);
        const hasMonetaryValue = /\d+[.,]\d{1,2}(?!\d)/.test(patchedLine);

        if (numbersMatch && hasMonetaryValue) {
          const numbers = numbersMatch.map(n => parseFloat(n.replace(',', '.')));
          let finalQty = 1;
          let finalUnitPrice = 0;
          let finalTotal = 0;
          let mathFound = false;
          let usedNumberStrings: string[] = [];

          if (numbers.length >= 3) {
            for (let i = 0; i < numbers.length - 2 && !mathFound; i++) {
              for (let j = i + 1; j < numbers.length - 1 && !mathFound; j++) {
                for (let k = j + 1; k < numbers.length && !mathFound; k++) {
                  const A = numbers[i];
                  const B = numbers[j];
                  const C = numbers[k];
                  
                  if (A > 0 && B > 0 && Math.abs((A * B) - C) < 0.05) {
                    finalQty = A;
                    finalUnitPrice = B;
                    finalTotal = C;
                    mathFound = true;
                    usedNumberStrings = [numbersMatch[i], numbersMatch[j], numbersMatch[k]];
                  }
                }
              }
            }
          }

          if (!mathFound) {
            finalTotal = numbers[numbers.length - 1];
            usedNumberStrings = [numbersMatch[numbers.length - 1]];
            
            const matchX = line.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[xX*]\s/);
            if (matchX) {
              finalQty = parseFloat(matchX[1].replace(',', '.'));
              usedNumberStrings.push(matchX[1]);
            } else if (numbersMatch.length > 1) {
              // Cas de secours extrême : L'OCR a fusionné la quantité et un autre symbole (ex: "22 00 4,70")
              const firstNumStr = numbersMatch[0];
              // Sécurité : on évite de casser les poids (ex: 250G lu comme 2506)
              const isWeight = /^(100|125|150|200|250|300|400|500|600|700|750|800)/.test(firstNumStr);
              
              if (!isWeight) {
                for (let q = 20; q >= 2; q--) { // On ne déduit pas "1" pour éviter les faux positifs (1 est déjà la valeur par défaut)
                  if (firstNumStr.startsWith(q.toString()) && firstNumStr.length > q.toString().length) {
                    finalQty = q;
                    usedNumberStrings.push(firstNumStr);
                    console.log(`  -> 💡 Déduction de quantité OCR fusionnée: ${q} à partir de "${firstNumStr}"`);
                    break;
                  }
                }
              }
            }
            finalUnitPrice = Number((finalTotal / finalQty).toFixed(4));
          }

          let namePart = line.replace(/[€$]|EUR/gi, '');
          usedNumberStrings.forEach(numStr => {
            namePart = namePart.replace(numStr, '');
          });
          
          namePart = namePart.trim().replace(/^(?:[A-Za-z*#]\s*)?[xX*]?\s+/, '').trim();
          if (namePart.toLowerCase().startsWith('x ')) {
            namePart = namePart.substring(2).trim();
          }

          const unitMatch = line.match(/\b(kg|g|l|ml|cl|pièce|pièces|sachet|u|unit|units)\b/i);
          const unit = normalizeUnit(unitMatch ? unitMatch[1] : undefined);

          // Si le nom extrait ne contient pas de lettres, on cherche sur la ligne du haut
          if (!/[a-zA-ZÀ-ÿ]{2,}/.test(namePart)) {
            let foundName = false;
            if (index > 0) {
              const previousLine = lines[index - 1].replace(/[€$]|EUR/gi, '').trim();
              if (/[a-zA-ZÀ-ÿ]{2,}/.test(previousLine) && !/\d+[.,]\d{1,2}/.test(previousLine)) {
                namePart = previousLine;
                foundName = true;
              }
            }
            if (!foundName) {
              namePart = 'Produit inconnu (à renommer)';
              console.log(`  -> ⚠️ Nom introuvable, utilisation de "Produit inconnu"`);
            } else {
              console.log(`  -> ⚠️ Nom récupéré sur la ligne précédente: "${namePart}"`);
            }
          }

          if (isPlausibleItem(namePart, finalQty, finalUnitPrice)) {
            items.push({ name: namePart, qty: finalQty, unitPrice: finalUnitPrice, unit });
            console.log(`  -> ✅ Match Algorithme Mathématique: Produit="${namePart}", Qte=${finalQty}, PrixU=${finalUnitPrice}€`);
          } else {
            console.log(`  -> ❌ Match Mathématique rejeté car invraisemblable (Nom="${namePart}", Qte=${finalQty}, PrixU=${finalUnitPrice})`);
          }
        } else {
          console.log(`  -> ❌ Aucun algorithme n'a pu extraire d'informations de cette ligne.`);
        }
      }
    });

    console.log('Total articles extraits:', items.length);
    console.groupEnd();
    return { storeName, date, items };
  };

  const [rawOcrText, setRawOcrText] = useState('');

  // Termine l'analyse d'une facture : parse le texte extrait (OCR, PDF ou .txt)
  // et tente de relier chaque ligne détectée à un produit du stock.
  const finishAnalysis = (fileName: string, text: string, imageBase64: string | null, ocrConfidence: number | null) => {
    setRawOcrText(text);
    const parsed = parseInvoiceFromText(text);

    const matchedStore = stores.find(s => s.name.toLowerCase().includes(parsed.storeName.toLowerCase()));
    setInvoiceStoreId(matchedStore ? matchedStore.id : '');
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

  // Prétraitement de l'image (Canvas) pour améliorer drastiquement l'OCR de Tesseract
  // - Zoom x2
  // - Passage en noir et blanc pur (Thresholding) pour faire ressortir les * et les virgules
  const preprocessImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(img.src);

        // Agrandissement x2
        const scale = 2;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // On dessine l'image agrandie
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Récupération des pixels
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Luminance (Grayscale)
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // Contraste modéré (évite de détruire les points et virgules)
          const contrast = 1.2; 
          gray = (gray - 128) * contrast + 128;
          
          // On évite le seuillage dur (Thresholding) pour laisser Tesseract faire son propre calcul Otsu
          gray = Math.min(255, Math.max(0, gray));

          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      
      reader.readAsDataURL(file);
    });
  };

  // Lecture avec l'API Premium Mindee
  const analyzeImageWithMindee = async (file: File) => {
    if (!settings.mindeeApiKey) {
      alert("Clé API Mindee non configurée dans les paramètres.");
      return;
    }

    if (!settings.mindeeModelId) {
      alert("ID du Modèle Mindee manquant. Veuillez le configurer dans les paramètres pour utiliser l'IA.");
      return;
    }

    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    let scansUsed = settings.mindeeMonthlyScans || 0;
    const lastScanMonth = settings.mindeeLastScanMonth || '';

    if (lastScanMonth !== currentMonth) {
      scansUsed = 0;
    }

    if (scansUsed >= 250) {
      alert(`Vous avez atteint votre quota gratuit de 250 scans ce mois-ci.\nVeuillez contacter le support pour passer à l'abonnement Premium (Logiciel complet + Scans IA en illimité).`);
      setStep('idle');
      return;
    } else if (scansUsed >= 200) {
      // Affichage silencieux du quota restant
      console.log(`Attention, il vous reste ${250 - scansUsed} scans gratuits ce mois-ci.`);
    }

    setStep('analyzing');
    setConfidence(0);

    try {
      // Afficher l'image source
      const reader = new FileReader();
      reader.onload = (e) => setSourceImage(e.target?.result as string);
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append("document", file);

      // On utilise l'API Receipt officielle de Mindee (qui autorise les requêtes depuis un navigateur, contrairement aux modèles personnalisés V2)
      const response = await fetch("https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict", {
        method: "POST",
        headers: {
          "Authorization": `Token ${settings.mindeeApiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      const json = await response.json();
      const prediction = json.document.inference.prediction;

      const extractedStore = prediction.supplier_name?.value || '';
      const extractedDate = prediction.date?.value || new Date().toISOString().split('T')[0];
      
      const mappedItems = [];
      const lineItems = prediction.line_items || [];
      
      for (const item of lineItems) {
        if (!item.description) continue;
        
        const qty = item.quantity || 1;
        const total = item.total_amount || 0;
        let unitPrice = item.unit_price;
        
        if (!unitPrice && total > 0) {
          unitPrice = total / qty;
        }
        
        if (total === 0 && !unitPrice) continue;

        mappedItems.push({
          name: item.description,
          qty: qty,
          unitPrice: Number((unitPrice || 0).toFixed(2)),
          unit: 'pièce', // Par défaut
          productId: autoMapProduct(item.description)
        });
      }

      // Sauvegarde du quota
      dbService.saveSettings({
        ...settings,
        mindeeMonthlyScans: scansUsed + 1,
        mindeeLastScanMonth: currentMonth
      });

      setInvoiceStoreId(stores.find(s => s.name.toLowerCase().includes(extractedStore.toLowerCase()))?.id || stores[0]?.id || '');
      setInvoiceDate(extractedDate);
      
      if (mappedItems.length === 0) {
        alert("Mindee n'a trouvé aucune ligne d'article sur ce document.");
      }
      
      setExtractedItems(mappedItems);
      setStep('validating');
      setConfidence(100);

    } catch (err) {
      console.error('Erreur Mindee', err);
      alert("La lecture avec Mindee a échoué. Vérifiez votre clé API et votre connexion internet.");
      setStep('idle');
    }
  };

  // Lecture réelle d'une photo de facture par OCR
  const analyzeImage = async (file: File) => {
    setStep('analyzing');
    setConfidence(0);

    try {
      // Étape 1 : Prétraitement de l'image
      const processedBase64 = await preprocessImage(file);

      // Conserver l'image source pour l'affichage (base64 compressé pour éviter de saturer la RAM)
      const reader = new FileReader();
      reader.onload = (e) => setSourceImage(e.target?.result as string);
      reader.readAsDataURL(file);

      // Étape 2 : Lancement de l'OCR
      const worker = await createWorker('fra', undefined, {
        logger: m => {
          if (typeof m.progress === 'number') setConfidence(Math.round(m.progress * 100));
        }
      });
      const { data } = await worker.recognize(processedBase64);
      await worker.terminate();
      
      finishAnalysis(file.name, data.text, processedBase64, data.confidence);
    } catch (err) {
      console.error('Erreur OCR', err);
      alert("La lecture automatique (OCR) de la photo a échoué. Réessayez avec une photo plus nette.");
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
      if (useMindee) {
        void analyzeImageWithMindee(file); // Mindee supporte les PDFs natifs
      } else {
        void analyzePdf(file);
      }
    } else if (file.type.startsWith('image/')) {
      if (useMindee) {
        void analyzeImageWithMindee(file);
      } else {
        void analyzeImage(file);
      }
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
    // Vérifier si toutes les lignes ont bien un produit associé ou "NEW"
    const unlinkedCount = extractedItems.filter(item => item.productId === '').length;
    if (unlinkedCount > 0) {
      if (!window.confirm(`Il y a ${unlinkedCount} ligne(s) avec le statut "-- Ignorer --". Elles ne seront pas enregistrées. Voulez-vous continuer ?`)) {
        return;
      }
    }

    const finalPurchases: Omit<Purchase, 'id'>[] = [];

    extractedItems.forEach(item => {
      let finalProductId = item.productId;
      
      // Création automatique des nouveaux produits dans le stock
      if (finalProductId === 'NEW') {
        const newProd: Product = {
          id: 'P_' + Date.now() + Math.floor(Math.random() * 1000),
          barcode: '',
          name: item.name,
          category: settings.categories[0] || 'Autre',
          unit: item.unit || 'pièce',
          brand: '',
          format: 'Unité',
          stock: 0,
          minStockAlert: settings.defaultMinStockAlert || 10,
          avgPurchasePrice: item.unitPrice,
          mainStoreId: invoiceStoreId || '',
          notes: 'Créé via scan facture',
          isActive: true
        };
        dbService.saveProduct(newProd);
        finalProductId = newProd.id;
      }

      if (finalProductId !== '') {
        finalPurchases.push({
          date: invoiceDate,
          productId: finalProductId,
          qty: item.qty,
          unit: item.unit,
          pricePaid: Number((item.qty * item.unitPrice).toFixed(2)),
          unitPrice: item.unitPrice,
          storeId: invoiceStoreId,
          notes: invoiceNotes
        });
      }
    });

    if (finalPurchases.length === 0) {
      alert("Aucun produit lié ou créé. Aucun achat n'a été enregistré.");
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

          {showTip && (
            <div className="card" style={{ marginTop: '16px', backgroundColor: '#fff3cd', borderColor: '#ffe69c', textAlign: 'left' }}>
              <div style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#664d03' }}>
                <Info size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '8px' }}>💡 Astuce pour une lecture parfaite (Téléphone)</strong>
                  Pour éviter les erreurs de texte, utilisez l'application <strong>Notes</strong> (iPhone) ou <strong>Google Drive</strong> (Android) pour "Scanner le document" en PDF noir et blanc bien net. 
                  Ensuite, cliquez ici sur "Parcourir mes fichiers" et choisissez votre PDF !
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                    <input type="checkbox" onChange={(e) => {
                      if (e.target.checked) {
                        setShowTip(false);
                        localStorage.setItem('marmicout_hide_scanner_tip', 'true');
                      }
                    }} />
                    J'ai compris, ne plus afficher ce message
                  </label>
                </div>
              </div>
            </div>
          )}
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

          <details style={{ marginBottom: '15px', fontSize: '12px', backgroundColor: 'var(--color-light)', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Voir le texte brut lu par le scanner (pour comprendre les erreurs)</summary>
            <pre style={{ marginTop: '10px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', maxHeight: '200px', overflowY: 'auto' }}>
              {rawOcrText}
            </pre>
          </details>

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
                            style={{ height: '30px', fontSize: '12px', padding: '0 4px', borderColor: item.productId && item.productId !== 'NEW' ? 'var(--color-secondary)' : (item.productId === 'NEW' ? 'var(--color-primary)' : 'var(--color-warning)') }}
                            value={item.productId}
                            onChange={e => handleRowChange(idx, 'productId', e.target.value)}
                          >
                            <option value="">-- Ignorer (non lié au stock) --</option>
                            <option value="NEW">➕ Créer comme nouveau produit au stock</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>
                          {item.productId && item.productId !== 'NEW' ? (
                            <span title="Lié au stock" style={{ color: 'var(--color-secondary)' }}><Check size={16} /></span>
                          ) : item.productId === 'NEW' ? (
                            <span title="Sera créé automatiquement" style={{ color: 'var(--color-primary)' }}><Plus size={16} /></span>
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
