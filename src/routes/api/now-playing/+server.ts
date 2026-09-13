import { json } from '@sveltejs/kit';
import { getNowPlaying } from '$lib/spotify';
import type { RequestHandler } from './$types';

function extractAverageColor(buffer: Buffer): { r: number; g: number; b: number } {
	let totalR = 0, totalG = 0, totalB = 0, count = 0;
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

function formatTime(ms: number) {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const GET: RequestHandler = async () => {
	const song = await getNowPlaying();

	let imageBase64 = '';
	let avgColor = { r: 30, g: 58, b: 147 };
	let isLight = false;

	if (song.albumImageUrl) {
		try {
			const imgRes = await fetch(song.albumImageUrl);
			if (imgRes.ok) {
				const arrayBuf = await imgRes.arrayBuffer();
				const buffer = Buffer.from(arrayBuf);
				avgColor = extractAverageColor(buffer);
				const mime = imgRes.headers.get('content-type') || 'image/jpeg';
				imageBase64 = `data:${mime};base64,${buffer.toString('base64')}`;
				
				const luminance = (0.2126 * avgColor.r + 0.7152 * avgColor.g + 0.0722 * avgColor.b) / 255;
				isLight = luminance > 0.42;
			}
		} catch (e) {
			console.error('[API] Failed to fetch album image:', e);
		}
	}

	const formattedProgress = formatTime(song.progressMs);
	const formattedDuration = formatTime(song.durationMs);
	const remainingMs = Math.max(0, song.durationMs - song.progressMs);
	const formattedRemaining = `-${formatTime(remainingMs)}`;
	const progressPercent = song.durationMs > 0 ? (song.progressMs / song.durationMs) * 100 : 0;
	
	const hexColor = `#${avgColor.r.toString(16).padStart(2, '0')}${avgColor.g.toString(16).padStart(2, '0')}${avgColor.b.toString(16).padStart(2, '0')}`;

	return json({
		...song,
		imageBase64,
		color: {
			...avgColor,
			hex: hexColor
		},
		isLight,
		formattedProgress,
		formattedDuration,
		formattedRemaining,
		progressPercent
	});
};
