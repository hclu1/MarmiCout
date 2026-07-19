import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2 } from 'lucide-react';

export const InviteQRCode: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const appUrl = 'https://marmi-cout.vercel.app/';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'MarmiCout',
          text: 'Découvrez MarmiCout, le logiciel de gestion pour traiteurs :',
          url: appUrl
        });
      } catch {
        // Partage annulé par l'utilisateur
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' }}>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px 0' }}>Partager l'application</h3>
        <p style={{ fontSize: '12px', color: 'var(--color-dark-light)', margin: 0, maxWidth: '380px' }}>
          Scannez ce QR code pour accéder directement à l'application MarmiCout et commencer l'essai.
        </p>
      </div>

      <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
        <QRCodeSVG value={appUrl} size={168} />
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary" style={{ height: '42px' }} onClick={handleShare}>
          <Share2 size={16} />
          Partager
        </button>
        <button type="button" className="btn btn-secondary" style={{ height: '42px' }} onClick={handleCopy}>
          {copied ? <Check size={16} style={{ color: 'var(--color-secondary)' }} /> : <Copy size={16} />}
          {copied ? 'Copié !' : 'Copier le lien'}
        </button>
      </div>
    </div>
  );
};

