import { getThemePalette } from '$lib/theme';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const palette = await getThemePalette();

	const target = new URL('https://readme-stats-fast.vercel.app/api/top-langs/');

	target.searchParams.set('username', url.searchParams.get('username') || 'n3-rd');
	target.searchParams.set('layout', url.searchParams.get('layout') || 'compact');
	target.searchParams.set('hide_border', url.searchParams.get('hide_border') || 'true');
	target.searchParams.set('bg_color', url.searchParams.get('bg_color') || '0d1117');
	target.searchParams.set('text_color', url.searchParams.get('text_color') || 'c9d1d9');
	target.searchParams.set('langs_count', url.searchParams.get('langs_count') || '8');

	for (const [key, value] of url.searchParams.entries()) {
		if (!target.searchParams.has(key)) {
			target.searchParams.set(key, value);
		}
	}

	target.searchParams.set('title_color', palette.primary);

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
