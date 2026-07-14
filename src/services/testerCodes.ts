// Gestion des codes d'invitation testeur : génération aléatoire, rotation
// après partage, historique local et expiration de l'accès à 1 mois.
//
// Le code d'invitation "en attente" n'est volontairement PAS préfixé par le
// code du testeur actif : il représente l'invitation que CET APPAREIL
// s'apprête à partager avec une nouvelle personne, indépendamment de
// l'espace de données du testeur qui l'utilise pour la générer.

const PENDING_KEY = 'marmicout_pending_invite';
const HISTORY_KEY = 'marmicout_invite_history';
const ISSUED_PREFIX = 'marmicout_issued_at_';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 50;

export interface PendingInvite {
  code: string;
  createdAt: number;
}

export interface InviteHistoryEntry {
  code: string;
  createdAt: number;
  sharedAt: number;
}

// Alphabet sans caractères ambigus (0/O, 1/I/l).
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generateRandomCode(length = 8): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, v => CODE_ALPHABET[v % CODE_ALPHABET.length]).join('');
}

function createInvite(): PendingInvite {
  const invite: PendingInvite = { code: generateRandomCode(), createdAt: Date.now() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(invite));
  return invite;
}

export function getOrCreatePendingInvite(): PendingInvite {
  const raw = localStorage.getItem(PENDING_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as PendingInvite;
    } catch {
      // Donnée corrompue : on régénère ci-dessous.
    }
  }
  return createInvite();
}

export function getInviteHistory(): InviteHistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as InviteHistoryEntry[];
  } catch {
    return [];
  }
}

// Invalide le code affiché (il vient d'être copié/partagé) et en prépare un
// nouveau, pour qu'un même code ne soit jamais remis à deux personnes.
export function rotatePendingInvite(): PendingInvite {
  const current = getOrCreatePendingInvite();
  const history = getInviteHistory();
  history.unshift({ code: current.code, createdAt: current.createdAt, sharedAt: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  return createInvite();
}

export function buildInviteUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('code', code);
  return url.toString();
}

// --- Expiration de l'accès testeur (1 mois à partir de la première visite) ---

export function markTesterCodeIssued(code: string): void {
  const key = `${ISSUED_PREFIX}${code}`;
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, String(Date.now()));
  }
}

export function getTesterCodeIssuedAt(code: string): number | null {
  const raw = localStorage.getItem(`${ISSUED_PREFIX}${code}`);
  return raw ? Number(raw) : null;
}

export function isTesterCodeExpired(code: string): boolean {
  const issuedAt = getTesterCodeIssuedAt(code);
  if (!issuedAt) return false;
  return Date.now() - issuedAt > ONE_MONTH_MS;
}

export function getTesterCodeExpiryDate(code: string): Date | null {
  const issuedAt = getTesterCodeIssuedAt(code);
  return issuedAt ? new Date(issuedAt + ONE_MONTH_MS) : null;
}
