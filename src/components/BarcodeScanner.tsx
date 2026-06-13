import React, { useState, useEffect } from 'react';
import { Camera, RefreshCw, X, HelpCircle, Check } from 'lucide-react';
import { dbService } from '../services/db';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('Prêt à scanner');
  const [cameraActive, setCameraActive] = useState(false);

  // Synthèse d'un bip de caisse enregistreuse
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime); // Fréquence de 1200Hz
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.log('Audio beep non supporté ou bloqué par le navigateur', e);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      playBeep();
      onScan(manualCode.trim());
      setManualCode('');
    }
  };

  const startDemoScan = (barcode: string, productName: string) => {
    setScanning(true);
    setScanMessage(`Analyse de l'article : ${productName}...`);
    
    setTimeout(() => {
      playBeep();
      setScanning(false);
      setScanMessage('Scan réussi !');
      onScan(barcode);
    }, 1200);
  };

  const triggerRandomScan = () => {
    const products = dbService.getProducts().filter(p => p.barcode);
    if (products.length === 0) {
      setScanMessage('Aucun produit enregistré avec code-barres');
      return;
    }
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    startDemoScan(randomProduct.barcode, randomProduct.name);
  };

  useEffect(() => {
    // Activer une fausse caméra
    setCameraActive(true);
    return () => {
      setCameraActive(false);
    };
  }, []);

  // Liste des produits avec code-barres de démonstration pour le test rapide
  const demoProducts = dbService.getProducts().filter(p => p.barcode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <p style={{ fontSize: '14px', color: 'var(--color-dark-light)' }}>
        MarmiCout simule un scanneur de caisse ultra rapide. Choisissez un produit de démo ci-dessous, déclenchez un scan aléatoire ou tapez le code.
      </p>

      {/* Viseur de Scan */}
      <div className="scanner-viewport">
        {cameraActive && (
          <>
            {/* Ligne laser animée */}
            <div className="scanner-laser scan-glow" />
            
            {/* Boîte de ciblage */}
            <div className="scanner-overlay-box" />

            <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', textAlign: 'center', zIndex: 20 }}>
              <span className="badge badge-info" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', color: '#fff' }}>
                {scanMessage}
              </span>
            </div>
            
            {scanning && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 30
              }}>
                <RefreshCw className="scan-glow" size={32} style={{ animation: 'spin 2s linear infinite', color: 'var(--color-primary)' }} />
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          type="button" 
          className="btn btn-primary" 
          style={{ flex: 1 }}
          onClick={triggerRandomScan}
          disabled={scanning}
        >
          <Camera size={18} />
          Scan Aléatoire
        </button>
        <button 
          type="button" 
          className="btn btn-secondary btn-icon-only"
          onClick={onClose}
          title="Fermer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Raccourcis de produits de démo */}
      {demoProducts.length > 0 && (
        <div>
          <span className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
            Simuler le scan d'un produit spécifique :
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {demoProducts.map(p => (
              <button
                key={p.id}
                type="button"
                className="btn btn-secondary"
                style={{ 
                  height: '32px', 
                  padding: '4px 10px', 
                  fontSize: '12px',
                  borderRadius: 'var(--radius-sm)'
                }}
                onClick={() => startDemoScan(p.barcode, p.name)}
                disabled={scanning}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-danger"
              style={{ 
                height: '32px', 
                padding: '4px 10px', 
                fontSize: '12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-danger-light)'
              }}
              onClick={() => startDemoScan('9999999999999', 'Produit Inconnu')}
              disabled={scanning}
            >
              Code Inconnu (Nouveau)
            </button>
          </div>
        </div>
      )}

      {/* Saisie Manuelle */}
      <form onSubmit={handleManualSubmit} style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="manual-barcode-input">
            Saisie manuelle du code-barres
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id="manual-barcode-input"
              type="text"
              placeholder="Ex: 3151240010205"
              className="form-input"
              style={{ flex: 1, height: '40px' }}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              disabled={scanning}
            />
            <button 
              type="submit" 
              className="btn btn-success"
              style={{ height: '40px' }}
              disabled={scanning || !manualCode.trim()}
            >
              Saisir
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
