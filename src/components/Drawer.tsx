import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  zIndex?: number;
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({ title, isOpen, onClose, children, footer, zIndex, width }) => {
  // Désactiver le défilement du corps de la page quand le drawer est ouvert
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const [isDesktop, setIsDesktop] = React.useState(typeof window !== 'undefined' ? window.innerWidth >= 769 : true);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 769);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isOpen) return null;

  // Calcul dynamique du style en fonction des props
  const customStyle: React.CSSProperties = {
    ...(zIndex ? { zIndex } : {}),
    ...(width && isDesktop ? { width, maxWidth: '95vw' } : {})
  };

  return (
    <>
      {/* Fond obscurci */}
      <div 
        className="drawer-backdrop" 
        onClick={onClose} 
        style={zIndex ? { zIndex: zIndex - 10 } : undefined} 
      />
      
      {/* Panneau coulissant */}
      <div 
        className={`drawer ${isOpen ? 'open' : ''} ${width ? 'drawer-wide' : ''}`} 
        style={Object.keys(customStyle).length > 0 ? customStyle : undefined}
      >
        <div className="drawer-header">
          <h3 className="drawer-title">{title}</h3>
          <button className="drawer-close" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        
        <div className="drawer-body">
          {children}
        </div>

        {footer && (
          <div className="drawer-footer">
            {footer}
          </div>
        )}
      </div>
    </>
  );
};
