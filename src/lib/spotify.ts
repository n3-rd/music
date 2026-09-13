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

export interface EnrichedSpotifyTrack extends SpotifyTrack {
	imageBase64: string;
	color: {
		r: number;
		g: number;
		b: number;
		hex: string;
	};
	isLight: boolean;
	formattedProgress: string;
	formattedDuration: string;
	formattedRemaining: string;
	progressPercent: number;
}

function extractAverageColor(buffer: Buffer): { r: number; g: number; b: number } {
	let totalR = 0,
		totalG = 0,
		totalB = 0,
		count = 0;
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

function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

let _cachedEnrichedTrack: EnrichedSpotifyTrack | null = null;
let _cacheExpiresAt = 0;
let _inFlightEnrichedPromise: Promise<EnrichedSpotifyTrack> | null = null;

// Persistent cache for image base64 and dominant color across polling ticks
let _cachedImageUrl = '';
let _cachedImageBase64 = '';
let _cachedAvgColor = { r: 30, g: 58, b: 147 };
let _cachedIsLight = false;

export async function getEnrichedNowPlaying(): Promise<EnrichedSpotifyTrack> {
	const now = Date.now();
	if (_cachedEnrichedTrack && now < _cacheExpiresAt) {
		return _cachedEnrichedTrack;
	}

	if (_inFlightEnrichedPromise) {
		return _inFlightEnrichedPromise;
	}

	_inFlightEnrichedPromise = (async () => {
		try {
			const song = await getNowPlaying();

			let imageBase64 = _cachedImageBase64;
			let avgColor = _cachedAvgColor;
			let isLight = _cachedIsLight;

			if (song.albumImageUrl && song.albumImageUrl !== _cachedImageUrl) {
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

						_cachedImageUrl = song.albumImageUrl;
						_cachedImageBase64 = imageBase64;
						_cachedAvgColor = avgColor;
						_cachedIsLight = isLight;
					}
				} catch (e) {
					console.error('[Spotify] Failed to fetch album image:', e);
				}
			} else if (!song.albumImageUrl) {
				imageBase64 = '';
				avgColor = { r: 30, g: 58, b: 147 };
				isLight = false;
				_cachedImageUrl = '';
				_cachedImageBase64 = '';
			}

			const formattedProgress = formatTime(song.progressMs);
			const formattedDuration = formatTime(song.durationMs);
			const remainingMs = Math.max(0, song.durationMs - song.progressMs);
			const formattedRemaining = `-${formatTime(remainingMs)}`;
			const progressPercent = song.durationMs > 0 ? (song.progressMs / song.durationMs) * 100 : 0;

			const hexColor = `#${avgColor.r.toString(16).padStart(2, '0')}${avgColor.g.toString(16).padStart(2, '0')}${avgColor.b.toString(16).padStart(2, '0')}`;

			const enriched: EnrichedSpotifyTrack = {
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
			};

			_cachedEnrichedTrack = enriched;
			_cacheExpiresAt = Date.now() + 5000; // 5-second internal cache for fast response
			return enriched;
		} catch (err) {
			console.error('[Spotify] Error fetching enriched now playing:', err);
			if (_cachedEnrichedTrack) return _cachedEnrichedTrack;
			throw err;
		} finally {
			_inFlightEnrichedPromise = null;
		}
	})();

	return _inFlightEnrichedPromise;
}
