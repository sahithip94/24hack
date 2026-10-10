import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { config } from './config.js';
import type {
  GuestSession,
  PersistedState,
  RecordMeta,
  Session,
  Share,
  User,
} from './types.js';

/**
 * Small JSON-file-backed store with atomic writes.
 * Suitable for a hackathon / single-process deployment; swap for a real
 * database (Postgres/SQLite) by implementing the same methods.
 */
export class Store {
  private state: PersistedState = {
    users: [],
    records: [],
    shares: [],
    sessions: [],
    guestSessions: [],
  };
  private readonly file: string;

  constructor(file: string = config.dataFile) {
    this.file = file;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf-8')) as Partial<PersistedState>;
      this.state = {
        users: parsed.users ?? [],
        records: parsed.records ?? [],
        shares: parsed.shares ?? [],
        sessions: parsed.sessions ?? [],
        guestSessions: parsed.guestSessions ?? [],
      };
    } catch (err) {
      console.error('[store] Failed to parse data file, starting fresh:', err);
    }
  }

  save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
  }

  // ---- Users ------------------------------------------------------------
  users(): User[] {
    return this.state.users;
  }

  userById(id: string): User | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  userByEmail(email: string): User | undefined {
    const target = email.toLowerCase();
    return this.state.users.find((u) => u.email.toLowerCase() === target);
  }

  addUser(user: User): User {
    this.state.users.push(user);
    this.save();
    return user;
  }

  updateUser(id: string, patch: Partial<User>): User | undefined {
    const user = this.userById(id);
    if (!user) return undefined;
    Object.assign(user, patch);
    this.save();
    return user;
  }

  // ---- Records ----------------------------------------------------------
  records(): RecordMeta[] {
    return this.state.records;
  }

  recordById(id: string): RecordMeta | undefined {
    return this.state.records.find((r) => r.id === id);
  }

  recordsForUser(userId: string): RecordMeta[] {
    return this.state.records
      .filter((r) => r.userId === userId)
      .sort((a, b) =>
        (b.recordDate + b.uploadedAt).localeCompare(a.recordDate + a.uploadedAt),
      );
  }

  addRecord(record: RecordMeta): RecordMeta {
    this.state.records.push(record);
    this.save();
    return record;
  }

  deleteRecord(id: string): boolean {
    const before = this.state.records.length;
    this.state.records = this.state.records.filter((r) => r.id !== id);
    const removed = this.state.records.length < before;
    if (removed) this.save();
    return removed;
  }

  // ---- Shares -----------------------------------------------------------
  shares(): Share[] {
    return this.state.shares;
  }

  shareById(id: string): Share | undefined {
    return this.state.shares.find((s) => s.id === id);
  }

  shareByToken(token: string): Share | undefined {
    return this.state.shares.find((s) => s.token === token);
  }

  sharesForUser(userId: string): Share[] {
    return this.state.shares
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  addShare(share: Share): Share {
    this.state.shares.push(share);
    this.save();
    return share;
  }

  updateShare(id: string, patch: Partial<Share>): Share | undefined {
    const share = this.shareById(id);
    if (!share) return undefined;
    Object.assign(share, patch);
    this.save();
    return share;
  }

  deleteShare(id: string): boolean {
    const before = this.state.shares.length;
    this.state.shares = this.state.shares.filter((s) => s.id !== id);
    const removed = this.state.shares.length < before;
    if (removed) this.save();
    return removed;
  }

  // ---- Sessions ---------------------------------------------------------
  sessions(): Session[] {
    return this.state.sessions;
  }

  sessionByToken(token: string): Session | undefined {
    return this.state.sessions.find((s) => s.token === token);
  }

  addSession(session: Session): Session {
    this.state.sessions.push(session);
    this.save();
    return session;
  }

  deleteSession(token: string): void {
    this.state.sessions = this.state.sessions.filter((s) => s.token !== token);
    this.save();
  }

  deleteUserSessions(userId: string, exceptToken?: string): void {
    this.state.sessions = this.state.sessions.filter(
      (s) => s.userId !== userId || s.token === exceptToken,
    );
    this.save();
  }

  // ---- Guest sessions ---------------------------------------------------
  guestSessions(): GuestSession[] {
    return this.state.guestSessions;
  }

  guestSessionByToken(token: string): GuestSession | undefined {
    return this.state.guestSessions.find((g) => g.token === token);
  }

  addGuestSession(session: GuestSession): GuestSession {
    this.state.guestSessions.push(session);
    this.save();
    return session;
  }

  deleteGuestSession(token: string): void {
    this.state.guestSessions = this.state.guestSessions.filter(
      (g) => g.token !== token,
    );
    this.save();
  }

  deleteGuestSessionsForShare(shareId: string): void {
    this.state.guestSessions = this.state.guestSessions.filter(
      (g) => g.shareId !== shareId,
    );
    this.save();
  }

  /** Remove expired sessions (sessions + guest sessions). */
  pruneExpired(now: Date = new Date()): void {
    const t = now.toISOString();
    const beforeS = this.state.sessions.length;
    const beforeG = this.state.guestSessions.length;
    this.state.sessions = this.state.sessions.filter((s) => s.expiresAt > t);
    this.state.guestSessions = this.state.guestSessions.filter(
      (g) => g.expiresAt > t,
    );
    if (
      this.state.sessions.length !== beforeS ||
      this.state.guestSessions.length !== beforeG
    ) {
      this.save();
    }
  }
}

export const store = new Store();
