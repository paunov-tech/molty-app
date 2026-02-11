// ═══════════════════════════════════════════════════
// MOLTY CORE: REACTIVE DATA STORE
// Centralni data layer — CRUD, events, localStorage
// Svaki modul čita/piše kroz store, ne drži lokalni state
//
// API:
//   store.get("customers")           → niz kupaca
//   store.add("customers", newItem)  → dodaje + persists + emituje event
//   store.update("customers", id, patch) → ažurira
//   store.remove("customers", id)    → briše
//   store.subscribe("customers", fn) → listener za promene
//   store.export()                   → JSON svih podataka
//   store.import(json)               → uvozi podatke
//   store.log(event, data)           → loguje za neural net
// ═══════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import { SEED } from "../data/seed.js";

class MoltyStore {
  constructor() {
    this._data = {};
    this._listeners = {};
    this._eventLog = [];
    this._init();
  }

  _init() {
    // Učitaj iz localStorage ili koristi seed
    for (const [key, seedData] of Object.entries(SEED)) {
      try {
        const saved = localStorage.getItem(`molty_${key}`);
        this._data[key] = saved ? JSON.parse(saved) : [...seedData];
      } catch {
        this._data[key] = [...seedData];
      }
    }
    // Učitaj event log
    try {
      const log = localStorage.getItem("molty_eventlog");
      this._eventLog = log ? JSON.parse(log) : [];
    } catch {
      this._eventLog = [];
    }
  }

  _persist(key) {
    try { localStorage.setItem(`molty_${key}`, JSON.stringify(this._data[key])); } catch {}
  }

  _emit(key) {
    (this._listeners[key] || []).forEach(fn => fn(this._data[key]));
    (this._listeners["*"] || []).forEach(fn => fn(key, this._data[key]));
  }

  // ── READ ──
  get(key) {
    return this._data[key] || [];
  }

  getAll(key) {
    return this.get(key);
  }

  getById(key, id) {
    return (this._data[key] || []).find(item => item.id === id);
  }

  // ── CREATE ──
  add(key, item) {
    if (!this._data[key]) this._data[key] = [];
    const maxId = this._data[key].reduce((max, i) => Math.max(max, i.id || 0), 0);
    const newItem = { ...item, id: item.id || maxId + 1, _created: Date.now() };
    this._data[key] = [...this._data[key], newItem];
    this._persist(key);
    this._emit(key);
    this.log("add", { collection: key, itemId: newItem.id });
    return newItem;
  }

  // ── UPDATE ──
  update(key, id, patch) {
    this._data[key] = (this._data[key] || []).map(item =>
      item.id === id ? { ...item, ...patch, _updated: Date.now() } : item
    );
    this._persist(key);
    this._emit(key);
    this.log("update", { collection: key, itemId: id, fields: Object.keys(patch) });
  }

  // ── DELETE ──
  remove(key, id) {
    this._data[key] = (this._data[key] || []).filter(item => item.id !== id);
    this._persist(key);
    this._emit(key);
    this.log("remove", { collection: key, itemId: id });
  }

  // ── REPLACE ALL ──
  set(key, data) {
    this._data[key] = data;
    this._persist(key);
    this._emit(key);
  }

  // ── SUBSCRIBE ──
  subscribe(key, fn) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(fn);
    return () => { this._listeners[key] = this._listeners[key].filter(f => f !== fn); };
  }

  // ── EVENT LOG (za neural net) ──
  log(event, data) {
    const entry = { t: Date.now(), e: event, d: data };
    this._eventLog.push(entry);
    // Drži max 1000 events
    if (this._eventLog.length > 1000) this._eventLog = this._eventLog.slice(-1000);
    try { localStorage.setItem("molty_eventlog", JSON.stringify(this._eventLog)); } catch {}
  }

  getLog() { return this._eventLog; }

  // ── IMPORT / EXPORT ──
  export() {
    return JSON.stringify({
      version: "8.0",
      timestamp: new Date().toISOString(),
      data: this._data,
      eventLog: this._eventLog,
    }, null, 2);
  }

  import(jsonString) {
    try {
      const { data, eventLog } = JSON.parse(jsonString);
      for (const [key, val] of Object.entries(data)) {
        this._data[key] = val;
        this._persist(key);
        this._emit(key);
      }
      if (eventLog) this._eventLog = eventLog;
      this.log("import", { collections: Object.keys(data) });
      return true;
    } catch (e) {
      console.error("Import failed:", e);
      return false;
    }
  }

  // ── RESET TO SEED ──
  reset() {
    for (const [key, seedData] of Object.entries(SEED)) {
      this._data[key] = [...seedData];
      this._persist(key);
      this._emit(key);
    }
    this._eventLog = [];
    localStorage.setItem("molty_eventlog", "[]");
    this.log("reset", {});
  }

  // ── STATS ──
  stats() {
    const s = {};
    for (const [k, v] of Object.entries(this._data)) {
      s[k] = Array.isArray(v) ? v.length : 1;
    }
    s.events = this._eventLog.length;
    return s;
  }
}

// Singleton
export const store = new MoltyStore();

// ── REACT HOOK ──
export function useStore(key) {
  const [data, setData] = useState(() => store.get(key));
  useEffect(() => {
    setData(store.get(key));
    return store.subscribe(key, (newData) => setData([...newData]));
  }, [key]);
  return data;
}

// Convenience hooks
export function useCustomers() { return useStore("customers"); }
export function useMaterials() { return useStore("materials"); }
export function usePipeline() { return useStore("pipeline"); }
export function useActions() { return useStore("actions"); }
export function useTDS() { return useStore("tds"); }
