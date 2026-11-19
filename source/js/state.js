import { VEH, NATIONS, CATS, PRESET_CATS, STARTERS, SLOT_PRICES, MAX_SLOTS, isAir } from './data.js';

const KEY = 'tankBattleProfile_v3';
const defaultNation = (id) => {
  const st = STARTERS[id];
  const owned = [...st.army, ...st.air];
  const blank = (n) => Array(n).fill(null);
  const presets = CATS.filter((c) => PRESET_CATS.includes(c.id)).map((c) => {
    const s = blank(3); (st[c.id] || []).forEach((v, i) => (s[i] = v));
    return { name: c.name, cat: c.id, slots: s, base: 1 };
  });
  return { owned, rp: {}, target: null, slots: 3, presets, cur: 0, camo: {}, camoOwned: [] };
};

export const S = {
  name: 'Commander', sl: 60000, ge: 0, xp: 0, nat: 'ZA', nations: {},
  load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) Object.assign(this, d); } catch (_) {}
    for (const n of NATIONS) if (!this.nations[n.id]) this.nations[n.id] = defaultNation(n.id);
    // keep data consistent with the current vehicle list
    for (const n of NATIONS) {
      // Vehicles that moved to another nation's tree (or were removed) leave this nation; starters are always owned.
      const N = this.nations[n.id], mine = (v) => VEH[v] && VEH[v].nat === n.id;
      N.owned = N.owned.filter(mine);
      for (const v of [...(STARTERS[n.id].army || []), ...(STARTERS[n.id].air || [])]) if (!N.owned.includes(v)) N.owned.push(v);
      if (N.target && !mine(N.target)) N.target = null;
      // Helicopters have no preset of their own: drop old Helicopter presets (any helicopters in them stay owned).
      const curP = N.presets[N.cur];
      N.presets = N.presets.filter((p) => PRESET_CATS.includes(p.cat));
      N.cur = Math.max(0, N.presets.indexOf(curP));
      if (!N.presets.length) N.presets = defaultNation(n.id).presets;
      for (const p of N.presets) { p.slots = p.slots.filter((_, i) => i < MAX_SLOTS).map((v) => (v && mine(v) ? v : null)); while (p.slots.length < N.slots) p.slots.push(null); }
      if (N.cur >= N.presets.length) N.cur = 0;
    }
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify({ name: this.name, named: this.named, sl: this.sl, ge: this.ge, xp: this.xp, nat: this.nat, nations: this.nations })); } catch (_) {} },
  reset() { try { localStorage.removeItem(KEY); } catch (_) {} this.name = this.name || 'Commander'; this.sl = 60000; this.xp = 0; this.nat = 'ZA'; this.nations = {}; this.load(); this.save(); },
  get N() { return this.nations[this.nat]; },
  get preset() { return this.N.presets[this.N.cur] || this.N.presets[0]; },
  level() { return 1 + Math.floor(Math.sqrt(this.xp / 400)); },

  owns(n) { return this.nations[VEH[n].nat].owned.includes(n); },
  researched(n) { const N = this.nations[VEH[n].nat]; return N.owned.includes(n) || (N.rp[n] || 0) >= VEH[n].rp; },
  // Requirement for research: ONLY the vehicle directly above it in the same column.
  // A column's first vehicle above rank I needs any vehicle of the previous rank in that nation's tree.
  requirement(n) {
    const V = VEH[n];
    if (V.parent) return { ok: this.owns(V.parent), text: V.parent };
    if (V.rank <= 1 || !V.rp) return { ok: true, text: '' };
    // Helicopter trees open up from the nation's ground vehicles too.
    const grp = (c) => (c === 'heli' ? 'army' : c);
    const N = this.nations[V.nat], ok = N.owned.some((o) => grp(VEH[o].cat) === grp(V.cat) && VEH[o].rank >= V.rank - 1);
    return { ok, text: 'any rank ' + ['', 'I', 'II', 'III', 'IV'][V.rank - 1] + ' vehicle' };
  },
  status(n) {
    if (this.owns(n)) return 'owned';
    if (this.researched(n)) return 'buy';
    if (!this.requirement(n).ok) return 'locked';
    return this.N.target === n || this.nations[VEH[n].nat].target === n ? 'researching' : 'available';
  },
  setTarget(n) { const N = this.nations[VEH[n].nat]; N.target = n; const f = N.free || 0; N.free = 0; if (f) this.addRP(VEH[n].nat, f); this.save(); },
  buy(n) { const V = VEH[n]; if (this.sl < V.sl || !this.researched(n)) return false; this.sl -= V.sl; this.nations[V.nat].owned.push(n); if (this.nations[V.nat].target === n) this.nations[V.nat].target = null; this.save(); return true; },
  addRP(nat, rp) {
    const N = this.nations[nat]; let left = rp;
    if (N.target && !this.researched(N.target)) { const need = VEH[N.target].rp - (N.rp[N.target] || 0), t = Math.min(need, left); N.rp[N.target] = (N.rp[N.target] || 0) + t; left -= t; }
    if (left > 0 && !(N.target && !this.researched(N.target))) N.free = (N.free || 0) + left;
    return 0;
  },
  slotPrice() { return SLOT_PRICES[this.N.slots] ?? null; },
  buySlot() {
    const p = this.slotPrice(); if (p == null || this.sl < p) return false;
    this.sl -= p; this.N.slots++; this.N.presets.forEach((pr) => pr.slots.push(null)); this.save(); return true;
  },
  fits(preset, n) {
    const V = VEH[n];
    if (preset.cat === 'army') return V.cat === 'army' || V.cat === 'air' || V.cat === 'heli';
    if (preset.cat === 'air') return V.cat === 'air' || V.cat === 'heli';
    return V.cat === preset.cat;
  },
  presetBR(p) { const l = p.slots.filter(Boolean); return l.length ? Math.max(...l.map((v) => VEH[v].br)) : 0; },
  newPreset(name, cat) { this.N.presets.push({ name, cat, slots: Array(this.N.slots).fill(null) }); this.N.cur = this.N.presets.length - 1; this.save(); },
  setSlot(i, n) {
    const p = this.preset; const j = p.slots.indexOf(n);
    if (j >= 0) p.slots[j] = p.slots[i];
    p.slots[i] = n; this.save();
  },
};
export const brStr = (b) => b.toFixed(1);
export const modeName = (p) => {
  const hasGround = p.slots.some((v) => v && !isAir(v));
  if (p.cat === 'blue' || p.cat === 'coast') return 'Naval Battles';
  return p.cat === 'air' || !hasGround ? 'Air Realistic Battles' : 'Ground Realistic Battles';
};
