<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<div class="max-w-full h-screen bg-[#1e3a93] md:overflow-hidden relative select-none">
	{@render children()}
</div>
