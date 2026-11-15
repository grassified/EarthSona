import { globeDisplay } from './globe-display';
import type { Dataset, Point } from './datasets';
import { globePosition, mapPoint, radians, screenPoint, surface, type Bounds, type GlobeView } from './projection';

// The display buffer is independent of the full-resolution sonification raster.
const size = 240;
const center = size / 2;
const radius = center - 3;

// Orthographic screen geometry is shared by every globe and every view.
const disk = (() => {
  const offsets: number[] = [];
  const coordinates: number[] = [];
  const alpha: number[] = [];
  for (let row = 0; row < size; row++) {
    const y = (center - row - .5) / radius;
    for (let col = 0; col < size; col++) {
      const x = (col + .5 - center) / radius;
      const depth = 1 - x * x - y * y;
      const coverage = Math.max(0, Math.min(1, .5 + (1 - Math.hypot(x, y)) * radius));
      if (!coverage) continue;
      offsets.push(row * size + col);
      coordinates.push(x, y, Math.sqrt(Math.max(0, depth)));
      alpha.push(Math.round(coverage * 255));
    }
  }
  return { offsets: Uint32Array.from(offsets), coordinates: Float64Array.from(coordinates), alpha: Uint8Array.from(alpha) };
})();

type GlobeProgress = { position: number; sampled?: Point; hover?: Point; target?: Point; marker?: Point };

function samePoint(a?: Point, b?: Point) {
  return a?.x === b?.x && a?.y === b?.y;
}

