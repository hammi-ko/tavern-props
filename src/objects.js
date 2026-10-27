// Десять предметов таверны. Единицы — метры, низ объекта на y = 0, перед смотрит в +Z.
import * as THREE from 'three';
import {
  seed, rand, pick, n3, setRes, RES, mesh, weld, roundedBox, lathe, filletProfile, densify, tube,
  chips, sculpt, grain, taper, plank, stone, nail, place, group, groove, wedgeCut, forEachV,
} from './lib.js';

// Временно сменить плотность сетки (мелкие предметы внутри крупных).
function withRes(r, fn) { const old = RES; setRes(r); try { return fn(); } finally { setRes(old); } }

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

// Поставить меш так, чтобы его ось +Y смотрела вдоль dir.
function orient(m, dir, pos) {
  m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  if (pos) m.position.copy(pos);
  return m;
}

function nailAt(r, x, y, z, dir = [0, 1, 0]) {
  return orient(mesh(nail(r)), new THREE.Vector3(...dir), new THREE.Vector3(x, y, z));
}

// Брус между двумя точками (ось бруса — Y).
function beamBetween(a, b, w, d, opts = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = plank(w, len, d, { axis: 'y', ...opts });
  const m = mesh(g);
  orient(m, B.clone().sub(A), A.clone().add(B).multiplyScalar(0.5));
  return m;
}

// ---------------------------------------------------------------- кружка
function tankardParts({ foam = true, scale = 1 } = {}) {
  const parts = [];
  const H = 0.15;
  const inBand = (y) => (y > 0.0155 && y < 0.0345) || (y > 0.1105 && y < 0.1285);
  const N = 11;
  const staveOff = Array.from({ length: N }, () => rand(-0.0009, 0.0009));
  const ph = rand(0, 1);
  const prof = filletProfile([
    [0, 0.0015], [0.05, 0], [0.0565, 0.005],
    [0.0565, 0.0158], [0.0598, 0.0165], [0.0598, 0.0335], [0.0556, 0.0342],
    [0.0526, 0.1105], [0.0562, 0.1112], [0.0562, 0.1278], [0.0523, 0.1285],
    [0.0512, H], [0.0505, H + 0.003], [0.0452, H + 0.003], [0.0446, H - 0.002],
    [0.0462, 0.02], [0.04, 0.012], [0, 0.012],
  ], 0.0018, 4);
  const body = lathe(prof, {
    segs: 132,
    fn: (r, y, th) => {
      if (r < 0.048 || inBand(y) || y < 0.006) return r;
      const f = ((th / TAU) * N + ph) % 1;
      const k = Math.floor(((th / TAU) * N + ph) % N);
      const e = Math.min(f, 1 - f);
      return r + staveOff[k] - 0.0022 * Math.exp(-((e / 0.03) ** 2));
    },
  });
  sculpt(body, { amp: 0.00025, freq: 45, wobble: 0.0009, wfreq: 10, dents: 5, dentR: 0.009, dentD: 0.0009 });
  parts.push(mesh(body));

  // заклёпки на обручах
  for (const by of [0.025, 0.119]) {
    const rr = by < 0.05 ? 0.0598 : 0.0562;
    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * TAU + 0.3;
      const d = new THREE.Vector3(Math.cos(th), 0, -Math.sin(th));
      parts.push(orient(mesh(nail(0.0028)), d, d.clone().multiplyScalar(rr).setY(by)));
    }
  }

  // ручка
  for (const g of tube([[0.047, 0.121], [0.074, 0.126], [0.093, 0.108], [0.096, 0.075], [0.087, 0.046], [0.068, 0.034], [0.05, 0.03]].map(([x, y]) => [x, y, 0]), 0.0075, { flat: 1.45, radial: 18 })) {
    sculpt(g, { amp: 0.0002, freq: 50, wobble: 0.0008, wfreq: 15 });
    parts.push(mesh(g));
  }
  // обойма ручки
  const ring = lathe(filletProfile([[0.0, -0.006], [0.0105, -0.006], [0.0105, 0.006], [0.0, 0.006]], 0.002, 3), { segs: 32 });
  const rm = mesh(ring); rm.position.set(0.0945, 0.09, 0); rm.scale.set(1, 1, 1.35); parts.push(rm);

  if (foam) {
    const fprof = densify([[0, 0.171], [0.02, 0.1705], [0.038, 0.1675], [0.05, 0.161], [0.0565, 0.153], [0.0555, 0.147], [0.049, 0.1445], [0.044, 0.147], [0, 0.147]], 0.0015);
    const foamG = lathe(fprof, {
      segs: 120,
      fn: (r, y, th) => r * (1 + 0.06 * n3(Math.cos(th) * 2.2, Math.sin(th) * 2.2, y * 30) + 0.04 * Math.sin(th * 7 + 1)),
    });
    sculpt(foamG, { amp: 0.0012, freq: 55, wobble: 0.0015, wfreq: 25 });
    parts.push(mesh(foamG));
    for (let i = 0; i < 3; i++) {
      const th = rand(0, TAU), len = rand(0.012, 0.03);
      const p = (t, rr) => [Math.cos(th) * rr, 0.151 - t * len, -Math.sin(th) * rr];
      const tg = tube([p(0, 0.0555), p(0.5, 0.0546), p(1, 0.0538)], rand(0.0038, 0.0048), { radial: 14 });
      // капля сужается вверх к пене и раздувается на конце
      for (const g of tg) parts.push(mesh(g));
    }
    for (let i = 0; i < 7; i++) {
      const th = rand(0, TAU), rr = rand(0, 0.045);
      const s = new THREE.SphereGeometry(rand(0.003, 0.0065), 16, 10);
      const y = 0.171 - (rr / 0.05) ** 2 * 0.012;
      s.translate(Math.cos(th) * rr, y, -Math.sin(th) * rr);
      parts.push(mesh(weld(s)));
    }
  }
  const g = group(parts);
  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------- мелкая утварь

// Глубокая тарелка (R — радиус по краю).
function deepPlateGeo(R = 0.13, H = 0.05) {
  const k = R / 0.13, h = H / 0.05;
  const P = (r, y) => [r * k, y * h];
  const prof = filletProfile([
    P(0, 0.0045), P(0.05, 0.0045), P(0.052, 0), P(0.06, 0), P(0.063, 0.007),
    P(0.09, 0.024), P(0.112, 0.037), P(0.128, 0.0445), P(0.134, 0.048), P(0.132, 0.0515),
    P(0.119, 0.0505), P(0.1155, 0.0485), P(0.112, 0.0502), P(0.1, 0.0485),
    P(0.088, 0.042), P(0.068, 0.024), P(0.045, 0.0135), P(0, 0.012),
  ], 0.0025 * k, 4);
  const wav = rand(0, TAU);
  const g = lathe(prof, { segs: 140, fn: (r, y, th) => (r > 0.1 * k ? r * (1 + 0.012 * Math.sin(th * 5 + wav) + 0.008 * n3(Math.cos(th) * 3, Math.sin(th) * 3, 1)) : r) });
  chips(g, 3, 0.0015 * k, 0.004 * k, { bias: new THREE.Vector3(1, 0.3, 1) });
  sculpt(g, { amp: 0.0004 * k, freq: 40 / k, wobble: 0.0012 * k, wfreq: 8 / k, dents: 5, dentR: 0.012 * k, dentD: 0.0012 * k });
  return g;
}

