// Runs before any Cesium call: points Cesium at its workers, images and widget assets (public/cesium, copied by
// scripts/copy-cesium.mjs). A wrong path fails silently as worker/texture 404s, the classic first-day Cesium error.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`;
