# sveltekit-braintree

A barebones SvelteKit library for [Braintree](https://www.braintreepayments.com/) Hosted Fields
and 3D Secure. It wraps `braintree-web` (client) and the `braintree` Node SDK (server) with a
small, typed, Svelte-idiomatic surface — a provider component, four field components, a couple of
tokenize helpers, and a set of server functions for client tokens, transactions, and webhooks. It
is Medusa-agnostic: nothing in this package assumes any particular ecommerce backend, so it drops
into any SvelteKit app that needs to take a card payment through Braintree.

## Features

- **Hosted Fields** — `<HostedFields>` provider + `<CardNumber>` / `<ExpirationDate>` / `<Cvv>` /
  `<PostalCode>` field components. Card data never touches your page's JS context; each field
  renders inside a Braintree-hosted iframe.
- **3D Secure 2** — opt in with `threeDSecure` on the provider; `tokenize()` runs the challenge
  automatically when you pass an `amount`, and returns `liabilityShifted` so you know whether the
  shift succeeded before you submit.
- **Device data** — collected automatically by the provider (`collectDeviceData`, on by default)
  for Braintree's fraud engine, or gathered standalone with `collectDeviceData(client)`.
- **Vaulting** — pass `vault: true` to `tokenize()` to store the payment method against a
  customer for later reuse.
- **Server helpers** (`sveltekit-braintree/server`) — a configured gateway, client-token
  generation, transaction sale/find/settle/void/refund, and webhook signature verification.
- **Granular + combined helpers** — reach for the one-call `tokenize()` for the common path, or
  drop to `tokenizeCard()` / `verifyCard()` (and the raw `client` / `hostedFields` /
  `threeDSecure` instances via `getBraintreeContext()`) when you need custom control flow.

## Setup

Create a SvelteKit project and install the package and its peer dependencies:

```bash
npm install sveltekit-braintree braintree-web braintree
```

- `braintree-web` is the client-side SDK — required, it's what powers Hosted Fields and 3D Secure
  in the browser.
- `braintree` is the server-side Node SDK — only needed if you use `sveltekit-braintree/server`.
  It's an **optional** peer dependency, so a client-only integration (where some other service
  issues your client tokens) doesn't need to install it.

Add your Braintree merchant credentials as server-only environment variables. You'll find these
in the Braintree Control Panel under **Settings → API**. Use the sandbox credentials while
developing:

`.env`

```bash
BRAINTREE_ENVIRONMENT=sandbox
BRAINTREE_MERCHANT_ID=your_merchant_id
BRAINTREE_PUBLIC_KEY=your_public_key
BRAINTREE_PRIVATE_KEY=your_private_key
```

`environment` is one of `'sandbox' | 'production' | 'development' | 'qa'`. These four values map
directly to `braintree.Environment`. Keep the public/private key pair and merchant ID out of
client code — they only ever get used server-side, to build a `BraintreeGateway` and issue
short-lived client tokens to the browser.

## Server: issue a client token

Every Hosted Fields session starts with a **client token** — a short-lived credential your server
generates and hands to the page. Build a `BraintreeGateway` once and reuse it:

`src/lib/server/braintree.ts`

```ts
import { createBraintreeGateway } from 'sveltekit-braintree/server'
import {
	BRAINTREE_ENVIRONMENT,
	BRAINTREE_MERCHANT_ID,
	BRAINTREE_PUBLIC_KEY,
	BRAINTREE_PRIVATE_KEY
} from '$env/static/private'

export const gateway = createBraintreeGateway({
	environment: BRAINTREE_ENVIRONMENT as 'sandbox' | 'production',
	merchantId: BRAINTREE_MERCHANT_ID,
	publicKey: BRAINTREE_PUBLIC_KEY,
	privateKey: BRAINTREE_PRIVATE_KEY
})
```

Then generate a client token in a `load` function and pass it to the page:

`src/routes/checkout/+page.server.ts`

```ts
import { generateClientToken } from 'sveltekit-braintree/server'
import { gateway } from '$lib/server/braintree'

export const load = async () => {
	const clientToken = await generateClientToken(gateway)
	return { clientToken }
}
```

`generateClientToken` also accepts a second `options` argument, passed straight through to
`gateway.clientToken.generate()` — for example `{ customerId }` to scope the token (and any
vaulted payment methods it authorizes) to a known customer.

Generate a fresh client token per checkout session rather than caching one — like Stripe client
secrets, these are cheap to create and are meant to be short-lived.

## Client: `<HostedFields>` + fields + `tokenize`

`<HostedFields>` is the provider. It creates the underlying `braintree-web` client from your
`authorization` (the client token from above), then creates a Hosted Fields instance out of
whichever field components you render as children. Field components don't take props for card
data — Braintree renders and owns the actual `<input>`s inside a same-origin iframe per field, so
none of it passes through your page's JS.

