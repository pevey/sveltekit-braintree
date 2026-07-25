<script lang="ts">
	import { onMount } from 'svelte'
	import { getBraintreeContext } from './context.js'

	interface Props { class?: string; placeholder?: string; id?: string }
	let { class: className = '', placeholder, id }: Props = $props()
	const ctx = getBraintreeContext()
	let el: HTMLDivElement
	onMount(() => ctx.registerField({ type: 'postalCode', container: el, placeholder }))
</script>

<div bind:this={el} {id} data-braintree-field="postalCode" class={className}></div>
