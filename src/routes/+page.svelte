<script lang="ts">
	import { onMount } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { PageData } from './$types';
	import type { SpotifyTrack } from '$lib/spotify';

	let { data }: { data: PageData } = $props();

	const text = 'NOWPLAYING';
	const letters = text.split('');
	const columns = [0, 1, 2, 3];

	// Keep track of DOM elements for letter containers
	let elements: HTMLSpanElement[][] = $state([[], [], [], []]);

	// Cache for coordinates to avoid layout thrashing via getBoundingClientRect on mousemove
	let centers: { x: number; y: number }[][] = [];

	// Store computed weights for each letter of each column
	let weights = $state(columns.map(() => letters.map(() => 200)));

	// State to track if component is mounted for intro transition
	let mounted = $state(false);
	let exiting = $state(false);

	// Image pan coordinates
	let imagePanX = $state(0);
	let imagePanY = $state(0);

	// Custom cursor coordinates, targets, and state
	let targetX = 0;
	let targetY = 0;
	let cursorX = $state(0);
	let cursorY = $state(0);
	let cursorVisible = $state(false);
	let cursorInitialized = false;

	// Cached viewport dimensions
	let viewportW = 0;
	let viewportH = 0;

	// Mobile detection
	let isMobile = $state(false);
	let visibleColumns = $derived(isMobile ? [0] : columns);

	// Color theme state extracted from the cover art
	let bgColor = $state('rgb(30, 58, 147)');
	let textColor = $state('rgb(255, 255, 255)');
	let textMutedColor = $state('rgba(255, 255, 255, 0.6)');
	let cursorText = $state('listen');

	// Spotify track state initialized with SSR data
	let song = $state<SpotifyTrack>(
		data.song || {
			isPlaying: false,
			isRecentlyPlayed: false,
			title: 'Not Playing',
			artist: 'Currently offline',
			album: '',
			albumImageUrl: '',
			songUrl: 'https://open.spotify.com',
			previewUrl: null,
			progressMs: 0,
			durationMs: 0
		}
	);

	// Song playback progress and duration state
	let currentProgressMs = $state(data.song?.progressMs || 0);
	let durationMs = $state(data.song?.durationMs || 0);
	let progressInterval: ReturnType<typeof setInterval> | undefined;

	// Loading state — start false if server already loaded track data
	let isLoading = $state(!data.song?.title || data.song.title === 'Loading...');
	let loadingTime = 0;

	// Track last album image URL to skip redundant color extraction
	let lastAlbumImageUrl = '';

	// Audio preview state
	let isMuted = $state(false);
	let audioEl = $state<HTMLAudioElement | null>(null);

	// Dynamic SEO computed tags
	let seoTitle = $derived(
		song.isPlaying || song.isRecentlyPlayed
			? `${song.title} — ${song.artist} | Now Playing`
			: 'Now Playing | n3-rd'
	);

	let seoDescription = $derived(
		song.isPlaying || song.isRecentlyPlayed
			? `Currently listening to ${song.title} by ${song.artist}${song.album ? ` on ${song.album}` : ''}. Live Spotify playback stream.`
			: 'Live Spotify Now Playing stream by Godwin.'
	);

	let seoImage = $derived(song.albumImageUrl || 'https://music.n3-rd.xyz/preview.png');

	$effect(() => {
		try {
			localStorage.setItem('sahrai_music_muted', isMuted.toString());
		} catch {
			// ignore in restricted envs
		}
	});

	$effect(() => {
		if (audioEl && song.previewUrl) {
			audioEl.volume = 0.5;
			audioEl.play().catch((e) => {
				console.warn('Autoplay blocked by browser. User interaction required.', e);
			});
		}
	});

	function formatTime(ms: number): string {
		if (isNaN(ms) || ms < 0) return '0:00';
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function cacheViewport() {
		if (typeof window === 'undefined') return;
		viewportW = window.innerWidth;
		viewportH = window.innerHeight;
		isMobile = viewportW < 768;
	}

	function updateCentersCache() {
		centers = columns.map((col) =>
			letters.map((_, i) => {
				const el = elements[col]?.[i];
				if (el) {
					const rect = el.getBoundingClientRect();
					return {
						x: rect.left + rect.width / 2,
						y: rect.top + rect.height / 2
					};
				}
				return { x: 0, y: 0 };
			})
		);
	}

	function handleResize() {
		cacheViewport();
		updateCentersCache();
	}

	let loopId = 0;
	function tick() {
		const ease = 0.08;
		cursorX += (targetX - cursorX) * ease;
		cursorY += (targetY - cursorY) * ease;

		const normX = viewportW > 0 ? cursorX / viewportW - 0.5 : 0;
		const normY = viewportH > 0 ? cursorY / viewportH - 0.5 : 0;
		const maxPan = 20;
		imagePanX = normX * maxPan;
		imagePanY = normY * maxPan;

		const newWeights = columns.map((_, col) =>
			letters.map((__, i) => {
				const center = centers[col]?.[i];

				if (isLoading) {
					const wave = Math.sin(loadingTime + (col * letters.length + i) * 0.4);
					return Math.round(500 + 300 * wave);
				} else if (center && (center.x !== 0 || center.y !== 0)) {
					const dx = cursorX - center.x;
					const dy = cursorY - center.y;
					const distance = Math.sqrt(dx * dx + dy * dy);

					const maxDistance = 800;
					const minWeight = 200;
					const maxWeight = 800;

					if (distance < maxDistance) {
						const factor = 1 - distance / maxDistance;
						const eased = factor * factor;
						return Math.round(minWeight + (maxWeight - minWeight) * eased);
					}
					return minWeight;
				}
				return weights[col][i];
			})
		);
		weights = newWeights;

		if (isLoading) {
			loadingTime += 0.05;
		}

		if (isLoading || (cursorVisible && !exiting)) {
			loopId = requestAnimationFrame(tick);
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (exiting || isMobile) return;

		targetX = e.clientX;
		targetY = e.clientY;

		if (!cursorInitialized) {
			cursorX = targetX;
			cursorY = targetY;
			cursorInitialized = true;
		}

		if (!cursorVisible) {
			cursorVisible = true;
		}

		cancelAnimationFrame(loopId);
		loopId = requestAnimationFrame(tick);
	}

	function handleMouseLeave() {
		if (exiting || isMobile) return;

		cursorVisible = false;
		cursorInitialized = false;
		if (!isLoading) {
			cancelAnimationFrame(loopId);
		}

		imagePanX = 0;
		imagePanY = 0;
		if (!isLoading) {
			weights = columns.map(() => letters.map(() => 200));
		}
	}

	function goBack() {
		if (exiting) return;
		exiting = true;
		cursorVisible = false;
		cancelAnimationFrame(loopId);

		setTimeout(() => {
			if (typeof window !== 'undefined') {
				if (window.history.length > 1 && document.referrer.includes('n3-rd.xyz')) {
					window.history.back();
				} else {
					window.location.href = 'https://n3-rd.xyz';
				}
			}
		}, 800);
	}

	function handlePageClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (target && target.closest('button')) {
			return;
		}
		if ((song.isPlaying || song.isRecentlyPlayed) && song.songUrl && song.songUrl !== '#') {
			window.open(song.songUrl, '_blank');
		}
	}

	function toggleMute() {
		isMuted = !isMuted;
	}

	function updateBgColor(imageUrl: string) {
		if (!imageUrl || typeof window === 'undefined') return;
		if (imageUrl === lastAlbumImageUrl) return;
		lastAlbumImageUrl = imageUrl;

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();

		img.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				if (!ctx) return;

				canvas.width = 10;
				canvas.height = 10;
				ctx.drawImage(img, 0, 0, 10, 10);

				const imgData = ctx.getImageData(0, 0, 10, 10).data;

				let totalR = 0,
					totalG = 0,
					totalB = 0;
				for (let i = 0; i < imgData.length; i += 4) {
					totalR += imgData[i];
					totalG += imgData[i + 1];
					totalB += imgData[i + 2];
				}
				const count = imgData.length / 4;
				const bgR = Math.round(totalR / count);
				const bgG = Math.round(totalG / count);
				const bgB = Math.round(totalB / count);
				bgColor = `rgb(${bgR}, ${bgG}, ${bgB})`;

				let maxDist = -1;
				let textR = 255,
					textG = 255,
					textB = 255;

				for (let i = 0; i < imgData.length; i += 4) {
					const pr = imgData[i];
					const pg = imgData[i + 1];
					const pb = imgData[i + 2];

					const dist = (pr - bgR) ** 2 + (pg - bgG) ** 2 + (pb - bgB) ** 2;

					if (dist > maxDist) {
						maxDist = dist;
						textR = pr;
						textG = pg;
						textB = pb;
					}
				}

				textColor = `rgb(${textR}, ${textG}, ${textB})`;

				const mutedR = Math.round(textR * 0.65 + bgR * 0.35);
				const mutedG = Math.round(textG * 0.65 + bgG * 0.35);
				const mutedB = Math.round(textB * 0.65 + bgB * 0.35);
				textMutedColor = `rgb(${mutedR}, ${mutedG}, ${mutedB})`;
			} catch (err) {
				console.error('[Spotify Color Extraction Error]:', err);
			}
		};
	}

	async function fetchNowPlaying() {
		try {
			const res = await fetch('/api/now-playing');
			if (res.ok) {
				const data: SpotifyTrack = await res.json();
				song = data;
				if ((song.isPlaying || song.isRecentlyPlayed) && song.albumImageUrl) {
					updateBgColor(song.albumImageUrl);

					currentProgressMs = song.progressMs || 0;
					durationMs = song.durationMs || 0;

					if (progressInterval !== undefined) {
						clearInterval(progressInterval);
						progressInterval = undefined;
					}

					if (song.isPlaying) {
						const tickRate = 100;
						progressInterval = setInterval(() => {
							if (currentProgressMs < durationMs) {
								currentProgressMs += tickRate;
							} else {
								currentProgressMs = durationMs;
								if (progressInterval !== undefined) {
									clearInterval(progressInterval);
									progressInterval = undefined;
								}
							}
						}, tickRate);
					}
				} else {
					bgColor = 'rgb(30, 58, 147)';
					textColor = 'rgb(255, 255, 255)';
					textMutedColor = 'rgba(255, 255, 255, 0.6)';

					if (progressInterval !== undefined) {
						clearInterval(progressInterval);
						progressInterval = undefined;
					}
					currentProgressMs = 0;
					durationMs = 0;
				}
			}
		} catch (e) {
			console.error(e);
		} finally {
			if (isLoading) {
				isLoading = false;
			}
		}
	}

	onMount(() => {
		try {
			const stored = localStorage.getItem('sahrai_music_muted');
			if (stored !== null) {
				isMuted = stored === 'true';
			}
		} catch {
			// ignore
		}

		cacheViewport();

		const setupTimer = setTimeout(() => {
			updateCentersCache();
			mounted = true;
		}, 50);

		if (song.albumImageUrl) {
			updateBgColor(song.albumImageUrl);
		}

		fetchNowPlaying();
		loopId = requestAnimationFrame(tick);
		const pollInterval = setInterval(fetchNowPlaying, 10000);

		window.addEventListener('resize', handleResize);

		return () => {
			clearTimeout(setupTimer);
			clearInterval(pollInterval);
			if (progressInterval !== undefined) {
				clearInterval(progressInterval);
				progressInterval = undefined;
			}
			cancelAnimationFrame(loopId);
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<svelte:head>
	<title>{seoTitle}</title>
	<meta name="description" content={seoDescription} />
	<link rel="canonical" href="https://music.n3-rd.xyz" />

	<!-- Open Graph / Facebook / Discord / WhatsApp -->
	<meta property="og:site_name" content="Godwin | Music" />
	<meta property="og:type" content="music.song" />
	<meta property="og:url" content="https://music.n3-rd.xyz" />
	<meta property="og:title" content={seoTitle} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:image" content={seoImage} />
	<meta property="og:image:alt" content={song.album ? `${song.album} Cover Art` : 'Album Art'} />

	<!-- Twitter Cards -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://music.n3-rd.xyz" />
	<meta property="twitter:title" content={seoTitle} />
	<meta property="twitter:description" content={seoDescription} />
	<meta property="twitter:image" content={seoImage} />

	{#if song.artist}
		<meta property="music:musician" content={song.artist} />
	{/if}
	{#if song.album}
		<meta property="music:album" content={song.album} />
	{/if}
</svelte:head>

{#if song.previewUrl}
	<audio bind:this={audioEl} src={song.previewUrl} bind:muted={isMuted} loop class="hidden"></audio>
{/if}

<div
	role="presentation"
	class="absolute inset-0 overflow-hidden {isMobile ? '' : 'cursor-none'}"
	style="background-color: {bgColor}; transition: background-color 1.5s cubic-bezier(0.22, 1, 0.36, 1);"
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	onclick={handlePageClick}
>
	<!-- Apple Music style Blurred Background Art Mesh -->
	{#if (song.isPlaying || song.isRecentlyPlayed) && song.albumImageUrl}
		<div class="absolute inset-0 overflow-hidden pointer-events-none z-0">
			<div
				class="absolute inset-[-15%] bg-cover bg-center filter blur-[60px] saturate-[200%] opacity-[0.6] scale-[1.2]"
				style="background-image: url({song.albumImageUrl}); will-change: transform, opacity; transition: background-image 2s cubic-bezier(0.22, 1, 0.36, 1), opacity 2s cubic-bezier(0.22, 1, 0.36, 1);"
			></div>
			<!-- Blend overlay -->
			<div class="absolute inset-0 bg-black/20"></div>
			<div
				class="absolute inset-0 bg-gradient-to-b from-transparent via-[#050b1c]/40 to-[#050b1c] md:hidden"
			></div>
		</div>
	{/if}

	<!-- Persistent Back Button to Portfolio -->
	<button
		class="fixed top-4 left-4 md:top-8 md:left-8 text-xs uppercase tracking-[0.3em] font-bold z-50 hover:opacity-70 cursor-pointer"
		style="color: {textColor}; transition: color 1s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1);"
		onclick={goBack}
		onmouseenter={() => (cursorText = 'home')}
		onmouseleave={() => (cursorText = 'listen')}
	>
		[ HOME ]
	</button>

	<!-- Mute Toggle Button -->
	{#if song.previewUrl}
		<button
			class="fixed top-4 right-4 md:top-8 md:right-8 z-50 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full border border-white/20 transition-all duration-300 hover:scale-105 hover:bg-white/10 cursor-pointer"
			style="color: {textColor}; background-color: rgba(0,0,0,0.1); backdrop-filter: blur(8px);"
			onclick={toggleMute}
			aria-label={isMuted ? 'Unmute' : 'Mute'}
			onmouseenter={() => (cursorText = isMuted ? 'unmute' : 'mute')}
			onmouseleave={() => (cursorText = 'listen')}
		>
			{#if isMuted}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
					<line x1="23" y1="9" x2="17" y2="15"></line>
					<line x1="17" y1="9" x2="23" y2="15"></line>
				</svg>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
					<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
					<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
				</svg>
			{/if}
		</button>
	{/if}

	<!-- Custom Follower Cursor (desktop only) -->
	{#if cursorVisible && !exiting && !isMobile}
		<div
			class="fixed pointer-events-none z-50 flex items-center justify-center"
			style="
				left: 0;
				top: 0;
				transform: translate3d({cursorX}px, {cursorY}px, 0) translate(-50%, -50%);
				will-change: transform;
			"
		>
			<div
				class="rounded-full bg-white flex items-center justify-center shadow-lg text-[#1e3a93] font-bold text-xs uppercase tracking-widest select-none mix-blend-exclusion"
				style="width: 90px; height: 90px; backface-visibility: hidden;"
				transition:scale={{
					duration: 400,
					start: 0.6,
					easing: cubicOut
				}}
			>
				{cursorText}
			</div>
		</div>
	{/if}

	<!-- MOBILE NATIVE LAYOUT: Vinyl Player -->
	<div class="flex md:hidden flex-col absolute inset-0 z-10 pt-20 pb-10 px-6 overflow-hidden">
		<!-- Infinite Marquee Header -->
		<div class="w-full absolute top-8 left-0 right-0 overflow-hidden pointer-events-none z-20">
			<div
				class="flex whitespace-nowrap animate-[marquee_15s_linear_infinite]"
				style="color: {textColor}; opacity: {mounted ? 0.9 : 0}; transition: opacity 1s;"
			>
				<h2 class="text-[7vw] panchang leading-none px-4 mix-blend-overlay">
					NOW PLAYING • NOW PLAYING • NOW PLAYING • NOW PLAYING • NOW PLAYING • NOW PLAYING •
				</h2>
				<span class="text-[7vw] panchang leading-none px-4 mix-blend-overlay" aria-hidden="true">
					NOW PLAYING • NOW PLAYING • NOW PLAYING • NOW PLAYING • NOW PLAYING • NOW PLAYING •
				</span>
			</div>
		</div>

		<div class="flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto mt-12">
			{#if isLoading}
				<div
					class="w-64 h-64 rounded-full bg-white/5 border border-white/10 shadow-2xl flex items-center justify-center animate-pulse mb-12"
				>
					<div
						class="w-16 h-16 rounded-full border-2 border-dashed animate-spin"
						style="animation-duration: 8s; border-color: {textColor}; opacity: 0.25;"
					></div>
				</div>
				<div class="w-full text-center select-none animate-pulse" style="color: {textColor};">
					<h3 class="text-3xl font-bold uppercase tracking-wider boska">Connecting</h3>
					<p class="text-xs uppercase tracking-widest mt-2" style="color: {textMutedColor};">
						Retrieving Spotify Stream...
					</p>
				</div>
			{:else}
				{#if (song.isPlaying || song.isRecentlyPlayed) && song.albumImageUrl}
					<!-- Vinyl Record -->
					<div
						class="relative w-72 h-72 mb-12 pointer-events-auto"
						style="
							opacity: {exiting ? 0 : mounted ? 1 : 0};
							transform: translate3d(0, {exiting ? '20px' : mounted ? '0' : '20px'}, 0);
							transition: opacity 1s cubic-bezier(0.22, 1, 0.36, 1), transform 1s cubic-bezier(0.22, 1, 0.36, 1);
						"
					>
						<!-- Outer Vinyl edge -->
						<div
							class="absolute inset-[-4px] rounded-full bg-black shadow-[0_20px_50px_rgba(0,0,0,0.7)]"
						></div>
						<!-- Record grooves -->
						<div
							class="absolute inset-[2px] rounded-full border border-white/5 pointer-events-none z-10"
						></div>
						<div
							class="absolute inset-[12px] rounded-full border border-white/5 pointer-events-none z-10"
						></div>
						<div
							class="absolute inset-[24px] rounded-full border border-white/5 pointer-events-none z-10"
						></div>

						<a
							href={song.songUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="absolute inset-0 rounded-full overflow-hidden transition-transform active:scale-95 z-20 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] border border-black/50 {song.isPlaying
								? 'animate-[spin_8s_linear_infinite]'
								: ''}"
							style="animation-play-state: {song.isPlaying ? 'running' : 'paused'};"
						>
							<img
								class="w-full h-full object-cover mix-blend-screen scale-[1.1]"
								src={song.albumImageUrl}
								alt={song.album || 'album-art'}
								crossorigin="anonymous"
							/>
							<div
								class="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10 mix-blend-overlay"
							></div>
							<!-- Center Hole -->
							<div
								class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#050b1c] rounded-full shadow-inner border border-black z-30"
							></div>
						</a>
					</div>
				{:else}
					<div
						class="w-64 h-64 rounded-full shadow-2xl mb-12 bg-black border border-white/5 flex items-center justify-center"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-24 h-24 animate-spin"
							style="animation-duration: 12s; color: {textColor}; opacity: 0.1;"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M12 12a0 0 0 1 0 0 0" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					</div>
				{/if}

				<!-- Floating Glassmorphic Control Card -->
				<div
					class="w-full backdrop-blur-xl bg-white/5 border border-white/10 p-6 rounded-3xl shadow-2xl"
					style="
						color: {textColor};
						opacity: {exiting ? 0 : mounted ? 1 : 0};
						transform: translate3d(0, {exiting ? '20px' : mounted ? '0' : '20px'}, 0);
						transition: opacity 1s cubic-bezier(0.22, 1, 0.36, 1) 0.1s, transform 1s cubic-bezier(0.22, 1, 0.36, 1) 0.1s;
					"
				>
					<div class="text-center mb-6 overflow-hidden px-2">
						{#if song.isPlaying || song.isRecentlyPlayed}
							<h3 class="text-2xl font-bold tracking-tight drop-shadow-md leading-tight">
								{song.title}
							</h3>
							<p class="text-base drop-shadow-sm opacity-80 mt-1">{song.artist}</p>
						{:else}
							<h3 class="text-2xl font-bold tracking-tight drop-shadow-md leading-tight">
								Not Playing
							</h3>
							<p class="text-base drop-shadow-sm opacity-80 mt-1">Currently offline</p>
						{/if}
					</div>

					{#if (song.isPlaying || song.isRecentlyPlayed) && durationMs > 0}
						<div class="w-full">
							<div
								class="w-full h-1 bg-black/20 rounded-full overflow-hidden relative backdrop-blur-sm border border-white/5"
							>
								<div
									class="absolute top-0 left-0 h-full rounded-full transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(255,255,255,0.8)]"
									style="background-color: {textColor}; width: {(currentProgressMs / durationMs) *
										100}%;"
								></div>
							</div>
							<div
								class="flex justify-between w-full text-[10px] font-mono mt-3 opacity-80 tracking-wider font-bold"
							>
								<span>{formatTime(currentProgressMs)}</span>
								<span>-{formatTime(durationMs - currentProgressMs)}</span>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- DESKTOP NATIVE LAYOUT -->
	<div class="hidden md:flex w-full h-full p-8 gap-4 absolute inset-0 z-10 items-center">
		<!-- Left Side: Staggered "NOWPLAYING" columns -->
		<div
			class="text w-[40%] h-full panchang flex justify-between items-center select-none overflow-hidden"
			style="color: {textColor}; transition: color 1s cubic-bezier(0.22, 1, 0.36, 1);"
		>
			{#each visibleColumns as col (col)}
				<div
					class="text-column [writing-mode:vertical-lr] text-[5vw] leading-none flex justify-center"
				>
					{#each letters as letter, i (`${col}-${i}`)}
						<span
							bind:this={elements[col][i]}
							class="letter-container relative inline-flex overflow-hidden"
						>
							<span
								style="
									font-weight: {weights[col][i]};
									font-variation-settings: 'wght' {weights[col][i]};
									transform: translate3d(0, {exiting ? '-100%' : mounted ? '0%' : '100%'}, 0);
									transition-property: font-weight, font-variation-settings, transform;
									transition-duration: 0.35s, 0.35s, 1.2s;
									transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.76, 0, 0.24, 1);
									transition-delay: 0ms, 0ms, {exiting
									? i * 30
									: (col * letters.length + i) * 30}ms;
									will-change: transform, font-variation-settings;
									backface-visibility: hidden;
								"
								class="inline-block"
							>
								{letter}
							</span>
						</span>
					{/each}
				</div>
			{/each}
		</div>

		<!-- Right Side: Cover Art and Details -->
		<div class="images w-[60%] h-full flex flex-col items-center justify-center relative">
			{#if isLoading}
				<div
					class="w-1/2 max-w-[380px] aspect-square bg-white/5 border border-white/10 rounded shadow-2xl flex items-center justify-center animate-pulse z-10"
				>
					<div
						class="w-16 h-16 rounded-full border-2 border-dashed animate-spin"
						style="animation-duration: 8s; border-color: {textColor}; opacity: 0.25;"
					></div>
				</div>
				<div
					class="mt-8 text-center select-none animate-pulse z-10"
					style="color: {textColor};"
				>
					<h3 class="text-3xl font-bold uppercase tracking-wider boska">Connecting</h3>
					<p class="text-xs uppercase tracking-widest mt-2" style="color: {textMutedColor};">
						Retrieving Spotify Stream...
					</p>
				</div>
			{:else}
				{#if (song.isPlaying || song.isRecentlyPlayed) && song.albumImageUrl}
					<a
						href={song.songUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="w-1/2 max-w-[380px] aspect-square overflow-hidden bg-black/20 shadow-2xl rounded pointer-events-auto block cursor-none {exiting
							? 'opacity-0'
							: mounted
								? 'opacity-100'
								: 'opacity-0'}"
						style="
							transform: translate3d({exiting ? '32px' : mounted ? '0' : '32px'}, 0, 0) scale({exiting ? 0.95 : mounted ? 1 : 0.95});
							transition: transform 1.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.5s cubic-bezier(0.22, 1, 0.36, 1);
							will-change: transform, opacity;
							backface-visibility: hidden;
						"
					>
						<img
							class="w-full h-full object-cover"
							style="
								transform: translate3d({imagePanX}px, {imagePanY}px, 0) scale(1.1);
								transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
								will-change: transform;
								backface-visibility: hidden;
							"
							src={song.albumImageUrl}
							alt={song.album || 'album-art'}
							crossorigin="anonymous"
						/>
					</a>
				{:else}
					<div
						class="w-1/2 max-w-[380px] aspect-square overflow-hidden bg-black/30 shadow-2xl rounded pointer-events-auto flex items-center justify-center {exiting
							? 'opacity-0'
							: mounted
								? 'opacity-100'
								: 'opacity-0'}"
						style="
							transform: translate3d({exiting ? '32px' : mounted ? '0' : '32px'}, 0, 0) scale({exiting ? 0.95 : mounted ? 1 : 0.95});
							transition: transform 1.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.5s cubic-bezier(0.22, 1, 0.36, 1);
							will-change: transform, opacity;
							backface-visibility: hidden;
						"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-24 h-24 animate-spin"
							style="animation-duration: 8s; color: {textColor}; opacity: 0.2; transition: color 1s cubic-bezier(0.22, 1, 0.36, 1);"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M12 12a0 0 0 1 0 0 0" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					</div>
				{/if}

				<!-- Song details layout below the image -->
				<div
					class="mt-8 text-center select-none w-full max-w-[380px] px-0 {exiting
						? 'opacity-0'
						: mounted
							? 'opacity-100'
							: 'opacity-0'}"
					style="
						color: {textColor};
						transform: translate3d(0, {exiting ? '16px' : mounted ? '0' : '16px'}, 0);
						transition: color 1s cubic-bezier(0.22, 1, 0.36, 1), transform 1.5s cubic-bezier(0.22, 1, 0.36, 1) 300ms, opacity 1.5s cubic-bezier(0.22, 1, 0.36, 1) 300ms;
						will-change: transform, opacity;
					"
				>
					{#if song.isPlaying || song.isRecentlyPlayed}
						<h3 class="text-3xl font-bold uppercase tracking-wider boska drop-shadow-md">
							{song.title}
						</h3>
						<p class="text-lg mt-1 drop-shadow-sm" style="color: {textMutedColor};">
							{song.artist}
						</p>
						{#if song.album}
							<p
								class="text-xs mt-1 uppercase tracking-widest drop-shadow-sm font-bold"
								style="color: {textMutedColor};"
							>
								{song.album}
							</p>
						{/if}

						{#if song.isRecentlyPlayed}
							<div
								class="mt-6 text-xs uppercase tracking-widest font-bold"
								style="color: {textMutedColor};"
							>
								Last Played
							</div>
						{:else if durationMs > 0}
							<!-- Progress Bar -->
							<div
								class="mt-6 w-full px-6 flex items-center gap-4 text-xs font-mono select-none"
								style="color: {textMutedColor};"
							>
								<span>{formatTime(currentProgressMs)}</span>
								<div class="flex-grow h-[3px] bg-white/20 rounded-full relative overflow-hidden">
									<div
										class="absolute top-0 left-0 h-full rounded-full transition-all duration-100 ease-linear"
										style="background-color: {textColor}; width: {(currentProgressMs /
											durationMs) *
											100}%;"
									></div>
								</div>
								<span>{formatTime(durationMs)}</span>
							</div>
						{/if}
					{:else}
						<h3 class="text-3xl font-bold uppercase tracking-wider boska drop-shadow-md">
							Not Playing
						</h3>
						<p class="text-lg mt-1 drop-shadow-sm" style="color: {textMutedColor};">
							Currently offline on Spotify
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
