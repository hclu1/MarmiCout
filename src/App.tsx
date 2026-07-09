import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ChefHat,
  Sparkles,
  DollarSign,
  Store,
  Settings as SettingsIcon,
  AlertTriangle,
  Plus,
  Camera
} from 'lucide-react';
import './App.css'; // Nous allons vider ce fichier pour éviter les conflits

// Importation des composants
import { Dashboard } from './components/Dashboard';
import { Products } from './components/Products';
import { Purchases } from './components/Purchases';
import { Recipes } from './components/Recipes';
import { Productions } from './components/Productions';
import { Sales } from './components/Sales';
import { Stores } from './components/Stores';
import { Settings } from './components/Settings';
import { Drawer } from './components/Drawer';

import { dbService, getActiveTesterCode } from './services/db';
import { APP_VERSION } from './version';

type Tab = 'Dashboard' | 'Produits' | 'Achats' | 'Recettes' | 'Production' | 'Ventes' | 'Magasins' | 'Paramètres';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const [tabExtraData, setTabExtraData] = useState<Record<string, unknown> | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [isMobileActionOpen, setIsMobileActionOpen] = useState(false);

  // Mettre à jour le nombre d'alertes de stock
  const updateAlerts = () => {
    const products = dbService.getProducts();
    const lowStock = products.filter(p => p.isActive && p.stock <= p.minStockAlert).length;
    setLowStockCount(lowStock);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateAlerts();
    // Rafraîchir toutes les 5 secondes ou à chaque changement d'onglet
    const interval = setInterval(updateAlerts, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Gérer la navigation inter-onglets avec paramètres
  const handleNavigate = (tab: string, extraData?: Record<string, unknown>) => {
    setActiveTab(tab as Tab);
    if (extraData) {
      setTabExtraData(extraData);
    } else {
      setTabExtraData(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Effacer les données supplémentaires après le rendu pour éviter de les réappliquer en boucle
  useEffect(() => {
    if (tabExtraData !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTabExtraData(null);
    }
  }, [tabExtraData]);

  // Liste des liens de navigation principale
  const menuItems = [
    { id: 'Dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'Produits', label: 'Produits & Stocks', icon: Package, badge: () => lowStockCount > 0 ? lowStockCount : undefined },
    { id: 'Achats', label: 'Achats & Entrées', icon: ShoppingCart },
    { id: 'Recettes', label: 'Recettes & Marges', icon: ChefHat },
    { id: 'Production', label: 'Productions Lot', icon: Sparkles },
    { id: 'Ventes', label: 'Ventes & Profits', icon: DollarSign },
    { id: 'Magasins', label: 'Fournisseurs', icon: Store },
    { id: 'Paramètres', label: 'Paramètres & Sync', icon: SettingsIcon }
  ];

  // Rendu de la vue active
  const renderActiveView = () => {
    const extra = tabExtraData;

    switch (activeTab) {
      case 'Dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      case 'Produits':
        return (
          <Products
            initialTriggerAdd={extra?.triggerAdd as any}
            onNavigate={handleNavigate}
          />
        );
      case 'Achats':
        return (
          <Purchases
            initialTriggerScan={extra?.triggerScan as any}
            initialPrefillProductId={extra?.prefillProductId as any}
          />
        );
      case 'Recettes':
        return (
          <Recipes
            initialTriggerAdd={extra?.triggerAdd as any}
            initialViewRecipeId={extra?.viewRecipeId as any}
          />
        );
      case 'Production':
        return <Productions initialTriggerAdd={extra?.triggerAdd as any} />;
      case 'Ventes':
        return <Sales initialTriggerAdd={extra?.triggerAdd as any} />;
      case 'Magasins':
        return <Stores />;
      case 'Paramètres':
        return <Settings />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  const currentSettings = dbService.getSettings();

  return (
    <div className="app-container">

      {/* --- SIDEBAR LATÉRALE (PC / TABLETTE HORIZONTALE) --- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <ChefHat size={28} style={{ color: 'var(--color-primary)' }} />
          <span className="logo-text">MarmiCout</span>
        </div>

        <nav className="sidebar-menu">
          <ul>
            {menuItems.map(item => {
              const IconComponent = item.icon;
              const isActive = activeTab === item.id;
              const badgeVal = item.badge ? item.badge() : undefined;

              return (
                <li key={item.id} className="menu-item">
                  <a
                    href={`#${item.id}`}
                    className={`menu-link ${isActive ? 'active' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleNavigate(item.id);
                    }}
                  >
                    <IconComponent size={20} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {badgeVal !== undefined && (
                      <span className="badge badge-danger" style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '10px' }}>
                        {badgeVal}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div>{currentSettings.businessName}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-dark-light)', marginTop: '2px' }}>
            MarmiCout V.{APP_VERSION}
          </div>
          {(() => {
            const code = getActiveTesterCode();
            return code ? (
              <div style={{
                marginTop: '8px',
                padding: '4px 8px',
                backgroundColor: 'var(--color-warning-light)',
                color: 'var(--color-warning)',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                textAlign: 'center',
                border: '1px solid rgba(242, 185, 34, 0.2)'
              }}>
                🧪 Espace Testeur : {code.toUpperCase()}
              </div>
            ) : null;
          })()}
        </div>
      </aside>

      {/* --- HEADER GLOBAL (MOBILE SENSITIVE) --- */}
      <main className="main-content">

        {/* Avertissement de stock faible persistant dans le header mobile */}
        {lowStockCount > 0 && activeTab !== 'Produits' && (
          <div
            onClick={() => handleNavigate('Produits')}
            style={{
              backgroundColor: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              marginBottom: '20px',
              border: '1px solid rgba(255, 75, 75, 0.15)'
            }}
          >
            <AlertTriangle size={16} />
            <span>Attention : {lowStockCount} produit(s) en stock faible ou nul. Gérer</span>
          </div>
        )}

        {/* Rendu du composant React actif */}
        {renderActiveView()}

        {/* Pied de page global avec version */}
        <footer style={{
          textAlign: 'center',
          padding: '24px 0 40px',
          fontSize: '11px',
          color: 'var(--color-dark-light)',
          borderTop: '1px solid var(--color-border)',
          marginTop: '40px'
        }}>
          <div>© {new Date().getFullYear()} MarmiCout — Logiciel de gestion Traiteur & Plats Cuisinés</div>
          <div style={{ marginTop: '4px', fontWeight: 'bold' }}>Version V.{APP_VERSION}</div>
        </footer>
      </main>

      {/* --- TABBAR DE NAVIGATION BASSE (MOBILE) --- */}
      <nav className="tabbar">
        <a
          href="#Dashboard"
          className={`tabbar-item ${activeTab === 'Dashboard' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleNavigate('Dashboard'); }}
        >
          <LayoutDashboard size={20} />
          <span>Accueil</span>
        </a>

        <a
          href="#Produits"
          className={`tabbar-item ${activeTab === 'Produits' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleNavigate('Produits'); }}
        >
          <div style={{ position: 'relative' }}>
            <Package size={20} />
            {lowStockCount > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-danger)' }} />
            )}
          </div>
          <span>Stocks</span>
        </a>

        {/* Bouton Central de Scan / Ajout rapide mobile */}
        <button
          className="tabbar-item tabbar-item-center"
          onClick={() => setIsMobileActionOpen(true)}
          aria-label="Actions rapides"
        >
          <Plus size={24} />
        </button>

        <a
          href="#Recettes"
          className={`tabbar-item ${activeTab === 'Recettes' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleNavigate('Recettes'); }}
        >
          <ChefHat size={20} />
          <span>Recettes</span>
        </a>

        <a
          href="#Ventes"
          className={`tabbar-item ${activeTab === 'Ventes' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleNavigate('Ventes'); }}
        >
          <DollarSign size={20} />
          <span>Ventes</span>
        </a>
      </nav>

      {/* --- DRAWER D'ACTIONS RAPIDES POUR MOBILE --- */}
      <Drawer
        title="Actions rapides"
        isOpen={isMobileActionOpen}
        onClose={() => setIsMobileActionOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>

          <button
            className="btn btn-primary"
            style={{ height: '54px', fontSize: '15px', justifyContent: 'flex-start', paddingLeft: '20px' }}
            onClick={() => {
              setIsMobileActionOpen(false);
              handleNavigate('Achats', { triggerScan: true });
            }}
          >
            <Camera size={20} style={{ marginRight: '12px' }} />
            Scanner un code-barres (Achat)
          </button>

          <button
            className="btn btn-secondary"
            style={{ height: '50px', justifyContent: 'flex-start', paddingLeft: '20px' }}
            onClick={() => {
              setIsMobileActionOpen(false);
              handleNavigate('Ventes', { triggerAdd: true });
            }}
          >
            <DollarSign size={18} style={{ marginRight: '12px', color: 'var(--color-secondary)' }} />
            Enregistrer une vente
          </button>

          <button
            className="btn btn-secondary"
            style={{ height: '50px', justifyContent: 'flex-start', paddingLeft: '20px' }}
            onClick={() => {
              setIsMobileActionOpen(false);
              handleNavigate('Production', { triggerAdd: true });
            }}
          >
            <Sparkles size={18} style={{ marginRight: '12px', color: 'var(--color-warning)' }} />
            Déclarer une production
          </button>

          <button
            className="btn btn-secondary"
            style={{ height: '50px', justifyContent: 'flex-start', paddingLeft: '20px' }}
            onClick={() => {
              setIsMobileActionOpen(false);
              handleNavigate('Produits', { triggerAdd: true });
            }}
          >
            <Package size={18} style={{ marginRight: '12px' }} />
            Créer un nouvel ingrédient
          </button>

          <button
            className="btn btn-secondary"
            style={{ height: '50px', justifyContent: 'flex-start', paddingLeft: '20px' }}
            onClick={() => {
              setIsMobileActionOpen(false);
              handleNavigate('Paramètres');
            }}
          >
            <SettingsIcon size={18} style={{ marginRight: '12px' }} />
            Aller aux paramètres
          </button>

          <button
            className="btn btn-danger"
            style={{ height: '44px', marginTop: '12px' }}
            onClick={() => setIsMobileActionOpen(false)}
          >
            Fermer
          </button>

        </div>
      </Drawer>

    </div>
  );
}

export default App;
