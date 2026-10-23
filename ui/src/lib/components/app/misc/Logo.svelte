<script>
	import logoMark from '$lib/assets/logo.svg?raw';
	let { class: className = '' } = $props();
</script>

<div class={className}>
	{@html logoMark}
</div>

<style>
	div :global(svg) {
		width: var(--size, 1rem);
		height: var(--size, 1rem);
	}
</style>
