import { getEnrichedNowPlaying } from './spotify';

export interface ThemePalette {
	primary: string;   // 6-character hex without '#'
	secondary: string; // 6-character hex without '#'
	tertiary: string;  // 6-character hex without '#'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	let cleaned = hex.replace('#', '').trim();
	if (cleaned.length === 3) {
		cleaned = cleaned
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const num = parseInt(cleaned, 16);
	if (isNaN(num)) {
		return { r: 0, g: 255, b: 157 };
	}
	return {
		r: (num >> 16) & 255,
		g: (num >> 8) & 255,
		b: num & 255
	};
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			case b:
				h = (r - g) / d + 4;
				break;
		}
		h *= 60;
	}

	return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
	h = ((h % 360) + 360) % 360;
	s = Math.max(0, Math.min(100, s)) / 100;
	l = Math.max(0, Math.min(100, l)) / 100;

	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let r = 0,
		g = 0,
		b = 0;
	if (h >= 0 && h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (h >= 60 && h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (h >= 120 && h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (h >= 180 && h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (h >= 240 && h < 300) {
		r = x;
		g = 0;
		b = c;
	} else {
		r = c;
		g = 0;
		b = x;
	}

	const toHex = (val: number) => {
		const intVal = Math.round((val + m) * 255);
		return Math.max(0, Math.min(255, intVal)).toString(16).padStart(2, '0');
	};

	return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function deriveThemePalette(rawHex: string): ThemePalette {
	const rgb = hexToRgb(rawHex || '#00FF9D');
	const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

	// Clamp saturation to at least 55%
	const clampedS = Math.max(55, Math.min(100, hsl.s));
	// Clamp lightness to between 45% and 70%
	const clampedL = Math.max(45, Math.min(70, hsl.l));

	const primary = hslToHex(hsl.h, clampedS, clampedL);
	const secondary = hslToHex(hsl.h + 150, clampedS, clampedL);
	const tertiary = hslToHex(hsl.h + 270, clampedS, clampedL);

	return {
		primary,
		secondary,
		tertiary
	};
}

let _cachedPalette: ThemePalette | null = null;
let _cacheExpiresAt = 0;
let _inFlightPalettePromise: Promise<ThemePalette> | null = null;

export async function getThemePalette(): Promise<ThemePalette> {
	const now = Date.now();
	if (_cachedPalette && now < _cacheExpiresAt) {
		return _cachedPalette;
	}

	if (_inFlightPalettePromise) {
		return _inFlightPalettePromise;
	}

	_inFlightPalettePromise = (async () => {
		try {
			const song = await getEnrichedNowPlaying();
			const hexColor = song.color?.hex || '#00FF9D';
			const palette = deriveThemePalette(hexColor);

			_cachedPalette = palette;
			// Cache for 20 seconds
			_cacheExpiresAt = Date.now() + 20_000;
			return palette;
		} catch (err) {
			console.error('[Theme] Failed to get enriched now-playing color:', err);
			if (_cachedPalette) return _cachedPalette;
			return deriveThemePalette('#00FF9D');
		} finally {
			_inFlightPalettePromise = null;
		}
	})();

	return _inFlightPalettePromise;
}
