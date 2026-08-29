import { Resvg } from '@resvg/resvg-js';
import { getNowPlaying } from '$lib/spotify';
import type { RequestHandler } from './$types';

function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function wrapTitle(text: string, maxChars = 24): string[] {
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

export const GET: RequestHandler = async ({ url }) => {
	try {
		const song = await getNowPlaying();

		const rawTitle = url.searchParams.get('t') || song.title || 'Not Playing';
		const rawArtist = url.searchParams.get('a') || song.artist || 'Currently offline';
		const rawAlbum = url.searchParams.get('album') || song.album || '';
		const imageUrl = song.albumImageUrl || '';

		let imageBase64 = '';
		if (imageUrl) {
			try {
				const imgRes = await fetch(imageUrl);
				if (imgRes.ok) {
					const buffer = await imgRes.arrayBuffer();
					const base64 = Buffer.from(buffer).toString('base64');
					const mime = imgRes.headers.get('content-type') || 'image/jpeg';
					imageBase64 = `data:${mime};base64,${base64}`;
				}
			} catch (e) {
				console.error('[OG Image] Failed to fetch album image:', e);
			}
		}

		const titleLines = wrapTitle(rawTitle, 22).map(escapeXml);
		const safeArtist = escapeXml(rawArtist.length > 36 ? rawArtist.slice(0, 34) + '...' : rawArtist);
		const safeAlbum = escapeXml(rawAlbum.length > 40 ? rawAlbum.slice(0, 38) + '...' : rawAlbum);

		const isPlaying = song.isPlaying;
		const statusText = isPlaying
			? 'N3RD IS LISTENING TO'
			: song.isRecentlyPlayed
				? 'N3RD WAS LISTENING TO'
				: 'N3RD // NOW PLAYING';
		const statusColor = isPlaying ? '#4ade80' : '#94a3b8';

		const titleFontSize = titleLines.length > 1 ? 38 : 44;
		const titleYStart = titleLines.length > 1 ? 260 : 280;

		const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0c1322"/>
      <stop offset="50%" stop-color="#070b14"/>
      <stop offset="100%" stop-color="#03050a"/>
    </linearGradient>

    <radialGradient id="vinylShine" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.09"/>
      <stop offset="35%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="65%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.75"/>
    </radialGradient>

    <radialGradient id="ambientGlow" cx="28%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1d3557" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <filter id="vinylShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="28" flood-color="#000000" flood-opacity="0.95"/>
    </filter>

    <clipPath id="artClip">
      <circle cx="310" cy="315" r="105"/>
    </clipPath>
  </defs>

  <!-- Background Layer -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect width="1200" height="630" fill="url(#ambientGlow)"/>

  <!-- Minimal Border Framing -->
  <line x1="60" y1="50" x2="1140" y2="50" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="60" y1="580" x2="1140" y2="580" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>

  <!-- Vinyl Record Disc -->
  <g filter="url(#vinylShadow)">
    <!-- Outer Vinyl Body -->
    <circle cx="310" cy="315" r="225" fill="#080b12" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
    
    <!-- Concentric Grooves -->
    <circle cx="310" cy="315" r="215" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1.5"/>
    <circle cx="310" cy="315" r="200" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
    <circle cx="310" cy="315" r="185" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
    <circle cx="310" cy="315" r="170" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1.5"/>
    <circle cx="310" cy="315" r="155" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
    <circle cx="310" cy="315" r="140" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
    <circle cx="310" cy="315" r="125" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1.5"/>

    <!-- Light Sheen Reflection -->
    <circle cx="310" cy="315" r="225" fill="url(#vinylShine)"/>

    <!-- Center Album Artwork -->
    ${
			imageBase64
				? `<image href="${imageBase64}" x="205" y="210" width="210" height="210" preserveAspectRatio="xMidYMid slice" clip-path="url(#artClip)"/>`
				: `<circle cx="310" cy="315" r="105" fill="#1e293b" stroke="#ffffff" stroke-opacity="0.1"/>`
		}

    <!-- Center Label Vignette Overlay -->
    <circle cx="310" cy="315" r="105" fill="none" stroke="#000000" stroke-opacity="0.4" stroke-width="6"/>

    <!-- Spindle Hub & Metal Center -->
    <circle cx="310" cy="315" r="24" fill="#080b12" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
    <circle cx="310" cy="315" r="8" fill="#000000" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1"/>
  </g>

  <!-- Typography Content -->
  <g transform="translate(600, 0)">
    <!-- Eyebrow Status -->
    <g transform="translate(0, 185)">
      <circle cx="5" cy="-5" r="4.5" fill="${statusColor}"/>
      <text x="22" y="0" fill="${statusColor}" font-family="monospace" font-size="13" font-weight="700" letter-spacing="3">${statusText}</text>
    </g>

    <!-- Track Title (Supports Multi-line) -->
    <text x="0" y="${titleYStart}" fill="#ffffff" font-family="Georgia, serif" font-size="${titleFontSize}" font-weight="700" letter-spacing="-0.5">
      ${titleLines.map((line, idx) => `<tspan x="0" dy="${idx === 0 ? 0 : 46}">${line}</tspan>`).join('')}
    </text>

    <!-- Artist Name -->
    <text x="0" y="${titleYStart + titleLines.length * 46 + 15}" fill="#e2e8f0" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" letter-spacing="2" text-transform="uppercase">${safeArtist}</text>

    <!-- Album Name (if present) -->
    ${
			safeAlbum
				? `<text x="0" y="${titleYStart + titleLines.length * 46 + 55}" fill="#94a3b8" font-family="monospace" font-size="14" letter-spacing="3" text-transform="uppercase">${safeAlbum}</text>`
				: ''
		}

    <!-- Progress Rail -->
    <g transform="translate(0, 440)">
      <rect width="480" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.15"/>
      <rect width="220" height="3" rx="1.5" fill="#ffffff"/>
      <circle cx="220" cy="1.5" r="5" fill="#ffffff"/>
      <text x="0" y="24" fill="#64748b" font-family="monospace" font-size="11" letter-spacing="1">LIVE STREAM</text>
      <text x="480" y="24" text-anchor="end" fill="#64748b" font-family="monospace" font-size="11" letter-spacing="1">SPOTIFY</text>
    </g>

    <!-- Brand Footer -->
    <g transform="translate(0, 525)">
      <text x="0" y="0" fill="#64748b" font-family="monospace" font-size="12" letter-spacing="3">MUSIC.N3-RD.XYZ</text>
    </g>
  </g>
</svg>
`;

		const resvg = new Resvg(svg, {
			fitTo: {
				mode: 'width',
				value: 1200
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
