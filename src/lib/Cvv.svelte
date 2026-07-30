<script lang="ts">
	import { onMount } from 'svelte'
	import { getBraintreeContext } from './context.js'

	interface Props {
		class?: string
		placeholder?: string
		id?: string
		style?: string
	}
	let { class: className = '', placeholder, id, style }: Props = $props()
	const ctx = getBraintreeContext()
	let el: HTMLDivElement
	onMount(() => ctx.registerField({ type: 'cvv', container: el, placeholder }))
</script>

<div bind:this={el} {id} {style} data-braintree-field="cvv" class={className}></div>
