import React from 'react';
import { Clock } from 'lucide-react';

interface ExpiredScreenProps {
  code: string;
  expiryDate: Date | null;
}

export const ExpiredScreen: React.FC<ExpiredScreenProps> = ({ code, expiryDate }) => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f2ff 0%, #faf5ff 100%)',
      padding: '20px',
      fontFamily: "'Inter', 'Segoe UI', sans-serif"
    }}>
      <div style={{
        background: 'white',
        borderRadius: '24px',
        padding: '48px 40px',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(99,102,241,0.15)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '72px', height: '72px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 8px 24px rgba(99,102,241,0.35)'
        }}>
          <Clock size={36} color="white" />
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1e1b4b', marginBottom: '8px' }}>
          Accès test expiré
        </h1>
        <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '8px', lineHeight: '1.5' }}>
          Votre espace de test « {code} » était valable 1 mois
          {expiryDate ? ` et a expiré le ${expiryDate.toLocaleDateString('fr-FR')}` : ''}.
        </p>
        <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
          Contactez-nous pour recevoir un nouveau code d'accès.
        </p>
      </div>
    </div>
  );
};
