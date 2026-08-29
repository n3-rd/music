<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<div class="w-full min-h-[100dvh] h-[100dvh] bg-[#1e3a93] overflow-hidden relative select-none">
	{@render children()}
</div>