```svelte
<script lang="ts">
	import { HostedFields, CardNumber, ExpirationDate, Cvv, tokenize, type BraintreeContext } from 'sveltekit-braintree'

	let { data } = $props()
	let ctx: BraintreeContext | undefined
	let submitting = $state(false)

	async function pay() {
		if (!ctx) return
		submitting = true
		try {
			const { nonce, deviceData } = await tokenize(ctx, { amount: '19.99' })
			const res = await fetch('/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ nonce, deviceData })
			})
			if (!res.ok) throw new Error('Payment failed')
			// navigate to confirmation, etc.
		} finally {
			submitting = false
		}
	}
</script>

<HostedFields authorization={data.clientToken} onready={(c) => (ctx = c)}>
	<CardNumber class="h-9 rounded-md border px-3" placeholder="4111 1111 1111 1111" />
	<ExpirationDate class="h-9 rounded-md border px-3" placeholder="MM/YY" />
	<Cvv class="h-9 rounded-md border px-3" placeholder="CVV" />
</HostedFields>
<button onclick={pay} disabled={!ctx?.ready || submitting}>Pay</button>
```

Notes:

- `onready` fires once after the client, Hosted Fields instance, and (if enabled) 3D Secure and
  device data collector have all finished initializing — it hands you the same context object
  `getBraintreeContext()` would give a descendant, so binding it out via `onready` (as above) or
  reading it inside a child component are equivalent.
- `ctx.ready` is a reactive getter — use it (as shown, `disabled={!ctx?.ready}`) to keep the pay
  button disabled until Hosted Fields has actually mounted.
- There's also a `<PostalCode>` field component if you want Braintree to collect it as part of
  Hosted Fields, though most integrations collect postal code as part of a regular billing
  address form instead.
- Render at most one of each field type per `<HostedFields>` — `CardNumber` maps to Braintree's
  `number` field, and a second instance would just overwrite the first in the fields map Hosted
  Fields is created with.
- `onerror` catches failures during client/Hosted Fields/3D Secure/device-data setup (bad
  authorization, network errors, etc.) — always handle it in a real integration.

## Server: create the transaction

Your endpoint receives the `nonce` (and `deviceData`, if you collected it) and hands it to
`createTransaction`, which submits a `transaction.sale` against the Braintree gateway:

`src/routes/checkout/+server.ts`

```ts
import { json } from '@sveltejs/kit'
import { createTransaction } from 'sveltekit-braintree/server'
import { gateway } from '$lib/server/braintree'

export async function POST({ request }) {
	const { nonce, deviceData } = await request.json()

	const result = await createTransaction(gateway, {
		amount: '19.99',
		nonce,
		deviceData,
		submitForSettlement: true
	})

	if (!result.success) {
		return json({ error: result.message }, { status: 402 })
	}
	return json({ transactionId: result.transaction.id })
}
```

`createTransaction` accepts:

- `amount` (required) — string or number; coerced to a string for the Braintree API.
- `nonce` (required) — the payment method nonce from `tokenize()` / `tokenizeCard()`.
- `deviceData` — the device fingerprint string; forward it if you collected it client-side.
- `submitForSettlement` — settle immediately instead of only authorizing.
- `threeDSecure` — enforce that the transaction only completes if 3D Secure liability shifted
  (see [3D Secure](#3d-secure) below).
- `merchantAccountId` — route the sale to a specific merchant account (multi-currency setups).
- `options` — any other `transaction.sale` `options` you want to set directly; merged with
  whatever `submitForSettlement`/`threeDSecure` compute.
- any other key is passed straight through to the Braintree request (e.g. `orderId`,
  `customFields`, `customer`, `billing`, `shipping`).

The always-verify-server-side rule applies here just like with any payment provider: the amount
charged is whatever you pass to `createTransaction`, not whatever the client claimed — compute it
from your own cart/order state on the server.

Once you have a transaction you can also `findTransaction(gateway, id)`,
`submitForSettlement(gateway, id, amount?)` (settle later, e.g. on fulfillment, if you authorized
only), `voidTransaction(gateway, id)` (cancel an unsettled authorization), and
`refundTransaction(gateway, id, amount?)` (full refund if `amount` is omitted, partial otherwise).

## 3D Secure

3D Secure 2 shifts liability for fraudulent chargebacks from you to the card issuer, and is
required (or strongly encouraged) by regulations like PSD2/SCA in some regions. It's opt-in on
both sides:

**Client** — set `threeDSecure` on the provider, and pass an `amount` to `tokenize()` (the
challenge needs to know the amount to show the cardholder):

```svelte
<HostedFields authorization={data.clientToken} threeDSecure onready={(c) => (ctx = c)}>
	<!-- fields -->
</HostedFields>
```

```ts
const { nonce, liabilityShifted } = await tokenize(ctx, { amount: '19.99' })
if (liabilityShifted === false) {
	// the issuer didn't shift liability — warn the customer, or let them retry
}
```

Internally, `tokenize()` calls `tokenizeCard()` to get a nonce from Hosted Fields, then — only if
`ctx.threeDSecure` exists (the provider was given `threeDSecure`) *and* you passed `amount` — runs
`verifyCard()` against that nonce and swaps in the verified nonce. If you don't pass `amount`, or
the provider wasn't given `threeDSecure`, `tokenize()` silently skips the challenge and returns
the plain Hosted Fields nonce.

**Server** — set `threeDSecure: true` on `createTransaction` to *enforce* the shift rather than
just observe it:

```ts
await createTransaction(gateway, {
	amount: '19.99',
	nonce,
	deviceData,
	threeDSecure: true, // → options.threeDSecure.required = true
	submitForSettlement: true
})
```

With `threeDSecure: true`, Braintree rejects the sale outright if liability wasn't shifted for
that nonce — this is the actual enforcement point. Treat `liabilityShifted` on the client as
UX-only (deciding whether to show a warning before submitting); never rely on client-reported
booleans as your security boundary.

## Styling

Two separate knobs style two separate things:

- **`styles`** on `<HostedFields>` — a Braintree Hosted Fields [styles
  object](https://developer.paypal.com/braintree/docs/guides/hosted-fields/styling), applied
  *inside* each field's iframe (it can't be reached by regular CSS because the input lives in a
  different origin). Keys are pseudo-states (`input`, `input.invalid`, `:focus`, …) mapping to
  CSS property/value pairs:

  ```svelte
  <HostedFields
  	authorization={data.clientToken}
  	styles={{
  		input: { 'font-size': '16px', 'font-family': 'system-ui, sans-serif', color: '#1a1a1a' },
  		'input.invalid': { color: '#dc2626' },
  		':focus': { color: '#1a1a1a' }
  	}}
  	onready={(c) => (ctx = c)}
  >
  	<CardNumber class="h-9 rounded-md border px-3" />
  </HostedFields>
  ```

- **`class`** — a regular CSS class, settable on both `<HostedFields>` (the outer wrapping
  `<div>` around all fields) and on each field component (each field's own container `<div>`).
  This is normal, same-origin CSS, so use it for layout, borders, background, spacing, focus
  rings on the container, etc.

One gotcha specific to Hosted Fields: Braintree injects an `<iframe>` with `height: 100%` into
each field's container, so **give every field container an explicit height** via `class` (as in
the examples above, e.g. Tailwind's `h-9`) — an unstyled container collapses to zero height and
the field disappears.

### Styling the container like a native input

Each field also accepts an inline **`style`** prop (a pass-through to the container `<div>`) — useful
for a runtime-resolved value like a theme surface colour that can't live in a static class.

Braintree's `styles` whitelist has **no `background`**, so to give the input a solid fill you paint it
in two places that must match: the container (`class`/`style` background) and the iframe input via the
one whitelisted property that actually paints — an opaque inset `box-shadow`:

```svelte
<script lang="ts">
	import { HostedFields, CardNumber, ExpirationDate, Cvv } from 'sveltekit-braintree'
	const surface = '#ffffff' // your resolved input background
	const styles = {
		input: {
			'box-shadow': `inset 0 0 0 1000px ${surface}`,
			'-webkit-box-shadow': `inset 0 0 0 1000px ${surface}`,
			'font-size': '14px',
			color: '#0a0a0a',
			'-webkit-text-fill-color': '#0a0a0a'
		},
		'::placeholder': { color: '#71717a' }
	}
	const box = 'h-9 rounded-md border px-3'
</script>

<HostedFields authorization={clientToken} {styles}>
	<CardNumber class={box} style="background: {surface}" />
	<ExpirationDate class={box} style="background: {surface}" />
	<Cvv class={box} style="background: {surface}" />
</HostedFields>
```

(`-webkit-text-fill-color` keeps the typed text visible over the shadow — the same trick that defeats
the yellow autofill background.)

## Vaulting

To store a tokenized payment method against a customer for reuse (saved cards), pass
`vault: true` to `tokenize()` (or `tokenizeCard()` directly):

```ts
const { nonce } = await tokenize(ctx, { vault: true })
```

This requires the client token to have been generated for a specific customer — pass a
`customerId` when generating it server-side:

```ts
const clientToken = await generateClientToken(gateway, { customerId })
```

Without a `customerId` on the client token, `vault: true` tokenizes for one-time use only; there's
no customer for Braintree to attach the vaulted payment method to. You can also pass
`billingAddress` and `cardholderName` alongside `vault: true` — both are forwarded to
`tokenizeCard()`.

## Device data

Braintree's fraud engine (Kount) uses a device fingerprint collected in the browser. The provider
collects this for you by default:

```svelte
<HostedFields authorization={data.clientToken} onready={(c) => (ctx = c)}>
	<!-- collectDeviceData defaults to true; ctx.deviceData is populated once ready -->
</HostedFields>
```

`tokenize()` automatically attaches `ctx.deviceData` to its result, so in the common path you
never call anything device-data-related yourself — just forward `deviceData` from `tokenize()`'s
result to your server, as shown in the checkout example above.

If you disabled it on the provider (`collectDeviceData={false}`) but need it for a specific flow,
collect it standalone with the raw `client` instance:

```ts
import { collectDeviceData, getBraintreeContext } from 'sveltekit-braintree'

const ctx = getBraintreeContext()
const deviceData = await collectDeviceData(ctx.client)
```

## Webhook verification

Braintree posts webhooks as `application/x-www-form-urlencoded` with two fields: `bt_signature`
and `bt_payload`. Parse the form body and hand both to `parseWebhook`, which verifies the
signature and decodes the notification:

`src/routes/webhooks/braintree/+server.ts`

```ts
import { error, json } from '@sveltejs/kit'
import { parseWebhook } from 'sveltekit-braintree/server'
import { gateway } from '$lib/server/braintree'

export async function POST({ request }) {
	const form = await request.formData()
	const signature = form.get('bt_signature')?.toString() ?? ''
	const payload = form.get('bt_payload')?.toString() ?? ''

	let notification
	try {
		notification = await parseWebhook(gateway, { signature, payload })
	} catch {
		throw error(400, 'Invalid webhook signature')
	}

	switch (notification.kind) {
		case 'transaction_settled':
			// notification.transaction — mark the order paid
			break
		case 'dispute_opened':
			// notification.dispute — flag the order
			break
	}
	return json({ received: true })
}
```

`parseWebhook` is a thin wrapper over `gateway.webhookNotification.parse(signature, payload)` — it
returns whatever shape the `braintree` Node SDK gives you for that notification kind (see the
[Braintree webhook docs](https://developer.paypal.com/braintree/docs/guides/webhooks/kinds) for
the full list and payload shapes).

## Granular helpers / raw access

`tokenize()` covers the common path (tokenize, optionally 3DS-verify, attach device data), but
each step is exported individually for when you need more control over the flow:

- **`tokenizeCard(hostedFields, options?)`** — just the Hosted Fields tokenization step. Returns
  `{ nonce, details }`, where `details` includes `bin`, `cardType`, `lastFour`, etc. — useful if
  you want the card BIN or last-four to show the customer a confirmation before deciding whether
  to run 3D Secure.

  ```ts
  const { nonce, details } = await tokenizeCard(ctx.hostedFields!, { vault: true })
  ```

- **`verifyCard(threeDSecure, options)`** — just the 3D Secure challenge, given a nonce you
  already have. `options` requires `amount` and `nonce`; anything else (`bin`, `email`,
  `challengeRequested`, `additionalInformation`, your own `onLookupComplete`, …) passes straight
  through to `braintree-web`'s `threeDSecure.verifyCard()`. Override `onLookupComplete` yourself
  if you want to show the customer something before the challenge continues — `tokenize()`'s
  built-in call just auto-continues (`(_, next) => next()`).

  ```ts
  const verified = await verifyCard(ctx.threeDSecure!, {
  	amount: '19.99',
  	nonce,
  	bin: details.bin,
  	onLookupComplete: (data, next) => {
  		showChallengeExplainer()
  		next()
  	}
  })
  ```

- **`getBraintreeContext()`** — call it from inside any descendant of `<HostedFields>` (or use
  the object handed to `onready`) to reach the raw `braintree-web` instances directly for
  anything this library doesn't wrap:

  ```svelte
  <script lang="ts">
  	import { getBraintreeContext } from 'sveltekit-braintree'
  	const ctx = getBraintreeContext()
  </script>
  ```

  - `ctx.client` — the `braintree-web` Client instance (hand it to other `braintree-web` modules,
    e.g. PayPal or Venmo, if you add them alongside Hosted Fields).
  - `ctx.hostedFields` — the Hosted Fields instance; call `.on('validityChange', …)`,
    `.on('focus', …)`, `.clear('number')`, etc. directly for anything beyond tokenizing.
  - `ctx.threeDSecure` — the 3D Secure instance (only set when the provider was given
    `threeDSecure`).
  - `ctx.deviceData` / `ctx.ready` — the reactive values `tokenize()` and your `disabled=` binding
    read.

  `getBraintreeContext()` throws if called outside a `<HostedFields>` tree — it's a thin wrapper
  over Svelte context, so the usual context rules apply (call it during component
  initialization, not inside an async callback).