// Плоская тарелка для полок.
function flatPlateGeo(R = 0.11) {
  const k = R / 0.11;
  const prof = filletProfile([[0, 0.003 * k], [0.045 * k, 0.003 * k], [0.05 * k, 0], [0.11 * k, 0.012 * k], [0.112 * k, 0.017 * k], [0.104 * k, 0.016 * k], [0.08 * k, 0.009 * k], [0, 0.008 * k]], 0.002 * k, 3);
  const g = lathe(prof, { segs: 72 });
  sculpt(g, { amp: 0.0004 * k, freq: 40 / k, wobble: 0.001 * k, wfreq: 8 / k, dents: 2, dentR: 0.01 * k, dentD: 0.001 * k });
  return g;
}

function bottleGeo(h = 0.26, r = 0.06) {
  const s = h / 0.26;
  const prof = filletProfile([
    [0, 0], [r * 0.85, 0], [r, 0.02 * s], [r * 1.02, 0.08 * s], [r * 0.85, 0.13 * s], [r * 0.4, 0.17 * s],
    [0.017 * s, 0.19 * s], [0.016 * s, 0.225 * s], [0.022 * s, 0.228 * s], [0.022 * s, 0.24 * s], [0.013 * s, 0.242 * s], [0, 0.242 * s],
  ], 0.008 * s, 5);
  const g = lathe(prof, { segs: 64 });
  sculpt(g, { amp: 0.0006 * s, freq: 30 / s, wobble: 0.003 * s, wfreq: 6 / s, dents: 4, dentR: 0.015 * s, dentD: 0.0015 * s });
  const cork = lathe(filletProfile([[0, 0.235 * s], [0.0135 * s, 0.235 * s], [0.0155 * s, h], [0, h + 0.002 * s]], 0.003 * s, 3), { segs: 24 });
  chips(cork, 3, 0.001 * s, 0.003 * s);
  sculpt(cork, { amp: 0.0006 * s, freq: 60 / s });
  return [g, cork];
}

function jarGeo(h = 0.16, r = 0.055) {
  const s = h / 0.16;
  const body = lathe(filletProfile([
    [0, 0], [r * 0.85, 0], [r, 0.03 * s], [r * 1.02, 0.09 * s], [r * 0.82, 0.125 * s], [r * 0.7, 0.13 * s], [r * 0.72, 0.142 * s], [0, 0.142 * s],
  ], 0.008 * s, 5), { segs: 64 });
  sculpt(body, { amp: 0.0005 * s, freq: 35 / s, wobble: 0.003 * s, wfreq: 6 / s, dents: 3, dentR: 0.015 * s, dentD: 0.0015 * s });
  // тканевая крышка с оборкой и бечёвкой
  const ph = rand(0, TAU);
  const cloth = lathe(densify([[0, h], [r * 0.6, h - 0.004 * s], [r * 0.78, 0.136 * s], [r * 0.82, 0.118 * s], [r * 0.86, 0.105 * s], [r * 0.8, 0.104 * s], [r * 0.74, 0.12 * s], [r * 0.72, 0.13 * s], [0, 0.13 * s]], 0.002 * s), {
    segs: 96,
    fn: (rr, y, th) => (y < 0.125 * s ? rr * (1 + 0.07 * Math.max(0, Math.sin(th * 9 + ph))) : rr),
  });
  sculpt(cloth, { amp: 0.0006 * s, freq: 40 / s, wobble: 0.0015 * s, wfreq: 10 / s });
  const tie = new THREE.TorusGeometry(r * 0.74, 0.0035 * s, 8, 48);
  tie.rotateX(Math.PI / 2); tie.translate(0, 0.128 * s, 0);
  return [body, cloth, weld(tie)];
}

function candleParts(h = 0.08, r = 0.02) {
  const parts = [];
  const body = lathe(filletProfile([[0, 0], [r, 0], [r * 1.02, h * 0.7], [r * 0.96, h], [r * 0.5, h - 0.004], [0, h - 0.003]], 0.003, 4), {
    segs: 48, fn: (rr, y, th) => rr * (1 + (y > h * 0.5 ? 0.06 * Math.max(0, n3(Math.cos(th) * 2, Math.sin(th) * 2, 3)) : 0)),
  });
  sculpt(body, { amp: 0.0004, freq: 60, wobble: 0.0008, wfreq: 20 });
  parts.push(mesh(body));
  for (let i = 0; i < 3; i++) {
    const th = rand(0, TAU), L = rand(0.015, 0.04);
    for (const g of tube([[Math.cos(th) * r * 0.95, h - 0.002, -Math.sin(th) * r * 0.95], [Math.cos(th) * r * 1.04, h - L * 0.6, -Math.sin(th) * r * 1.04], [Math.cos(th) * r * 1.05, h - L, -Math.sin(th) * r * 1.05]], rand(0.003, 0.0045), { radial: 10 })) parts.push(mesh(g));
  }
  for (const g of tube([[0, h - 0.004, 0], [0, h + 0.006, 0], [0.002, h + 0.01, 0]], 0.0013, { radial: 6 })) parts.push(mesh(g));
  parts.push(mesh(flameGeo(0.045, 0.011), clayLight), );
  parts[parts.length - 1].position.y = h + 0.006;
  return parts;
}

// Стилизованный язык пламени.
function flameGeo(h, r) {
  const prof = densify([[0, 0], [r * 0.8, h * 0.08], [r, h * 0.25], [r * 0.75, h * 0.5], [r * 0.35, h * 0.78], [0, h]], h / 40);
  const ph = rand(0, TAU);
  const g = lathe(prof, { segs: 40, fn: (rr, y, th) => rr * (1 + 0.18 * Math.sin(th * 3 + y / h * 5 + ph)) });
  forEachV(g, (v) => { const t = v.y / h; v.x += Math.sin(t * 3 + ph) * r * 0.4 * t; });
  return g;
}

const clayLight = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.5 });

