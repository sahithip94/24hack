export interface User {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface RecordMeta {
  id: string;
  userId: string;
  title: string;
  category: string;
  recordDate: string; // ISO date (yyyy-mm-dd)
  fileName: string;
  fileType: string; // mime type
  fileSize: number; // bytes
  storagePath: string; // relative to uploadsDir
  uploadedAt: string;
}

export type ShareEventType =
  | 'created'
  | 'verify_success'
  | 'verify_failed'
  | 'view'
  | 'file_open'
  | 'revoked';

export interface ShareEvent {
  at: string;
  ip: string;
  type: ShareEventType;
  detail?: string;
}

export interface Share {
  id: string;
  token: string;
  userId: string;
  recordIds: string[];
  recipientLabel: string | null;
  createdAt: string;
  expiresAt: string;
  pinHash: string;
  pinSalt: string;
  revoked: boolean;
  events: ShareEvent[];
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface GuestSession {
  token: string;
  shareId: string;
  createdAt: string;
  expiresAt: string;
}

export interface PersistedState {
  users: User[];
  records: RecordMeta[];
  shares: Share[];
  sessions: Session[];
  guestSessions: GuestSession[];
}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    createdAt: u.createdAt,
  };
}
