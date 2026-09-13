import { json } from '@sveltejs/kit';
import { getEnrichedNowPlaying } from '$lib/spotify';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const data = await getEnrichedNowPlaying();
	return json(data);
};

