import { getContext, setContext } from 'svelte'
import type { BraintreeContext } from './types.js'

const KEY = Symbol('braintree')

export function setBraintreeContext(ctx: BraintreeContext): void {
	setContext(KEY, ctx)
}

export function getBraintreeContext(): BraintreeContext {
	const ctx = getContext<BraintreeContext>(KEY)
	if (!ctx) throw new Error('Braintree parts must be used within <HostedFields>')
	return ctx
}
