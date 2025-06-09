<script>
	import '../app.css';
	import TopBar from '$lib/components/TopBar.svelte';
</script>

<TopBar />

<main>
	<slot />
</main>

<style>
	main {
		padding: 2rem 1rem;
		width: 100%;
		max-width: 1024px;
		margin: 0 auto;
	}
</style>
