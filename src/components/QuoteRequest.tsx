import React, { useState } from 'react';
import { Send, FileText, Copy, Check, Info, Calendar, Users, Phone, User } from 'lucide-react';
import { getActiveTesterCode } from '../services/db';

export const QuoteRequest: React.FC = () => {
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [eventType, setEventType] = useState('repas_assis');
  const [eventDate, setEventDate] = useState('');
  const [guestsCount, setGuestsCount] = useState('');
  const [details, setDetails] = useState('');
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const testerCode = getActiveTesterCode() || 'Anonyme';
  const recipientEmail = 'contact.marmicout@gmail.com';

  const eventTypeLabels: Record<string, string> = {
    repas_assis: 'Repas assis',
    buffet: 'Buffet',
    cocktail: 'Cocktail déjeunatoire/dînatoire',
    emporter: 'Plats à emporter',
    autre: 'Autre prestation'
  };

  const devisText = `📄 DEMANDE DE DEVIS MARMICOUT
---------------------------------------
👤 Client : ${clientName}
📞 Téléphone : ${phone || 'Non renseigné'}
📌 Prestation : ${eventTypeLabels[eventType]}
📅 Date prévue : ${eventDate ? new Date(eventDate).toLocaleDateString('fr-FR') : 'Non définie'}
👥 Nombre de convives : ${guestsCount || 'Non précisé'}
🧪 Testeur ID : ${testerCode.toUpperCase()}

💬 Détails de la demande :
${details}

---------------------------------------
Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !details.trim()) {
      alert("Veuillez renseigner votre nom et les détails de votre demande.");
      return;
    }

    const subject = encodeURIComponent(`[MarmiCout Devis] ${eventTypeLabels[eventType]} - ${clientName}`);
    const body = encodeURIComponent(devisText);
    const mailtoUrl = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;

    window.open(mailtoUrl, '_blank');
    setSent(true);
    setTimeout(() => setSent(false), 5000);
  };

  const handleCopy = () => {
    if (!clientName.trim() || !details.trim()) {
      alert("Veuillez renseigner votre nom et les détails avant de copier.");
      return;
    }

    navigator.clipboard.writeText(devisText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* En-tête */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Demande de devis</h1>
          <p className="page-subtitle">
            Estimez le coût d'une prestation de cuisine ou demandez une tarification sur-mesure.
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
            <FileText size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>
              Formulaire de demande de devis
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--color-dark-light)' }}>
              Espace actif : <strong>{testerCode.toUpperCase()}</strong>
            </span>
          </div>
        </div>

        <form onSubmit={handleSendEmail}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={14} /> Votre nom / Entreprise *
              </label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="Ex : Marie Dupont"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Phone size={14} /> Téléphone
              </label>
              <input
                type="tel"
                className="form-input"
                placeholder="Ex : 06 12 34 56 78"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Type de prestation</label>
            <select
              className="form-input"
              value={eventType}
              onChange={e => setEventType(e.target.value)}
            >
              <option value="repas_assis">🍽️ Repas assis</option>
              <option value="buffet">🥗 Buffet traiteur</option>
              <option value="cocktail">🍹 Cocktail déjeunatoire/dînatoire</option>
              <option value="emporter">🥡 Plats cuisinés à emporter</option>
              <option value="autre">✨ Autre prestation</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} /> Date souhaitée
              </label>
              <input
                type="date"
                className="form-input"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} /> Nombre de personnes
              </label>
              <input
                type="number"
                min="1"
                className="form-input"
                placeholder="Ex : 25"
                value={guestsCount}
                onChange={e => setGuestsCount(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Détaillez vos besoins (Menu, Budget, Contraintes...) *</label>
            <textarea
              className="form-input"
              required
              rows={6}
              style={{ minHeight: '120px', resize: 'vertical' }}
              placeholder="Décrivez les plats souhaités, si vous avez des exigences pour le service, des allergies à signaler, ou un budget par personne..."
              value={details}
              onChange={e => setDetails(e.target.value)}
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
                Votre demande sera envoyée directement à <strong>{recipientEmail}</strong>. Vous pouvez aussi copier le texte pour l'envoyer par SMS ou WhatsApp.
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
              {sent ? 'Redirection mail...' : 'Envoyer la demande'}
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
