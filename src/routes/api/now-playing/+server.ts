import { json } from '@sveltejs/kit';
import { getNowPlaying } from '$lib/spotify';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const song = await getNowPlaying();
	return json(song);
};
