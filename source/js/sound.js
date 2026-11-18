// ─────────────────────────────────────────────────────────────
//  Procedural sound effects (Web Audio). No audio files: every sound is synthesised from noise and
//  oscillators, so the game stays dependency-free. Sounds are positioned by distance to the listener
//  (volume falls off and distant guns arrive late, at the speed of sound).
// ─────────────────────────────────────────────────────────────
const KEY = 'tankBattleSound';
let ctx = null, master = null, noiseBuf = null, volume = .7, muted = false;
let audioUnlocked = false, resumePending = false, resumeBlocked = false;
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { volume = s.v ?? volume; muted = !!s.m; } } catch (_) {}

function resumeAudio(force = false) {
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed' || resumePending) return;
  if (resumeBlocked && !force) return;
  try {
    const pending = ctx.resume();
    resumePending = true;
    Promise.resolve(pending).then(() => {
      resumePending = false;
      resumeBlocked = false;
    }).catch(() => {
      resumePending = false;
      resumeBlocked = true;
    });
  } catch (_) {
    resumePending = false;
    resumeBlocked = true;
  }
}

function ensure(fromGesture = false) {
  if (fromGesture) { audioUnlocked = true; resumeBlocked = false; }
  if (ctx) { if (audioUnlocked) resumeAudio(fromGesture); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : volume;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (audioUnlocked) resumeAudio(fromGesture);
  return ctx;
}
// Browsers only allow audio after a user gesture. Focus/visibility returns retry an already-unlocked context.
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => ensure(true), { capture: true });
addEventListener('focus', () => { if (audioUnlocked) resumeAudio(true); });
addEventListener('pageshow', () => { if (audioUnlocked) resumeAudio(true); });
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioUnlocked) resumeAudio(true);
});

const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: volume, m: muted })); } catch (_) {} };
export const Sound = {
  get volume() { return volume; }, get muted() { return muted; },
  setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = muted ? 0 : volume; save(); },
  toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : volume; save(); return muted; },
  musicOn: true,
};

