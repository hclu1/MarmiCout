import React, { useState } from 'react';
import { Send, MessageSquare, Copy, Check, Info } from 'lucide-react';
import { getActiveTesterCode } from '../services/db';

export const Suggestions: React.FC = () => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('amélioration');
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const testerCode = getActiveTesterCode() || 'Anonyme';
  const recipientEmail = 'contact.marmicout@gmail.com';

  const suggestionText = `💡 SUGGESTION MARMICOUT
---------------------------------------
👤 Testeur : ${testerCode.toUpperCase()}
📌 Type : ${type.toUpperCase()}
📝 Titre : ${title}

💬 Description :
${description}

---------------------------------------
Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      alert("Veuillez remplir le titre et la description de votre suggestion.");
      return;
    }

    const subject = encodeURIComponent(`[MarmiCout Suggestion] ${type.toUpperCase()} - ${title}`);
    const body = encodeURIComponent(suggestionText);
    const mailtoUrl = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;

    window.open(mailtoUrl, '_blank');
    setSent(true);
    setTimeout(() => setSent(false), 5000);
  };

  const handleCopy = () => {
    if (!title.trim() || !description.trim()) {
      alert("Veuillez remplir le titre et la description avant de copier.");
      return;
    }

    navigator.clipboard.writeText(suggestionText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Boîte à suggestions</h1>
          <p className="page-subtitle">
            Proposez des idées d'amélioration, signalez un bug ou demandez une modification directement à l'administrateur
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{
            width: '36px', height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-primary)'
          }}>
            <MessageSquare size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>
              Formulaire de retour d'expérience
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--color-dark-light)' }}>
              Espace testeur actif : <strong>{testerCode.toUpperCase()}</strong>
            </span>
          </div>
        </div>

        <form onSubmit={handleSendEmail}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Titre court de votre idée ou problème *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Ex : Ajouter un bouton d'export PDF, Bug sur le stock de beurre..."
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Type de suggestion</label>
            <select
              className="form-input"
              value={type}
              onChange={e => setType(e.target.value)}
            >
              <option value="amélioration">💡 Amélioration / Suggestion</option>
              <option value="bug">🐛 Signalement de bug</option>
              <option value="nouvelle idée">🚀 Nouvelle fonctionnalité</option>
              <option value="autre">💬 Autre retour</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Expliquez votre besoin en détail *</label>
            <textarea
              className="form-input"
              required
              rows={6}
              style={{ minHeight: '120px', resize: 'vertical' }}
              placeholder="Décrivez ce que vous souhaitez modifier, pourquoi c'est important pour vous, et comment vous l'imaginez..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Alert explicative */}
          <div className="card" style={{
            backgroundColor: 'var(--color-light)',
            borderColor: 'var(--color-border)',
            fontSize: '12px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Info size={16} style={{ color: 'var(--color-dark-light)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                Le bouton <strong>« Envoyer par email »</strong> va ouvrir votre application de messagerie avec un email pré-rempli destiné à l'administrateur. Si vous préférez, vous pouvez utiliser le bouton <strong>« Copier le texte »</strong> pour lui envoyer directement sur WhatsApp ou par SMS.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1, minWidth: '160px', height: '44px' }}
            >
              <Send size={16} />
              {sent ? 'Redirection mail...' : 'Envoyer par email'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: '44px', minWidth: '140px' }}
              onClick={handleCopy}
            >
              {copied ? <Check size={16} style={{ color: 'var(--color-secondary)' }} /> : <Copy size={16} />}
              {copied ? 'Copié !' : 'Copier le texte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
