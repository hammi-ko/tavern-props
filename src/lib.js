// Модельные примитивы в стиле "ручной скульпт": скруглённые бруски со сколами,
// токарные тела с неровностями, трубки. Всё детерминировано через seed.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

let rng = Math.random;
let simplex = new SimplexNoise();

export function seed(s) {
  let a = s >>> 0;
  rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  simplex = new SimplexNoise({ random: rng });
}

export const rand = (a = 0, b = 1) => a + (b - a) * rng();
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const n3 = (x, y, z) => simplex.noise3d(x, y, z);

// Плотность сетки (м на сегмент). Задаётся под масштаб каждого объекта.
export let RES = 0.01;
export function setRes(r) { RES = r; }

export const clay = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.62, metalness: 0.0 });

export function mesh(geo, mat = clay) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function weld(geo) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  geo = mergeVertices(geo, 1e-6);
  geo.computeVertexNormals();
  return geo;
}

// Скруглённый брусок с центром в начале координат.
export function roundedBox(w, h, d, r, res = RES) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const seg = (s) => Math.max(2, Math.ceil(s / res));
  const g = new THREE.BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
  const p = g.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    v.sub(c);
    const L = v.length();
    if (L > 1e-9) v.multiplyScalar(r / L);
    v.add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return weld(g);
}

// Токарное тело. profile: [[r, y], ...]. fn(r, y, theta, j) -> r (необязательно).
export function lathe(profile, { segs = 64, fn = null, phase = 0 } = {}) {
  const pos = [], idx = [];
  const P = profile.length;
  for (let i = 0; i < segs; i++) {
    const th = phase + (i / segs) * Math.PI * 2;
    for (let j = 0; j < P; j++) {
      let [r, y] = profile[j];
      if (fn) r = fn(r, y, th, j);
      pos.push(r * Math.cos(th), y, -r * Math.sin(th));
    }
  }
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % segs;
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j, b = i2 * P + j, c = i2 * P + j + 1, d = i * P + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const out = weld(g);
  // профиль может идти в любую сторону — разворачиваем грани, чтобы нормали смотрели наружу
  const P2 = out.attributes.position, N2 = out.attributes.normal;
  out.computeBoundingBox();
  const cy = (out.boundingBox.min.y + out.boundingBox.max.y) / 2;
  let s = 0;
  for (let i = 0; i < P2.count; i++) s += N2.getX(i) * P2.getX(i) + N2.getY(i) * (P2.getY(i) - cy) + N2.getZ(i) * P2.getZ(i);
  if (s < 0) {
    const ix = out.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    out.index.needsUpdate = true;
    out.computeVertexNormals();
  }
  return out;
}

// Сглаженный профиль через сплайн; sharp — индексы точек, где нужен излом.
export function spline(pts, n = 60) {
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getSpacedPoints(n).map((v) => [Math.max(0, v.x), v.y]);
}

// Профиль с "скруглёнными" углами: каждый внутренний угол заменяется дугой радиуса rad.
export function filletProfile(pts, rad, steps = 5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = new THREE.Vector2(...pts[i]);
    const a = new THREE.Vector2(...pts[i - 1]).sub(p);
    const b = new THREE.Vector2(...pts[i + 1]).sub(p);
    const ra = Math.min(rad, a.length() * 0.45, b.length() * 0.45);
    a.normalize(); b.normalize();
    const s = p.clone().addScaledVector(a, ra), e = p.clone().addScaledVector(b, ra);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      // квадратичная кривая Безье через угол
      const q = s.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * t * (1 - t)).addScaledVector(e, t * t);
      out.push([Math.max(0, q.x), q.y]);
    }
  }
  out.push(pts[pts.length - 1]);
  return densify(out, RES * 0.7);
}

export function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

// Трубка вдоль кривой с закрытыми концами (сферические шапки).
export function tube(points, radius, { closed = false, radial = 14, tension = 0.5, flat = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', tension);
  const len = curve.getLength();
  const tubular = Math.max(8, Math.ceil(len / (RES * 0.8)));
  const g = new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
  if (flat !== 1) {
    // сплющить сечение вдоль бинормали
    const p = g.attributes.position;
    const frames = curve.computeFrenetFrames(tubular, closed);
    const v = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      curve.getPointAt(i / tubular, c);
      const B = frames.binormals[i];
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        v.fromBufferAttribute(p, k);
        d.subVectors(v, c);
        const along = d.dot(B);
        v.addScaledVector(B, along * (flat - 1));
        p.setXYZ(k, v.x, v.y, v.z);
      }
    }
  }
  let geo = weld(g);
  if (!closed) {
    const grp = [geo];
    for (const t of [0, 1]) {
      const s = new THREE.SphereGeometry(radius, radial, Math.ceil(radial / 2));
      const c = curve.getPointAt(t);
      s.translate(c.x, c.y, c.z);
      grp.push(weld(s));
    }
    return grp;
  }
  return [geo];
}

