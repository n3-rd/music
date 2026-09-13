import { getThemePalette } from '$lib/theme';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const palette = await getThemePalette();

	const target = new URL('https://capsule-render.vercel.app/api');

	target.searchParams.set('type', url.searchParams.get('type') || 'venom');
	target.searchParams.set('height', url.searchParams.get('height') || '260');
	target.searchParams.set('section', url.searchParams.get('section') || 'header');
	target.searchParams.set('animation', url.searchParams.get('animation') || 'blink');
	target.searchParams.set('fontColor', url.searchParams.get('fontColor') || 'ffffff');
	target.searchParams.set('fontSize', url.searchParams.get('fontSize') || '0');

	for (const [key, value] of url.searchParams.entries()) {
		if (!target.searchParams.has(key)) {
			target.searchParams.set(key, value);
		}
	}

	target.searchParams.set(
		'color',
		`0:${palette.primary},50:${palette.secondary},100:${palette.tertiary}`
	);

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
