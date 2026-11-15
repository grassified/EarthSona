import type { Rgb } from './sampling';

const scale = [
  110, 130.81, 146.83, 164.81, 196,
  220, 261.63, 293.66, 329.63, 392,
  440, 523.25, 587.33, 659.25, 783.99, 880,
];

export function rgbChord({ red, green, blue }: Rgb, weak: boolean) {
  const level = weak ? .42 : 1;
  return [
    { frequency: scale[Math.min(4, Math.floor((1 - blue * .7) * 5))],
      level: .20 * (.3 + blue * .7) * level, type: 'sine' },
    { frequency: scale[5 + Math.min(4, Math.floor(green * 5))],
      level: .16 * (.3 + green * .7) * level, type: 'triangle' },
    { frequency: scale[10 + Math.min(5, Math.floor(red * 6))],
      level: .14 * (.2 + red * .8) * level, type: 'sine' },
  ] as const;
}
