// Structural types over braintree-web (its shipped @types are imperfect for our surface — we treat
// the instance handles loosely and expose clean result/option types).
export type HostedFieldType = 'number' | 'expirationDate' | 'cvv' | 'postalCode'

export interface BraintreeBillingAddress {
	postalCode?: string
	firstName?: string
	lastName?: string
	streetAddress?: string
	extendedAddress?: string
	locality?: string
	region?: string
	countryCodeAlpha2?: string
	[k: string]: string | undefined
}

export interface TokenizeOptions {
	vault?: boolean
	billingAddress?: BraintreeBillingAddress
	cardholderName?: string
}

export interface TokenizeResult {
	nonce: string
	details: { bin?: string; cardType?: string; lastFour?: string; lastTwo?: string; [k: string]: unknown }
}

export interface VerifyCardOptions {
	amount: string | number
	nonce: string
	bin?: string
	// passthrough to threeDSecure.verifyCard (challengeRequested, additionalInformation, email, …)
	[k: string]: unknown
}

export interface VerifyCardResult {
	nonce: string
	liabilityShifted: boolean
	liabilityShiftPossible: boolean
	threeDSecureInfo?: unknown
}

export interface CombinedTokenizeOptions extends TokenizeOptions {
	amount?: string | number
}

export interface CombinedTokenizeResult {
	nonce: string
	deviceData?: string
	liabilityShifted?: boolean
}

// Loose handles — braintree-web's DTs are awkward; consumers rarely touch these directly.
export type BraintreeClient = unknown
export type HostedFieldsInstance = {
	tokenize(options?: Record<string, unknown>): Promise<{ nonce: string; details: Record<string, unknown> }>
	teardown?(): Promise<void> | void
}
export type ThreeDSecureInstance = {
	verifyCard(options: Record<string, unknown>): Promise<{
		nonce: string; liabilityShifted: boolean; liabilityShiftPossible: boolean; threeDSecureInfo?: unknown
	}>
	teardown?(): Promise<void> | void
}

export interface BraintreeContext {
	readonly client: BraintreeClient | null
	readonly hostedFields: HostedFieldsInstance | null
	readonly threeDSecure: ThreeDSecureInstance | null
	readonly deviceData: string | null
	readonly ready: boolean
	registerField(entry: { type: HostedFieldType; container: HTMLElement; placeholder?: string }): void
}
