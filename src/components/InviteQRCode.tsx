import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2, History } from 'lucide-react';
import {
  getOrCreatePendingInvite,
  rotatePendingInvite,
  buildInviteUrl,
  getInviteHistory
} from '../services/testerCodes';

export const InviteQRCode: React.FC = () => {
  const [invite, setInvite] = useState(() => getOrCreatePendingInvite());
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(() => getInviteHistory());

  const inviteUrl = buildInviteUrl(invite.code);

  const rotateAfterShare = () => {
    setInvite(rotatePendingInvite());
    setHistory(getInviteHistory());
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    rotateAfterShare();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Invitation MarmiCout',
          text: 'Rejoins mon espace de test MarmiCout :',
          url: inviteUrl
        });
        rotateAfterShare();
      } catch {
        // Partage annulé par l'utilisateur : on ne change rien.
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' }}>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px 0' }}>Inviter un testeur</h3>
        <p style={{ fontSize: '12px', color: 'var(--color-dark-light)', margin: 0, maxWidth: '380px' }}>
          Ce QR code / lien est à usage unique : dès que vous le copiez ou le partagez, il est remplacé par un nouveau afin qu'il ne soit jamais donné à deux personnes. L'accès offert est valable 1 mois à partir de la première connexion.
        </p>
      </div>

      <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
        <QRCodeSVG value={inviteUrl} size={168} />
      </div>

      <div style={{ fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px' }}>
        Code : {invite.code}
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
        <button type="button" className="btn btn-secondary" style={{ height: '42px' }} onClick={() => setShowHistory(s => !s)}>
          <History size={16} />
          Historique
        </button>
      </div>

      {showHistory && (
        <div style={{ width: '100%', textAlign: 'left', fontSize: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
          <div style={{ color: 'var(--color-dark-light)', marginBottom: '6px' }}>
            Codes déjà partagés depuis cet appareil (indique seulement qu'ils ont été envoyés, pas qu'ils ont été ouverts) :
          </div>
          {history.length === 0 ? (
            <div style={{ color: 'var(--color-dark-light)' }}>Aucun code partagé pour l'instant.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {history.map((h) => (
                <li key={h.sharedAt}>
                  <strong>{h.code}</strong> — partagé le{' '}
                  {new Date(h.sharedAt).toLocaleDateString('fr-FR')} à{' '}
                  {new Date(h.sharedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
