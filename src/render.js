// Рендер-страница: строит объект, снимает виды, отдаёт PNG (dataURL) и GLB.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJECTS } from './objects.js';

const SIZE = 1536;
const BG = 0x3a3a3a;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

// Виды: азимут (0 = спереди, +90 = справа), возвышение, проекция.
export const VIEWS = [
  { id: '01_front', az: 0, el: 0, ortho: true },
  { id: '02_back', az: 180, el: 0, ortho: true },
  { id: '03_left', az: -90, el: 0, ortho: true },
  { id: '04_right', az: 90, el: 0, ortho: true },
  { id: '05_top', az: 0, el: 89.9, ortho: true },
  { id: '06_front_3q', az: 35, el: 22, ortho: false },
  { id: '07_back_3q', az: 215, el: 22, ortho: false },
  { id: '08_low_3q', az: -40, el: 8, ortho: false },
];

function buildScene(obj) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.add(obj);
  return scene;
}

function setupLights(scene, camDir, up, radius, center) {
  // Свет "привязан" к камере, чтобы любой вид был одинаково освещён (как в студии скульптора).
  const right = new THREE.Vector3().crossVectors(up, camDir).normalize().negate();
  const camUp = new THREE.Vector3().crossVectors(camDir, right).normalize().negate();
  const lights = [];
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 1.1);
  lights.push(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.copy(center).addScaledVector(camDir, radius * 2).addScaledVector(right, -radius * 1.6).addScaledVector(camUp, radius * 2.2);
  key.target.position.copy(center);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -radius * 1.3; sc.right = sc.top = radius * 1.3;
  sc.near = radius * 0.1; sc.far = radius * 8;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = radius * 0.004;
  key.shadow.radius = 3;
  lights.push(key, key.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.copy(center).addScaledVector(camDir, radius * 2).addScaledVector(right, radius * 2).addScaledVector(camUp, radius * 0.3);
  lights.push(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.copy(center).addScaledVector(camDir, -radius * 2).addScaledVector(right, radius * 0.8).addScaledVector(camUp, radius * 1.5);
  lights.push(rim);
  for (const l of lights) scene.add(l);
  return () => lights.forEach((l) => scene.remove(l));
}

// Точки поверхности (прореженные) — для плотного кадрирования по силуэту.
function samplePoints(obj) {
  const pts = [];
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 3000));
    for (let i = 0; i < p.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  });
  return pts;
}

function shoot(scene, obj, view) {
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  const az = THREE.MathUtils.degToRad(view.az), el = THREE.MathUtils.degToRad(view.el);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const up = view.el > 80 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);

  let cam;
  if (view.ortho) {
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, radius * 0.05, radius * 10);
  } else {
    cam = new THREE.PerspectiveCamera(30, 1, radius * 0.05, radius * 20);
  }
  cam.up.copy(up);
  cam.position.copy(center).addScaledVector(dir, radius * 4);
  cam.lookAt(center);
  cam.updateMatrixWorld();

  // Подгонка кадра по проекции углов габарита (поле ~ 84% кадра).
  const corners = samplePoints(obj);
  const inv = cam.matrixWorldInverse;
  if (view.ortho) {
    let mx = 0, my = 0;
    for (const c of corners) { const q = c.clone().applyMatrix4(inv); mx = Math.max(mx, Math.abs(q.x)); my = Math.max(my, Math.abs(q.y)); }
    const half = Math.max(mx, my) / 0.84;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
  } else {
    const t = Math.tan(THREE.MathUtils.degToRad(15));
    let dist = 0;
    for (const c of corners) {
      const q = c.clone().sub(center);
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const depth = q.dot(dir);
      const need = Math.max(Math.abs(q.dot(right)), Math.abs(q.dot(camUp))) / (t * 0.84) + depth;
      dist = Math.max(dist, need);
    }
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    // уточнение: масштабируем так, чтобы проекция габарита занимала ~84% кадра
    let m = 0;
    for (const c of corners) { const q = c.clone().project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
    cam.zoom = 0.84 / m;
    cam.updateProjectionMatrix();
  }
  cam.updateMatrixWorld();

  const remove = setupLights(scene, dir, up, radius, center);
  const composer = new EffectComposer(renderer);
  composer.setSize(SIZE, SIZE);
  composer.addPass(new RenderPass(scene, cam));
  const ao = new GTAOPass(scene, cam, SIZE, SIZE);
  ao.updateGtaoMaterial({ radius: radius * 0.12, distanceExponent: 1.5, thickness: radius * 0.1, scale: 1.0 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  composer.dispose();
  remove();
  return url;
}

window.renderObject = async (name, viewIds = null) => {
  const def = OBJECTS[name];
  const obj = def.build();
  obj.updateMatrixWorld(true);
  const scene = buildScene(obj);
  const out = {};
  for (const v of VIEWS) {
    if (viewIds && !viewIds.includes(v.id)) continue;
    out[v.id] = shoot(scene, obj, v);
  }
  let tris = 0;
  obj.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  const box = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  return { views: out, tris, size: box.toArray() };
};

window.exportGLB = async (name) => {
  const obj = OBJECTS[name].build();
  const ab = await new GLTFExporter().parseAsync(obj, { binary: true });
  const bytes = new Uint8Array(ab);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

window.objectNames = Object.keys(OBJECTS);
window.ready = true;
