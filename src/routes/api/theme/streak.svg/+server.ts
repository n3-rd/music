import { getThemePalette } from '$lib/theme';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const palette = await getThemePalette();

	const target = new URL('https://streak-stats.demolab.com/');

	target.searchParams.set('user', url.searchParams.get('user') || 'n3-rd');
	target.searchParams.set('hide_border', url.searchParams.get('hide_border') || 'true');
	target.searchParams.set('background', url.searchParams.get('background') || '0d1117');
	target.searchParams.set('sideLabels', url.searchParams.get('sideLabels') || 'c9d1d9');
	target.searchParams.set('currStreakNum', url.searchParams.get('currStreakNum') || 'c9d1d9');
	target.searchParams.set('sideNums', url.searchParams.get('sideNums') || 'c9d1d9');
	target.searchParams.set('dates', url.searchParams.get('dates') || '6e7681');

	for (const [key, value] of url.searchParams.entries()) {
		if (!target.searchParams.has(key)) {
			target.searchParams.set(key, value);
		}
	}

	target.searchParams.set('ring', palette.primary);
	target.searchParams.set('fire', palette.secondary);
	target.searchParams.set('currStreakLabel', palette.tertiary);

	return new Response(null, {
		status: 302,
		headers: {
			Location: target.toString(),
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			Pragma: 'no-cache',
			Expires: '0'
		}
	});
};
