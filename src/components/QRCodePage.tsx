import React from 'react';
import { InviteQRCode } from './InviteQRCode';

export const QRCodePage: React.FC = () => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">QR Code</h1>
          <p className="page-subtitle">
            Générez un QR code / lien pour inviter un nouveau testeur dans son propre espace isolé.
          </p>
        </div>
      </div>

      <InviteQRCode />
    </div>
  );
};
