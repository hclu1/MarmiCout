import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, X, HelpCircle, Check, AlertTriangle } from 'lucide-react';
import { dbService } from '../services/db';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';
import { barcodeLookupService, LookupResult } from '../services/barcodeLookupService';

interface BarcodeScannerProps {
  onScan: (barcode: string, result: LookupResult) => void;
  onClose: () => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('Prêt à scanner');

  // États de la caméra physique
  const [isRealCamera, setIsRealCamera] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied' | 'error'>('prompt');
  const [errorMessage, setErrorMessage] = useState('');
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);

  // États du lookup de code-barres
  const [lookupState, setLookupState] = useState<'idle' | 'local_lookup' | 'external_lookup' | 'found' | 'not_found' | 'error'>('idle');
  const [foundProductName, setFoundProductName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  // Synthèse d'un bip de caisse enregistreuse
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
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

  const handleBarcodeLookup = async (barcode: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    setScanning(true);
    setLookupState('local_lookup');
    setScanMessage('Recherche dans la base locale...');
    
    try {
      // 1. Recherche locale d'abord
      const localProduct = dbService.getProductByBarcode(barcode);
      
      if (localProduct) {
        setLookupState('found');
        setFoundProductName(localProduct.name || '');
        setScanMessage(`Produit trouvé (local) : ${localProduct.name}`);
        setTimeout(() => {
          onScan(barcode, { state: 'local_found', localProduct });
          onClose();
        }, 1000);
      } else {
        // 2. Si non trouvé localement, recherche externe
        setLookupState('external_lookup');
        setScanMessage('Recherche externe (Open Food Facts)...');
        
        await new Promise(resolve => setTimeout(resolve, 600));
        
        const extResult = await barcodeLookupService.lookupBarcode(barcode);
        
        if (extResult.state === 'external_found' && extResult.externalProduct) {
          setLookupState('found');
          setFoundProductName(extResult.externalProduct.name);
          setScanMessage(`Produit trouvé (externe) : ${extResult.externalProduct.name}`);
          setTimeout(() => {
            onScan(barcode, extResult);
            onClose();
          }, 1200);
        } else if (extResult.state === 'error') {
          setLookupState('error');
          setScanMessage(extResult.error || 'Erreur réseau');
          setTimeout(() => {
            onScan(barcode, extResult);
            onClose();
          }, 1800);
        } else {
          setLookupState('not_found');
          setScanMessage('Produit inconnu');
          setTimeout(() => {
            onScan(barcode, extResult);
            onClose();
          }, 1200);
        }
      }
    } catch (err) {
      console.error('Erreur lors de la recherche de code-barres :', err);
      setLookupState('error');
      setScanMessage('Erreur inattendue.');
      setTimeout(() => {
        onScan(barcode, { state: 'error', error: 'Erreur inattendue.' });
        onClose();
      }, 1500);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
      setScanning(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      playBeep();
      handleBarcodeLookup(manualCode.trim());
      setManualCode('');
    }
  };

  const startDemoScan = (barcode: string, productName: string) => {
    setScanning(true);
    setScanMessage(`Analyse de l'article : ${productName}...`);

    setTimeout(() => {
      playBeep();
      setScanning(false);
      handleBarcodeLookup(barcode);
    }, 1200);
  };

  const triggerRandomScan = () => {
    const products = dbService.getProducts().filter(p => p.barcode);
    if (products.length === 0) {
      startDemoScan('7622210449283', 'LU Prince Chocolat');
      return;
    }
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    startDemoScan(randomProduct.barcode, randomProduct.name);
  };

  const demoProducts = dbService.getProducts().filter(p => p.barcode);

  useEffect(() => {
    let html5Qrcode: Html5Qrcode | null = null;
    let isMounted = true;

    const initHtml5Qrcode = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!isMounted) return;

        html5Qrcode = new Html5Qrcode("scanner-video-container", {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E
          ]
        });

        const devices = await Html5Qrcode.getCameras();
        if (isMounted && devices && devices.length > 0) {
          setCameraDevices(devices);
          const selectedCamId = activeCameraId || (
            devices.find(device =>
              device.label.toLowerCase().includes('back') ||
              device.label.toLowerCase().includes('arrière') ||
              device.label.toLowerCase().includes('rear') ||
              device.label.toLowerCase().includes('environment')
            )?.id || devices[0].id
          );

          if (!activeCameraId) {
            setActiveCameraId(selectedCamId);
          }
          await startScanning(html5Qrcode, selectedCamId);
        } else if (isMounted) {
          await startScanning(html5Qrcode, { facingMode: "environment" });
        }
      } catch (err: any) {
        console.warn("Échec d'initialisation des caméras :", err);
        if (isMounted) {
          setIsRealCamera(false);
          if (err.name === 'NotAllowedError' || err.toString().includes('Permission denied')) {
            setCameraPermission('denied');
            setErrorMessage("Accès caméra refusé. Veuillez autoriser la caméra dans les paramètres de votre navigateur.");
          } else {
            setCameraPermission('error');
            setErrorMessage("Impossible d'activer la caméra. Assurez-vous d'être sur une adresse sécurisée (HTTPS).");
          }
        }
      }
    };

    const startScanning = async (scannerInstance: Html5Qrcode, cameraSource: string | { facingMode: string }) => {
      try {
        await scannerInstance.start(
          cameraSource,
          {
            fps: 10,
            qrbox: (width, height) => {
              const boxWidth = Math.min(width * 0.85, 300);
              const boxHeight = Math.min(height * 0.45, 140);
              return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, width: boxWidth, height: boxHeight };
            },
            aspectRatio: 1.0
          },
          (decodedText) => {
            if (isProcessingRef.current) return;
            playBeep();
            handleBarcodeLookup(decodedText);
          },
          () => {}
        );

        if (isMounted) {
          setIsRealCamera(true);
          setCameraPermission('granted');
          setScanMessage("Visez le code-barres d'un ingrédient");
        }
      } catch (err: any) {
        console.warn("Échec du lancement du scan vidéo :", err);
        if (isMounted) {
          setIsRealCamera(false);
          setCameraPermission('error');
          setErrorMessage("Erreur d'accès à la caméra. Vérifiez vos autorisations.");
        }
      }
    };

    initHtml5Qrcode();

    return () => {
      isMounted = false;
      if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().catch(e => console.error("Erreur arrêt scanner", e));
      }
    };
  }, [activeCameraId]);

  const handleSwitchCamera = (deviceId: string) => {
    setActiveCameraId(deviceId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-border)' }}>

        <div id="scanner-video-container" className="scanner-viewport" style={{ border: 'none' }}>
        </div>

        {lookupState !== 'idle' && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(21, 16, 12, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
            color: '#fff',
            padding: '16px',
            textAlign: 'center',
            gap: '12px'
          }}>
            {lookupState === 'local_lookup' && (
              <>
                <RefreshCw className="spin" size={36} style={{ color: 'var(--color-primary)', animation: 'spin 1.5s linear infinite' }} />
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Recherche dans la base locale...</span>
              </>
            )}
            {lookupState === 'external_lookup' && (
              <>
                <RefreshCw className="spin" size={36} style={{ color: 'var(--color-info)', animation: 'spin 1.5s linear infinite' }} />
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Recherche externe (Open Food Facts)...</span>
              </>
            )}
            {lookupState === 'found' && (
              <>
                <div style={{ backgroundColor: 'var(--color-secondary)', borderRadius: '50%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={36} style={{ color: '#fff' }} />
                </div>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--color-secondary)' }}>Produit identifié !</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', maxWidth: '240px' }}>{foundProductName}</span>
              </>
            )}
            {lookupState === 'not_found' && (
              <>
                <div style={{ backgroundColor: 'var(--color-dark-light)', borderRadius: '50%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <HelpCircle size={36} style={{ color: '#fff' }} />
                </div>
                <span style={{ fontSize: '15px', fontWeight: 'bold' }}>Produit non répertorié</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>Redirection vers la création manuelle...</span>
              </>
            )}
            {lookupState === 'error' && (
              <>
                <div style={{ backgroundColor: 'var(--color-danger)', borderRadius: '50%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={36} style={{ color: '#fff' }} />
                </div>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-danger)' }}>Erreur de recherche</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', maxWidth: '240px' }}>{scanMessage}</span>
              </>
            )}
          </div>
        )}

        {isRealCamera && lookupState === 'idle' && (
          <>
            <div className="scanner-laser scan-glow" style={{ pointerEvents: 'none', zIndex: 10 }} />
            <div className="scanner-overlay-box" style={{ pointerEvents: 'none', zIndex: 10, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
            <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', textAlign: 'center', zIndex: 20 }}>
              <span className="badge badge-success" style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'var(--color-secondary)' }}>
                🎥 Caméra Active - {scanMessage}
              </span>
            </div>
          </>
        )}

        {!isRealCamera && lookupState === 'idle' && (
          <div className="scanner-viewport" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, backgroundColor: '#15100c', border: 'none', display: 'flex', flexDirection: 'column', padding: '16px' }}>
            <div className="scanner-laser scan-glow" />
            <div className="scanner-overlay-box" />

            <div style={{ zIndex: 12, textAlign: 'center', marginTop: 'auto', marginBottom: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              {cameraPermission === 'prompt' ? (
                <>
                  <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: '13px', color: '#fff' }}>Demande d'accès caméra en cours...</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                  <span style={{ fontSize: '12px', color: '#ffcc00', fontWeight: 'bold' }}>Caméra physique non disponible</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', maxWidth: '240px', lineHeight: '1.3' }}>
                    {errorMessage}
                  </span>
                  <span className="badge badge-info" style={{ marginTop: '8px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                    💡 Mode simulation activé
                  </span>
                </>
              )}
            </div>

            <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', textAlign: 'center', zIndex: 20 }}>
              <span className="badge badge-info" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', color: '#fff' }}>
                {scanMessage}
              </span>
            </div>
          </div>
        )}

        {scanning && lookupState === 'idle' && (
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
      </div>

      {isRealCamera && cameraDevices.length > 1 && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: '11px' }}>Changer d'appareil photo :</label>
          <select
            className="form-input"
            style={{ height: '36px', padding: '4px 8px', fontSize: '12px' }}
            value={activeCameraId || ''}
            onChange={(e) => handleSwitchCamera(e.target.value)}
          >
            {cameraDevices.map(device => (
              <option key={device.id} value={device.id}>
                {device.label || `Caméra ${cameraDevices.indexOf(device) + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={triggerRandomScan}
          disabled={scanning || isProcessing}
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

      <div>
        <span className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '12px' }}>
          Simuler le scan d'un produit (local ou via Open Food Facts API) :
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {demoProducts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {demoProducts.slice(0, 3).map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ height: '28px', padding: '4px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)' }}
                  onClick={() => startDemoScan(p.barcode, p.name)}
                  disabled={scanning || isProcessing}
                >
                  🏠 {p.name} (Local)
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: '28px', padding: '4px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info)' }}
              onClick={() => startDemoScan('7622210449283', 'LU Prince Chocolat')}
              disabled={scanning || isProcessing}
            >
              🌐 LU Prince (API OFF)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: '28px', padding: '4px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info)' }}
              onClick={() => startDemoScan('5449000000996', 'Coca-Cola')}
              disabled={scanning || isProcessing}
            >
              🌐 Coca-Cola (API OFF)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: '28px', padding: '4px 8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info)' }}
              onClick={() => startDemoScan('3017624010701', 'Nutella 400g')}
              disabled={scanning || isProcessing}
            >
              🌐 Nutella (API OFF)
            </button>
            <button
              type="button"
              className="btn btn-danger"
              style={{
                height: '28px',
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-danger-light)'
              }}
              onClick={() => startDemoScan('9999999999999', 'Produit Inconnu')}
              disabled={scanning || isProcessing}
            >
              ❓ Inconnu (Nouveau)
            </button>
          </div>
        </div>
      </div>

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
              disabled={scanning || isProcessing}
            />
            <button
              type="submit"
              className="btn btn-success"
              style={{ height: '40px' }}
              disabled={scanning || isProcessing || !manualCode.trim()}
            >
              Saisir
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
