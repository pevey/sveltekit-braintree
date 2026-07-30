<script lang="ts">
	import { onMount, onDestroy, type Snippet } from 'svelte'
	// Static import: browser-only SDK; a dynamic import triggers a Vite re-bundle that 404s the module.
	import * as braintree from 'braintree-web'
	import { setBraintreeContext } from './context.js'
	import type { BraintreeContext, HostedFieldType } from './types.js'

	interface Props {
		authorization: string
		styles?: Record<string, Record<string, string>>
		threeDSecure?: boolean
		collectDeviceData?: boolean
		onready?: (ctx: BraintreeContext) => void
		onerror?: (err: unknown) => void
		class?: string
		children?: Snippet
	}
	let { authorization, styles, threeDSecure = false, collectDeviceData = true, onready, onerror, class: className = '', children }: Props = $props()

	const registry: { type: HostedFieldType; container: HTMLElement; placeholder?: string }[] = []

	let client = $state<unknown>(null)
	let hostedFields = $state<unknown>(null)
	let three = $state<unknown>(null)
	let deviceData = $state<string | null>(null)
	let ready = $state(false)

	// Reactive-getter context (SSR-safe, no $effect). Children register their bound container in their
	// OWN onMount (runs before this component's onMount), so `registry` is complete when we create.
	const ctx: BraintreeContext = {
		get client() {
			return client
		},
		get hostedFields() {
			return hostedFields as BraintreeContext['hostedFields']
		},
		get threeDSecure() {
			return three as BraintreeContext['threeDSecure']
		},
		get deviceData() {
			return deviceData
		},
		get ready() {
			return ready
		},
		registerField(entry) {
			registry.push(entry)
		}
	}
	setBraintreeContext(ctx)

	onMount(async () => {
		try {
			client = await braintree.client.create({ authorization })
			const fields: Record<string, { container: HTMLElement; placeholder?: string }> = {}
			for (const f of registry) fields[f.type] = { container: f.container, placeholder: f.placeholder }
			hostedFields = await braintree.hostedFields.create({ client, styles, fields } as never)
			if (threeDSecure) three = await braintree.threeDSecure.create({ client, version: 2 } as never)
			if (collectDeviceData) {
				const dc = await braintree.dataCollector.create({ client } as never)
				deviceData = (dc as { deviceData?: string }).deviceData ?? null
			}
			ready = true
			onready?.(ctx)
		} catch (e) {
			onerror?.(e)
		}
	})

	onDestroy(() => {
		try {
			;(hostedFields as { teardown?: () => void } | null)?.teardown?.()
		} catch {
			/* ignore */
		}
		try {
			;(three as { teardown?: () => void } | null)?.teardown?.()
		} catch {
			/* ignore */
		}
	})
</script>

<div data-braintree-hosted-fields class={className}>
	{@render children?.()}
</div>