// ---- деформации ----

function forEachVertex(geo, cb) {
  const p = geo.attributes.position, nrm = geo.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.fromBufferAttribute(nrm, i);
    cb(v, n, i);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
}

// Сколы: срезает геометрию случайными плоскостями у рёбер и углов.
export function chips(geo, count, depthMin, depthMax, { bias = null } = {}) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let c = 0; c < count; c++) {
    const n = new THREE.Vector3(
      pick([-1, 1]) * rand(0, 1), pick([-1, 1]) * rand(0, 1), pick([-1, 1]) * rand(0, 1));
    // одна ось почти нулевая -> срез вдоль ребра
    const ax = Math.min(2, Math.floor(rand(0, 3)));
    if (rng() < 0.6) n.setComponent(ax, n.getComponent(ax) * 0.15);
    if (bias) n.multiply(bias);
    if (n.lengthSq() < 1e-4) continue;
    n.normalize();
    let sup = -Infinity;
    for (let i = 0; i < p.count; i++) sup = Math.max(sup, v.fromBufferAttribute(p, i).dot(n));
    const plane = sup - rand(depthMin, depthMax);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const dd = v.dot(n) - plane;
      if (dd > 0) { v.addScaledVector(n, -dd); p.setXYZ(i, v.x, v.y, v.z); }
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Шум по нормали + общий "рукотворный" изгиб.
export function sculpt(geo, { amp = 0.002, freq = 20, wobble = 0, wfreq = 2, dents = 0, dentR = 0.02, dentD = 0.003 } = {}) {
  const off = rand(0, 100);
  const dentList = [];
  if (dents) {
    const p = geo.attributes.position;
    for (let k = 0; k < dents; k++) {
      const i = Math.floor(rand(0, p.count));
      dentList.push(new THREE.Vector3().fromBufferAttribute(p, i));
    }
  }
  forEachVertex(geo, (v, n) => {
    let d = 0;
    if (amp) d += amp * (n3(v.x * freq + off, v.y * freq, v.z * freq) + 0.25 * n3(v.x * freq * 2.3, v.y * freq * 2.3 + off, v.z * freq * 2.3));
    for (const c of dentList) {
      const q = v.distanceTo(c) / dentR;
      if (q < 1) d -= dentD * (1 - q * q) * (1 - q * q);
    }
    v.addScaledVector(n, d);
    if (wobble) {
      v.x += wobble * n3(v.x * wfreq + 11 + off, v.y * wfreq, v.z * wfreq);
      v.y += wobble * n3(v.x * wfreq, v.y * wfreq + 23 + off, v.z * wfreq);
      v.z += wobble * n3(v.x * wfreq, v.y * wfreq, v.z * wfreq + 37 + off);
    }
  });
  geo.computeVertexNormals();
  return geo;
}

// Волокна дерева: длинные борозды вдоль оси axis ('x'|'y'|'z').
export function grain(geo, axis = 'x', { amp = 0.0015, freq = 90, cracks = 3, crackD = 0.004, crackW = 0.004 } = {}) {
  const A = { x: 0, y: 1, z: 2 }[axis];
  const B = (A + 1) % 3, C = (A + 2) % 3;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const lines = [];
  for (let k = 0; k < cracks; k++) {
    lines.push({
      b: rand(bb.min.getComponent(B), bb.max.getComponent(B)) * 0.85,
      c: rand(bb.min.getComponent(C), bb.max.getComponent(C)) * 0.85,
      s: rand(0.15, 0.85), e: rand(0.15, 0.85), ph: rand(0, 100),
      d: crackD * rand(0.6, 1.2),
    });
  }
  const lenMin = bb.min.getComponent(A), len = bb.max.getComponent(A) - lenMin;
  const off = rand(0, 100);
  forEachVertex(geo, (v, n) => {
    const a = v.getComponent(A), b = v.getComponent(B), c = v.getComponent(C);
    let d = amp * n3(a * freq * 0.04 + off, b * freq, c * freq);
    const t = (a - lenMin) / len;
    for (const L of lines) {
      const t0 = Math.min(L.s, L.e) - 0.15, t1 = Math.max(L.s, L.e) + 0.15;
      if (t < t0 || t > t1) continue;
      const fade = Math.min(1, (t - t0) / 0.15, (t1 - t) / 0.15);
      const wv = 0.006 * n3(a * 3 + L.ph, 0, 0);
      const db = Math.abs(b - L.b - wv), dc = Math.abs(c - L.c - wv);
      const nb = Math.abs(n.getComponent(B)), nc = Math.abs(n.getComponent(C));
      // борозда видна на гранях, перпендикулярных B или C
      const dist = nb > nc ? dc : db;
      if (dist < crackW) d -= L.d * fade * (1 - (dist / crackW) ** 2);
    }
    v.addScaledVector(n, d);
  });
  geo.computeVertexNormals();
  return geo;
}

// Конусность: масштаб поперечного сечения по оси y.
export function taper(geo, bottom = 1, top = 1, curve = 0) {
  geo.computeBoundingBox();
  const y0 = geo.boundingBox.min.y, y1 = geo.boundingBox.max.y;
  forEachVertex(geo, (v) => {
    const t = (v.y - y0) / (y1 - y0);
    const s = bottom + (top - bottom) * t + curve * Math.sin(Math.PI * t);
    v.x *= s; v.z *= s;
  });
  geo.computeVertexNormals();
  return geo;
}

// Готовая доска: брусок + сколы + волокна + лёгкий шум.
export function plank(w, h, d, { r = null, axis = null, chipN = 6, chipD = null, cracks = 2, wobble = null, amp = null } = {}) {
  const m = Math.min(w, h, d);
  const g = roundedBox(w, h, d, r ?? m * 0.18);
  chips(g, chipN, (chipD ?? m * 0.12) * 0.3, chipD ?? m * 0.12);
  const ax = axis ?? (w >= h && w >= d ? 'x' : h >= d ? 'y' : 'z');
  grain(g, ax, { amp: m * 0.02, cracks, crackD: m * 0.06, crackW: m * 0.07 });
  sculpt(g, { amp: amp ?? m * 0.012, freq: 6 / m, wobble: wobble ?? m * 0.04, wfreq: 1.5 / Math.max(w, h, d) });
  return g;
}

// Камень: грубый скруглённый блок с крупными гранями.
export function stone(w, h, d, { chipN = 9 } = {}) {
  const m = Math.min(w, h, d);
  const g = roundedBox(w, h, d, m * 0.28);
  chips(g, chipN, m * 0.05, m * 0.22);
  sculpt(g, { amp: m * 0.02, freq: 4 / m, wobble: m * 0.06, wfreq: 1.2 / m, dents: 2, dentR: m * 0.3, dentD: m * 0.04 });
  return g;
}

// Шляпка гвоздя / заклёпка, ориентированная вдоль нормали dir.
export function nail(r, h = r * 0.6) {
  const prof = filletProfile([[0, -h], [r * 0.9, -h], [r, h * 0.2], [r * 0.6, h], [0, h * 1.05]], r * 0.35, 4);
  const g = lathe(prof, { segs: 20 });
  sculpt(g, { amp: r * 0.04, freq: 3 / r, wobble: r * 0.06, wfreq: 1 / r });
  return g;
}

export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = mesh(geo);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

export function group(...items) {
  const g = new THREE.Group();
  for (const it of items.flat()) g.add(it);
  return g;
}

// Пазы между досками: борозды вдоль плоскостей coord(axis) = values.
// Грани, параллельные плоскости паза (нормаль вдоль axis), не трогаются.
export function groove(geo, axis, values, w, depth) {
  const A = { x: 0, y: 1, z: 2 }[axis];
  forEachVertex(geo, (v, n) => {
    if (Math.abs(n.getComponent(A)) > 0.7) return;
    let d = 0;
    for (const c of values) {
      const q = Math.abs(v.getComponent(A) - c) / w;
      if (q < 1) d = Math.max(d, depth * (1 - q * q));
    }
    v.addScaledVector(n, -d);
  });
  geo.computeVertexNormals();
  return geo;
}

// Вырезать клин (углы в радианах, вокруг оси Y) из токарного тела.
export function wedgeCut(geo, a0, a1) {
  const mid = (a0 + a1) / 2;
  forEachVertex(geo, (v) => {
    let th = Math.atan2(-v.z, v.x);
    if (th < 0) th += Math.PI * 2;
    if (th <= a0 || th >= a1) return;
    const ap = th < mid ? a0 : a1;
    const r = Math.hypot(v.x, v.z) * Math.cos(th - ap);
    v.x = r * Math.cos(ap);
    v.z = -r * Math.sin(ap);
  });
  geo.computeVertexNormals();
  return geo;
}

export function forEachV(geo, cb) { forEachVertex(geo, cb); geo.computeVertexNormals(); return geo; }