export function mountGlobe(canvas: HTMLCanvasElement, options: {
  view: GlobeView;
  bounds: Bounds;
  dataset: Dataset;
  light: boolean;
  laser: () => boolean;
  reduced: () => boolean;
  frame: () => ImageData | undefined;
  backdrop?: () => ImageData | undefined;
  auto: () => boolean;
  rotating: () => boolean;
  progress: () => GlobeProgress;
  choose: (point: Point, screenX: number) => void;
  fail: () => void;
}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    options.fail();
    return { wake: () => {}, dispose: () => {}, spatial: () => undefined, pick: () => null };
  }
  canvas.width = canvas.height = size;
  const output = ctx.createImageData(size, size);
  const texture = new Uint8ClampedArray(output.data.length);
  const packed = new Uint32Array(texture.buffer);
  const longitudeOffsets = new Float64Array(disk.offsets.length);
  let projectedLatitude: number | undefined;
  let display: Uint32Array | undefined;
  const uCoords = new Float64Array(disk.offsets.length);
  const vCoords = new Float64Array(disk.offsets.length);
  const view = options.view;
  let raf = 0;
  let visible = false;
  let last: number | undefined;
  let frame: ImageData | undefined;
  let backdrop: ImageData | undefined;
  let paintedView = { ...view };
  let paintedProgress: GlobeProgress = { position: -1 };
  let paintedLaser: boolean | undefined;
  let sampleTime = 0;
  let pointer: { id: number; x: number; y: number } | undefined;

  function project(source: ImageData) {
    const { width, height } = source;
    const { west, east, north, south } = options.bounds;
    const longitude = view.longitude / radians;
    const { offsets, coordinates, alpha } = disk;
    // Auto-rotation changes longitude only, so keep the latitude-dependent trig.
    if (view.latitude !== projectedLatitude) {
      const sin = Math.sin(view.latitude), cos = Math.cos(view.latitude);
      for (let i = 0, j = 0; i < offsets.length; i++, j += 3) {
        const x = coordinates[j], y = coordinates[j + 1], z = coordinates[j + 2];
        longitudeOffsets[i] = Math.atan2(x, z * cos - y * sin) / radians;
        const latitude = Math.asin(Math.max(-1, Math.min(1, y * cos + z * sin))) / radians;
        vCoords[i] = (north - latitude) / (north - south);
      }
      projectedLatitude = view.latitude;
    }
    const raster = display!;
    for (let i = 0; i < offsets.length; i++) {
      const lon = (longitude + longitudeOffsets[i] + 540) % 360 - 180;
      const u = (lon - west) / (east - west), v = vCoords[i];
      const to = offsets[i];
      uCoords[i] = u;
      if (u < 0 || u > 1 || v < 0 || v > 1) {
        packed[to] = 0;
        continue;
      }
      const from = Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width));
      packed[to] = raster[from];
      if (alpha[i] !== 255) texture[to * 4 + 3] = alpha[i];
    }
  }

  function draw({ position, sampled, hover, target, marker }: GlobeProgress, laser: boolean, pulse: number) {
    const pixels = output.data;
    pixels.set(texture);
    if (position >= 0 || sampled || hover || target || marker) {
      const projected = (point?: Point) => point && screenPoint(point, options.bounds, view);
      const preview = projected(hover);
      const dot = projected(marker);
      const ringCenter = projected(target ?? (laser ? sampled : undefined));
      const squaredDistance = (point: { x: number; y: number }, x: number, y: number) =>
        (point.x - x) ** 2 + (point.y - y) ** 2;
      const reduced = options.reduced();
      const halo = reduced ? .003 : .006;
      const pulseRadius = .035 + (target ? 0 : pulse * .04);
      const { offsets, coordinates } = disk;
      const wraps = options.bounds.east - options.bounds.west === 360;
      for (let i = 0; i < offsets.length; i++) {
        const to = offsets[i] * 4;
        if (!pixels[to + 3]) continue;
        const u = uCoords[i];
        let distance = position >= 0 ? Math.abs(position - u) : Infinity;
        if (wraps && position >= 0) distance = Math.min(distance, 1 - distance);
        const stripe = !laser && !target && sampled && Math.abs(sampled.x - u) < .0025;
        const x = coordinates[i * 3], y = coordinates[i * 3 + 1];
        const marked = dot && Math.abs(squaredDistance(dot, x, y) - .034 ** 2) < .00054;
        const ring = (ringCenter && Math.abs(squaredDistance(ringCenter, x, y) - pulseRadius ** 2) < pulseRadius * .014) ||
          (preview && Math.abs(squaredDistance(preview, x, y) - .035 ** 2) < .00049);
        if (stripe || marked || ring) {
          pixels[to] = 245;
          pixels[to + 1] = 216;
          pixels[to + 2] = 151;
        } else if (laser && distance < halo) {
          const core = distance < .0014;
          const intensity = core ? 1 : distance < .0027 ? .88 : reduced ? .22 : .36;
          pixels[to] += (255 - pixels[to]) * intensity;
          pixels[to + 1] += ((core ? 255 : 111) - pixels[to + 1]) * intensity;
          pixels[to + 2] += ((core ? 255 : 144) - pixels[to + 2]) * intensity;
        } else if (!laser && distance < .0018) {
          pixels[to] = 245;
          pixels[to + 1] = 178;
          pixels[to + 2] = 98;
        }
      }
    }
    ctx!.putImageData(output, 0, 0);
  }

  function tick(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    const moving = options.auto() && !pointer;
    if (moving && last !== undefined) {
      view.longitude = (view.longitude + Math.min(80, now - last) * .000075) % (2 * Math.PI);
    }
    last = moving ? now : undefined;
    const next = options.frame();
    const base = options.backdrop?.();
    const progress = options.progress();
    const laser = options.laser();
    const sourceChanged = next !== frame || base !== backdrop;
    const reproject = sourceChanged ||
      view.longitude !== paintedView.longitude || view.latitude !== paintedView.latitude;
    if (next && (reproject || progress.position !== paintedProgress.position || laser !== paintedLaser ||
        !samePoint(progress.sampled, paintedProgress.sampled) || !samePoint(progress.hover, paintedProgress.hover) ||
        !samePoint(progress.target, paintedProgress.target) || !samePoint(progress.marker, paintedProgress.marker))) {
      if (sourceChanged) display = globeDisplay(options.dataset, next, base, options.light);
      if (reproject) project(next);
      if (!samePoint(progress.sampled, paintedProgress.sampled)) sampleTime = now;
      const pulse = options.reduced() ? 0 : Math.min(1, (now - sampleTime) / 260);
      draw(progress, laser, pulse);
      paintedLaser = laser;
      frame = next;
      backdrop = base;
      paintedView = { ...view };
      paintedProgress = progress;
    }
    if (moving) wake();
  }

  function wake() {
    if (visible && !document.hidden && !raf) raf = requestAnimationFrame(tick);
  }
  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = undefined;
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
    else pause();
  });
  observer.observe(canvas);
  const listeners = new AbortController();
  const listener = { signal: listeners.signal };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else wake();
  }, listener);

  function rotate(dx: number, dy: number) {
    view.longitude = (view.longitude + dx) % (2 * Math.PI);
    view.latitude = Math.max(-1.48, Math.min(1.48, view.latitude + dy));
    wake();
  }

  canvas.addEventListener('pointerdown', event => {
    if (!options.rotating() || !event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    last = undefined;
    canvas.setPointerCapture(event.pointerId);
  }, listener);
  canvas.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId || !options.rotating()) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = { ...pointer, x: event.clientX, y: event.clientY };
    rotate(-dx / canvas.clientWidth * 2.8, dy / canvas.clientHeight * 2.8);
  }, listener);
  function choose(x: number, y: number) {
    const location = surface(x, y, paintedView);
    const point = location && mapPoint(location, options.bounds);
    if (point) options.choose(point, x);
  }
  function pick(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width * size - center) / radius;
    const y = (center - (clientY - rect.top) / rect.height * size) / radius;
    const location = surface(x, y, paintedView);
    const point = location && mapPoint(location, options.bounds);
    return point && { point, screenX: x };
  }
  canvas.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    pointer = undefined;
    wake();
  }, listener);
  for (const name of ['pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(name, () => { pointer = undefined; wake(); }, listener);
  }
  canvas.addEventListener('keydown', event => {
    const delta = 12 * radians;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, delta], ArrowDown: [0, -delta],
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(0, 0);
    } else if (steps[event.key]) {
      event.preventDefault();
      rotate(...steps[event.key]);
    }
  }, listener);
  canvas.addEventListener('contextlost', options.fail, listener);
  return {
    wake,
    pick,
    spatial: (point: Point) => visible && frame ? globePosition(point, options.bounds, view) : undefined,
    dispose() {
      visible = false;
      listeners.abort();
      observer.disconnect();
      pause();
    },
  };
}
