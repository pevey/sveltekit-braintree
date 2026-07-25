// Static import (browser-only SDK; a dynamic import triggers a Vite re-bundle that 404s the module).
import * as braintree from 'braintree-web'
import type { BraintreeClient } from './types.js'

/**
 * Manually collect Braintree device data (fraud signal). Not needed when
 * `<HostedFields collectDeviceData>` is enabled — read `ctx.deviceData` instead.
 */
export async function collectDeviceData(client: BraintreeClient): Promise<string> {
	const collector = await braintree.dataCollector.create({ client } as never)
	return (collector as { deviceData?: string }).deviceData ?? ''
}
