import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecolingo-classifier-'));
fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"commonjs"}');

for (const [source, output] of [
  ['src/types.ts', 'types.js'],
  ['src/data/recyclingData.ts', 'recyclingData.js'],
]) {
  const input = fs.readFileSync(source, 'utf8').replace("from '@/types'", "from './types'");
  const result = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  fs.writeFileSync(path.join(tempDir, output), result.outputText);
}

const { classifyMaterial } = require(path.join(tempDir, 'recyclingData.js'));
const expected = new Map([
  ['botella de plástico', 'plastico'],
  ['botella PET', 'plastico'],
  ['botella de vidrio', 'vidrio'],
  ['frasco de vidrio', 'vidrio'],
  ['lata de aluminio', 'metal'],
  ['caja de cartón', 'papel'],
  ['pila AA', 'pilas'],
  ['celular', 'raee'],
  ['ropa', 'textil'],
  ['restos de fruta', 'organico'],
  ['pintura', 'peligroso'],
]);

let failures = 0;
for (const [input, category] of expected) {
  const result = classifyMaterial(input);
  if (result.item?.category !== category) {
    console.error(`FAIL ${input}: esperado ${category}, recibido ${result.item?.category ?? 'sin categoría'}`);
    failures += 1;
  } else {
    console.log(`PASS ${input} -> ${category}`);
  }
}

for (const input of ['botella', 'caja', 'envase', 'bolsa', 'vaso', 'bateria', 'bombilla', 'objeto', 'cosa', '']) {
  const result = classifyMaterial(input);
  if (result.item || result.status === 'confident') {
    console.error(`FAIL ambiguo “${input}”: no debía clasificarse con certeza`);
    failures += 1;
  } else {
    console.log(`PASS ambiguo “${input || '(vacío)'}” -> ${result.status}`);
  }
}

fs.rmSync(tempDir, { recursive: true, force: true });
if (failures) process.exit(1);
