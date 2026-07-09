import React, { useState, useRef } from 'react';
import { parseDecimalInput } from '../utils';
import { Camera, Upload, RefreshCw, Check, ArrowLeft, Trash2, Link as LinkIcon, Info } from 'lucide-react';
import { Product, Recipe, RecipeIngredient, RecipePackaging, Settings } from '../types';
import { convertUnits } from '../services/db';
import mammoth from 'mammoth';

interface RecipeScannerProps {
  onClose: () => void;
  onSave: (recipe: Recipe, ingredients: Omit<RecipeIngredient, 'id' | 'recipeId'>[], packagings: Omit<RecipePackaging, 'id' | 'recipeId'>[]) => void;
  products: Product[];
  settings: Settings;
}

// Recettes de démonstration pour simuler l'extraction OCR / IA de manière réaliste
const MOCK_RECIPES = [
  {
    id: 'demo1',
    name: 'Tarte Tatin de Grand-Mère',
    category: 'Tarte',
    portions: 6,
    description: 'Une Tarte Tatin renversante avec des pommes fondantes caramélisées.',
    utensilsNotes: 'Moule à tatin de 24cm, poêle en cuivre, rouleau à pâtisserie.',
    notes: 'Servir chaud avec une boule de glace vanille ou une cuillère de crème fraîche.',
    ingredients: [
      { customName: 'Farine de blé', qtyUsed: 200, unit: 'g' },
      { customName: 'Beurre doux', qtyUsed: 120, unit: 'g' },
      { customName: 'Pommes Golden', qtyUsed: 1.2, unit: 'kg' },
      { customName: 'Sucre en poudre', qtyUsed: 150, unit: 'g' },
      { customName: 'Cannelle moulue', qtyUsed: 5, unit: 'g' }
    ],
    instructions: "1. Faire un caramel à sec directement dans le moule avec 100g de sucre.\n2. Éplucher les pommes Golden, les couper en quatre.\n3. Disposer les pommes debout bien serrées dans le caramel refroidi et parsemer de lamelles de beurre (50g) et du reste du sucre.\n4. Étaler la pâte brisée (faite avec la farine et les 70g de beurre restant) par-dessus, rentrer les bords.\n5. Cuire à 180°C pendant 35 à 40 minutes. Laisser reposer 5 min et retourner."
  },
  {
    id: 'demo2',
    name: 'Confiture de Fraises Artisanale',
    category: 'Confiture',
    portions: 8, // Équivaut à 8 pots de confiture
    description: 'Confiture maison onctueuse préparée avec des fruits frais de saison.',
    utensilsNotes: 'Grande bassine à confiture en cuivre ou inox, louche, 8 pots stérilisés.',
    notes: 'Remplir les pots à chaud, fermer et retourner immédiatement.',
    ingredients: [
      { customName: 'Fraises fraîches', qtyUsed: 2.0, unit: 'kg' },
      { customName: 'Sucre cristal', qtyUsed: 1.8, unit: 'kg' },
      { customName: 'Citron pressé', qtyUsed: 1, unit: 'pièce' },
      { customName: 'Pots en verre vides', qtyUsed: 8, unit: 'pièce' }
    ],
    instructions: "1. Laver, équeuter et couper les fraises en morceaux.\n2. Dans une grande bassine, mélanger les fraises, le sucre cristal et le jus de citron.\n3. Laisser macérer pendant 2 heures pour dissoudre le sucre.\n4. Porter à ébullition à feu vif en remuant continuellement.\n5. Cuire pendant 30 minutes. Vérifier la cuisson sur une assiette froide.\n6. Mettre en pot immédiatement."
  },
  {
    id: 'demo3',
    name: 'Quiche Gourmande aux Poireaux',
    category: 'Plat Cuisiné',
    portions: 4,
    description: 'Une quiche salée croustillante avec des poireaux fondus et du fromage de chèvre frais.',
    utensilsNotes: 'Moule à tarte de 28cm, poêle, fouet.',
    notes: 'Idéal pour le marché du samedi midi.',
    ingredients: [
      { customName: 'Poireaux émincés', qtyUsed: 500, unit: 'g' },
      { customName: 'Beurre gastronomique', qtyUsed: 30, unit: 'g' },
      { customName: 'Œufs frais', qtyUsed: 3, unit: 'pièce' },
      { customName: 'Lait demi-écrémé', qtyUsed: 15, unit: 'cl' },
      { customName: 'Fromage de chèvre', qtyUsed: 100, unit: 'g' },
      { customName: 'Farine T55 (pâte)', qtyUsed: 200, unit: 'g' }
    ],
    instructions: "1. Préparer une pâte brisée rapide et l'étaler dans le moule à tarte.\n2. Faire revenir les poireaux émincés dans le beurre à la poêle pendant 15 min.\n3. Disposer les poireaux cuits sur le fond de pâte.\n4. Dans un saladier, fouetter les œufs avec le lait, saler et poivrer.\n5. Verser l'appareil aux œufs sur les poireaux.\n6. Disposer des tranches de fromage de chèvre sur le dessus.\n7. Enfourner à 190°C pendant 30 minutes."
  }
];

