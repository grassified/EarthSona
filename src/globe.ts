import type { Point } from './datasets';
import { mapPoint, radians, surface, type Bounds, type GlobeView } from './projection';

const size = 320;
const center = size / 2;
const radius = center - 3;

export function mountGlobe(canvas: HTMLCanvasElement, options: {
  view: GlobeView;
  bounds: Bounds;
  frame: () => ImageData | undefined;
  backdrop?: () => ImageData | undefined;
  auto: () => boolean;
  progress: () => { position: number; sampled?: number; point?: Point } | undefined;
  choose: (point: Point) => void;
  fail: () => void;
}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    options.fail();
    return () => {};
  }
  canvas.width = canvas.height = size;
  const output = ctx.createImageData(size, size);
  const pixels = output.data;
  const view = options.view;
  let raf = 0;
  let visible = false;
  let last = 0;
  let dirty = true;
  let frame: ImageData | undefined;
  let previousProgress = '';
  let backdrop: ImageData | undefined;
  let previousView = '';
  let paintedView = { ...view };
  let pointer: { id: number; x: number; y: number; moved: boolean } | undefined;

  function draw(source: ImageData) {
    const { width, height, data } = source;
    const progress = options.progress();
    const base = options.backdrop?.();
    previousProgress = JSON.stringify(progress);
    previousView = JSON.stringify(view);
    paintedView = { ...view };
    const sin = Math.sin(view.latitude);
    const cos = Math.cos(view.latitude);
    const { west, east, north, south } = options.bounds;
    for (let row = 0; row < size; row++) {
      const y = (center - row - .5) / radius;
      for (let col = 0; col < size; col++) {
        const x = (col + .5 - center) / radius;
        const depth = 1 - x * x - y * y;
        if (depth < 0) continue;
        const z = Math.sqrt(depth);
        const lon = ((view.longitude + Math.atan2(x, z * cos - y * sin)) / radians + 540) % 360 - 180;
        const lat = Math.asin(Math.max(-1, Math.min(1,y * cos + z * sin))) / radians;
        const u = (lon - west) / (east - west);
        const v = (north - lat) / (north - south);
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const from = (Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width))) * 4;
        const to = (row * size + col) * 4;
        const line = progress && Math.abs(progress.position - u) < .0018;
        const sampled = progress?.sampled !== undefined && Math.abs(progress.sampled - u) < .0025;
        const point = progress?.point;
        const marked = point && Math.hypot(point.x - u, point.y - v) < .007;
        const light = .60 + z * .40;
        const baseIndex = base ? (Math.min(base.height - 1, Math.floor(v * base.height)) * base.width + Math.min(base.width - 1, Math.floor(u * base.width))) * 4 : 0;
        const overlay = base ? .38 : 1;
        const backdrop = base ? .62 : 0;
        const baseData = base?.data;
        pixels[to] = line || sampled || marked ? 245 : (data[from + 0] * overlay + (baseData?.[baseIndex + 0] ?? 0) * backdrop) * light + 5;
        pixels[to + 1] = sampled || marked ? 227 : line ? 178 : (data[from + 1] * overlay + (baseData?.[baseIndex + 1] ?? 0) * backdrop) * light + 8;
        pixels[to + 2] = sampled || marked ? 194 : line ? 98 : (data[from + 2] * overlay + (baseData?.[baseIndex + 2] ?? 0) * backdrop) * light + 13;
        pixels[to + 3] = 255;
      }
    }
    ctx!.putImageData(output, 0, 0);
  }

  function tick(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (now - last >= 50) {
      const next = options.frame();
      const nextBackdrop = options.backdrop?.();
      const moving = options.auto() && !pointer;
      if (moving) view.longitude = (view.longitude + Math.min(80, now - last) * .000075) % (2 * Math.PI);
      if (next && (dirty || moving || previousView !== JSON.stringify(view) || next !== frame || nextBackdrop !== backdrop || previousProgress !== JSON.stringify(options.progress()))) {
        draw(next);
        frame = next;
        backdrop = nextBackdrop;
        dirty = false;
      }
      last = now;
    }
    raf = requestAnimationFrame(tick);
  }

  function wake() {
    if (visible && !document.hidden && !raf) raf = requestAnimationFrame(tick);
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else wake();
  });
  observer.observe(canvas);
  const listeners = new AbortController();
  const listener = { signal: listeners.signal };
  document.addEventListener('visibilitychange', wake, listener);

  function rotate(dx: number, dy: number) {
    view.longitude = (view.longitude + dx) % (2 * Math.PI);
    view.latitude = Math.max(-1.48, Math.min(1.48, view.latitude + dy));
    dirty = true;
  }

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }, listener);
  canvas.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.moved && Math.hypot(dx, dy) < 5) return;
    pointer = { ...pointer, x: event.clientX, y: event.clientY, moved: true };
    rotate(-dx / canvas.clientWidth * 2.8, dy / canvas.clientHeight * 2.8);
  }, listener);
  function choose(x: number, y: number) {
    const location = surface(x, y, paintedView);
    const point = location && mapPoint(location, options.bounds);
    if (point) options.choose(point);
  }
  canvas.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    const tap = !pointer.moved;
    pointer = undefined;
    if (!tap) return;
    const rect = canvas.getBoundingClientRect();
    choose(((event.clientX - rect.left) / rect.width * size - center) / radius,
      (center - (event.clientY - rect.top) / rect.height * size) / radius);
  }, listener);
  for (const name of ['pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(name, () => { pointer = undefined; }, listener);
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
  return () => {
    listeners.abort();
    observer.disconnect();
    cancelAnimationFrame(raf);
  };
}
