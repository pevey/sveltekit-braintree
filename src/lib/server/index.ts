import * as braintree from 'braintree'

export interface BraintreeCredentials {
	environment: 'sandbox' | 'production' | 'development' | 'qa'
	merchantId: string
	publicKey: string
	privateKey: string
}

const ENV_MAP: Record<string, braintree.Environment> = {
	sandbox: braintree.Environment.Sandbox,
	production: braintree.Environment.Production,
	development: braintree.Environment.Development,
	qa: braintree.Environment.Qa
}

export function createBraintreeGateway(creds: BraintreeCredentials): braintree.BraintreeGateway {
	const environment = ENV_MAP[creds.environment?.toLowerCase?.()]
	if (!environment) {
		throw new Error(
			`Invalid Braintree environment "${creds.environment}". Must be one of: ${Object.keys(ENV_MAP).join(', ')}`
		)
	}
	return new braintree.BraintreeGateway({
		environment,
		merchantId: creds.merchantId,
		publicKey: creds.publicKey,
		privateKey: creds.privateKey
	})
}

export async function generateClientToken(
	gateway: braintree.BraintreeGateway,
	options: Record<string, unknown> = {}
): Promise<string> {
	const { clientToken } = await gateway.clientToken.generate(options)
	return clientToken
}

export interface CreateTransactionParams {
	amount: string | number
	nonce: string
	deviceData?: string
	submitForSettlement?: boolean
	threeDSecure?: boolean
	merchantAccountId?: string
	options?: Record<string, unknown>
	[k: string]: unknown
}

/** Pure builder for `transaction.sale` params — separated for unit testing. */
export function buildTransactionRequest(params: CreateTransactionParams): Record<string, unknown> {
	const { amount, nonce, deviceData, submitForSettlement, threeDSecure, merchantAccountId, options, ...rest } = params
	const request: Record<string, unknown> = { amount: String(amount), paymentMethodNonce: nonce, ...rest }
	if (deviceData) request.deviceData = deviceData
	if (merchantAccountId) request.merchantAccountId = merchantAccountId
	const opts: Record<string, unknown> = { ...(options ?? {}) }
	if (submitForSettlement !== undefined) opts.submitForSettlement = submitForSettlement
	if (threeDSecure !== undefined) opts.threeDSecure = { required: threeDSecure }
	if (Object.keys(opts).length) request.options = opts
	return request
}

export function createTransaction(gateway: braintree.BraintreeGateway, params: CreateTransactionParams) {
	return gateway.transaction.sale(buildTransactionRequest(params) as never)
}

export function findTransaction(gateway: braintree.BraintreeGateway, id: string) {
	return gateway.transaction.find(id)
}

export function submitForSettlement(gateway: braintree.BraintreeGateway, id: string, amount?: string | number) {
	return amount == null
		? gateway.transaction.submitForSettlement(id)
		: gateway.transaction.submitForSettlement(id, String(amount))
}

export function voidTransaction(gateway: braintree.BraintreeGateway, id: string) {
	return gateway.transaction.void(id)
}

export function refundTransaction(gateway: braintree.BraintreeGateway, id: string, amount?: string | number) {
	return amount == null ? gateway.transaction.refund(id) : gateway.transaction.refund(id, String(amount))
}

export function parseWebhook(
	gateway: braintree.BraintreeGateway,
	{ signature, payload }: { signature: string; payload: string }
) {
	return gateway.webhookNotification.parse(signature, payload)
}