// ── building blocks ──
function noise(t0, dur, { f = 1000, q = .7, type = 'lowpass', gain = 1, attack = .002, decay = dur, out = master, f2 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
  if (f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(.0005, t0 + Math.max(attack + .01, decay));
  src.connect(flt); flt.connect(g); g.connect(out);
  src.onended = () => { try { src.disconnect(); } catch (_) {} try { flt.disconnect(); } catch (_) {} try { g.disconnect(); } catch (_) {} };
  src.start(t0, Math.random()); src.stop(t0 + dur + .05);
}
function tone(t0, dur, { f = 200, f2, type = 'sine', gain = .5, attack = .002, out = master } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(10, f2), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(.0005, t0 + dur);
  o.connect(g); g.connect(out);
  o.onended = () => { try { o.disconnect(); } catch (_) {} try { g.disconnect(); } catch (_) {} };
  o.start(t0); o.stop(t0 + dur + .05);
}
// Distance handling: returns {t0, out} or null if inaudible. Far sounds are quieter, duller and delayed.
function place(dist = 0, base = 1) {
  if (!ensure() || muted) return null;
  const d = Math.max(0, dist), vol = base / (1 + d / 40) ** 1.25; if (vol < .012) return null;
  const g = ctx.createGain(); g.gain.value = vol;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 16000 / (1 + d / 60));
  g.connect(lp); lp.connect(master);
  const delay = Math.min(1.2, d / 343);
  // Each positional sound gets its own route; remove it after the longest effect can finish.
  setTimeout(() => { try { g.disconnect(); } catch (_) {} try { lp.disconnect(); } catch (_) {} }, (delay + 4.5) * 1000);
  return { t0: ctx.currentTime + delay, out: g };
}

// ── weapons ──
// cal: gun calibre class. 'small' = MG/autocannon, 'big' = tank gun; kind of shell for missiles/rockets.
// A stable signature makes each named vehicle / weapon sound recognisably different.
const soundHash = (value) => {
  let h = 2166136261;
  for (const ch of String(value || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const soundClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── weapons ──
// Original cinematic game sounds: each weapon family has its own timbre and timing.
// These are intentionally stylised rather than recordings or replicas of real weapons.
// ── weapons ──
// Distinctive original game-audio profiles by ammunition family; stylised, not real recordings.
export function sGun(kind, dist, mine, info = {}) {
  const P = place(dist, mine ? 1 : .9); if (!P) return;
  const { t0, out } = P;
  const ammo = String(info.ammo || 'AP').toUpperCase();
  const signature = [info.vehicle, info.weapon, ammo].join('|');
  const seed = soundHash(signature);
  const pitch = .9 + (seed % 31) / 100 + (Math.random() - .5) * .025;
  const mass = soundClamp(Number(info.power) || 1, .55, 1.45);
  const voices = {
    APFSDS:{snap:4700,body:185,tail:2100,weight:.82}, APDS:{snap:3650,body:235,tail:1450,weight:.9},
    APCR:{snap:5200,body:205,tail:2650,weight:.78}, AP:{snap:3000,body:270,tail:1050,weight:1},
    APHE:{snap:3350,body:115,tail:780,weight:1.18}, HE:{snap:1850,body:92,tail:430,weight:1.28},
    HEM:{snap:950,body:62,tail:310,weight:1.34}, HESH:{snap:1250,body:74,tail:520,weight:1.3},
    HEAT:{snap:4100,body:135,tail:1850,weight:1.08}, AC_AP:{snap:3900,body:165,tail:1850,weight:.9},
    AC_HE:{snap:2100,body:105,tail:720,weight:1.12}, MG:{snap:4300,body:155,tail:1250,weight:.55},
    ATGM:{snap:1250,body:88,tail:2400,weight:1.05}, ROCKET:{snap:1700,body:105,tail:780,weight:1.16}
  };
  const v = voices[ammo] || voices.AP;
  const variation = .94 + (seed % 13) / 100;
  if (kind === 'missile') {
    noise(t0,.16,{f:390*pitch,f2:145,q:.65,type:'lowpass',gain:.4,decay:.15,out});
    noise(t0+.035,1.25,{f:(ammo==='ATGM'?760:520)*pitch,f2:2200*variation,q:.55,type:'bandpass',gain:.34,attack:.07,decay:1.18,out});
    tone(t0+.06,.92,{f:78*pitch,f2:ammo==='ATGM'?205:165,type:'sawtooth',gain:.07,attack:.08,out}); return;
  }
  if (kind === 'rocket') {
    noise(t0,.12,{f:980*pitch,q:.75,type:'bandpass',gain:.38,decay:.1,out});
    noise(t0+.025,.68,{f:(ammo==='ROCKET'?1580:1250)*pitch,f2:330,q:.6,type:'bandpass',gain:.31,attack:.03,decay:.63,out});
    tone(t0,.31,{f:105*pitch,f2:44,type:'triangle',gain:.2,out}); return;
  }
  if (kind === 'mg') {
    noise(t0,.045,{f:v.snap*pitch,q:1.15,type:'bandpass',gain:.47,decay:.04,out});
    noise(t0+.006,.105,{f:v.tail*pitch,f2:610,q:.8,type:'bandpass',gain:.23,decay:.095,out});
    tone(t0,.075,{f:v.body*pitch,f2:64,type:'triangle',gain:.15,out});
    tone(t0+.042,.035,{f:760*variation,f2:450,type:'square',gain:.05,out}); return;
  }
  if (kind === 'ac') {
    if (ammo === 'AC_HE') {
      noise(t0,.065,{f:v.snap*pitch,q:.8,type:'bandpass',gain:.53,decay:.055,out});
      noise(t0+.012,.23,{f:v.body*pitch,f2:180,q:.6,type:'lowpass',gain:.42*mass,decay:.21,out});
      tone(t0,.18,{f:v.body*.8,f2:48,type:'sine',gain:.24*mass,out});
    } else {
      noise(t0,.052,{f:v.snap*pitch,q:1.25,type:'bandpass',gain:.62,decay:.046,out});
      tone(t0,.15,{f:v.body*pitch,f2:50,type:'triangle',gain:.22*mass,out});
      noise(t0+.025,.13,{f:v.tail*pitch,f2:380,q:1,type:'bandpass',gain:.22,decay:.12,out});
    }
    return;
  }
  if (ammo === 'HEM' || /mortar/i.test(String(info.weapon||''))) {
    noise(t0,.13,{f:520*pitch,f2:180,q:.58,type:'lowpass',gain:.55,decay:.12,out});
    tone(t0,.42,{f:72*pitch,f2:35,type:'sine',gain:.43,out});
    noise(t0+.09,.38,{f:260,f2:95,q:.55,type:'lowpass',gain:.24,decay:.34,out}); return;
  }
  if (ammo === 'APFSDS' || ammo === 'APCR') {
    noise(t0,.052,{f:v.snap*pitch,q:.72,type:'highpass',gain:.7,decay:.045,out});
    tone(t0,.23,{f:v.body*pitch,f2:38,type:'triangle',gain:.42*v.weight,out});
    noise(t0+.035,.31,{f:v.tail*pitch,f2:520,q:1.1,type:'bandpass',gain:.17,decay:.28,out}); return;
  }
  if (ammo === 'APDS') {
    noise(t0,.065,{f:v.snap*pitch,q:.85,type:'highpass',gain:.66,decay:.055,out});
    noise(t0+.012,.22,{f:1180*pitch,f2:330,q:1.5,type:'bandpass',gain:.2,decay:.2,out});
    tone(t0,.29,{f:v.body*pitch,f2:46,type:'triangle',gain:.35,out}); return;
  }
  if (ammo === 'HE') {
    noise(t0,.12,{f:v.snap*pitch,f2:260,q:.6,type:'lowpass',gain:.6,decay:.11,out});
    noise(t0+.025,.86,{f:v.body*pitch,f2:48,q:.52,type:'lowpass',gain:.72*mass,decay:.8,out});
    tone(t0,.62,{f:v.body*.72,f2:26,type:'sine',gain:.54*mass,out});
    noise(t0+.12,.42,{f:v.tail*pitch,f2:180,q:.55,type:'lowpass',gain:.16,decay:.38,out}); return;
  }
  if (ammo === 'HESH') {
    noise(t0,.09,{f:v.snap*pitch,f2:180,q:.55,type:'lowpass',gain:.52,decay:.08,out});
    tone(t0,.58,{f:v.body*pitch,f2:27,type:'sine',gain:.62*mass,out});
    noise(t0+.08,.52,{f:v.tail*pitch,f2:125,q:.7,type:'lowpass',gain:.29,decay:.48,out}); return;
  }
  if (ammo === 'HEAT') {
    noise(t0,.045,{f:v.snap*pitch,q:.9,type:'highpass',gain:.62,decay:.04,out});
    noise(t0+.018,.62,{f:v.tail*pitch,f2:420,q:.7,type:'bandpass',gain:.24,decay:.58,out});
    tone(t0,.34,{f:v.body*pitch,f2:34,type:'sine',gain:.49*mass,out}); return;
  }
  if (ammo === 'APHE') {
    noise(t0,.06,{f:v.snap*pitch,q:.8,type:'highpass',gain:.68,decay:.05,out});
    tone(t0,.38,{f:v.body*pitch,f2:32,type:'sine',gain:.62*mass,out});
    noise(t0+.055,.72,{f:v.tail*pitch,f2:58,q:.56,type:'lowpass',gain:.68*mass,decay:.66,out});
    noise(t0+.11,.16,{f:1800*pitch,q:1.5,type:'bandpass',gain:.14,decay:.14,out}); return;
  }
  noise(t0,.065,{f:v.snap*pitch,q:.7,type:'highpass',gain:.64,decay:.055,out});
  noise(t0,.78,{f:v.body*pitch,f2:66,q:.55,type:'lowpass',gain:.82*mass,attack:.006,decay:.72,out});
  tone(t0,.42,{f:68*pitch,f2:28,type:'sine',gain:.56*mass,out});
  noise(t0+.035,.34,{f:v.tail*pitch,f2:165,q:.65,type:'lowpass',gain:.28*mass,decay:.3,out});
}
export function sReloaded(info = {}) {
  const P=place(0,.58); if(!P)return; const {t0,out}=P;
  const seed=soundHash([info.vehicle,info.weapon].join('|')), pitch=.88+(seed%27)/100;
  if(/autoloader|drum|magazine/i.test(String(info.weapon||''))) {
    noise(t0,.07,{f:1750*pitch,q:3,type:'bandpass',gain:.24,decay:.06,out});
    tone(t0+.075,.11,{f:390*pitch,f2:210,type:'triangle',gain:.18,out});
    noise(t0+.19,.08,{f:2800*pitch,q:4,type:'bandpass',gain:.22,decay:.07,out}); return;
  }
  tone(t0,.055,{f:520*pitch,f2:330,type:'square',gain:.14,out});
  noise(t0+.045,.09,{f:2100*pitch,q:3.2,type:'bandpass',gain:.25,decay:.08,out});
  tone(t0+.12,.085,{f:265*pitch,f2:155,type:'triangle',gain:.13,out});
}

// ── impacts ──
// Impact textures vary with round family; the effects remain stylised game audio.
export function sHit(kind, dist, big, onMe, info = {}) {
  const P=place(dist,onMe?1.2:1); if(!P)return; const {t0,out}=P;
  const ammo=String(info.ammo||'AP').toUpperCase();
  const seed=soundHash([ammo,info.source,info.weapon].join('|')), pitch=.88+(seed%29)/100;
  const metal=['APFSDS','APDS','APCR','AP'].includes(ammo);
  const blastLike=['HE','HEM','APHE','HESH','HEAT','AC_HE','ROCKET'].includes(ammo);
  if(kind==='ricochet') {
    tone(t0,metal?.42:.28,{f:(metal?2300:1450)*pitch,f2:580*pitch,type:'triangle',gain:.25,out});
    noise(t0,.05,{f:(metal?4900:3200)*pitch,type:'highpass',gain:.3,decay:.04,out});
    tone(t0+.07,.18,{f:(metal?1420:760)*pitch,f2:380,type:'sine',gain:.07,out}); return;
  }
  if(kind==='pen') {
    const hitTone=metal?720:blastLike?390:560;
    noise(t0,.075,{f:(metal?3800:2300)*pitch,q:metal?1.6:.8,type:'bandpass',gain:.62,decay:.065,out});
    tone(t0,.3,{f:hitTone*pitch,f2:metal?250:115,type:metal?'triangle':'sine',gain:.17,out});
    noise(t0+.018,.48,{f:metal?780:420,f2:95,q:.6,type:'lowpass',gain:big?.56:.3,decay:.44,out});
    if(['HEAT','HE','APHE','AC_HE'].includes(ammo)) noise(t0+.04,.28,{f:1500*pitch,f2:460,q:.6,type:'bandpass',gain:.16,decay:.25,out});
    if(onMe) { noise(t0,.7,{f:128,f2:55,q:.55,type:'lowpass',gain:.7,decay:.65,out}); tone(t0,.5,{f:48,f2:24,type:'sine',gain:.5,out}); }
    return;
  }
  if(kind==='blast') {
    noise(t0,ammo==='HEM'?.9:.64,{f:(ammo==='HEM'?330:470)*pitch,f2:82,q:.56,type:'lowpass',gain:.72,decay:.6,out});
    noise(t0+.02,.21,{f:blastLike?1750:1050,f2:390,q:.7,type:'bandpass',gain:.19,decay:.18,out}); return;
  }
  tone(t0,.23,{f:(big?310:680)*pitch,f2:big?185:360,type:'triangle',gain:.22,out});
  noise(t0,.105,{f:(metal?1800:1250)*pitch,q:1,type:'bandpass',gain:.37,decay:.09,out});
  noise(t0+.055,.22,{f:metal?620:410,f2:135,q:.65,type:'lowpass',gain:.2,decay:.2,out});
}
export function sGround(dist,big,info={}) {
  const P=place(dist,big?1:.5); if(!P)return; const {t0,out}=P;
  const ammo=String(info.ammo||'AP').toUpperCase(), seed=soundHash([ammo,info.source].join('|')), pitch=.9+(seed%21)/100;
  if(['HE','HEM','APHE','HESH','HEAT','AC_HE','ROCKET'].includes(ammo)) {
    noise(t0,big?1:.34,{f:big?350*pitch:920*pitch,f2:big?74:310,q:.55,type:'lowpass',gain:big?.78:.36,decay:big?.92:.3,out});
    noise(t0+.035,.22,{f:1250*pitch,f2:330,q:.7,type:'bandpass',gain:.14,decay:.2,out});
  } else {
    noise(t0,big?.68:.2,{f:(big?530:1550)*pitch,f2:big?145:580,q:.8,type:'bandpass',gain:big?.54:.29,decay:big?.62:.17,out});
    tone(t0,.12,{f:big?105:270,f2:42,type:'triangle',gain:big?.2:.08,out});
  }
}
export function sExplosion(dist,huge,info={}) {
  const P=place(dist,huge?1.55:1.12); if(!P)return; const {t0,out}=P;
  const seed=soundHash([info.vehicle,info.engine,info.air].join('|')), pitch=.88+(seed%25)/100;
  const scale=soundClamp(Number(info.mass)?Math.sqrt(Number(info.mass)/30):1,.65,1.5), aircraft=!!info.air;
  noise(t0,aircraft?.095:.14,{f:(aircraft?3900:2700)*pitch,type:'highpass',gain:aircraft?.62:.72,decay:.12,out});
  noise(t0,aircraft?2.1:2.65,{f:(aircraft?380:280)*pitch,f2:aircraft?65:42,q:.55,type:'lowpass',gain:.95*scale,attack:.012,decay:aircraft?1.95:2.5,out});
  tone(t0,aircraft?.85:1.15,{f:(aircraft?72:52)*pitch,f2:20,type:'sine',gain:.75*scale,out});
  for(let i=0;i<(aircraft?8:5);i++) noise(t0+.22+Math.random()*(aircraft?.9:1.25),.1+Math.random()*.06,{f:950+(seed%900)+Math.random()*1500,q:2,type:'bandpass',gain:.14+Math.random()*.08,decay:.1,out});
}

export function sUi(kind) {
  const P = place(0, .5); if (!P) return; const { t0, out } = P;
  if (kind === 'cap') { tone(t0, .15, { f: 660, type: 'triangle', gain: .3, out }); tone(t0 + .15, .25, { f: 990, type: 'triangle', gain: .3, out }); }
  else if (kind === 'lost') { tone(t0, .2, { f: 520, type: 'triangle', gain: .3, out }); tone(t0 + .18, .35, { f: 330, type: 'triangle', gain: .3, out }); }
  else if (kind === 'wrench') { for (let i = 0; i < 3; i++) noise(t0 + i * .11, .05, { f: 4200, q: 6, type: 'bandpass', gain: .35, decay: .04, out }); }
  else if (kind === 'kill') { tone(t0, .12, { f: 880, type: 'square', gain: .12, out }); tone(t0 + .1, .2, { f: 1320, type: 'square', gain: .12, out }); }
}

// ── continuous engine / rotor / jet sound for your own vehicle ──
let eng=null;
export function engine(kind,load,speed,on,details={}) {
  if(!ensure()||!on) { if(eng&&ctx) eng.g.gain.setTargetAtTime(0,ctx.currentTime,.18); return; }
  const engineName=String(details.engineName||'generic engine'), vehicleName=String(details.vehicleName||'vehicle');
  const lower=engineName.toLowerCase(), signature=[kind,engineName,vehicleName].join('|');
  const dieselFuel=/diesel|multi[- ]?fuel|multifuel/.test(lower);
  const family=/radial/.test(lower)?'radial':/flat[- ]?\d|boxer/.test(lower)?'flat':
    /turboshaft/.test(lower)?'turboshaft':/turbojet|turbofan|afterburner/.test(lower)?'jet':
    /v12|12y|meteor/.test(lower)?(dieselFuel?'v12diesel':'v12'):
    /v10/.test(lower)?(dieselFuel?'v10diesel':'v10'):
    /v8/.test(lower)?(dieselFuel?'v8diesel':'v8'):
    /v6|6[- ]cyl|six[- ]cylinder/.test(lower)?(dieselFuel?'v6diesel':'v6'):
    /inline|4[- ]cyl|four[- ]cylinder/.test(lower)?(dieselFuel?'inlinediesel':'inline'):
    /multi[- ]?fuel/.test(lower)?'multifuel':/turbodiesel|turbo diesel/.test(lower)?'turbodiesel':
    /diesel/.test(lower)?'diesel':/petrol|gasoline/.test(lower)?'petrol':'generic';
  const voices={
    radial:{base:27,rev:30,roar:390,pulse:23,rough:.052,saw:'sawtooth',harmonic:2.45,rattle:1.28},
    flat:{base:31,rev:27,roar:330,pulse:17,rough:.028,saw:'triangle',harmonic:2,rattle:.62},
    v12:{base:43,rev:31,roar:520,pulse:32,rough:.018,saw:'triangle',harmonic:3,rattle:.42},
    v12diesel:{base:29,rev:25,roar:325,pulse:17,rough:.052,saw:'sawtooth',harmonic:2.05,rattle:1.18},
    v10:{base:34,rev:35,roar:430,pulse:27,rough:.044,saw:'sawtooth',harmonic:2.55,rattle:1.12},
    v10diesel:{base:27,rev:29,roar:335,pulse:18,rough:.058,saw:'sawtooth',harmonic:2.08,rattle:1.24},
    v8:{base:39,rev:34,roar:465,pulse:24,rough:.026,saw:'sawtooth',harmonic:2.35,rattle:.78},
    v8diesel:{base:31,rev:28,roar:350,pulse:18,rough:.05,saw:'sawtooth',harmonic:2.12,rattle:1.08},
    v6:{base:30,rev:28,roar:370,pulse:19,rough:.034,saw:'triangle',harmonic:2.2,rattle:.85},
    v6diesel:{base:25,rev:24,roar:295,pulse:15,rough:.056,saw:'sawtooth',harmonic:2.02,rattle:1.22},
    inlinediesel:{base:28,rev:27,roar:310,pulse:16,rough:.052,saw:'square',harmonic:2.1,rattle:1.1},
    inline:{base:46,rev:38,roar:580,pulse:31,rough:.03,saw:'square',harmonic:2.7,rattle:.95},
    multifuel:{base:23,rev:24,roar:270,pulse:14,rough:.062,saw:'sawtooth',harmonic:1.9,rattle:1.35},
    turbodiesel:{base:26,rev:29,roar:315,pulse:16,rough:.05,saw:'sawtooth',harmonic:2,rattle:1.15},
    diesel:{base:25,rev:26,roar:290,pulse:15,rough:.055,saw:'sawtooth',harmonic:2,rattle:1.2},
    petrol:{base:37,rev:36,roar:490,pulse:24,rough:.022,saw:'triangle',harmonic:2.5,rattle:.7},
    turboshaft:{base:37,rev:38,roar:590,pulse:21,rough:.018,saw:'sawtooth',harmonic:3.2,rattle:.35},
    jet:{base:0,rev:0,roar:900,pulse:0,rough:0,saw:'sawtooth',harmonic:1.5,rattle:.1},
    generic:{base:30,rev:30,roar:340,pulse:18,rough:.035,saw:'sawtooth',harmonic:2.2,rattle:.8}
  };
  const baseVoice=voices[family], modelSeed=soundHash(engineName);
  // A model-specific offset gives different named engines their own pitch, pulse and harmonic colour.
  const profile={
    ...baseVoice,
    base:Math.max(12,baseVoice.base+(((modelSeed>>>3)%25)-12)*.42),
    rev:Math.max(10,baseVoice.rev+(((modelSeed>>>7)%17)-8)*.8),
    roar:Math.max(120,baseVoice.roar+(((modelSeed>>>10)%181)-90)),
    pulse:Math.max(8,baseVoice.pulse+(((modelSeed>>>16)%7)-3)),
    harmonic:baseVoice.harmonic+(((modelSeed>>>20)%9)-4)*.025
  };
  const seed=soundHash(signature), variation=((seed>>>4)%17)-8;
  const engineRPM=soundClamp(Number(details.rpm)||(kind==='jet'?9000:2200),700,15000);
  const hp=soundClamp(Number(details.hp)||Number(details.thrust)*65||220,40,1800), scale=soundClamp(Math.sqrt(hp/250),.65,1.55);

  if(!eng||eng.signature!==signature) {
    if(eng){eng.g.gain.setTargetAtTime(0,ctx.currentTime,.06);const old=eng;setTimeout(()=>old.stop(),420);}
    const g=ctx.createGain();g.gain.value=0;g.connect(master);const nodes=[];
    const osc=(type,f,gv)=>{const o=ctx.createOscillator();o.type=type;o.frequency.value=f;const og=ctx.createGain();og.gain.value=gv;o.connect(og);og.connect(g);o.start();nodes.push(o,og);return o;};
    const nz=(f,q,gv,type='bandpass')=>{const src=ctx.createBufferSource();src.buffer=noiseBuf;src.loop=true;const fl=ctx.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const ng=ctx.createGain();ng.gain.value=gv;src.connect(fl);fl.connect(ng);ng.connect(g);src.start();nodes.push(src,fl,ng);return{filter:fl,gain:ng};};
    const lfo=(rate,depth)=>{const o=ctx.createOscillator();o.type='sine';o.frequency.value=rate;const amount=ctx.createGain();amount.gain.value=depth;o.connect(amount);amount.connect(g.gain);o.start();nodes.push(o,amount);return o;};
    const e={kind,family,profile,signature,g,nodes,stop:()=>{nodes.forEach(n=>{try{if(n.stop)n.stop();}catch(_){}try{n.disconnect();}catch(_){}});try{g.disconnect();}catch(_){}}};
    if(kind==='jet'||family==='jet') {
      e.whine=osc('sawtooth',540+engineRPM*.045+variation*7,.042);e.harm=osc('sine',1150+engineRPM*.08+variation*11,.024);
      e.roar=nz(520+engineRPM*.04,.5,.48,'lowpass');e.hiss=nz(3100+variation*55,.65,.15,'highpass');
    } else if(kind==='heli') {
      e.thump=osc('sine',19+variation*.12,.045);e.whine=osc('sawtooth',(family==='turboshaft'?390:290)+variation*7,.025);
      e.roar=nz(profile.roar*.6,.6,.42,'lowpass');e.lfo=lfo(profile.pulse,.035+profile.rough);
      e.turbine=nz(1900+variation*45,.9,.08,'bandpass');
    } else if(kind==='prop') {
      const base=profile.base+variation*.5;e.saw=osc(profile.saw,base,family==='radial'?.13:.09);
      e.harm=osc('triangle',base*profile.harmonic,.045);e.roar=nz(profile.roar,.65,.3*scale,'lowpass');
      e.wind=nz(1550+variation*25,.45,.09,'highpass');e.lfo=lfo(profile.pulse,.025+profile.rough);
      if(family==='radial'||family==='v12') e.clatter=nz(family==='radial'?1250:2050,1.2,family==='radial'?.08:.035);
    } else {
      const base=profile.base+variation*.38;e.saw=osc(profile.saw,base,family==='v12'||family==='v8'?.11:.14);
      e.harm=osc('triangle',base*profile.harmonic,.045+profile.rough*.35);e.rumble=osc('sine',base*.47,.055);
      e.roar=nz(profile.roar+hp*.16,.65,.3*scale,'lowpass');e.lfo=lfo(profile.pulse+(seed%4),.025+profile.rough);
      const clatter=nz((kind==='tracks'?1550:700)*profile.rattle,1.15,0);
      e.clatter=clatter.filter;e.clatterGain=clatter.gain;
      const road=nz(kind==='tracks'?980:420,kind==='tracks'?1.35:.72,0,'bandpass');
      e.road=road.filter;e.roadGain=road.gain;
    }
    eng=e;
  }
  const t=ctx.currentTime,e=eng,L=soundClamp(load,0,1),S=soundClamp(speed,0,1),rpmLoad=.18+.58*L+.24*S;
  e.g.gain.setTargetAtTime(kind==='jet'||family==='jet'?.14+.14*L:kind==='heli'?.2+.055*L:kind==='prop'?.15+.08*L:.16+.105*L,t,.16);
  if(kind==='jet'||family==='jet') {
    e.whine.frequency.setTargetAtTime(330+engineRPM*.05+L*650+S*240+variation*8,t,.25);
    e.harm.frequency.setTargetAtTime(760+engineRPM*.07+L*820,t,.28);
    e.roar.filter.frequency.setTargetAtTime(360+engineRPM*.035+L*980,t,.3);
    e.hiss.filter.frequency.setTargetAtTime(2050+L*2100+variation*20,t,.3);
  } else if(kind==='heli') {
    e.lfo.frequency.setTargetAtTime(profile.pulse+L*4+S*2,t,.28);
    e.whine.frequency.setTargetAtTime((family==='turboshaft'?310:245)+engineRPM*.012+L*180+variation*3,t,.28);
    e.roar.filter.frequency.setTargetAtTime(profile.roar*.42+L*250,t,.3);
    e.turbine.filter.frequency.setTargetAtTime(1450+L*900+variation*16,t,.3);
  } else if(kind==='prop') {
    e.saw.frequency.setTargetAtTime(profile.base+variation*.5+L*profile.rev,t,.2);
    e.harm.frequency.setTargetAtTime((profile.base+variation*.5+L*profile.rev)*profile.harmonic,t,.2);
    e.roar.filter.frequency.setTargetAtTime(profile.roar*.6+L*340,t,.24);
    e.wind.filter.frequency.setTargetAtTime(1050+S*1850,t,.25);
    if(e.clatter)e.clatter.frequency.setTargetAtTime((family==='radial'?1050:1800)+L*420,t,.25);
  } else {
    const base=profile.base+variation*.38+rpmLoad*profile.rev;
    e.saw.frequency.setTargetAtTime(base,t,.18);e.harm.frequency.setTargetAtTime(base*profile.harmonic,t,.18);
    e.rumble.frequency.setTargetAtTime(base*.47+rpmLoad*4,t,.2);
    e.roar.filter.frequency.setTargetAtTime(profile.roar*.62+hp*.12+rpmLoad*170,t,.22);
    if(e.clatterGain)e.clatterGain.gain.setTargetAtTime(S*(kind==='tracks'?.12:.035),t,.12);
    if(e.clatter)e.clatter.frequency.setTargetAtTime((kind==='tracks'?1450:660)*profile.rattle+S*360,t,.18);
    if(e.roadGain?.gain)e.roadGain.gain.setTargetAtTime(S*(kind==='tracks'?.18:.095),t,.12);
    if(e.road)e.road.frequency.setTargetAtTime(kind==='tracks'?740+S*950:310+S*460,t,.18);
  }
}
export function engineOff(){if(eng&&ctx){eng.g.gain.setTargetAtTime(0,ctx.currentTime,.1);const old=eng;eng=null;setTimeout(()=>old.stop(),500);}}

// ── hangar music: a slow procedural march (pads + bass + snare), looping while you are in the hangar ──
let mus = null;
const CH = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], hz = (n) => 440 * 2 ** ((n - 69) / 12);
export function music(on) {
  if (!on) { if (mus) { mus.g.gain.setTargetAtTime(0, ctx.currentTime, .4); clearInterval(mus.iv); const o = mus; setTimeout(() => o.g.disconnect(), 1500); mus = null; } return; }
  if (mus || !ensure() || muted) return;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(master); g.gain.setTargetAtTime(.22, ctx.currentTime, 1);
  const bar = 2.4; let next = ctx.currentTime + .1, i = 0;
  const sched = () => { while (next < ctx.currentTime + 1.5) { const c = CH[i % 4];
      for (const n of c) { tone(next, bar * .95, { f: hz(n), type: 'triangle', gain: .09, attack: .4, out: g }); tone(next, bar * .95, { f: hz(n) * 1.004, type: 'sine', gain: .05, attack: .5, out: g }); }
      for (let b = 0; b < 4; b++) { const t = next + b * bar / 4; tone(t, .3, { f: hz(c[0] - 24), type: 'sine', gain: .35, out: g }); if (b % 2) noise(t, .12, { f: 1800, q: .8, type: 'bandpass', gain: .12, decay: .1, out: g }); }
      if (i % 2) tone(next + bar / 2, bar / 2, { f: hz(c[2] + 12), type: 'triangle', gain: .06, attack: .05, out: g });
      next += bar; i++; } };
  sched(); mus = { g, iv: setInterval(sched, 500) };
}
