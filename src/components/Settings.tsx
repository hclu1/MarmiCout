import React, { useState } from 'react';
import { parseDecimalInput } from '../utils';
import { 
  Settings as SettingsIcon, 
  Download, 
  Upload, 
  RotateCcw, 
  Check,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { dbService } from '../services/db';
import { Settings as SettingsType } from '../types';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsType>(dbService.getSettings());
  const [saveSuccess, setSaveSuccess] = useState(false);

  // États pour l'importateur CSV
  const [importTable, setImportTable] = useState<string>('PRODUCTS');
  const [importMerge, setImportMerge] = useState<boolean>(true);
  const [importText, setImportText] = useState<string>('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  // États pour la synchronisation Google Sheets en direct
  const [googleSheetId, setGoogleSheetId] = useState(settings.googleSheetId || '');
  const [googleSheetLink, setGoogleSheetLink] = useState(settings.googleSheetLink || '');
  const [googleWebAppUrl, setGoogleWebAppUrl] = useState(settings.googleWebAppUrl || '');
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  const [isPushing, setIsPushing] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushStatus, setPushStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  // Champs de saisie simple
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [currency, setCurrency] = useState(settings.currency);
  const [defaultMargin, setDefaultMargin] = useState(settings.defaultTargetMargin);
  const [minStock, setMinStock] = useState(settings.defaultMinStockAlert);

  // Listes sous forme de texte (une ligne par item)
  const [categoriesText, setCategoriesText] = useState(settings.categories.join('\n'));
  const [recipeCategoriesText, setRecipeCategoriesText] = useState(settings.recipeCategories.join('\n'));
  const [unitsText, setUnitsText] = useState(settings.units.join('\n'));
  const [locationsText, setLocationsText] = useState(settings.salesLocations.join('\n'));

  // Enregistrer les paramètres
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    
    const updatedSettings: SettingsType = {
      businessName: businessName.trim(),
      currency: currency.trim(),
      defaultTargetMargin: Number(defaultMargin),
      defaultMinStockAlert: Number(minStock),
      categories: categoriesText.split('\n').map(c => c.trim()).filter(c => c.length > 0),
      recipeCategories: recipeCategoriesText.split('\n').map(c => c.trim()).filter(c => c.length > 0),
      units: unitsText.split('\n').map(c => c.trim()).filter(c => c.length > 0),
      salesLocations: locationsText.split('\n').map(c => c.trim()).filter(c => c.length > 0),
      googleSheetId: googleSheetId.trim(),
      googleSheetLink: googleSheetLink.trim(),
      googleWebAppUrl: googleWebAppUrl.trim()
    };

    dbService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Exporter en CSV
  const handleExportCSV = (tableKey: Parameters<typeof dbService.exportToCSV>[0], fileName: string) => {
    const csvContent = dbService.exportToCSV(tableKey);
    if (!csvContent) {
      alert("Aucune donnée disponible dans cette table.");
      return;
    }

    // Ajouter le BOM UTF-8 (\uFEFF) pour forcer Excel / Google Sheets à lire correctement les accents français !
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Importer le CSV manuellement
  const handleImportCSVSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) {
      setImportStatus({ type: 'error', message: 'Veuillez coller le contenu CSV ou charger un fichier.' });
      return;
    }

    const result = dbService.importFromCSV(
      importTable as Parameters<typeof dbService.importFromCSV>[0],
      importText,
      importMerge
    );

    if (result.success) {
      setImportStatus({ 
        type: 'success', 
        message: `Import réussi ! ${result.count} ligne(s) synchronisée(s) dans la table.` 
      });
      setImportText('');
    } else {
      setImportStatus({ 
        type: 'error', 
        message: `Erreur d'importation : ${result.error}` 
      });
    }
  };

  // Synchronisation Google Sheets en temps réel
  const handleSyncLiveGoogleSheets = async () => {
    if (!googleSheetId.trim()) {
      setSyncStatus({ type: 'error', message: "Veuillez renseigner l'ID ou le lien de votre Google Sheet." });
      return;
    }
    
    setIsSyncing(true);
    setSyncStatus({ type: null, message: '' });
    setSyncMessage("Démarrage de la synchronisation...");

    const sheetsToSync = [
      { key: 'PRODUCTS', name: 'Produits' },
      { key: 'PURCHASES', name: 'Achats' },
      { key: 'STORES', name: 'Magasins' },
      { key: 'RECIPES', name: 'Recettes' },
      { key: 'RECIPE_INGREDIENTS', name: 'Recette_Ingredients' },
      { key: 'RECIPE_PACKAGING', name: 'Recette_Emballages' },
      { key: 'PRODUCTIONS', name: 'Productions' },
      { key: 'SALES', name: 'Ventes' },
      { key: 'STOCK_MOVEMENTS', name: 'Mouvements_Stock' }
    ];

    let successCount = 0;
    const errors: string[] = [];

    for (const sheet of sheetsToSync) {
      setSyncMessage(`Import de la table : ${sheet.name}...`);
      try {
        // API Google Sheets gviz pour obtenir du CSV directement sans jeton OAuth
        const url = `https://docs.google.com/spreadsheets/d/${googleSheetId.trim()}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet.name)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Erreur réseau (${response.status})`);
        }
        
        const csvText = await response.text();

        // Si la réponse contient de l'HTML, c'est que Google Sheets demande une authentification
        if (csvText.includes("<!doctype html>") || csvText.includes("<html") || csvText.includes("Sign in")) {
          throw new Error("Feuille inaccessible. Assurez-vous d'avoir configuré le partage en 'Tous les utilisateurs disposant du lien peuvent lire'.");
        }

        const importResult = dbService.importFromCSV(sheet.key as Parameters<typeof dbService.importFromCSV>[0], csvText, false); // Écrasement total local
        if (importResult.success) {
          successCount++;
        } else {
          throw new Error(importResult.error || "Format de données invalide");
        }
      } catch (err: unknown) {
        errors.push(`${sheet.name} : ${(err as Error).message || 'Erreur inconnue'}`);
      }
    }

    setIsSyncing(false);
    if (successCount === sheetsToSync.length) {
      setSyncStatus({
        type: 'success',
        message: `Synchronisation réussie ! Les 9 tables de données ont été mises à jour avec succès depuis votre Google Sheets.`
      });
      // Rafraîchir les alertes globales de l'application
      window.dispatchEvent(new Event('storage'));
    } else {
      setSyncStatus({
        type: 'error',
        message: `Synchronisation partielle (${successCount}/9 feuilles importées). Échecs :\n- ${errors.join('\n- ')}\n\n💡 Vérifications requises :\n1. Le partage de votre Google Sheet doit être réglé sur 'Tous les utilisateurs disposant du lien' en Lecteur.\n2. Le script d'initialisation Apps Script doit avoir été exécuté dans Sheets pour nommer les onglets.`
      });
    }
  };

  // Exporter / Pousser les données locales de l'App vers Google Sheets
  const handlePushLiveGoogleSheets = async () => {
    if (!googleWebAppUrl.trim()) {
      setPushStatus({ type: 'error', message: "Veuillez renseigner l'URL Web App de votre Apps Script." });
      return;
    }
    
    setIsPushing(true);
    setPushStatus({ type: null, message: '' });
    setPushMessage("Collecte des données locales...");

    try {
      // Regrouper toutes les tables de localStorage
      const payload = {
        PRODUCTS: JSON.parse(localStorage.getItem('marmicout_products') || '[]'),
        PURCHASES: JSON.parse(localStorage.getItem('marmicout_purchases') || '[]'),
        STORES: JSON.parse(localStorage.getItem('marmicout_stores') || '[]'),
        RECIPES: JSON.parse(localStorage.getItem('marmicout_recipes') || '[]'),
        RECIPE_INGREDIENTS: JSON.parse(localStorage.getItem('marmicout_recipe_ingredients') || '[]'),
        RECIPE_PACKAGING: JSON.parse(localStorage.getItem('marmicout_recipe_packaging') || '[]'),
        PRODUCTIONS: JSON.parse(localStorage.getItem('marmicout_productions') || '[]'),
        SALES: JSON.parse(localStorage.getItem('marmicout_sales') || '[]'),
        STOCK_MOVEMENTS: JSON.parse(localStorage.getItem('marmicout_stock_movements') || '[]')
      };

      setPushMessage("Envoi des données vers Google Sheets...");

      // Requête POST vers la Web App Apps Script
      // On utilise 'no-cors' pour éviter que le navigateur bloque la redirection de script.google.com vers script.googleusercontent.com
      await fetch(googleWebAppUrl.trim(), {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(payload)
      });

      // Avec 'no-cors', la réponse réseau est opaque (on ne peut pas lire le corps ni le statut).
      // Si aucune exception n'est levée, l'envoi a réussi côté client.
      setIsPushing(false);
      setPushStatus({
        type: 'success',
        message: "Envoi réussi ! Vos données locales (ingrédients, achats, recettes, ventes...) ont été envoyées vers votre Google Sheet.\n\n💡 Actualisez votre document Google Sheets pour voir les données s'afficher !"
      });

    } catch (err: unknown) {
      setIsPushing(false);
      setPushStatus({
        type: 'error',
        message: `Erreur d'envoi : ${(err as Error).message || 'Erreur de connexion réseau'}`
      });
    }
  };

  // Gérer le chargement d'un fichier CSV local
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportText(text);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Réinitialiser la base de données aux valeurs de démo
  const handleResetData = () => {
    if (window.confirm("⚠️ Attention : cela écrasera toutes vos modifications actuelles pour restaurer les recettes et produits de démonstration. Continuer ?")) {
      dbService.resetToDefault();
      window.location.reload();
    }
  };

  return (
    <div>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres & Google Sheets</h1>
          <p className="page-subtitle">Configurez votre application culinaire et synchronisez vos données avec Google Sheets</p>
        </div>
      </div>

      <div className="grid-cols-details">
        
        {/* --- FORMULAIRE DES PARAMÈTRES --- */}
        <div className="card">
          <h3 className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SettingsIcon size={20} />
              Configuration Générale
            </span>
          </h3>

          <form onSubmit={handleSaveSettings}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom de l'activité culinaire</label>
                <input
                  type="text"
                  className="form-input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Devise monétaire</label>
                <input
                  type="text"
                  className="form-input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marge cible par défaut (%)</label>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  max="100"
                  value={defaultMargin}
                  onChange={(e) => setDefaultMargin(parseDecimalInput(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Seuil d'alerte stock par défaut</label>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(parseDecimalInput(e.target.value))}
                />
              </div>
            </div>

            {/* --- CHAMP INTEGRATION GOOGLE SHEETS DIRECT --- */}
            <h4 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', marginTop: '24px', marginBottom: '12px' }}>
              Intégration Google Sheets
            </h4>
            
            <div className="form-group">
              <label className="form-label">Lien de votre Google Sheet</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: https://docs.google.com/spreadsheets/d/.../edit"
                value={googleSheetLink}
                onChange={(e) => {
                  setGoogleSheetLink(e.target.value);
                  // Extraire l'ID automatiquement
                  const match = e.target.value.match(/\/d\/([a-zA-Z0-9-_]+)/);
                  if (match && match[1]) {
                    setGoogleSheetId(match[1]);
                  }
                }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">ID du classeur Google Sheet (Extrait du lien)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: 1SU8ypH5aufwKVoZLlCfhcw6nwd..."
                value={googleSheetId}
                onChange={(e) => setGoogleSheetId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">URL de l'App Script (Web App pour l'exportation)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: https://script.google.com/macros/s/.../exec"
                value={googleWebAppUrl}
                onChange={(e) => setGoogleWebAppUrl(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: 'var(--color-dark-light)', marginTop: '4px', display: 'block' }}>
                💡 Requis pour pouvoir pousser automatiquement vos données de MarmiCout vers votre Google Sheet.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">Catégories de produits (1 par ligne)</label>
                <textarea
                  className="form-input"
                  style={{ height: '100px' }}
                  value={categoriesText}
                  onChange={(e) => setCategoriesText(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Catégories de recettes (1 par ligne)</label>
                <textarea
                  className="form-input"
                  style={{ height: '100px' }}
                  value={recipeCategoriesText}
                  onChange={(e) => setRecipeCategoriesText(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Unités acceptées (1 par ligne)</label>
                <textarea
                  className="form-input"
                  style={{ height: '100px' }}
                  value={unitsText}
                  onChange={(e) => setUnitsText(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Lieux de vente (1 par ligne)</label>
                <textarea
                  className="form-input"
                  style={{ height: '100px' }}
                  value={locationsText}
                  onChange={(e) => setLocationsText(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '20px' }}>
              <button type="submit" className="btn btn-primary">Enregistrer les paramètres</button>
              {saveSuccess && (
                <span className="badge badge-success" style={{ padding: '8px 12px' }}>
                  <Check size={14} style={{ marginRight: '4px' }} /> Paramètres sauvegardés
                </span>
              )}
            </div>
          </form>
        </div>

        {/* --- GOOGLE SHEETS : SYNCHRONISATION EN DIRECT & IMPORTS/EXPORTS --- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Synchronisation en direct */}
          <div className="card" style={{ borderLeft: '4px solid var(--color-secondary)' }}>
            <h3 className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={20} className={isSyncing || isPushing ? 'scan-glow' : ''} style={{ animation: (isSyncing || isPushing) ? 'spin 2s linear infinite' : 'none' }} />
                Synchronisation Google Sheets
              </span>
            </h3>
            
            <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', marginBottom: '16px' }}>
              Synchronisez vos 9 tables de données en direct avec votre document Google Sheets.
            </p>

            {googleSheetId ? (
              <div style={{ marginBottom: '16px', fontSize: '12px', wordBreak: 'break-all', padding: '10px', backgroundColor: 'var(--color-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <strong>ID Google Sheet détecté :</strong> {googleSheetId}
                <br />
                <a href={googleSheetLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'inline-block', marginTop: '4px' }}>
                  Ouvrir votre document Google Sheets ↗
                </a>
              </div>
            ) : (
              <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--color-danger)' }}>
                ⚠️ Renseignez le lien de votre Google Sheet dans le formulaire à gauche pour activer la synchronisation.
              </div>
            )}

            {/* --- SECTION IMPORT (SHEET ➜ APP) --- */}
            <h5 style={{ fontSize: '13px', fontWeight: 'bold', margin: '12px 0 6px 0', color: 'var(--color-primary)' }}>
              📥 Importer depuis Google Sheets (Sheet ➜ App)
            </h5>
            
            {syncStatus.message && (
              <div 
                className="badge" 
                style={{ 
                  display: 'flex', 
                  width: '100%', 
                  padding: '10px', 
                  marginBottom: '10px',
                  whiteSpace: 'pre-line',
                  textAlign: 'left',
                  lineHeight: '1.4',
                  backgroundColor: syncStatus.type === 'success' ? 'var(--color-secondary-light)' : 'var(--color-danger-light)',
                  color: syncStatus.type === 'success' ? 'var(--color-secondary)' : 'var(--color-danger)',
                  borderColor: 'rgba(0,0,0,0.05)'
                }}
              >
                {syncStatus.message}
              </div>
            )}

            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ width: '100%', marginBottom: '20px' }}
              disabled={isSyncing || isPushing || !googleSheetId}
              onClick={handleSyncLiveGoogleSheets}
            >
              {isSyncing ? (
                <>
                  <RotateCcw size={16} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} />
                  {syncMessage}
                </>
              ) : (
                '🔄 Importer en direct de Google Sheets'
              )}
            </button>

            {/* --- SECTION EXPORT (APP ➜ SHEET) --- */}
            <h5 style={{ fontSize: '13px', fontWeight: 'bold', margin: '12px 0 6px 0', color: 'var(--color-secondary)' }}>
              📤 Exporter vers Google Sheets (App ➜ Sheet)
            </h5>
            
            <p style={{ fontSize: '12px', color: 'var(--color-dark-light)', marginBottom: '10px' }}>
              Envoie toutes les données actuellement affichées dans MarmiCout vers votre Google Sheet.
            </p>

            {pushStatus.message && (
              <div 
                className="badge" 
                style={{ 
                  display: 'flex', 
                  width: '100%', 
                  padding: '10px', 
                  marginBottom: '10px',
                  whiteSpace: 'pre-line',
                  textAlign: 'left',
                  lineHeight: '1.4',
                  backgroundColor: pushStatus.type === 'success' ? 'var(--color-secondary-light)' : 'var(--color-danger-light)',
                  color: pushStatus.type === 'success' ? 'var(--color-secondary)' : 'var(--color-danger)',
                  borderColor: 'rgba(0,0,0,0.05)'
                }}
              >
                {pushStatus.message}
              </div>
            )}

            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ width: '100%', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
              disabled={isSyncing || isPushing || !googleWebAppUrl}
              onClick={handlePushLiveGoogleSheets}
            >
              {isPushing ? (
                <>
                  <RotateCcw size={16} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} />
                  {pushMessage}
                </>
              ) : (
                '📤 Envoyer mes données vers Google Sheets'
              )}
            </button>

            {!googleWebAppUrl && (
              <div style={{ fontSize: '11px', color: 'var(--color-dark-light)', marginTop: '8px', fontStyle: 'italic' }}>
                💡 Pour activer l'envoi direct, renseignez l'URL de votre Web App Apps Script dans le formulaire de gauche.
              </div>
            )}
          </div>

          {/* Section Exporter */}
          <div className="card">
            <h3 className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={20} />
                Exporter pour Google Sheets
              </span>
            </h3>
            
            <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', marginBottom: '16px' }}>
              Téléchargez vos données au format CSV. Le fichier utilise le point-virgule <code>;</code> pour une compatibilité parfaite avec Google Sheets et Excel France.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('PRODUCTS', 'marmi_produits')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Produits & Stocks</span>
                <Download size={14} />
              </button>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('PURCHASES', 'marmi_achats')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Historique des Achats</span>
                <Download size={14} />
              </button>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('RECIPES', 'marmi_recettes')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Recettes Principales</span>
                <Download size={14} />
              </button>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('RECIPE_INGREDIENTS', 'marmi_recettes_ingredients')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Recettes (Ingrédients)</span>
                <Download size={14} />
              </button>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('RECIPE_PACKAGING', 'marmi_recettes_emballages')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Recettes (Emballages)</span>
                <Download size={14} />
              </button>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('PRODUCTIONS', 'marmi_fabrications')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Productions</span>
                <Download size={14} />
              </button>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('SALES', 'marmi_ventes')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Ventes & Recettes</span>
                <Download size={14} />
              </button>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }} onClick={() => handleExportCSV('STORES', 'marmi_fournisseurs')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Fournisseurs</span>
                <Download size={14} />
              </button>
            </div>
          </div>

          {/* Section Importer Manuelle */}
          <div className="card">
            <h3 className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={20} />
                Import Manuel (Coller CSV)
              </span>
            </h3>
            
            <form onSubmit={handleImportCSVSubmit}>
              <div className="form-group">
                <label className="form-label">Table de destination</label>
                <select className="form-input" value={importTable} onChange={(e) => setImportTable(e.target.value)}>
                  <option value="PRODUCTS">Produits (Matières premières)</option>
                  <option value="PURCHASES">Achats</option>
                  <option value="RECIPES">Recettes</option>
                  <option value="SALES">Ventes</option>
                  <option value="STORES">Fournisseurs</option>
                </select>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  id="importMerge"
                  checked={importMerge}
                  onChange={(e) => setImportMerge(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <label className="form-label" htmlFor="importMerge" style={{ cursor: 'pointer', marginBottom: 0 }}>
                  Fusionner (écraser si ID identique, sinon ajouter)
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Fichier CSV (.csv)</label>
                <input
                  type="file"
                  accept=".csv"
                  className="form-input"
                  style={{ padding: '8px', height: 'auto' }}
                  onChange={handleFileChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Ou collez directement le texte CSV ici :</label>
                <textarea
                  className="form-input"
                  style={{ height: '80px', fontSize: '11px', fontFamily: 'monospace' }}
                  placeholder="id;barcode;name;category;unit..."
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </div>

              {importStatus.type && (
                <div 
                  className="badge" 
                  style={{ 
                    display: 'flex', 
                    width: '100%', 
                    padding: '8px 12px', 
                    marginBottom: '12px',
                    backgroundColor: importStatus.type === 'success' ? 'var(--color-secondary-light)' : 'var(--color-danger-light)',
                    color: importStatus.type === 'success' ? 'var(--color-secondary)' : 'var(--color-danger)'
                  }}
                >
                  {importStatus.message}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Lancer l'importation manuelle
              </button>
            </form>
          </div>

          {/* Réinitialisation de sécurité */}
          <div className="card" style={{ borderColor: 'rgba(255, 75, 75, 0.2)' }}>
            <h3 className="card-title" style={{ color: 'var(--color-danger)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} />
                Zone de Danger
              </span>
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-dark-light)', marginBottom: '16px' }}>
              Vous pouvez réinitialiser l'application pour effacer vos données et remettre les données de démonstration de tartes et confitures de Marmie.
            </p>
            <button type="button" className="btn btn-danger" style={{ width: '100%' }} onClick={handleResetData}>
              <RotateCcw size={16} style={{ marginRight: '6px' }} />
              Réinitialiser les données de démo
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
