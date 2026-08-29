import { getNowPlaying } from '$lib/spotify';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const song = await getNowPlaying();
	return {
		song
	};
};
