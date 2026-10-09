import { Cartesian2, Cartographic, Math as CesiumMath } from 'cesium';
import type { Viewer } from 'cesium';

export interface Ground {
  lat: number;
  lon: number;
  /** height of the rendered ground surface, metres above the ellipsoid */
  hEllipsoid: number;
}

/** The ground point under a canvas pixel (CSS px from the canvas corner), or undefined over space. */
export function pickGround(viewer: Viewer, x: number, y: number): Ground | undefined {
  const ray = viewer.camera.getPickRay(new Cartesian2(x, y));
  const hit = ray && viewer.scene.globe.pick(ray, viewer.scene);
  if (!hit) return undefined;
  const g = Cartographic.fromCartesian(hit);
  return { lat: CesiumMath.toDegrees(g.latitude), lon: CesiumMath.toDegrees(g.longitude), hEllipsoid: g.height };
}
