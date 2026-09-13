import { getThemePalette } from '$lib/theme';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const palette = await getThemePalette();

	const target = new URL('https://readme-stats-fast.vercel.app/api');

	target.searchParams.set('username', url.searchParams.get('username') || 'n3-rd');
	target.searchParams.set('show_icons', url.searchParams.get('show_icons') || 'true');
	target.searchParams.set('include_all_commits', url.searchParams.get('include_all_commits') || 'true');
	target.searchParams.set('count_private', url.searchParams.get('count_private') || 'true');
	target.searchParams.set('hide_border', url.searchParams.get('hide_border') || 'true');
	target.searchParams.set('bg_color', url.searchParams.get('bg_color') || '0d1117');
	target.searchParams.set('text_color', url.searchParams.get('text_color') || 'c9d1d9');

	for (const [key, value] of url.searchParams.entries()) {
		if (!target.searchParams.has(key)) {
			target.searchParams.set(key, value);
		}
	}

	target.searchParams.set('title_color', palette.primary);
	target.searchParams.set('icon_color', palette.secondary);
	target.searchParams.set('ring_color', palette.tertiary);

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