// Бочонок с клёпками и обручами, ось — Y.
function kegParts(h = 0.32, r = 0.13) {
  const parts = [];
  const N = 16, off = Array.from({ length: N }, () => rand(-0.002, 0.002));
  const bands = [0.12, 0.24, 0.76, 0.88];
  const inBand = (t) => bands.some((b) => Math.abs(t - b) < 0.035);
  const prof = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    prof.push([r * (0.84 + 0.16 * Math.sin(Math.PI * t)) + (inBand(t) ? 0.004 : 0), t * h]);
  }
  const full = filletProfile([[0, h * 0.02], [r * 0.8, h * 0.02], ...prof.map(([a, b]) => [a, b]), [r * 0.8, h * 0.98], [0, h * 0.98]], 0.006, 3);
  const g = lathe(full, {
    segs: 128,
    fn: (rr, y, th) => {
      const t = y / h;
      if (rr < r * 0.82 || inBand(t)) return rr;
      const f = (th / TAU) * N, k = Math.floor(f) % N, e = Math.min(f % 1, 1 - (f % 1));
      return rr + off[k] - 0.004 * Math.exp(-((e / 0.04) ** 2));
    },
  });
  sculpt(g, { amp: 0.0008, freq: 25, wobble: 0.002, wfreq: 5, dents: 4, dentR: 0.03, dentD: 0.002 });
  parts.push(mesh(g));
  return parts;
}

function breadGeo(len = 0.24, w = 0.11, h = 0.08) {
  const g = weld(new THREE.SphereGeometry(0.5, 64, 32));
  const cuts = 3 + Math.floor(rand(0, 2));
  forEachV(g, (v) => {
    v.x *= len; v.z *= w; v.y = Math.max(v.y, -0.25) * h + 0.25 * h;
    if (v.y < 0.03 * h) v.y = 0.03 * h * (1 - Math.hypot(v.x / len, v.z / w) * 0.2);
  });
  forEachV(g, (v, n) => {
    const u = (v.x / len + 0.5) * cuts + v.z / w * 0.6;
    const f = Math.abs((u % 1) - 0.5);
    if (n.y > 0.3 && f < 0.09) v.addScaledVector(n, -0.012 * (1 - (f / 0.09) ** 2) * n.y);
  });
  sculpt(g, { amp: 0.0012, freq: 30, wobble: 0.004, wfreq: 6 });
  return g;
}

function cheeseGeo(r = 0.11, h = 0.08, cut = false) {
  const g = lathe(filletProfile([[0, 0], [r, 0], [r * 1.03, h * 0.5], [r, h], [0, h]], h * 0.3, 5), { segs: 96 });
  if (cut) wedgeCut(g, 0.2, 0.2 + 0.9);
  sculpt(g, { amp: 0.0008, freq: 30, wobble: 0.002, wfreq: 6, dents: cut ? 0 : 3, dentR: 0.02, dentD: 0.002 });
  return g;
}

function sackParts(w = 0.3, h = 0.42) {
  const ph = rand(0, TAU);
  const prof = densify([[0, 0], [w * 0.42, 0.005], [w * 0.5, h * 0.18], [w * 0.52, h * 0.45], [w * 0.42, h * 0.66], [w * 0.2, h * 0.8], [w * 0.13, h * 0.83], [w * 0.16, h * 0.9], [w * 0.22, h * 0.97], [w * 0.1, h], [0, h * 0.97]], w / 50);
  const g = lathe(prof, {
    segs: 96,
    fn: (r, y, th) => {
      const t = y / h;
      const folds = t > 0.55 ? 0.12 * Math.max(0, Math.sin(th * 7 + ph + t * 4)) * Math.min(1, (t - 0.55) * 4) : 0;
      return r * (1 + folds + 0.07 * n3(Math.cos(th) * 1.5, Math.sin(th) * 1.5, t * 2 + ph));
    },
  });
  forEachV(g, (v) => { v.x += Math.sin(v.y / h * 2.5) * w * 0.04; });
  sculpt(g, { amp: w * 0.006, freq: 12 / w, wobble: w * 0.02, wfreq: 2 / w, dents: 4, dentR: w * 0.2, dentD: w * 0.02 });
  const rope = new THREE.TorusGeometry(w * 0.145, w * 0.022, 10, 48);
  rope.rotateX(Math.PI / 2 + 0.1); rope.translate(w * 0.04 * Math.sin(0.83 * 2.5), h * 0.835, 0);
  return [mesh(g), mesh(weld(rope))];
}

function pumpkinParts(r = 0.1) {
  const g = weld(new THREE.SphereGeometry(r, 96, 48));
  forEachV(g, (v) => {
    const th = Math.atan2(v.z, v.x);
    const rib = 1 - 0.1 * Math.abs(Math.sin(th * 4));
    v.x *= rib; v.z *= rib; v.y *= 0.72;
    v.y += r * 0.72;
  });
  forEachV(g, (v) => { const d = Math.hypot(v.x, v.z) / r; if (v.y > r * 1.2) v.y -= r * 0.15 * Math.max(0, 1 - d * 3); });
  sculpt(g, { amp: r * 0.01, freq: 6 / r, wobble: r * 0.03, wfreq: 1 / r });
  const stem = tube([[0, r * 1.3, 0], [0.01, r * 1.5, 0], [r * 0.25, r * 1.6, 0]], r * 0.07, { radial: 8 });
  return [mesh(g), ...stem.map((s) => mesh(s))];
}

function logGeo(L = 0.55, r = 0.055) {
  const ph = rand(0, 100);
  const g = lathe(filletProfile([[0, 0], [r * 0.9, 0], [r, 0.008], [r, L - 0.008], [r * 0.9, L], [0, L]], 0.006, 3), {
    segs: 64,
    fn: (rr, y, th) => {
      if (y < 0.004 || y > L - 0.004) return rr;
      return rr * (1 + 0.08 * n3(Math.cos(th) * 2 + ph, Math.sin(th) * 2, y * 6) - 0.05 * Math.abs(Math.sin(th * 9 + 4 * n3(y * 10, ph, 0))));
    },
  });
  chips(g, 3, 0.004, 0.012);
  sculpt(g, { amp: 0.001, freq: 25, wobble: 0.006, wfreq: 3 });
  return g;
}

// Простая плетёная корзинка с яблоками.
function basketParts(r = 0.13, h = 0.1) {
  const parts = [];
  const g = lathe(filletProfile([[0, 0], [r * 0.8, 0], [r, h], [r * 1.04, h + 0.008], [r * 0.93, h + 0.008], [r * 0.9, h], [r * 0.72, 0.012], [0, 0.012]], 0.005, 3), {
    segs: 120,
    fn: (rr, y, th) => rr * (1 + (y > 0.01 && y < h ? 0.025 * Math.sin(th * 24 + (Math.floor(y / 0.018) % 2) * Math.PI) : 0)),
  });
  groove(g, 'y', [0.025, 0.043, 0.061, 0.079], 0.003, 0.002);
  sculpt(g, { amp: 0.0006, freq: 40, wobble: 0.002, wfreq: 8 });
  parts.push(mesh(g));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rand(-0.2, 0.2), rr = i === 0 ? 0 : r * 0.55;
    const ar = rand(0.033, 0.04);
    const ap = weld(new THREE.SphereGeometry(ar, 32, 20));
    forEachV(ap, (v) => { const d = Math.hypot(v.x, v.z) / ar; if (v.y > 0) v.y -= ar * 0.25 * Math.max(0, 1 - d * 2.5); v.y *= 0.9; });
    const m = mesh(ap);
    m.position.set(Math.cos(a) * (i === 0 ? 0 : rr), h * 0.75 + (i === 0 ? ar * 0.9 : 0), -Math.sin(a) * (i === 0 ? 0 : rr));
    parts.push(m);
  }
  return parts;
}

