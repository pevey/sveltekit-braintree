import type {
	BraintreeContext,
	HostedFieldsInstance,
	ThreeDSecureInstance,
	TokenizeOptions,
	TokenizeResult,
	VerifyCardOptions,
	VerifyCardResult,
	CombinedTokenizeOptions,
	CombinedTokenizeResult
} from './types.js'

/** Tokenize the entered card via Hosted Fields → single-use nonce (+ card details incl. bin). */
export async function tokenizeCard(hostedFields: HostedFieldsInstance, options: TokenizeOptions = {}): Promise<TokenizeResult> {
	return (await hostedFields.tokenize(options as Record<string, unknown>)) as unknown as TokenizeResult
}

/** Run the 3-D Secure 2 challenge for a nonce; returns the verified nonce + liability shift. */
export async function verifyCard(threeDSecure: ThreeDSecureInstance, options: VerifyCardOptions): Promise<VerifyCardResult> {
	const { amount, ...rest } = options
	return (await threeDSecure.verifyCard({
		amount: String(amount),
		onLookupComplete: (_data: unknown, next: () => void) => next(),
		...rest
	})) as VerifyCardResult
}

/** Happy-path: tokenize → (if 3DS enabled and `amount` given) verify → attach the provider's deviceData. */
export async function tokenize(ctx: BraintreeContext, options: CombinedTokenizeOptions = {}): Promise<CombinedTokenizeResult> {
	if (!ctx.hostedFields) throw new Error('Braintree hosted fields are not ready')
	const { amount, ...tokenizeOpts } = options
	const { nonce, details } = await tokenizeCard(ctx.hostedFields, tokenizeOpts)
	let finalNonce = nonce
	let liabilityShifted: boolean | undefined
	if (ctx.threeDSecure && amount != null) {
		const verified = await verifyCard(ctx.threeDSecure, { amount, nonce, bin: details.bin })
		finalNonce = verified.nonce
		liabilityShifted = verified.liabilityShifted
	}
	return { nonce: finalNonce, deviceData: ctx.deviceData ?? undefined, liabilityShifted }
}
