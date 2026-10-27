// models/*.glb (метры) -> fbx/<obj>.fbx и fbx/<obj>_lite.fbx (сантиметры).
// Упрощение — meshoptimizer через glTF-Transform, запись FBX — assimp.
// node tools/to_fbx.mjs [объект ...]
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TMP = fs.mkdtempSync('/tmp/tofbx-');
const io = new NodeIO();
const names = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(ROOT, 'models')).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
fs.mkdirSync(path.join(ROOT, 'fbx'), { recursive: true });
await MeshoptSimplifier.ready;

const VARIANTS = [
  { suffix: '', ratio: 0.5, error: 0.0002 },   // визуально без потерь
  { suffix: '_lite', ratio: 0.12, error: 0.002 }, // лёгкая версия для движка
];

for (const name of names) {
  for (const v of VARIANTS) {
    const doc = await io.read(path.join(ROOT, 'models', `${name}.glb`));
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: v.ratio, error: v.error }));
    // FBX по умолчанию в сантиметрах: всё масштабируем ×100 (вершины и смещения узлов),
    // чтобы в Blender/Unity/Unreal/Max размеры совпадали с реальными
    const done = new Set();
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
      const a = p.getAttribute('POSITION');
      if (!a || done.has(a)) continue;
      done.add(a);
      const arr = a.getArray();
      for (let i = 0; i < arr.length; i++) arr[i] *= 100;
      a.setArray(arr);
    }
    for (const n of doc.getRoot().listNodes()) n.setTranslation(n.getTranslation().map((x) => x * 100));
    let tris = 0;
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
    const tmp = path.join(TMP, `${name}${v.suffix}.glb`);
    await io.write(tmp, doc);
    const out = path.join(ROOT, 'fbx', `${name}${v.suffix}.fbx`);
    execFileSync('assimp', ['export', tmp, out, '-ffbx'], { stdio: 'ignore' });
    console.log(`${name}${v.suffix}.fbx  ${Math.round(tris)} tris  ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
  }
}
fs.rmSync(TMP, { recursive: true });
