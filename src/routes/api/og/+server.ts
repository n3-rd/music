import { Resvg } from '@resvg/resvg-js';
import { getNowPlaying } from '$lib/spotify';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

function getFontFiles(): string[] {
	const candidates = [
		join(process.cwd(), 'src/lib/fonts'),
		join(process.cwd(), 'static/fonts'),
		join(process.cwd(), 'fonts'),
		'/app/src/lib/fonts',
		'/app/static/fonts',
		'/app/fonts'
	];

	const files: string[] = [];
	for (const dir of candidates) {
		if (existsSync(dir)) {
			try {
				const entries = readdirSync(dir);
				for (const entry of entries) {
					if (entry.endsWith('.ttf') || entry.endsWith('.otf')) {
						const fullPath = join(dir, entry);
						if (!files.includes(fullPath)) {
							files.push(fullPath);
						}
					}
				}
			} catch (e) {
				console.warn('[OG Image] Error reading font dir:', dir, e);
			}
		}
	}
	return files;
}

function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function wrapTitle(text: string, maxChars = 20): string[] {
	if (text.length <= maxChars) return [text];
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';

	for (const w of words) {
		if ((current + ' ' + w).trim().length <= maxChars) {
			current = (current + ' ' + w).trim();
		} else {
			if (current) lines.push(current);
			current = w;
		}
	}
	if (current) lines.push(current);

	if (lines.length > 2) {
		return [lines[0], lines[1] + '...'];
	}
	return lines;
}

