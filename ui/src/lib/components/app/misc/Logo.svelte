<script>
	let { class: className = '' } = $props();
</script>

<img class={className} src="/icon.svg" alt="" aria-hidden="true" draggable="false" />

<style>
	img { width:var(--size,1rem);height:var(--size,1rem);object-fit:contain;flex-shrink:0;border-radius:18%; }
</style>
