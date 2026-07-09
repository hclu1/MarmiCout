import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * Correctif global décimal : accepte la virgule (,) comme séparateur décimal
 * dans tous les champs numériques de l'application.
 * Fonctionne pour la saisie au clavier ET le collage (Ctrl+V).
 */
function setupDecimalFix() {
  const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  // Convertit "," → "." lors de la saisie clavier
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== ',') return;
    const el = e.target as HTMLInputElement;
    if (el.tagName !== 'INPUT') return;

    e.preventDefault();

    if (el.type === 'number') {
      // Pour les inputs numériques, on change temporairement en text, insère '.', puis restaure
      const prevType = el.type;
      el.type = 'text';
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + '.' + el.value.slice(end);
      nativeSet?.call(el, newVal);
      el.setSelectionRange(start + 1, start + 1);
      el.type = prevType;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Pour les inputs texte
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + '.' + el.value.slice(end);
      nativeSet?.call(el, newVal);
      el.setSelectionRange(start + 1, start + 1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, true);

  // Normalise les valeurs collées (ex : "1,50" → "1.50")
  document.addEventListener('paste', (e: ClipboardEvent) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== 'INPUT') return;
    if (el.type !== 'number' && el.type !== 'text') return;

    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!pasted.includes(',')) return;

    e.preventDefault();
    const normalized = pasted.replace(',', '.');

    if (el.type === 'number') {
      el.type = 'text';
      nativeSet?.call(el, normalized);
      el.type = 'number';
    } else {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + normalized + el.value.slice(end);
      nativeSet?.call(el, newVal);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
}

setupDecimalFix();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

