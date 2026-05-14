import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import worker, { type Env } from './index.js';
import { parseVoipMsBalance, VoipMsError } from './voipms.js';

interface ErrorResponse {
	error: true;
	message: string;
}

const env: Env = {
	VOIP_MS_USERNAME: 'test@voip.ms',
	VOIP_MS_PASSWORD: 'api-password',
	CURRENCY: 'CAD',
	DEBUG: 'false',
};

function createBalanceRequest(options: RequestInit = {}): Request {
	return new Request('https://worker.example.com/balance', {
		...options,
		headers: {
			'User-Agent': 'Groundwire/25.2.34 (build 2335157; iOS 18.6.2; arm64-neon)',
			...options.headers,
		},
	});
}

function mockVoipMsResponse(body: unknown, status: number = 200): ReturnType<typeof vi.fn> {
	const mockFetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
	globalThis.fetch = mockFetch as typeof fetch;
	return mockFetch;
}

describe('Worker routes', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	test('returns health without secrets', async () => {
		const response = await worker.fetch(new Request('https://worker.example.com/health'), {});
		const data = (await response.json()) as { status: string; version: string; timestamp: string };

		expect(response.status).toBe(200);
		expect(data.status).toBe('healthy');
		expect(data.version).toBe('1.0.0');
		expect(data.timestamp).toBeDefined();
	});

	test('rejects non-GET health requests', async () => {
		const response = await worker.fetch(new Request('https://worker.example.com/health', { method: 'POST' }), {});
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(405);
		expect(data.message).toBe('Method POST not allowed');
	});

	test('returns 404 for unknown routes', async () => {
		const response = await worker.fetch(new Request('https://worker.example.com/provision/1'), env);
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(404);
		expect(data.message).toBe('Not found');
	});

	test('rejects non-GET balance requests without calling VoIP.ms', async () => {
		const mockFetch = vi.fn();
		globalThis.fetch = mockFetch as typeof fetch;

		const response = await worker.fetch(createBalanceRequest({ method: 'POST' }), env);
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(405);
		expect(data.message).toBe('Method POST not allowed');
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test('rejects missing worker secrets', async () => {
		const mockFetch = vi.fn();
		globalThis.fetch = mockFetch as typeof fetch;

		const response = await worker.fetch(createBalanceRequest(), {
			VOIP_MS_USERNAME: 'test@voip.ms',
		});
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(500);
		expect(data.message).toBe('Server configuration error');
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test('rejects missing user agent without calling VoIP.ms', async () => {
		const mockFetch = vi.fn();
		globalThis.fetch = mockFetch as typeof fetch;

		const response = await worker.fetch(new Request('https://worker.example.com/balance'), env);
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(401);
		expect(data.message).toBe('Unauthorized');
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test('rejects non-Groundwire user agents without calling VoIP.ms', async () => {
		const mockFetch = vi.fn();
		globalThis.fetch = mockFetch as typeof fetch;

		const response = await worker.fetch(
			createBalanceRequest({
				headers: {
					'User-Agent': 'Mozilla/5.0',
				},
			}),
			env,
		);
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(401);
		expect(data.message).toBe('Unauthorized');
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test('returns Groundwire balance string for a Groundwire request', async () => {
		const mockFetch = mockVoipMsResponse({
			status: 'success',
			balance: {
				current_balance: '12.34',
			},
		});

		const response = await worker.fetch(createBalanceRequest(), env);
		const data = (await response.json()) as { balanceString: string };

		expect(response.status).toBe(200);
		expect(data).toEqual({
			balanceString: 'CAD 12.34',
		});

		const requestedUrl = new URL(String(mockFetch.mock.calls[0]?.[0]));
		expect(requestedUrl.searchParams.get('method')).toBe('getBalance');
		expect(requestedUrl.searchParams.get('content_type')).toBe('json');
		expect(requestedUrl.searchParams.get('api_username')).toBe('test@voip.ms');
		expect(requestedUrl.searchParams.get('api_password')).toBe('api-password');
	});

	test('uses configured currency with a zero balance', async () => {
		mockVoipMsResponse({
			status: 'success',
			balance: {
				current_balance: '0.00',
			},
		});

		const response = await worker.fetch(createBalanceRequest(), {
			...env,
			CURRENCY: 'USD',
		});
		const data = (await response.json()) as { balanceString: string };

		expect(response.status).toBe(200);
		expect(data.balanceString).toBe('USD 0.00');
	});

	test('returns 502 when VoIP.ms rejects credentials', async () => {
		mockVoipMsResponse({
			status: 'invalid_credentials',
			message: 'Invalid username or password',
		});

		const response = await worker.fetch(createBalanceRequest(), env);
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(502);
		expect(data.message).toBe('Failed to retrieve balance');
	});

	test('returns 502 when VoIP.ms returns malformed data', async () => {
		mockVoipMsResponse({
			status: 'success',
			balance: {
				current_balance: 'not-a-number',
			},
		});

		const response = await worker.fetch(createBalanceRequest(), env);
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(502);
		expect(data.message).toBe('Failed to retrieve balance');
	});

	test('returns 502 when the upstream request fails', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error('network unavailable');
		}) as typeof fetch;

		const response = await worker.fetch(createBalanceRequest(), env);
		const data = (await response.json()) as ErrorResponse;

		expect(response.status).toBe(502);
		expect(data.message).toBe('Failed to retrieve balance');
	});
});

describe('VoIP.ms response parsing', () => {
	test('parses string and numeric balances', () => {
		expect(parseVoipMsBalance({ status: 'success', balance: { current_balance: '42.5' } })).toBe('42.50');
		expect(parseVoipMsBalance({ status: 'success', balance: { current_balance: 3 } })).toBe('3.00');
	});

	test('handles VoIP.ms IP allowlist errors', () => {
		expect(() => parseVoipMsBalance({ status: 'ip_not_enabled' })).toThrow(VoipMsError);
	});

	test('rejects non-object responses', () => {
		expect(() => parseVoipMsBalance(null)).toThrow(VoipMsError);
	});
});
