import { describe, it, expect, vi } from 'vitest'
import {
	createBraintreeGateway, generateClientToken, buildTransactionRequest, createTransaction, parseWebhook
} from './index.js'

describe('createBraintreeGateway', () => {
	it('throws on an invalid environment', () => {
		expect(() =>
			createBraintreeGateway({ environment: 'nope' as never, merchantId: 'm', publicKey: 'p', privateKey: 'k' })
		).toThrow(/Invalid Braintree environment/)
	})
	it('constructs a gateway for a valid environment', () => {
		const gw = createBraintreeGateway({ environment: 'sandbox', merchantId: 'm', publicKey: 'p', privateKey: 'k' })
		expect(gw.transaction).toBeTruthy()
		expect(gw.clientToken).toBeTruthy()
	})
})

describe('buildTransactionRequest', () => {
	it('maps amount+nonce and coerces amount to string', () => {
		expect(buildTransactionRequest({ amount: 19.99, nonce: 'n1' })).toMatchObject({
			amount: '19.99', paymentMethodNonce: 'n1'
		})
	})
	it('includes deviceData, merchantAccountId and options when present', () => {
		const r = buildTransactionRequest({
			amount: '10.00', nonce: 'n', deviceData: 'dd', merchantAccountId: 'sub',
			submitForSettlement: true, threeDSecure: true
		})
		expect(r.deviceData).toBe('dd')
		expect(r.merchantAccountId).toBe('sub')
		expect(r.options).toMatchObject({ submitForSettlement: true, threeDSecure: { required: true } })
	})
	it('omits options when no option flags are given', () => {
		expect(buildTransactionRequest({ amount: '5', nonce: 'n' }).options).toBeUndefined()
	})
})

describe('generateClientToken', () => {
	it('unwraps the clientToken string', async () => {
		const gateway = { clientToken: { generate: vi.fn().mockResolvedValue({ clientToken: 'ct_abc' }) } }
		await expect(generateClientToken(gateway as never)).resolves.toBe('ct_abc')
		expect(gateway.clientToken.generate).toHaveBeenCalledWith({})
	})
})

describe('createTransaction', () => {
	it('calls gateway.transaction.sale with the built request', async () => {
		const sale = vi.fn().mockResolvedValue({ success: true })
		await createTransaction({ transaction: { sale } } as never, { amount: '10', nonce: 'n', deviceData: 'dd' })
		expect(sale).toHaveBeenCalledWith(
			expect.objectContaining({ amount: '10', paymentMethodNonce: 'n', deviceData: 'dd' })
		)
	})
})

describe('parseWebhook', () => {
	it('delegates to webhookNotification.parse(signature, payload)', async () => {
		const parse = vi.fn().mockResolvedValue({ kind: 'x' })
		await parseWebhook({ webhookNotification: { parse } } as never, { signature: 'sig', payload: 'pl' })
		expect(parse).toHaveBeenCalledWith('sig', 'pl')
	})
})