// ---------------------------------------------------------------- 1. кружка
function buildMug() {
  seed(101); setRes(0.0016);
  return tankardParts({ foam: true });
}

// ---------------------------------------------------------------- 2. стол
function buildTable() {
  seed(202); setRes(0.008);
  const parts = [];
  const L = 1.6, D = 0.86, T = 0.09, H = 0.76, n = 4, gap = 0.012;
  const pw = (D - gap * (n - 1)) / n;
  const legX = 0.62, legZ = 0.3;
  for (let i = 0; i < n; i++) {
    const z = -D / 2 + pw / 2 + i * (pw + gap);
    const len = L + rand(-0.04, 0.04);
    parts.push(place(plank(len, T, pw, { axis: 'x', cracks: 3, chipN: 10 }), rand(-0.02, 0.02), H - T / 2 + rand(-0.004, 0.004), z, rand(-0.006, 0.006), rand(-0.008, 0.008), 0));
    for (const x of [-legX, legX]) for (const dz of [-pw * 0.25, pw * 0.25]) parts.push(nailAt(0.013, x + rand(-0.01, 0.01), H + 0.001, z + dz));
  }
  for (const x of [-legX, legX]) {
    parts.push(place(plank(0.12, 0.065, D - 0.05, { axis: 'z' }), x, H - T - 0.032, 0));
    for (const z of [-legZ, legZ]) {
      const g = plank(0.115, H - T - 0.04, 0.115, { axis: 'y', chipN: 8 });
      taper(g, 0.86, 1.0);
      parts.push(place(g, x, (H - T - 0.04) / 2, z, rand(-0.01, 0.01), rand(-0.1, 0.1), rand(-0.01, 0.01)));
      parts.push(nailAt(0.012, x + Math.sign(x) * 0.048, H - T - 0.032, z, [Math.sign(x), 0, 0]));
    }
    parts.push(place(plank(0.065, 0.075, legZ * 2 + 0.06, { axis: 'z' }), x, 0.16, 0));
  }
  parts.push(place(plank(legX * 2 + 0.06, 0.08, 0.065, { axis: 'x' }), 0, 0.22, 0));
  for (const x of [-legX, legX]) for (const z of [-legZ, legZ]) parts.push(nailAt(0.011, x, 0.16, z + Math.sign(z) * 0.048, [0, 0, Math.sign(z)]));
  return group(parts);
}

// ---------------------------------------------------------------- 3. барная стойка
function buildBar() {
  seed(303); setRes(0.01);
  const parts = [];
  const L = 2.2, H = 1.1, FZ = 0.25;
  // столешница из двух толстых досок
  for (const [z, d] of [[0.2, 0.36], [-0.17, 0.36]]) parts.push(place(plank(L + 0.12 + rand(-0.03, 0.03), 0.085, d, { axis: 'x', cracks: 4, chipN: 14 }), rand(-0.02, 0.02), H - 0.0425, z, rand(-0.004, 0.004), rand(-0.006, 0.006), 0));
  for (const x of [-1.05, 0, 1.05]) {
    parts.push(place(plank(0.13, H - 0.085, 0.13, { axis: 'y', chipN: 10 }), x, (H - 0.085) / 2, FZ, 0, rand(-0.05, 0.05), 0));
    // кронштейн под свесом столешницы
    const br = roundedBox(0.1, 0.18, 0.1, 0.02);
    chips(br, 6, 0.005, 0.02); sculpt(br, { amp: 0.002, freq: 15, wobble: 0.004, wfreq: 4 });
    forEachV(br, (v) => { if (v.z > 0) v.y += (v.y + 0.09) * 0; if (v.y < 0) v.z -= (-v.y / 0.09) * 0.04 * (v.z + 0.05) / 0.1 * 1.0; });
    parts.push(place(br, x, H - 0.085 - 0.09, FZ + 0.1));
    for (const y of [0.25, 0.8]) parts.push(nailAt(0.016, x, y, FZ + 0.067, [0, 0, 1]));
  }
  // вертикальные доски фасада
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -0.985 : 0.065, span = 0.92, k = 6, w = span / k;
    for (let i = 0; i < k; i++) {
      const h = H - 0.085 - 0.09 + rand(-0.01, 0.01);
      parts.push(place(plank(w - 0.008, h, 0.035, { axis: 'y', cracks: 2, chipN: 7 }), x0 + w / 2 + i * w, 0.09 + h / 2, FZ, 0, 0, rand(-0.01, 0.01)));
    }
    for (const y of [0.25, 0.8]) {
      parts.push(place(plank(span, 0.1, 0.04, { axis: 'x' }), x0 + span / 2, y, FZ + 0.035, 0, 0, rand(-0.012, 0.012)));
      for (let i = 0; i < k; i++) parts.push(nailAt(0.011, x0 + w / 2 + i * w, y + rand(-0.02, 0.02), FZ + 0.057, [0, 0, 1]));
    }
  }
  parts.push(place(plank(L + 0.04, 0.1, 0.07, { axis: 'x' }), 0, 0.05, FZ + 0.04));
  // боковины
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -0.27 + 0.085 + i * 0.165;
      parts.push(place(plank(0.035, H - 0.1, 0.16, { axis: 'y' }), sx * 1.065, (H - 0.1) / 2, z, 0, 0, 0));
    }
    parts.push(place(plank(0.11, H - 0.085, 0.11, { axis: 'y' }), sx * 1.05, (H - 0.085) / 2, -0.29));
  }
  // полки со стороны бармена
  for (const y of [0.1, 0.52]) parts.push(place(plank(2.0, 0.04, 0.42, { axis: 'x', cracks: 3 }), 0, y, -0.03));
  parts.push(place(plank(0.08, 0.5, 0.08, { axis: 'y' }), 0, 0.31, -0.29));
  withRes(0.0025, () => {
    for (let i = 0; i < 5; i++) {
      const m = tankardParts({ foam: false });
      m.position.set(-0.8 + i * 0.16, 0.54, -0.12 + rand(-0.03, 0.03)); m.rotation.y = rand(0, TAU);
      parts.push(m);
    }
    for (let i = 0; i < 3; i++) {
      const [b, c] = bottleGeo(0.26 + rand(-0.03, 0.03), 0.055);
      parts.push(place(b, 0.25 + i * 0.13, 0.54, -0.1), place(c, 0.25 + i * 0.13, 0.54, -0.1));
    }
    const keg = group(kegParts(0.34, 0.14));
    keg.rotation.z = Math.PI / 2; keg.position.set(-0.55, 0.12 + 0.14, -0.06);
    parts.push(keg);
    const keg2 = group(kegParts(0.34, 0.14));
    keg2.position.set(0.55, 0.12, -0.06);
    parts.push(keg2);
  });
  return group(parts);
}

