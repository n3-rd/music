import { getEnrichedNowPlaying } from '$lib/spotify';
import type { RequestHandler } from './$types';

function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function truncate(str: string, max = 42): string {
	const s = (str || '').trim();
	if (s.length > max) {
		return s.slice(0, max - 3) + '...';
	}
	return s;
}

export const GET: RequestHandler = async () => {
	const song = await getEnrichedNowPlaying();

	// 1. Status label & color
	let statusLabel = 'OFFLINE';
	let statusColor = '#6e7681';

	if (song.isPlaying) {
		statusLabel = 'VIBING TO';
		statusColor = '#00FF9D';
	} else if (song.isRecentlyPlayed) {
		statusLabel = 'LAST PLAYED';
		statusColor = '#00D4FF';
	}

	// 2. Title
	const rawTitle = song.title || (song.isPlaying ? 'Unknown Track' : 'Not Playing');
	const escapedTitle = escapeXml(truncate(rawTitle, 42));

	// 3. Artist — Album
	let artistAlbumStr = '';
	if (song.artist && song.album) {
		artistAlbumStr = `${song.artist} — ${song.album}`;
	} else if (song.artist) {
		artistAlbumStr = song.artist;
	} else if (song.album) {
		artistAlbumStr = song.album;
	} else {
		artistAlbumStr = song.isPlaying ? 'Unknown Artist' : 'Currently offline';
	}
	const escapedArtistAlbum = escapeXml(truncate(artistAlbumStr, 42));

	// 4. Progress bar
	const rawPercent = typeof song.progressPercent === 'number' ? song.progressPercent : 0;
	const progressPercent = Math.max(0, Math.min(100, rawPercent));
	const fillWidth = Math.round((progressPercent / 100) * 300 * 10) / 10;
	const barColor = song.color?.hex || '#00FF9D';
	const escapedBarColor = escapeXml(barColor);

	// 5. Timestamps
	const escapedProgress = escapeXml(song.formattedProgress || '0:00');
	const escapedDuration = escapeXml(song.formattedDuration || '0:00');

	// 6. Album Art / Placeholder (90x90, 8px rounded corners)
	const albumArtElement = song.imageBase64
		? `<rect x="18" y="18" width="90" height="90" rx="8" fill="#161b22"/>
  <image href="${song.imageBase64}" xlink:href="${song.imageBase64}" x="18" y="18" width="90" height="90" preserveAspectRatio="xMidYMid slice" clip-path="url(#albumArtClip)"/>`
		: `<rect x="18" y="18" width="90" height="90" rx="8" fill="#161b22"/>`;

	const svg = `<svg width="450" height="126" viewBox="0 0 450 126" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="450" height="126" rx="10" fill="#0d1117"/>

  <defs>
    <clipPath id="albumArtClip">
      <rect x="18" y="18" width="90" height="90" rx="8" ry="8"/>
    </clipPath>
  </defs>

  <!-- Album Art or Placeholder -->
  ${albumArtElement}

  <!-- Status Label -->
  <text x="124" y="33" fill="${statusColor}" font-family="'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace" font-size="11" font-weight="600" letter-spacing="2">${statusLabel}</text>

  <!-- Track Title -->
  <text x="124" y="55" fill="#f0f6fc" font-family="'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace" font-size="16" font-weight="700">${escapedTitle}</text>

  <!-- Artist — Album -->
  <text x="124" y="75" fill="#8b949e" font-family="'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace" font-size="12">${escapedArtistAlbum}</text>

  <!-- Progress Bar -->
  <rect x="124" y="90" width="300" height="4" rx="2" fill="#21262d"/>
  ${fillWidth > 0 ? `<rect x="124" y="90" width="${fillWidth}" height="4" rx="2" fill="${escapedBarColor}"/>` : ''}

  <!-- Timestamps -->
  <text x="124" y="106" fill="#6e7681" font-family="'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace" font-size="10">${escapedProgress}</text>
  <text x="424" y="106" text-anchor="end" fill="#6e7681" font-family="'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace" font-size="10">${escapedDuration}</text>
</svg>`;

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': 'no-cache, max-age=0, must-revalidate',
			Pragma: 'no-cache',
			Expires: '0'
		}
	});
};