// Approximate dominant RGB from buffer samples
function extractAverageColor(buffer: Buffer): { r: number; g: number; b: number } {
	let totalR = 0,
		totalG = 0,
		totalB = 0,
		count = 0;
	const step = Math.max(1, Math.floor(buffer.length / 600));
	for (let i = 200; i < buffer.length - 4; i += step) {
		totalR += buffer[i];
		totalG += buffer[i + 1];
		totalB += buffer[i + 2];
		count++;
	}
	if (count === 0) return { r: 30, g: 58, b: 147 };
	return {
		r: Math.round(totalR / count),
		g: Math.round(totalG / count),
		b: Math.round(totalB / count)
	};
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const song = await getNowPlaying();

		const rawTitle = (url.searchParams.get('t') || song.title || 'NOT PLAYING').toUpperCase();
		const rawArtist = (url.searchParams.get('a') || song.artist || 'CURRENTLY OFFLINE').toUpperCase();
		const rawAlbum = (url.searchParams.get('album') || song.album || '').toUpperCase();
		const imageUrl = song.albumImageUrl || '';

		let imageBase64 = '';
		let avgColor = { r: 30, g: 58, b: 147 };

		if (imageUrl) {
			try {
				const imgRes = await fetch(imageUrl);
				if (imgRes.ok) {
					const arrayBuf = await imgRes.arrayBuffer();
					const buffer = Buffer.from(arrayBuf);
					avgColor = extractAverageColor(buffer);
					const mime = imgRes.headers.get('content-type') || 'image/jpeg';
					imageBase64 = `data:${mime};base64,${buffer.toString('base64')}`;
				}
			} catch (e) {
				console.error('[OG Image] Failed to fetch album image:', e);
			}
		}

		// Calculate relative perceived luminance (ITU-R BT.709)
		const luminance = (0.2126 * avgColor.r + 0.7152 * avgColor.g + 0.0722 * avgColor.b) / 255;
		const isLight = luminance > 0.42;

		const bgColor = `rgb(${avgColor.r}, ${avgColor.g}, ${avgColor.b})`;
		const textColor = isLight ? '#06080e' : '#ffffff';
		const textMutedColor = isLight ? 'rgba(6, 8, 14, 0.75)' : 'rgba(255, 255, 255, 0.75)';
		const railBg = isLight ? 'rgba(6, 8, 14, 0.15)' : 'rgba(255, 255, 255, 0.25)';

		const titleLines = wrapTitle(rawTitle, 20).map(escapeXml);
		const safeArtist = escapeXml(rawArtist.length > 34 ? rawArtist.slice(0, 32) + '...' : rawArtist);
		const statusOrAlbum = escapeXml(
			song.isRecentlyPlayed ? 'LAST PLAYED' : rawAlbum ? rawAlbum.slice(0, 32) : 'LIVE STREAM'
		);

		const titleFontSize = titleLines.length > 1 ? 40 : 48;
		const titleYStart = titleLines.length > 1 ? 230 : 255;
		const artistY = titleYStart + titleLines.length * 48 + 14;
		const subtitleY = artistY + 34;

		const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="bgBlur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="80"/>
      <feColorMatrix type="saturate" values="1.6"/>
    </filter>

    <radialGradient id="vinylShine" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="35%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="65%" stop-color="#ffffff" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.75"/>
    </radialGradient>

    <filter id="vinylShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="36" flood-color="#000000" flood-opacity="0.75"/>
    </filter>

    <clipPath id="vinylArtClip">
      <circle cx="290" cy="315" r="180"/>
    </clipPath>
  </defs>

  <!-- Base Dynamic Background Color -->
  <rect width="1200" height="630" fill="${bgColor}"/>

  <!-- Stretched Blurred Album Artwork Mesh (matching mobile) -->
  ${
		imageBase64
			? `<image href="${imageBase64}" x="-120" y="-120" width="1440" height="870" preserveAspectRatio="xMidYMid slice" opacity="0.45" filter="url(#bgBlur)"/>`
			: ''
	}

  <!-- Mobile-style Prominent Vinyl Disc -->
  <g filter="url(#vinylShadow)">
    <!-- Outer Vinyl Body -->
    <circle cx="290" cy="315" r="200" fill="#0a0d14" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
    
    <!-- Concentric Vinyl Grooves -->
    <circle cx="290" cy="315" r="195" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5"/>
    <circle cx="290" cy="315" r="188" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>

    <!-- Full Centered Artwork Disc (matching mobile player) -->
    ${
			imageBase64
				? `<image href="${imageBase64}" x="110" y="135" width="360" height="360" preserveAspectRatio="xMidYMid slice" clip-path="url(#vinylArtClip)"/>`
				: `<circle cx="290" cy="315" r="180" fill="#1e293b"/>`
		}

    <!-- Vinyl Sheen Reflection -->
    <circle cx="290" cy="315" r="180" fill="url(#vinylShine)"/>

    <!-- Inner Edge Vignette -->
    <circle cx="290" cy="315" r="180" fill="none" stroke="#000000" stroke-opacity="0.45" stroke-width="8"/>

    <!-- Center Spindle Hub & Ring (matching mobile) -->
    <circle cx="290" cy="315" r="22" fill="#0a0d14" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
    <circle cx="290" cy="315" r="7" fill="#000000" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1"/>
  </g>

  <!-- Typography Content (Exact Mobile Layout & High Contrast Text) -->
  <g transform="translate(560, 0)">
    <!-- Top Header: [ N3RD // SPOTIFY ] (NO badges) -->
    <text x="0" y="145" fill="${textMutedColor}" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" letter-spacing="4">[ N3RD // SPOTIFY ]</text>

    <!-- Track Title in Boska Editorial Serif (Uppercase) -->
    <text x="0" y="${titleYStart}" fill="${textColor}" font-family="Boska, Georgia, serif" font-size="${titleFontSize}" font-weight="700" letter-spacing="-0.5">
      ${titleLines.map((line, idx) => `<tspan x="0" dy="${idx === 0 ? 0 : 50}">${line}</tspan>`).join('')}
    </text>

    <!-- Artist in Clean Tracked Uppercase Inter -->
    <text x="0" y="${artistY}" fill="${textMutedColor}" font-family="Inter, sans-serif" font-size="19" font-weight="700" letter-spacing="2.5" text-transform="uppercase">${safeArtist}</text>

    <!-- Subtitle (LAST PLAYED or Album Name) -->
    <text x="0" y="${subtitleY}" fill="${textMutedColor}" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" letter-spacing="3" text-transform="uppercase">${statusOrAlbum}</text>

    <!-- Minimalist Scrubber Progress Bar -->
    <g transform="translate(0, 440)">
      <rect width="520" height="3" rx="1.5" fill="${railBg}"/>
      <rect width="240" height="3" rx="1.5" fill="${textColor}"/>
      <text x="0" y="24" fill="${textMutedColor}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" letter-spacing="1">0:18</text>
      <text x="520" y="24" text-anchor="end" fill="${textMutedColor}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" letter-spacing="1">-1:38</text>
    </g>

    <!-- Direct Spotify Action Link -->
    <g transform="translate(0, 520)">
      <text x="0" y="0" fill="${textColor}" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" letter-spacing="3">OPEN SPOTIFY ↗</text>
    </g>
  </g>
</svg>
`;

		const fontFiles = getFontFiles();

		const resvg = new Resvg(svg, {
			fitTo: {
				mode: 'width',
				value: 1200
			},
			font: {
				fontFiles,
				defaultFontFamily: 'Inter',
				loadSystemFonts: true
			}
		});

		const pngData = resvg.render();
		const pngBuffer = pngData.asPng();

		return new Response(new Uint8Array(pngBuffer), {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=30'
			}
		});
	} catch (err) {
		console.error('[OG Image Error]:', err);
		return new Response('Failed to generate image', { status: 500 });
	}
};