// ---------------------------------------------------------------- 4. высокий стул
function roundSeat(R, T, seams) {
  const g = lathe(filletProfile([[0, 0], [R * 0.97, 0], [R, T * 0.5], [R * 0.98, T], [0, T]], T * 0.35, 5), { segs: 120 });
  groove(g, 'x', seams, 0.006, 0.004);
  grain(g, 'z', { amp: 0.0008, freq: 120, cracks: 4, crackD: 0.003, crackW: 0.004 });
  chips(g, 5, 0.003, 0.01);
  sculpt(g, { amp: 0.0015, freq: 12, wobble: 0.004, wfreq: 3, dents: 3, dentR: 0.03, dentD: 0.002 });
  return g;
}

function buildHighStool() {
  seed(404); setRes(0.006);
  const parts = [];
  const H = 0.76, T = 0.055, R = 0.19;
  parts.push(place(roundSeat(R, T, [-R / 3, R / 3]), 0, H - T, 0));
  for (const x of [-R * 0.66, 0, R * 0.66]) for (const z of [-R * 0.5, R * 0.5]) parts.push(nailAt(0.009, x, H + 0.001, z));
  parts.push(place(plank(0.3, 0.04, 0.06, { axis: 'x' }), 0, H - T - 0.02, 0));
  parts.push(place(plank(0.06, 0.04, 0.3, { axis: 'z' }), 0, H - T - 0.02, 0));
  const legAt = (i, y) => {
    const a = (i / 4) * TAU + Math.PI / 4;
    const t = y / (H - 0.03);
    const r = 0.25 + (0.12 - 0.25) * t;
    return [Math.cos(a) * r, y, -Math.sin(a) * r];
  };
  for (let i = 0; i < 4; i++) parts.push(beamBetween(legAt(i, 0), legAt(i, H - 0.03), 0.062, 0.062, { chipN: 6 }));
  for (const y of [0.25]) for (let i = 0; i < 4; i++) {
    const a = legAt(i, y), b = legAt((i + 1) % 4, y);
    parts.push(beamBetween(a, b, 0.04, 0.045, { chipN: 4 }));
  }
  return group(parts);
}

// ---------------------------------------------------------------- 5. низкий стул (со спинкой)
function buildLowChair() {
  seed(505); setRes(0.006);
  const parts = [];
  const SH = 0.46, T = 0.055, W = 0.44, D = 0.42;
  const pw = (D - 0.016) / 3;
  for (let i = 0; i < 3; i++) {
    const z = -D / 2 + pw / 2 + i * (pw + 0.008);
    parts.push(place(plank(W + rand(-0.01, 0.02), T, pw, { axis: 'x', cracks: 2 }), rand(-0.005, 0.005), SH - T / 2, z + 0.01, 0, rand(-0.01, 0.01), 0));
    for (const x of [-0.17, 0.17]) parts.push(nailAt(0.009, x, SH + 0.001, z + 0.01));
  }
  const lx = 0.175, fz = 0.16, bz = -0.16;
  for (const x of [-lx, lx]) {
    parts.push(beamBetween([x, 0, fz], [x, SH - T, fz], 0.06, 0.06));
    parts.push(beamBetween([x, 0, bz], [x * 1.02, 0.95, bz - 0.06], 0.06, 0.06));
    const knob = lathe(filletProfile([[0, 0], [0.018, 0], [0.032, 0.02], [0.03, 0.04], [0.012, 0.055], [0, 0.058]], 0.008, 4), { segs: 32 });
    sculpt(knob, { amp: 0.0006, freq: 40, wobble: 0.001, wfreq: 20 });
    parts.push(place(knob, x * 1.02, 0.94, bz - 0.06 + 0.002));
    parts.push(beamBetween([x, 0.12, fz], [x, 0.12, bz], 0.03, 0.035));
  }
  parts.push(beamBetween([-lx, 0.2, fz], [lx, 0.2, fz], 0.03, 0.035));
  parts.push(beamBetween([-lx, 0.15, bz], [lx, 0.15, bz], 0.03, 0.035));
  // спинка: верхняя перекладина + средняя
  const zAt = (y) => bz + (-0.06) * (y / 0.95);
  for (const [y, h] of [[0.84, 0.11], [0.64, 0.07]]) {
    const g = plank(2 * lx + 0.06, h, 0.03, { axis: 'x' });
    if (h > 0.1) forEachV(g, (v) => { v.y += 0.025 * (1 - (v.x / (lx + 0.03)) ** 2) * (v.y > 0 ? 1 : 0.4); });
    parts.push(place(g, 0, y, zAt(y), -0.063, 0, 0));
    for (const x of [-lx, lx]) parts.push(nailAt(0.008, x * 1.01, y, zAt(y) + 0.017, [0, 0, 1]));
  }
  return group(parts);
}

// ---------------------------------------------------------------- 6. глубокая тарелка
function buildPlate() {
  seed(606); setRes(0.0015);
  return group(mesh(deepPlateGeo()));
}

