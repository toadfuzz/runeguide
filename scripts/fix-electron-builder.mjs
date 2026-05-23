import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const target = require.resolve('app-builder-lib/out/targets/nsis/NsisTarget.js');
const original = await readFile(target, 'utf8');
const needle = `        else {
            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }`;
const replacement = `        else {
            await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
        }`;

if (!original.includes(needle)) {
  console.log('electron-builder patch already applied or target changed:', target);
  process.exit(0);
}

const updated = original.replace(needle, replacement);
await writeFile(target, updated, 'utf8');
console.log('Patched electron-builder NSIS uninstaller flow in', target);
