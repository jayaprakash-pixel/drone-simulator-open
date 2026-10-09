// Copies CesiumJS's static assets (workers, images, widget CSS) into public/cesium so Vite serves them in dev and
// ships them in the build. Run by npm postinstall; public/cesium is gitignored.
import { cpSync } from 'node:fs';

const from = 'node_modules/cesium/Build/Cesium';
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  cpSync(`${from}/${dir}`, `public/cesium/${dir}`, { recursive: true });
}
console.log('cesium assets copied to public/cesium');