// ---------------------------------------------------------------- 7. настольный фонарь
function buildLantern() {
  seed(707); setRes(0.0015);
  const parts = [];
  const S = 0.065, H0 = 0.025, H1 = 0.205;
  const base = roundedBox(0.15, 0.022, 0.15, 0.006);
  chips(base, 5, 0.001, 0.004); sculpt(base, { amp: 0.0004, freq: 50, wobble: 0.001, wfreq: 12 });
  parts.push(place(base, 0, 0.011 + 0.01, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = weld(new THREE.SphereGeometry(0.011, 16, 10)); parts.push(place(f, sx * 0.058, 0.009, sz * 0.058));
  }
  const bar = (a, b, w = 0.009) => parts.push(beamBetween(a, b, w, w, { chipN: 2, wobble: 0.0006, amp: 0.0002 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar([sx * S, H0, sz * S], [sx * S, H1, sz * S], 0.011);
  for (const y of [H0 + 0.012, 0.115, H1 - 0.006]) {
    for (const s of [-1, 1]) {
      bar([-S, y, s * S], [S, y, s * S], 0.008);
      bar([s * S, y, -S], [s * S, y, S], 0.008);
    }
  }
  // решётка: по одному вертикальному прутку на каждой стороне
  for (const s of [-1, 1]) { bar([0, H0, s * S], [0, H1, s * S], 0.006); bar([s * S, H0, 0], [s * S, H1, 0], 0.006); }
  // крыша-пирамида
  const roof = lathe(densify([[0, 0.285], [0.016, 0.278], [0.106, H1 + 0.006], [0.106, H1 - 0.004], [0, H1 - 0.004]], 0.003), { segs: 4, phase: Math.PI / 4 });
  sculpt(roof, { amp: 0.0003, freq: 50, wobble: 0.0012, wfreq: 10 });
  parts.push(mesh(roof));
  const cap = lathe(filletProfile([[0, 0.27], [0.022, 0.27], [0.026, 0.285], [0.02, 0.3], [0.028, 0.304], [0.026, 0.312], [0, 0.312]], 0.002, 3), { segs: 40 });
  sculpt(cap, { amp: 0.0003, freq: 60, wobble: 0.0008, wfreq: 15 });
  parts.push(mesh(cap));
  const ring = new THREE.TorusGeometry(0.032, 0.0055, 12, 64);
  ring.translate(0, 0.312 + 0.028, 0);
  parts.push(mesh(weld(ring)));
  // свеча в чашечке
  const dish = lathe(filletProfile([[0, H0 + 0.001], [0.035, H0 + 0.001], [0.038, H0 + 0.012], [0.033, H0 + 0.012], [0.03, H0 + 0.006], [0, H0 + 0.006]], 0.002, 3), { segs: 48 });
  parts.push(mesh(dish));
  const c = group(candleParts(0.085, 0.02)); c.position.y = H0 + 0.006;
  parts.push(c);
  return group(parts);
}

// ---------------------------------------------------------------- 8. шкаф с посудой
function buildCabinet() {
  seed(808); setRes(0.009);
  const parts = [];
  const W = 1.0, LH = 0.86, D = 0.46, UD = 0.3, TOP = 1.98;
  const backZ = -D / 2;
  // нижняя тумба
  for (const sx of [-1, 1]) parts.push(place(plank(0.05, LH - 0.05, D, { axis: 'y', cracks: 3 }), sx * (W / 2 - 0.025), 0.07 + (LH - 0.07) / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(place(plank(0.08, 0.07, 0.08, { axis: 'y', chipN: 5 }), sx * (W / 2 - 0.04), 0.035, sz * (D / 2 - 0.04)));
  parts.push(place(plank(W, 0.08, 0.04, { axis: 'x' }), 0, 0.11, D / 2 - 0.02));
  parts.push(place(plank(W - 0.1, 0.03, D - 0.04, { axis: 'x' }), 0, 0.14, 0));
  for (let i = 0; i < 6; i++) parts.push(place(plank((W - 0.1) / 6 - 0.006, LH - 0.1, 0.022, { axis: 'y', cracks: 2, chipN: 4 }), -W / 2 + 0.05 + (W - 0.1) / 12 + i * ((W - 0.1) / 6), 0.08 + (LH - 0.1) / 2, -D / 2 + 0.011));
  for (const z of [0.12, -0.13]) parts.push(place(plank(W + 0.08, 0.05, 0.25, { axis: 'x', cracks: 3, chipN: 10 }), rand(-0.01, 0.01), LH + 0.025, z));
  // двери
  for (const side of [-1, 1]) {
    const dw = 0.445, x0 = side * (dw / 2 + 0.005);
    for (let i = 0; i < 3; i++) parts.push(place(plank(dw / 3 - 0.006, 0.66, 0.032, { axis: 'y', cracks: 2 }), x0 - dw / 2 + dw / 6 + i * (dw / 3), 0.16 + 0.33, D / 2 - 0.01, 0, 0, rand(-0.008, 0.008)));
    for (const y of [0.27, 0.71]) {
      const strap = roundedBox(dw * 0.78, 0.035, 0.008, 0.003);
      forEachV(strap, (v) => { const t = (v.x * side + dw * 0.39) / (dw * 0.78); v.y *= 1 + 0.5 * Math.max(0, 1 - t * 4); });
      sculpt(strap, { amp: 0.0005, freq: 30, wobble: 0.0015, wfreq: 6, dents: 3, dentR: 0.01, dentD: 0.001 });
      parts.push(place(strap, x0 + side * (dw * 0.11), y, D / 2 + 0.01));
      for (let k = 0; k < 3; k++) parts.push(nailAt(0.007, x0 + side * (dw * 0.11) + side * (-0.13 + k * 0.1), y, D / 2 + 0.014, [0, 0, 1]));
    }
    const pull = new THREE.TorusGeometry(0.025, 0.006, 10, 40);
    parts.push(place(weld(pull), side * 0.05, 0.49 - 0.02, D / 2 + 0.03));
    parts.push(nailAt(0.01, side * 0.05, 0.49 + 0.006, D / 2 + 0.008, [0, 0, 1]));
  }
  // верхняя часть
  const uz = backZ + UD / 2;
  const uh = TOP - LH - 0.05;
  for (const sx of [-1, 1]) {
    const g = plank(0.045, uh, UD, { axis: 'y', cracks: 3 });
    forEachV(g, (v) => { const t = (v.y + uh / 2) / uh; if (v.z > 0 && t < 0.35) v.z -= (0.35 - t) / 0.35 * 0; if (v.z > 0 && t > 0.15 && t < 0.4) v.z -= Math.sin((t - 0.15) / 0.25 * Math.PI) * 0.0; });
    parts.push(place(g, sx * (W / 2 - 0.035), LH + 0.05 + uh / 2, uz));
  }
  const nb = 6, bw = (W - 0.1) / nb;
  for (let i = 0; i < nb; i++) parts.push(place(plank(bw - 0.006, uh, 0.022, { axis: 'y', cracks: 2, chipN: 4 }), -W / 2 + 0.05 + bw / 2 + i * bw, LH + 0.05 + uh / 2, backZ + 0.011));
  const shelves = [1.27, 1.62];
  for (const y of shelves) {
    parts.push(place(plank(W - 0.09, 0.035, UD - 0.03, { axis: 'x', cracks: 2 }), 0, y, uz + 0.005));
    for (const g of tube([[-W / 2 + 0.06, y + 0.065, uz + UD / 2 - 0.02], [W / 2 - 0.06, y + 0.065, uz + UD / 2 - 0.02]], 0.009, { radial: 10 })) parts.push(mesh(sculpt(g, { wobble: 0.002, wfreq: 4, amp: 0 })));
  }
  parts.push(place(plank(W + 0.16, 0.07, UD + 0.1, { axis: 'x', cracks: 3, chipN: 10 }), 0, TOP + 0.035, uz + 0.03));
  parts.push(place(plank(W + 0.06, 0.05, UD + 0.03, { axis: 'x' }), 0, TOP - 0.025, uz + 0.01));
  // гребень сверху
  const crest = plank(W * 0.6, 0.1, 0.04, { axis: 'x' });
  forEachV(crest, (v) => { if (v.y > 0) v.y *= Math.max(0.15, 1 - (v.x / (W * 0.3)) ** 2); });
  parts.push(place(crest, 0, TOP + 0.07 + 0.05, backZ + 0.03));
  // посуда
  withRes(0.0025, () => {
    for (const [y, n] of [[1.62 + 0.0175, 3], [1.27 + 0.0175, 3]]) {
      for (let i = 0; i < n; i++) {
        const p = mesh(flatPlateGeo(0.105));
        p.position.set(-0.3 + i * 0.3 + rand(-0.02, 0.02), y + 0.11, backZ + 0.05);
        p.rotation.set(Math.PI / 2 - 0.25, 0, rand(-0.05, 0.05));
        parts.push(p);
      }
    }
    // миски стопкой
    for (let k = 0; k < 3; k++) {
      const b = mesh(deepPlateGeo(0.09, 0.035));
      b.position.set(-0.28, 1.27 + 0.0175 + k * 0.022, uz + 0.04); parts.push(b);
    }
    for (let i = 0; i < 3; i++) {
      const m = tankardParts({ foam: false });
      m.position.set(0.05 + i * 0.15, LH + 0.05, uz + 0.04 + rand(-0.02, 0.02)); m.rotation.y = rand(0, TAU);
      parts.push(m);
    }
    const [jb, jc] = bottleGeo(0.28, 0.07);
    parts.push(place(jb, -0.3, LH + 0.05, uz + 0.04), place(jc, -0.3, LH + 0.05, uz + 0.04));
    for (const [x, h] of [[0.22, 0.14], [0.36, 0.11]]) for (const g of jarGeo(h, 0.05)) parts.push(place(g, x, 1.27 + 0.0175, uz + 0.06));
  });
  return group(parts);
}

// ---------------------------------------------------------------- 9. камин
function buildFireplace() {
  seed(909); setRes(0.014);
  const parts = [];
  const OW = 0.46, OH = 0.86, HB = 0.1, Z0 = -0.36, Z1 = 0.28;
  // очаг: плиты
  const hs = [[-0.62, 0.55], [-0.07, 0.55], [0.5, 0.65]];
  for (const [x, w] of hs) parts.push(place(stone(w - 0.02, HB, 0.62, { chipN: 7 }), x + 0.02, HB / 2, 0.14));
  // пилоны из камня
  for (const sx of [-1, 1]) {
    let y = HB;
    let row = 0;
    while (y < OH + 0.15 - 0.05) {
      const h = Math.min(rand(0.16, 0.22), OH + 0.15 - y);
      const xs = row % 2 ? [[OW, OW + 0.18], [OW + 0.18, 0.84]] : [[OW, 0.84]];
      for (const [a, b] of xs) {
        const w = b - a;
        const g = stone(w - 0.012, h - 0.012, Z1 - Z0 - 0.02 + rand(-0.02, 0.02));
        parts.push(place(g, sx * (a + w / 2) + rand(-0.006, 0.006), y + h / 2, (Z0 + Z1) / 2 + rand(-0.01, 0.01), 0, rand(-0.03, 0.03), rand(-0.02, 0.02)));
      }
      y += h; row++;
    }
  }
  // задняя стенка топки
  for (let y = HB, r = 0; y < OH + 0.15; r++) {
    const h = rand(0.15, 0.2);
    let x = -OW - (r % 2 ? 0.12 : 0);
    while (x < OW) {
      const w = Math.min(rand(0.22, 0.32), OW - x + 0.06);
      parts.push(place(stone(w - 0.012, h - 0.012, 0.16), x + w / 2, y + h / 2, Z0 + 0.08));
      x += w;
    }
    y += h;
  }
  // деревянная балка-перемычка и каминная полка
  const beamY = OH + 0.08;
  setRes(0.012);
  parts.push(place(plank(1.76, 0.18, 0.3, { axis: 'x', cracks: 4, chipN: 14 }), 0, beamY + 0.09, Z1 - 0.13, 0, 0, 0.005));
  for (let x = -OW; x < OW;) { const w = Math.min(rand(0.25, 0.35), OW - x); parts.push(place(stone(w - 0.01, 0.17, Z1 - Z0 - 0.3), x + w / 2, beamY + 0.09, Z0 + (Z1 - Z0 - 0.3) / 2)); x += w; }
  const shelfY = beamY + 0.18 + 0.035;
  parts.push(place(plank(1.95, 0.07, 0.42, { axis: 'x', cracks: 4, chipN: 14 }), 0, shelfY, Z1 - 0.18));
  for (const sx of [-1, 1]) {
    const br = roundedBox(0.12, 0.2, 0.14, 0.03);
    chips(br, 7, 0.006, 0.025); sculpt(br, { amp: 0.002, freq: 12, wobble: 0.004, wfreq: 4 });
    forEachV(br, (v) => { if (v.y < 0 && v.z > 0) v.z -= (-v.y / 0.1) * 0.06; });
    parts.push(place(br, sx * 0.9, beamY + 0.08, Z1 - 0.01));
  }
  // дымоход (сужается кверху)
  setRes(0.014);
  let y = shelfY + 0.035;
  const TOP = 2.35;
  for (let r = 0; y < TOP - 0.05; r++) {
    const h = Math.min(rand(0.16, 0.22), TOP - y);
    const t = (y - shelfY) / (TOP - shelfY);
    const half = 0.74 + (0.45 - 0.74) * t;
    let x = -half - (r % 2 ? rand(0.08, 0.15) : 0);
    if (x < -half) x = -half;
    const depth = 0.5 - 0.12 * t;
    while (x < half - 0.02) {
      const w = Math.min(rand(0.24, 0.4), half - x);
      if (w < 0.08) break;
      parts.push(place(stone(w - 0.012, h - 0.012, depth + rand(-0.02, 0.02)), x + w / 2, y + h / 2, Z0 + depth / 2 + rand(-0.01, 0.01), 0, 0, rand(-0.02, 0.02)));
      x += w;
    }
    y += h;
  }
  // дрова и пламя
  setRes(0.006);
  const logs = [[[-0.05, HB + 0.055, 0.02], [0, 0.35, Math.PI / 2]], [[0.03, HB + 0.055, -0.12], [0, -0.3, Math.PI / 2]], [[0, HB + 0.15, -0.04], [0, 0.05, Math.PI / 2 + 0.12]]];
  for (const [[x, yy, z], [rx, ry, rz]] of logs) {
    const g = logGeo(0.62, 0.058);
    g.translate(0, -0.31, 0);
    parts.push(place(g, x, yy, z, rx, ry, rz));
  }
  setRes(0.004);
  const fl = [[0, 0.5, 0.0], [-0.13, 0.38, 0.4], [0.13, 0.4, -0.5], [-0.24, 0.27, 0.8], [0.25, 0.28, -0.9], [0.05, 0.3, 2.5], [-0.06, 0.32, -2.2]];
  for (const [x, h, ry] of fl) {
    const f = mesh(flameGeo(h, h * 0.26), clayLight);
    f.position.set(x, HB + 0.06, 0.02 - Math.abs(x) * 0.3);
    f.rotation.set(rand(-0.08, 0.08), ry, -x * 0.6);
    parts.push(f);
  }
  // мелочи на полке
  setRes(0.0025);
  for (const [x, hh] of [[-0.7, 0.1], [-0.6, 0.07]]) {
    const c = group(candleParts(hh, 0.022)); c.position.set(x, shelfY + 0.035, Z1 - 0.2); parts.push(c);
  }
  const m = tankardParts({ foam: false }); m.position.set(0.55, shelfY + 0.035, Z1 - 0.2); m.rotation.y = 2.2; parts.push(m);
  const [bb, bc] = bottleGeo(0.24, 0.055);
  parts.push(place(bb, 0.72, shelfY + 0.035, Z1 - 0.22), place(bc, 0.72, shelfY + 0.035, Z1 - 0.22));
  return group(parts);
}

// ---------------------------------------------------------------- 10. полка для продуктов
function buildPantry() {
  seed(1010); setRes(0.008);
  const parts = [];
  const W = 1.1, H = 1.5, D = 0.38;
  const shelves = [0.1, 0.56, 1.02, 1.47];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(place(plank(0.06, H, 0.06, { axis: 'y', chipN: 7 }), sx * (W / 2 - 0.03), H / 2, sz * (D / 2 - 0.03), 0, rand(-0.05, 0.05), 0));
    for (const y of [0.32, 0.79, 1.25]) parts.push(place(plank(0.03, 0.05, D - 0.06, { axis: 'z' }), sx * (W / 2 - 0.03), y, 0, rand(-0.01, 0.01), 0, 0));
  }
  for (const y of shelves) {
    for (const z of [-D / 4, D / 4]) parts.push(place(plank(W + 0.06 + rand(-0.02, 0.02), 0.035, D / 2 - 0.006, { axis: 'x', cracks: 3, chipN: 9 }), rand(-0.01, 0.01), y, z));
    for (const sx of [-1, 1]) for (const z of [-D / 4, D / 4]) parts.push(nailAt(0.009, sx * (W / 2 - 0.03), y + 0.018, z));
  }
  // диагональные связи сзади
  parts.push(beamBetween([-W / 2 + 0.06, 0.12, -D / 2 + 0.01], [W / 2 - 0.06, 1.0, -D / 2 + 0.01], 0.05, 0.022));
  parts.push(beamBetween([W / 2 - 0.06, 0.12, -D / 2 + 0.035], [-W / 2 + 0.06, 1.0, -D / 2 + 0.035], 0.05, 0.022));
  const s0 = shelves.map((y) => y + 0.0175);
  withRes(0.004, () => {
    // нижний ярус: мешки, бочонок, сыры
    const sk = group(sackParts(0.3, 0.38)); sk.position.set(-0.32, s0[0], 0.01); sk.rotation.y = 0.4; parts.push(sk);
    const sk2 = group(sackParts(0.22, 0.28)); sk2.position.set(-0.08, s0[0], 0.06); sk2.rotation.y = 2; parts.push(sk2);
    const keg = group(kegParts(0.3, 0.12)); keg.position.set(0.3, s0[0], -0.02); parts.push(keg);
  });
  withRes(0.0025, () => {
    // второй ярус: банки и хлеб
    for (const [x, h, r] of [[-0.4, 0.17, 0.06], [-0.26, 0.13, 0.05], [-0.14, 0.15, 0.055]]) for (const g of jarGeo(h, r)) parts.push(place(g, x, s0[1], -0.05 + rand(-0.03, 0.03)));
    parts.push(place(breadGeo(0.26, 0.12, 0.09), 0.12, s0[1], 0.04, 0, 0.3, 0));
    parts.push(place(breadGeo(0.22, 0.11, 0.08), 0.36, s0[1], -0.04, 0, -0.5, 0));
    parts.push(place(cheeseGeo(0.1, 0.07), 0.36, s0[1] + 0.0, 0.1));
    // третий ярус: сыры и бутылки
    parts.push(place(cheeseGeo(0.12, 0.085), -0.33, s0[2], 0.0));
    parts.push(place(cheeseGeo(0.1, 0.075), -0.33, s0[2] + 0.085, 0.0, 0, 0.5, 0));
    parts.push(place(cheeseGeo(0.11, 0.08, true), -0.07, s0[2], 0.03, 0, -0.6, 0));
    for (const [x, h] of [[0.18, 0.27], [0.29, 0.24]]) { const [b, c] = bottleGeo(h, 0.05); parts.push(place(b, x, s0[2], -0.06), place(c, x, s0[2], -0.06)); }
    for (const g of jarGeo(0.12, 0.05)) parts.push(place(g, 0.42, s0[2], 0.03));
    // верх: тыква и корзина с яблоками
    const pk = group(pumpkinParts(0.11)); pk.position.set(-0.3, s0[3], 0); parts.push(pk);
    const bs = group(basketParts(0.13, 0.09)); bs.position.set(0.22, s0[3], 0); parts.push(bs);
    // колбасы на крючках под верхней полкой
    for (const hx of [-0.05, 0.42]) {
      const hook = tube([[hx, 1.45, 0.17], [hx, 1.41, 0.17], [hx + 0.012, 1.39, 0.17]], 0.003, { radial: 6 });
      hook.forEach((g) => parts.push(mesh(g)));
      let yy = 1.39;
      for (let k = 0; k < 3; k++) {
        const len = rand(0.09, 0.12), sw = rand(-0.02, 0.02);
        tube([[hx + sw * 0.3, yy - 0.012, 0.17], [hx + sw, yy - len * 0.5, 0.17 + 0.008], [hx + sw * 0.4, yy - len, 0.17]], 0.019, { radial: 16 }).forEach((g) => {
          sculpt(g, { amp: 0.0008, freq: 50, wobble: 0.002, wfreq: 10 });
          parts.push(mesh(g));
        });
        yy -= len + 0.022;
      }
    }
  });
  return group(parts);
}

export const OBJECTS = {
  mug: { title: 'Пивная кружка', build: buildMug },
  table: { title: 'Стол', build: buildTable },
  bar_counter: { title: 'Барная стойка', build: buildBar },
  stool_high: { title: 'Высокий стул', build: buildHighStool },
  chair_low: { title: 'Низкий стул', build: buildLowChair },
  deep_plate: { title: 'Глубокая тарелка', build: buildPlate },
  table_lantern: { title: 'Настольный фонарь', build: buildLantern },
  dish_cabinet: { title: 'Шкаф с посудой', build: buildCabinet },
  fireplace: { title: 'Камин', build: buildFireplace },
  pantry_shelf: { title: 'Полка для продуктов', build: buildPantry },
};
