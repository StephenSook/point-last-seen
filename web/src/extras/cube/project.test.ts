import { describe, expect, it } from "vitest";
import type { CubeScene } from "./scene";
import { farFirst, project, toLocalM, type CubeView } from "./project";

const scene: CubeScene = { points: [], order: [], floor: [], halfM: 500, t0: 1_000_000, t1: 4_600_000 };
const view: CubeView = { azimuthDeg: 30, tiltDeg: 30, size: 400 };

describe("toLocalM", () => {
  it("0.001 degree of latitude is 111 m within 1 m", () => {
    const p = toLocalM({ lat: 33.781, lon: -84.37 }, { lat: 33.78, lon: -84.37 });
    expect(Math.abs(p.y - 111.19)).toBeLessThan(1);
    expect(p.x).toBeCloseTo(0, 6);
  });

  it("east is positive x and shrinks with the cosine of the latitude", () => {
    const p = toLocalM({ lat: 60, lon: 0.002 }, { lat: 60, lon: 0 });
    expect(p.x).toBeCloseTo(0.002 * 111_194.9 * 0.5, 0);
  });
});

describe("project", () => {
  it("the earliest time is on the floor and the latest at the top", () => {
    const floor = project({ x: 100, y: 50, t: scene.t0 }, scene, view);
    const top = project({ x: 100, y: 50, t: scene.t1 }, scene, view);
    expect(top.sy).toBeLessThan(floor.sy);
  });

  it("a vertical bar has the same screen x at both ends", () => {
    const a = project({ x: -220, y: 310, t: scene.t0 }, scene, view);
    const b = project({ x: -220, y: 310, t: scene.t1 }, scene, view);
    expect(a.sx).toBeCloseTo(b.sx, 9);
  });

  it("turning 360 degrees gives the same screen point", () => {
    const p = { x: 140, y: -90, t: 2_000_000 };
    const a = project(p, scene, view);
    const b = project(p, scene, { ...view, azimuthDeg: view.azimuthDeg + 360 });
    expect(b.sx).toBeCloseTo(a.sx, 9);
    expect(b.sy).toBeCloseTo(a.sy, 9);
  });

  it("every point inside the cube lands inside the picture", () => {
    for (const x of [-500, 500]) for (const y of [-500, 500]) for (const t of [scene.t0, scene.t1]) {
      for (const azimuthDeg of [0, 45, 90, 135]) {
        const p = project({ x, y, t }, scene, { ...view, azimuthDeg });
        expect(p.sx >= 0 && p.sx <= view.size && p.sy >= 0 && p.sy <= view.size).toBe(true);
      }
    }
  });
});

describe("farFirst", () => {
  it("depth order draws far things first", () => {
    const north = { id: "north", ...project({ x: 0, y: 400, t: scene.t0 }, scene, { ...view, azimuthDeg: 0 }) };
    const south = { id: "south", ...project({ x: 0, y: -400, t: scene.t0 }, scene, { ...view, azimuthDeg: 0 }) };
    expect(north.depth).toBeGreaterThan(south.depth);
    expect(farFirst([south, north]).map((p) => p.id)).toEqual(["north", "south"]);
  });
});
