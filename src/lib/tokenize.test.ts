import { describe, it, expect, vi } from 'vitest'
import { tokenizeCard, verifyCard, tokenize } from './tokenize.js'

describe('tokenizeCard', () => {
	it('passes options through and returns nonce+details', async () => {
		const hf = { tokenize: vi.fn().mockResolvedValue({ nonce: 'n1', details: { bin: '411111' } }) }
		const r = await tokenizeCard(hf as never, { vault: true, cardholderName: 'A B' })
		expect(hf.tokenize).toHaveBeenCalledWith({ vault: true, cardholderName: 'A B' })
		expect(r).toEqual({ nonce: 'n1', details: { bin: '411111' } })
	})
})

describe('verifyCard', () => {
	it('coerces amount, auto-continues the lookup, returns the verified nonce', async () => {
		const verifyCardFn = vi.fn().mockImplementation((opts) => {
			opts.onLookupComplete({}, () => {})
			return Promise.resolve({ nonce: 'v1', liabilityShifted: true, liabilityShiftPossible: true })
		})
		const r = await verifyCard({ verifyCard: verifyCardFn } as never, { amount: 20, nonce: 'n1', bin: '411111' })
		expect(verifyCardFn).toHaveBeenCalledWith(
			expect.objectContaining({ amount: '20', nonce: 'n1', bin: '411111' })
		)
		expect(r.nonce).toBe('v1')
		expect(r.liabilityShifted).toBe(true)
	})
})

describe('tokenize (combined)', () => {
	const hf = () => ({ tokenize: vi.fn().mockResolvedValue({ nonce: 'n1', details: { bin: '411111' } }) })
	const tds = (result: unknown) => ({
		verifyCard: vi.fn().mockImplementation((opts) => { opts.onLookupComplete?.({}, () => {}); return Promise.resolve(result) })
	})

	it('runs 3DS when enabled and amount given → verified nonce + liabilityShifted + deviceData', async () => {
		const ctx = {
			hostedFields: hf(),
			threeDSecure: tds({ nonce: 'v1', liabilityShifted: true, liabilityShiftPossible: true }),
			deviceData: 'dd', ready: true
		}
		await expect(tokenize(ctx as never, { amount: 20 })).resolves.toEqual({
			nonce: 'v1', deviceData: 'dd', liabilityShifted: true
		})
	})
	it('skips 3DS when no amount → original nonce, no liabilityShifted', async () => {
		const t = tds({ nonce: 'v1', liabilityShifted: true, liabilityShiftPossible: true })
		const ctx = { hostedFields: hf(), threeDSecure: t, deviceData: 'dd', ready: true }
		await expect(tokenize(ctx as never, {})).resolves.toEqual({
			nonce: 'n1', deviceData: 'dd', liabilityShifted: undefined
		})
		expect(t.verifyCard).not.toHaveBeenCalled()
	})
	it('skips 3DS when threeDSecure is absent', async () => {
		const ctx = { hostedFields: hf(), threeDSecure: null, deviceData: null, ready: true }
		await expect(tokenize(ctx as never, { amount: 20 })).resolves.toEqual({
			nonce: 'n1', deviceData: undefined, liabilityShifted: undefined
		})
	})
	it('throws if hosted fields are not ready', async () => {
		await expect(tokenize({ hostedFields: null } as never, {})).rejects.toThrow(/not ready/)
	})
})
