import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SpotifyTrack {
	isPlaying: boolean;
	isRecentlyPlayed: boolean;
	title: string;
	artist: string;
	album: string;
	albumImageUrl: string;
	songUrl: string;
	previewUrl: string | null;
	progressMs: number;
	durationMs: number;
}

const token_endpoint = `https://accounts.spotify.com/api/token`;
const now_playing_endpoint = `https://api.spotify.com/v1/me/player/currently-playing`;
const recently_played_endpoint = `https://api.spotify.com/v1/me/player/recently-played?limit=1`;

let _credentials: { clientId: string; clientSecret: string; refreshToken: string } | null = null;

function getCredentials() {
	if (_credentials) return _credentials;

	let clientId = process.env.SPOTIFY_CLIENT_ID || '';
	let clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
	let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || '';

	if (!clientId || !clientSecret || !refreshToken) {
		try {
			const envPath = join(process.cwd(), '.env');
			const envContent = readFileSync(envPath, 'utf-8');
			for (const line of envContent.split('\n')) {
				const part = line.trim();
				if (!part || part.startsWith('#')) continue;
				const eqIdx = part.indexOf('=');
				if (eqIdx === -1) continue;
				const key = part.slice(0, eqIdx).trim();
				const val = part.slice(eqIdx + 1).trim();
				if (key === 'SPOTIFY_CLIENT_ID' && !clientId) clientId = val;
				if (key === 'SPOTIFY_CLIENT_SECRET' && !clientSecret) clientSecret = val;
				if (key === 'SPOTIFY_REFRESH_TOKEN' && !refreshToken) refreshToken = val;
			}
		} catch {
			// .env might not exist in production container with process.env set
		}
	}

	_credentials = { clientId, clientSecret, refreshToken };
	return _credentials;
}

async function getAccessToken(): Promise<string | null> {
	const { clientId, clientSecret, refreshToken } = getCredentials();

	if (!clientId || !clientSecret || !refreshToken) {
		console.warn('[Spotify] Missing credentials.', {
			hasClientId: !!clientId,
			hasClientSecret: !!clientSecret,
			hasRefreshToken: !!refreshToken
		});
		return null;
	}

	try {
		const response = await fetch(token_endpoint, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refreshToken
			})
		});

		if (!response.ok) {
			const text = await response.text();
			console.error('[Spotify] Token exchange failed:', text);
			return null;
		}

		const data = await response.json();
		return data.access_token;
	} catch (err) {
		console.error('[Spotify] Token exchange exception:', err);
		return null;
	}
}

async function getRecentlyPlayed(accessToken: string): Promise<SpotifyTrack | null> {
	try {
		const response = await fetch(recently_played_endpoint, {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		if (!response.ok) {
			console.warn('[Spotify] Recently played error:', await response.text());
			return null;
		}

		const data = await response.json();
		if (data.items && data.items.length > 0) {
			const track = data.items[0].track;
			return {
				isPlaying: false,
				isRecentlyPlayed: true,
				title: track.name,
				artist: track.artists.map((a: { name: string }) => a.name).join(', '),
				album: track.album.name,
				albumImageUrl: track.album.images?.[0]?.url || '',
				songUrl: track.external_urls?.spotify || '',
				previewUrl: track.preview_url || null,
				progressMs: 0,
				durationMs: track.duration_ms || 0
			};
		}
		return null;
	} catch (e) {
		console.error('[Spotify] Recently played exception:', e);
		return null;
	}
}

export async function getNowPlaying(): Promise<SpotifyTrack> {
	const fallback: SpotifyTrack = {
		isPlaying: false,
		isRecentlyPlayed: false,
		title: 'Not Playing',
		artist: 'Currently offline on Spotify',
		album: '',
		albumImageUrl: '',
		songUrl: 'https://open.spotify.com',
		previewUrl: null,
		progressMs: 0,
		durationMs: 0
	};

	const accessToken = await getAccessToken();
	if (!accessToken) {
		return fallback;
	}

	try {
		const response = await fetch(now_playing_endpoint, {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		if (response.status === 204) {
			const recentlyPlayed = await getRecentlyPlayed(accessToken);
			return recentlyPlayed || fallback;
		}

		if (response.status > 400) {
			const text = await response.text();
			console.error('[Spotify] Currently playing error:', text);
			const recentlyPlayed = await getRecentlyPlayed(accessToken);
			return recentlyPlayed || fallback;
		}

		const song = await response.json();

		if (!song.item) {
			const recentlyPlayed = await getRecentlyPlayed(accessToken);
			return recentlyPlayed || fallback;
		}

		const isPlaying = Boolean(song.is_playing);
		const title = song.item.name || 'Unknown Track';
		const artist = song.item.artists?.map((_artist: { name: string }) => _artist.name).join(', ') || 'Unknown Artist';
		const album = song.item.album?.name || '';
		const albumImageUrl = song.item.album?.images?.[0]?.url || '';
		const songUrl = song.item.external_urls?.spotify || 'https://open.spotify.com';
		const previewUrl = song.item.preview_url || null;
		const progressMs = song.progress_ms || 0;
		const durationMs = song.item.duration_ms || 0;

		return {
			isPlaying,
			isRecentlyPlayed: !isPlaying,
			title,
			artist,
			album,
			albumImageUrl,
			songUrl,
			previewUrl,
			progressMs,
			durationMs
		};
	} catch (error) {
		console.error('[Spotify] Exception in getNowPlaying:', error);
		return fallback;
	}
}
