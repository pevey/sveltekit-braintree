<script lang="ts">
	import { onMount } from 'svelte'
	import { getBraintreeContext } from './context.js'

	// The container div; Braintree injects a `height:100%` iframe, so give it height via `class`.
	interface Props {
		class?: string
		placeholder?: string
		id?: string
		style?: string
	}
	let { class: className = '', placeholder, id, style }: Props = $props()
	const ctx = getBraintreeContext()
	let el: HTMLDivElement
	onMount(() => ctx.registerField({ type: 'number', container: el, placeholder }))
</script>

<div bind:this={el} {id} {style} data-braintree-field="number" class={className}></div>
