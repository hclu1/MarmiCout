import React, { useState } from 'react';
import { ChefHat } from 'lucide-react';

/**
 * Écran de bienvenue affiché quand aucun ?code= n'est présent dans l'URL.
 * L'utilisateur saisit son prénom → l'app se recharge avec ?code=prenom
 */
export const WelcomeScreen: React.FC = () => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .toLowerCase();

    if (!cleaned || cleaned.length < 2) {
      setError('Veuillez entrer un prénom ou un nom d\'au moins 2 caractères.');
      return;
    }

    // Redirige vers ?code=prenom pour créer la session personnalisée
    const url = new URL(window.location.href);
    url.searchParams.set('code', cleaned);
    window.location.href = url.toString();
  };

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
        {/* Logo */}
        <div style={{
          width: '72px', height: '72px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 8px 24px rgba(99,102,241,0.35)'
        }}>
          <ChefHat size={36} color="white" />
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#1e1b4b', marginBottom: '8px' }}>
          Bienvenue sur MarmiCout 🍳
        </h1>
        <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '32px', lineHeight: '1.5' }}>
          Pour créer votre espace personnel de test, entrez simplement votre prénom ci-dessous.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px', textAlign: 'left' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>
              Votre prénom ou pseudo
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="Ex : Marie, Chef1, Jean..."
              maxLength={20}
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                border: `2px solid ${error ? '#f43f5e' : '#e0e7ff'}`,
                borderRadius: '14px',
                fontSize: '16px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.2s',
                color: '#1e1b4b'
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = '#6366f1'; }}
              onBlur={e => { if (!error) e.target.style.borderColor = '#e0e7ff'; }}
            />
            {error && (
              <p style={{ color: '#f43f5e', fontSize: '12px', marginTop: '6px' }}>{error}</p>
            )}
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '15px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              fontSize: '16px',
              fontWeight: '700',
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(99,102,241,0.35)',
              transition: 'opacity 0.2s, transform 0.1s'
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            Accéder à mon espace →
          </button>
        </form>

        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '20px', lineHeight: '1.5' }}>
          Votre prénom sert uniquement à créer un espace de données isolé pour vos tests. Aucune information n'est transmise à un serveur.
        </p>
      </div>
    </div>
  );
};
