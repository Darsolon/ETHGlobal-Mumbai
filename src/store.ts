import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type AuditEvent = { id: string; time: string; type: string; runId: string; detail: Record<string, unknown>; previousHash: string; hash: string; hcs?: { topicId: string; sequence: string; transactionId: string }; hcsError?: string };
type Reservation = { id: string; day: string; provider: string; amount: number; status: 'reserved' | 'spent' | 'released' };
type State = { events: AuditEvent[]; reservations: Reservation[]; runs: Record<string, unknown>; receipts: Record<string, unknown> };

/** Single-process persistent journal. Testnet deployment must run one instance with a persistent volume. */
export class Store {
  private state: State;
  private file: string;
  constructor(directory = process.env.GRID_DATA_DIR || 'data') {
    mkdirSync(directory, { recursive: true }); this.file = join(directory, 'state.json');
    this.state = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : { events: [], reservations: [], runs: {}, receipts: {} };
    if (!this.verify().valid) throw new Error('Audit integrity check failed. Refusing to overwrite journal.');
  }
  private save() { const temp = this.file + '.tmp'; writeFileSync(temp, JSON.stringify(this.state), { mode: 0o600 }); renameSync(temp, this.file); }
  events() { return structuredClone(this.state.events); }
  append(type: string, runId: string, detail: Record<string, unknown>) {
    const body = { id: randomUUID(), time: new Date().toISOString(), type, runId, detail, previousHash: this.state.events.at(-1)?.hash || '0'.repeat(64) };
    const event: AuditEvent = { ...body, hash: digest(body) }; this.state.events.push(event); this.save(); return structuredClone(event);
  }
  anchor(id: string, anchor: AuditEvent['hcs'], error?: string) {
    const event = this.state.events.find(e => e.id === id)!;
    if (anchor) { event.hcs = anchor; delete event.hcsError; }
    if (error) event.hcsError = error;
    this.save();
  }
  verify() {
    let previous = '0'.repeat(64);
    for (const e of this.state.events) {
      const { hash, hcs, hcsError, ...body } = e;
      if (body.previousHash !== previous || digest(body) !== hash) return { valid: false, count: this.state.events.length, failedId: e.id };
      previous = hash;
    }
    return { valid: true, count: this.state.events.length, head: previous };
  }
  totals(day = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin'}).format(new Date())) {
    const active = this.state.reservations.filter(r => r.day === day && r.status !== 'released');
    return { day, total: active.reduce((s,r) => s+r.amount, 0), byProvider: active.reduce<Record<string, number>>((s,r) => { s[r.provider] = (s[r.provider] || 0) + r.amount; return s; }, {}) };
  }
  reserve(provider: string, amount: number, daily: number, perProvider: number) {
    const totals = this.totals();
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid payment amount');
    if (totals.total + amount > daily) throw new Error('Daily budget reached');
    if ((totals.byProvider[provider] || 0) + amount > perProvider) throw new Error('Provider spending limit reached');
    const reservation: Reservation = { id: randomUUID(), day: totals.day, provider, amount, status: 'reserved' };
    this.state.reservations.push(reservation); this.save(); return reservation.id;
  }
  finishReservation(id: string, status: 'spent' | 'released') { this.state.reservations.find(r => r.id === id)!.status = status; this.save(); }
  getRun(id: string) { return structuredClone(this.state.runs[id]); }
  setRun(id: string, run: unknown) { this.state.runs[id] = run; this.save(); }
  getReceipt(id: string) { return this.state.receipts[id]; }
  setReceipt(id: string, receipt: unknown) { this.state.receipts[id] = receipt; this.save(); }
}