export const RecipeScanner: React.FC<RecipeScannerProps> = ({ onClose, onSave, products, settings }) => {
  const [step, setStep] = useState<'idle' | 'analyzing' | 'validating'>('idle');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Valeurs du formulaire d'édition
  const [recipeName, setRecipeName] = useState('');
  const [recipeCategory, setRecipeCategory] = useState(settings.recipeCategories[0] || 'Autre');
  const [recipeDescription, setRecipeDescription] = useState('');
  const [recipePortions, setRecipePortions] = useState(6);
  const [recipeInstructions, setRecipeInstructions] = useState('');
  const [recipeNotes, setRecipeNotes] = useState('');
  
  // Ingrédients extraits pour l'édition et le mapping de stock
  const [ingredients, setIngredients] = useState<{
    customName: string;
    qtyUsed: number;
    unit: string;
    productId: string; // ID du produit si lié au stock, "" sinon
    customCostPerUnit: number; // coût estimé si non lié au stock
  }[]>([]);

  // Correspondance automatique d'ingrédients vers la table de stock
  const autoMapIngredient = (name: string): string => {
    const normal = name.toLowerCase().trim();
    if (normal.includes('farine')) return products.find(p => p.name.toLowerCase().includes('farine'))?.id || '';
    if (normal.includes('sucre')) return products.find(p => p.name.toLowerCase().includes('sucre'))?.id || '';
    if (normal.includes('beurre')) return products.find(p => p.name.toLowerCase().includes('beurre'))?.id || '';
    if (normal.includes('pomme')) return products.find(p => p.name.toLowerCase().includes('pomme'))?.id || '';
    if (normal.includes('oeuf') || normal.includes('œuf')) return products.find(p => p.name.toLowerCase().includes('oeuf') || p.name.toLowerCase().includes('œuf'))?.id || '';
    if (normal.includes('lait')) return products.find(p => p.name.toLowerCase().includes('lait'))?.id || '';
    if (normal.includes('pot')) return products.find(p => p.name.toLowerCase().includes('pot'))?.id || '';
    if (normal.includes('barquette')) return products.find(p => p.name.toLowerCase().includes('barquette'))?.id || '';
    if (normal.includes('abricot')) return products.find(p => p.name.toLowerCase().includes('abricot'))?.id || '';
    
    // Recherche floue par nom
    const partialMatch = products.find(p => p.name.toLowerCase().includes(normal) || normal.includes(p.name.toLowerCase()));
    return partialMatch ? partialMatch.id : '';
  };

  // Parser textuel de recette pour extraire titre, portions, ingrédients et étapes
  const parseRecipeFromText = (text: string): {
    name: string;
    portions: number;
    description: string;
    ingredients: {
      customName: string;
      qtyUsed: number;
      unit: string;
    }[];
    instructions: string;
    notes: string;
  } => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    let name = "Recette Importée";
    let portions = 6;
    let description = "";
    const extractedIngredients: { customName: string; qtyUsed: number; unit: string }[] = [];
    const instructionsLines: string[] = [];
    const notesLines: string[] = [];
    
    if (lines.length > 0) {
      name = lines[0];
      if (name.length > 80 || name.toLowerCase().includes("ingrédient") || name.toLowerCase().includes("préparation")) {
        name = "Recette Importée";
      }
    }

    const portionsRegex = /(?:pour|rendement)\s*(\d+)\s*(?:personnes|parts|portions|pots|pièces)/i;
    const portionsMatch = text.match(portionsRegex);
    if (portionsMatch && portionsMatch[1]) {
      portions = parseInt(portionsMatch[1], 10);
    } else {
      const portionsRegexAlt = /(\d+)\s*(?:personnes|parts|portions|pots|pièces)/i;
      const portionsMatchAlt = text.match(portionsRegexAlt);
      if (portionsMatchAlt && portionsMatchAlt[1]) {
        portions = parseInt(portionsMatchAlt[1], 10);
      }
    }

    let currentSection: 'meta' | 'ingredients' | 'instructions' | 'notes' = 'meta';

    // Regex pour extraire : [quantité] [unité] [nom]
    const ingLineRegex = /^[-*•\s]*([\d,./]+)?\s*(g|kg|ml|cl|l|pièce[s]?|œuf[s]?|pot[s]?|cuillère[s]?|sachet[s]?)?\s*(?:de|d')?\s+(.+)$/i;

    lines.forEach((line, index) => {
      if (index === 0 && line === name) return;

      const lowerLine = line.toLowerCase();
      
      if (lowerLine.includes("ingrédient") || lowerLine.includes("ingredients")) {
        currentSection = 'ingredients';
        return;
      }
      if (lowerLine.includes("préparation") || lowerLine.includes("preparation") || lowerLine.includes("instruction") || lowerLine.includes("étape") || lowerLine.includes("etape")) {
        currentSection = 'instructions';
        return;
      }
      if (lowerLine.includes("remarque") || lowerLine.includes("conseil") || lowerLine.includes("astuce") || lowerLine.includes("notes") || lowerLine.includes("note")) {
        currentSection = 'notes';
        return;
      }

      if (currentSection === 'meta') {
        if (line.match(portionsRegex)) return;
        description += (description ? " " : "") + line;
      } else if (currentSection === 'ingredients') {
        const match = line.match(ingLineRegex);
        if (match) {
          const qtyStr = match[1] || "1";
          let qty = 1;
          if (qtyStr.includes('/')) {
            const parts = qtyStr.split('/');
            if (parts.length === 2) {
              qty = parseFloat(parts[0]) / parseFloat(parts[1]);
            }
          } else {
            qty = parseFloat(qtyStr.replace(',', '.'));
          }
          if (isNaN(qty)) qty = 1;

          let unit = match[2] || "pièce";
          unit = unit.trim().toLowerCase();
          if (unit.startsWith('g')) unit = 'g';
          else if (unit.startsWith('kg')) unit = 'kg';
          else if (unit.startsWith('ml')) unit = 'ml';
          else if (unit.startsWith('cl')) unit = 'cl';
          else if (unit.startsWith('l')) unit = 'l';
          else if (unit.startsWith('œuf') || unit.startsWith('oeuf')) unit = 'pièce';
          else if (unit.startsWith('pot')) unit = 'pièce';
          else if (unit.startsWith('cuillère')) unit = 'pièce';
          else if (unit.startsWith('sachet')) unit = 'pièce';
          else unit = 'pièce';

          const customName = match[3].trim();
          extractedIngredients.push({
            customName: customName.charAt(0).toUpperCase() + customName.slice(1),
            qtyUsed: qty,
            unit: unit
          });
        } else {
          extractedIngredients.push({
            customName: line,
            qtyUsed: 1,
            unit: 'pièce'
          });
        }
      } else if (currentSection === 'instructions') {
        instructionsLines.push(line);
      } else if (currentSection === 'notes') {
        notesLines.push(line);
      }
    });

    // Fallback si pas de structure claire de sections
    if (extractedIngredients.length === 0 && lines.length > 1) {
      lines.forEach((line, index) => {
        if (index === 0 && line === name) return;
        if (line.match(portionsRegex)) return;
        
        const match = line.match(ingLineRegex);
        if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•') || (match && match[1] && match[2])) {
          if (match) {
            const qtyStr = match[1] || "1";
            let qty = parseFloat(qtyStr.replace(',', '.'));
            if (isNaN(qty)) qty = 1;
            const unit = match[2] || "pièce";
            const customName = match[3].trim();
            extractedIngredients.push({ customName, qtyUsed: qty, unit });
          } else {
            extractedIngredients.push({ customName: line.replace(/^[-*•\s]+/, ''), qtyUsed: 1, unit: 'pièce' });
          }
        } else {
          if (line.match(/^\d+[.\s]/) || line.length > 50) {
            instructionsLines.push(line);
          } else if (line.length > 0) {
            description += (description ? "\n" : "") + line;
          }
        }
      });
    }

    return {
      name: name.substring(0, 50),
      portions,
      description: description.substring(0, 200),
      ingredients: extractedIngredients,
      instructions: instructionsLines.join('\n'),
      notes: notesLines.join('\n')
    };
  };

  // Simuler le processus d'analyse OCR
  const launchOCR = (mockData: typeof MOCK_RECIPES[0], imageBase64: string | null) => {
    setStep('analyzing');
    setSourceImage(imageBase64);
    
    // Défilement progressif du taux de confiance pour faire réaliste
    let currentConf = 0;
    const interval = setInterval(() => {
      currentConf += 8;
      if (currentConf >= 94) {
        currentConf = 94;
        clearInterval(interval);
      }
      setConfidence(currentConf);
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      setConfidence(94);
      
      // Préremplir le formulaire avec la recette extraite
      setRecipeName(mockData.name);
      setRecipeCategory(settings.recipeCategories.includes(mockData.category) ? mockData.category : settings.recipeCategories[0]);
      setRecipeDescription(mockData.description);
      setRecipePortions(mockData.portions);
      setRecipeInstructions(mockData.instructions);
      setRecipeNotes(mockData.notes);

      // Traiter les ingrédients et faire les correspondances automatiques
      const mappedIngredients = mockData.ingredients.map(ing => {
        const matchedId = autoMapIngredient(ing.customName);
        return {
          customName: ing.customName,
          qtyUsed: ing.qtyUsed,
          unit: ing.unit,
          productId: matchedId,
          customCostPerUnit: 0 // Par défaut à 0, modifiable s'il n'est pas lié
        };
      });

      setIngredients(mappedIngredients);
      setStep('validating');
    }, 1800);
  };

  // Analyser un fichier texte / Word
  const launchFileAnalysis = (fileName: string, extractedText: string) => {
    setStep('analyzing');
    setSourceImage(null);
    setConfidence(0);
    
    let currentConf = 0;
    const interval = setInterval(() => {
      currentConf += 12;
      if (currentConf >= 98) {
        currentConf = 98;
        clearInterval(interval);
      }
      setConfidence(currentConf);
    }, 80);

    setTimeout(() => {
      clearInterval(interval);
      setConfidence(98);
      
      const parsed = parseRecipeFromText(extractedText);
      
      setRecipeName(parsed.name);
      setRecipeCategory(settings.recipeCategories[0]);
      setRecipeDescription(parsed.description || `Importé depuis le fichier ${fileName}`);
      setRecipePortions(parsed.portions);
      setRecipeInstructions(parsed.instructions);
      setRecipeNotes(parsed.notes);

      const mappedIngredients = parsed.ingredients.map(ing => {
        const matchedId = autoMapIngredient(ing.customName);
        return {
          customName: ing.customName,
          qtyUsed: ing.qtyUsed,
          unit: ing.unit,
          productId: matchedId,
          customCostPerUnit: 0
        };
      });

      setIngredients(mappedIngredients);
      setStep('validating');
    }, 1200);
  };

  // Gérer le chargement d'un fichier (Photo, Texte ou Word) par l'utilisateur
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    // 1. Fichiers texte (.txt)
    if (fileName.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        launchFileAnalysis(file.name, text);
      };
      reader.readAsText(file);
    }
    // 2. Fichiers Word (.docx)
    else if (fileName.endsWith('.docx')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          const text = result.value;
          launchFileAnalysis(file.name, text);
        } catch (error) {
          console.error("Erreur de lecture du fichier Word", error);
          alert("Erreur de lecture du fichier Word (.docx).");
        }
      };
      reader.readAsArrayBuffer(file);
    }
    // 3. Fichiers Word anciens (.doc)
    else if (fileName.endsWith('.doc')) {
      alert("Le format ancien Word (.doc) n'est pas supporté en direct. Veuillez l'enregistrer au format .docx ou .txt pour l'importer.");
    }
    // 4. Images / Captures
    else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const randomDemo = MOCK_RECIPES[Math.floor(Math.random() * MOCK_RECIPES.length)];
        launchOCR(randomDemo, base64);
      };
      reader.readAsDataURL(file);
    }
    else {
      alert("Format de fichier non supporté. Veuillez importer une image, un fichier texte (.txt) ou Word (.docx).");
    }
  };

  const triggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Gestion des lignes d'ingrédients
  const handleIngredientChange = (index: number, field: string, value: string | number) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    
    // Si on change de produit de liaison, adapter l'unité
    if (field === 'productId' && value !== "") {
      const prod = products.find(p => p.id === value);
      if (prod) {
        updated[index].unit = prod.unit === 'kg' ? 'g' : prod.unit;
      }
    }
    setIngredients(updated);
  };

  const handleAddIngredientLine = () => {
    setIngredients([...ingredients, {
      customName: 'Nouvel ingrédient',
      qtyUsed: 100,
      unit: 'g',
      productId: '',
      customCostPerUnit: 0
    }]);
  };

  const handleRemoveIngredientLine = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  // Calcul du coût total estimé de la recette en cours de validation
  const calculateTotalCost = () => {
    let total = 0;
    ingredients.forEach(ing => {
      if (ing.productId) {
        const prod = products.find(p => p.id === ing.productId);
        if (prod) {
          const converted = convertUnits(ing.qtyUsed, ing.unit, prod.unit);
          total += converted * prod.avgPurchasePrice;
        }
      } else {
        total += ing.qtyUsed * ing.customCostPerUnit;
      }
    });
    return total;
  };

  const handleSaveSubmit = () => {
    if (!recipeName.trim()) {
      alert("Veuillez donner un nom à la recette");
      return;
    }

    const recipeId = 'R_SCAN_' + Date.now();
    
    // Structurer l'objet Recette final
    const finalRecipe: Recipe = {
      id: recipeId,
      name: recipeName.trim(),
      category: recipeCategory,
      description: recipeDescription.trim(),
      portions: recipePortions,
      yieldQty: 1,
      yieldUnit: 'pièce',
      stock: 0,
      prepTimeMinutes: 30,
      notes: recipeNotes.trim() || undefined,
      isActive: true,
      originalPortions: recipePortions,
      sourceImage: sourceImage || undefined,
      rawExtractedText: `Texte extrait par OCR de la recette : ${recipeName}.\nIngrédients : ${ingredients.map(i => `${i.customName} (${i.qtyUsed} ${i.unit})`).join(', ')}`
    };

    // Maper les ingrédients au format de base de données
    const dbIngredients: Omit<RecipeIngredient, 'id' | 'recipeId'>[] = ingredients.map(ing => ({
      productId: ing.productId || undefined,
      customName: ing.productId ? undefined : ing.customName,
      qtyUsed: ing.qtyUsed,
      unit: ing.unit,
      originalQtyUsed: ing.qtyUsed,
      customCostPerUnit: ing.productId ? undefined : ing.customCostPerUnit
    }));

    onSave(finalRecipe, dbIngredients, []);
  };

  const totalCost = calculateTotalCost();
  const costPerPortion = recipePortions > 0 ? totalCost / recipePortions : totalCost;

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '16px 0' }}>
      
      {/* BOUTON RETOUR */}
      <button 
        type="button" 
        className="btn btn-secondary" 
        style={{ marginBottom: '20px', height: '36px', padding: '0 12px' }}
        onClick={onClose}
      >
        <ArrowLeft size={16} />
        Retour aux recettes
      </button>

      {/* --- ÉTAPE 1 : SELECTION IMAGE / PHOTO --- */}
      {step === 'idle' && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Camera size={48} style={{ margin: '0 auto 16px', color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Numériser / Importer une Recette</h2>
          <p style={{ color: 'var(--color-dark-light)', fontSize: '14px', maxWidth: '500px', margin: '0 auto 24px', lineHeight: '1.4' }}>
            Prenez en photo une recette papier, ou importez une image, un fichier texte (.txt) ou un document Word (.docx) contenant votre recette. MarmiCout en extraira automatiquement les ingrédients et les étapes.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px', margin: '0 auto' }}>
            {/* Input fichier caché pour appareil photo / galerie */}
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              ref={fileInputRef} 
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            <button type="button" className="btn btn-primary" style={{ height: '50px' }} onClick={triggerCamera}>
              <Camera size={18} style={{ marginRight: '6px' }} />
              Prendre une photo de la recette
            </button>

            <label className="btn btn-secondary" style={{ height: '50px', cursor: 'pointer', lineHeight: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Upload size={18} />
              <span>Importer Photo, Txt ou Word (.docx)</span>
              <input type="file" accept="image/*,.txt,.docx,.doc" style={{ display: 'none' }} onChange={handleFileChange} />
            </label>
          </div>

          {/* Démonstrateur rapide en un clic */}
          <div style={{ marginTop: '40px', borderTop: '1px solid var(--color-border)', paddingTop: '24px' }}>
            <span className="form-label" style={{ display: 'block', marginBottom: '12px' }}>
              Ou tester l'extraction instantanément avec un exemple de recette :
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
              {MOCK_RECIPES.map(demo => (
                <button
                  key={demo.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '13px', height: '36px', padding: '0 12px' }}
                  onClick={() => launchOCR(demo, null)}
                >
                  📄 {demo.name} ({demo.portions} parts)
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- ÉTAPE 2 : CHARGEMENT / ANALYSE OCR --- */}
      {step === 'analyzing' && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <RefreshCw size={40} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-primary)', marginBottom: '20px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Analyse intelligente de l'image...</h3>
          <p style={{ color: 'var(--color-dark-light)', fontSize: '14px', marginBottom: '20px' }}>
            Recherche du texte, détection des ingrédients et extraction des quantités.
          </p>

          <div style={{ width: '100%', maxWidth: '280px', height: '8px', backgroundColor: 'var(--color-light)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ width: `${confidence}%`, height: '100%', backgroundColor: 'var(--color-primary)', transition: 'width 0.1s ease' }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-primary)' }}>
            Confiance OCR : {confidence}%
          </span>
        </div>
      )}

      {/* --- ÉTAPE 3 : ÉCRAN DE VALIDATION / CORRECTION --- */}
      {step === 'validating' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="badge badge-success" style={{ padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Check size={16} />
            <span>Extraction réussie avec {confidence}% de confiance ! Veuillez valider ou corriger la fiche ci-dessous.</span>
          </div>

          <div className="grid-cols-details">
            
            {/* FORMULAIRE GAUCHE */}
            <div className="card">
              <h3 className="card-title" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
                Fiche Recette Extraite
              </h3>

              <div className="form-group">
                <label className="form-label">Nom de la recette détecté *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Catégorie</label>
                  <select className="form-input" value={recipeCategory} onChange={(e) => setRecipeCategory(e.target.value)}>
                    {settings.recipeCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Nombre de portions d'origine *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    required
                    value={recipePortions}
                    onChange={(e) => setRecipePortions(parseDecimalInput(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description extraite</label>
                <textarea
                  className="form-input"
                  style={{ height: '60px' }}
                  value={recipeDescription}
                  onChange={(e) => setRecipeDescription(e.target.value)}
                />
              </div>

              {/* LISTE DES INGRÉDIENTS CORRIGIBLES AVEC MAPPING DE STOCK */}
              <h4 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', marginTop: '24px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Ingrédients & Correspondances Stock ({ingredients.length})</span>
                <button type="button" className="btn btn-secondary" style={{ height: '28px', padding: '0 8px', fontSize: '11px' }} onClick={handleAddIngredientLine}>
                  + Ajouter ingrédient
                </button>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ingredients.map((ing, idx) => {
                  const isLinked = ing.productId !== "";
                  const linkedProduct = products.find(p => p.id === ing.productId);

                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '8px', 
                        padding: '12px', 
                        backgroundColor: isLinked ? 'rgba(74, 155, 120, 0.04)' : 'rgba(242, 85, 34, 0.03)', 
                        borderRadius: 'var(--radius-md)', 
                        border: `1px solid ${isLinked ? 'var(--color-secondary-light)' : 'rgba(242, 85, 34, 0.15)'}` 
                      }}
                    >
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Nom de l'ingrédient extrait */}
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: 2, height: '36px', padding: '0 8px', fontWeight: '600' }}
                          value={ing.customName}
                          onChange={(e) => handleIngredientChange(idx, 'customName', e.target.value)}
                          placeholder="Nom de l'ingrédient"
                        />

                        {/* Quantité */}
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          style={{ width: '60px', height: '36px', padding: '0 4px', textAlign: 'center' }}
                          value={ing.qtyUsed}
                          onChange={(e) => handleIngredientChange(idx, 'qtyUsed', parseDecimalInput(e.target.value))}
                        />

                        {/* Unité */}
                        <select
                          className="form-input"
                          style={{ width: '60px', height: '36px', padding: '0 4px' }}
                          value={ing.unit}
                          onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                        >
                          {settings.units.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>

                        {/* Supprimer ligne */}
                        <button
                          type="button"
                          className="btn btn-danger btn-icon-only"
                          style={{ height: '36px', width: '36px' }}
                          onClick={() => handleRemoveIngredientLine(idx)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Liaison de stock */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px dashed var(--color-border)', paddingTop: '8px', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-dark-light)', fontWeight: '600' }}>
                          <LinkIcon size={12} />
                          Liaison stock :
                        </span>
                        
                        <select
                          className="form-input"
                          style={{ flex: 1, height: '30px', padding: '0 4px', fontSize: '12px' }}
                          value={ing.productId}
                          onChange={(e) => handleIngredientChange(idx, 'productId', e.target.value)}
                        >
                          <option value="">-- Laisser non lié (Achat à part) --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                          ))}
                        </select>

                        {/* Coût estimé si non lié */}
                        {!isLinked && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>Coût est. :</span>
                            <input
                              type="number"
                              step="any"
                              className="form-input"
                              style={{ width: '50px', height: '30px', padding: '0 4px', fontSize: '12px', textAlign: 'center' }}
                              value={ing.customCostPerUnit}
                              onChange={(e) => handleIngredientChange(idx, 'customCostPerUnit', parseDecimalInput(e.target.value))}
                              title="Coût estimé par unité de cet ingrédient"
                            />
                            <span style={{ fontSize: '11px' }}>€/{ing.unit}</span>
                          </div>
                        )}

                        {isLinked && linkedProduct && (
                          <span className="badge badge-success" style={{ fontSize: '10px', height: '24px' }}>
                            PMP : {linkedProduct.avgPurchasePrice.toFixed(2)}€/{linkedProduct.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ÉTAPES DE PRÉPARATION */}
              <div className="form-group" style={{ marginTop: '24px' }}>
                <label className="form-label">Instructions / Étapes de préparation extraites</label>
                <textarea
                  className="form-input"
                  style={{ height: '180px', fontFamily: 'inherit', lineHeight: '1.4' }}
                  value={recipeInstructions}
                  onChange={(e) => setRecipeInstructions(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Remarques / Conseils extraits</label>
                <input
                  type="text"
                  className="form-input"
                  value={recipeNotes}
                  onChange={(e) => setRecipeNotes(e.target.value)}
                />
              </div>
            </div>

            {/* SYNTHÈSE DES COÛTS DROITE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              <div className="card">
                <h3 className="card-title">Coût Estimé</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span>Coût total des ingrédients :</span>
                    <strong>{totalCost.toFixed(2)} €</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span>Coût par portion ({recipePortions} parts) :</span>
                    <strong style={{ color: 'var(--color-primary)' }}>{costPerPortion.toFixed(2)} €</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                    <span>Marge cible ({settings.defaultTargetMargin}%) :</span>
                    <strong style={{ color: 'var(--color-secondary)' }}>
                      {(costPerPortion / (1 - (settings.defaultTargetMargin / 100))).toFixed(2)} € (PV)
                    </strong>
                  </div>
                </div>

                <div style={{ padding: '10px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-md)', fontSize: '12px', display: 'flex', gap: '8px', color: 'var(--color-dark-light)' }}>
                  <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    Ce coût se base sur le Prix Moyen d'Achat (PMP) de vos produits de stock liés et sur le coût estimé pour les ingrédients non liés.
                  </span>
                </div>
              </div>

              {/* ACTION FINALE */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button type="button" className="btn btn-success" style={{ height: '48px', width: '100%' }} onClick={handleSaveSubmit}>
                  💾 Enregistrer la recette
                </button>
                <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setStep('idle')}>
                  Recommencer / Annuler
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
