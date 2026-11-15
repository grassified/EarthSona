export const defaultAccent = '#4169e1';
export const accents = {
  royal: defaultAccent,
  ice: '#92d5e7',
  violet: '#b5a4f5',
  mint: '#79d8ae',
  amber: '#f1bc71',
} as const;

export type Theme = 'light' | 'dark' | 'black';
export function validTheme(value: string): Theme {
  return value === 'light' || value === 'black' ? value : 'dark';
}

export function validAccent(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : defaultAccent;
}

function luminance(color: string) {
  const channels = [1, 3, 5].map(index => {
    const channel = parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

export function applyAppearance(root: HTMLElement, theme: Theme, accent: string) {
  root.dataset.theme = theme;
  const value = luminance(accent);
  const ink = value > .179 ? '#000000' : '#ffffff';
  root.style.setProperty('--chosen-accent', accent);
  root.style.setProperty('--on-accent', ink);
  // Keep custom accents readable on each theme's control surfaces.
  root.style.setProperty('--accent-text', theme === 'light'
    ? `color-mix(in srgb, ${accent} 25%, #152338)`
    : `color-mix(in srgb, ${accent} 34%, #ffffff)`);
}
