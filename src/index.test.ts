import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import worker, {
	validateUserAgent,
	parseBearerToken,
	parseBasicAuth,
	secureCompare,
	escapeXml,
	maskSensitive,
	generateAccountXml,
	CONSTANTS,
	AppError,
	AuthenticationError,
	IpNotEnabledError,
	MethodNotAllowedError,
	RateLimitError,
	BruteForceError,
	type BalanceResponse,
	type ErrorResponse,
} from './index.js';

// Type for our test environment
type TestEnv = Record<string, string | undefined>;

describe('Groundwire Provisioning Service', () => {
	let env: TestEnv;
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		env = {
			CURRENCY: 'CAD',
			DEBUG: 'false',
		};

		// Store original fetch
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		// Restore original fetch after each test
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	// =========================================================================
	// Health Check Tests
	// =========================================================================

	describe('Health Check Endpoint', () => {
		test('should return health status without authentication', async () => {
			const request = new Request('https://example.com/health', {
				headers: {
					'User-Agent': 'Mozilla/5.0',
				},
			});

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as { status: string; version: string; timestamp: string };

			expect(response.status).toBe(200);
			expect(data.status).toBe('healthy');
			expect(data.version).toBe(CONSTANTS.VERSION);
			expect(data.timestamp).toBeDefined();
		});

		test('should return health status for any HTTP method', async () => {
			const request = new Request('https://example.com/health', {
				method: 'POST',
			});

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as { status: string };

			expect(response.status).toBe(200);
			expect(data.status).toBe('healthy');
		});

		test('should return health status at root path', async () => {
			const request = new Request('https://example.com/', {
				method: 'GET',
				headers: { 'User-Agent': 'Groundwire/1.0' },
			});

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as { status: string };

			expect(response.status).toBe(200);
			expect(data.status).toBe('healthy');
		});
	});

	// =========================================================================
	// User-Agent Validation Tests
	// =========================================================================

	describe('User-Agent Validation', () => {
		test('should reject requests without Groundwire user agent on /balance', async () => {
			const credentials = btoa('user@email.com:password');
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'Mozilla/5.0',
					Authorization: `Basic ${credentials}`,
				},
			});

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as ErrorResponse;

			expect(response.status).toBe(401);
			expect(data.error).toBe(true);
			expect(data.message).toBe('Unauthorized');
		});

		test('should accept requests with Groundwire user agent', async () => {
			const credentials = btoa('user@email.com:password');
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'Groundwire/1.0',
					Authorization: `Basic ${credentials}`,
				},
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					return new Response(
						JSON.stringify({
							status: 'success',
							balance: { current_balance: '12.34' },
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as BalanceResponse;

			expect(response.status).toBe(200);
			expect(data.balanceString).toBe('CAD 12.34');
			expect(data.balance).toBe(12.34);
			expect(data.currency).toBe('CAD');
		});

		test('should accept CloudSoftphone user agent', async () => {
			const credentials = btoa('user@email.com:password');
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'CloudSoftphone/1.0',
					Authorization: `Basic ${credentials}`,
				},
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					return new Response(
						JSON.stringify({
							status: 'success',
							balance: { current_balance: '15.00' },
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(200);
		});

		test('should accept Acrobits user agent', async () => {
			const credentials = btoa('user@email.com:password');
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'Acrobits Softphone/1.0',
					Authorization: `Basic ${credentials}`,
				},
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					return new Response(
						JSON.stringify({
							status: 'success',
							balance: { current_balance: '20.00' },
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(200);
		});

		test('should reject XSS attempts in user agent', async () => {
			const maliciousRequest = new Request('https://example.com/balance', {
				headers: { 'User-Agent': 'Groundwire/<script>alert("xss")</script>' },
			});

			const response = await worker.fetch(maliciousRequest, env);
			const data = (await response.json()) as ErrorResponse;

			expect(response.status).toBe(401);
			expect(data.error).toBe(true);
			expect(data.message).toBe('Unauthorized');
		});

		test('should accept real Groundwire user agent with build info', async () => {
			const credentials = btoa('user@email.com:password');
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'Groundwire/25.2.34 (build 2335157; iOS 18.6.2; arm64-neon)',
					Authorization: `Basic ${credentials}`,
				},
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					return new Response(
						JSON.stringify({
							status: 'success',
							balance: { current_balance: '42.50' },
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(200);
		});
	});

	// =========================================================================
	// Balance Endpoint Tests
	// =========================================================================

	describe('Balance Endpoint', () => {
		test('should return balance with Basic Auth', async () => {
			const credentials = btoa('api_user@email.com:api_password');
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'Groundwire/1.0',
					Authorization: `Basic ${credentials}`,
				},
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					expect(urlStr).toContain('api_username=api_user%40email.com');
					return new Response(
						JSON.stringify({
							status: 'success',
							balance: { current_balance: '99.99' },
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as BalanceResponse;

			expect(response.status).toBe(200);
			expect(data.balanceString).toBe('CAD 99.99');
			expect(data.balance).toBe(99.99);
			expect(data.currency).toBe('CAD');
			expect(data.timestamp).toBeDefined();
		});

		test('should reject balance request without credentials', async () => {
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'Groundwire/1.0',
				},
			});

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(401);
		});

		test('should reject POST method on balance endpoint', async () => {
			const credentials = btoa('user@email.com:password');
			const request = new Request('https://example.com/balance', {
				method: 'POST',
				headers: {
					'User-Agent': 'Groundwire/1.0',
					Authorization: `Basic ${credentials}`,
				},
			});

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as ErrorResponse;

			expect(response.status).toBe(405);
			expect(data.message).toBe('Method POST not allowed');
		});

		test('should handle VoIP API errors gracefully', async () => {
			const credentials = btoa('user@email.com:password');
			const request = new Request('https://example.com/balance', {
				headers: {
					'User-Agent': 'Groundwire/1.0',
					Authorization: `Basic ${credentials}`,
				},
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					return new Response(
						JSON.stringify({
							status: 'invalid_credentials',
							message: 'Invalid username or password',
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(502);
		});
	});

	// =========================================================================
	// Provisioning Endpoint Tests
	// =========================================================================

	describe('Provisioning Endpoint', () => {
		test('should reject provisioning without credentials', async () => {
			const request = new Request('https://example.com/provision', {
				method: 'POST',
				headers: {
					'User-Agent': 'Groundwire/1.0',
				},
			});

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(401);
			expect(response.headers.get('content-type')).toContain('application/xml');
		});

		test('should accept GET method for re-provisioning', async () => {
			const request = new Request('https://example.com/provision?username=test&password=test', {
				method: 'GET',
				headers: {
					'User-Agent': 'Groundwire/1.0',
				},
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					if (urlStr.includes('getSubAccounts')) {
						return new Response(
							JSON.stringify({
								status: 'success',
								accounts: [
									{
										account: '12345_test',
										password: 'sippass',
										pop: 'atlanta',
									},
								],
							}),
						);
					}
					if (urlStr.includes('getServersInfo')) {
						return new Response(
							JSON.stringify({
								status: 'success',
								servers: [
									{
										server_name: 'Atlanta',
										server_shortname: 'ATL',
										server_hostname: 'atlanta.voip.ms',
										server_ip: '1.2.3.4',
										server_country: 'US',
										server_pop: 'atlanta',
									},
								],
							}),
						);
					}
					if (urlStr.includes('getDIDsInfo')) {
						return new Response(
							JSON.stringify({
								status: 'success',
								dids: [
									{
										did: '5551234567',
										description: 'Main Line',
									},
								],
							}),
						);
					}
					return new Response(
						JSON.stringify({
							status: 'success',
							balance: { current_balance: '10.00' },
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('application/xml');
		});

		test('should accept POST method for initial provisioning', async () => {
			const request = new Request('https://example.com/provision', {
				method: 'POST',
				headers: {
					'User-Agent': 'Groundwire/1.0',
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: 'username=test@email.com&password=apipassword',
			});

			globalThis.fetch = async (url: RequestInfo | URL) => {
				const urlStr = url.toString();
				if (urlStr.includes('voip.ms')) {
					if (urlStr.includes('getSubAccounts')) {
						return new Response(
							JSON.stringify({
								status: 'success',
								accounts: [
									{
										account: '12345_test',
										password: 'sippass',
										pop: 'atlanta',
									},
								],
							}),
						);
					}
					if (urlStr.includes('getServersInfo')) {
						return new Response(
							JSON.stringify({
								status: 'success',
								servers: [
									{
										server_name: 'Atlanta',
										server_shortname: 'ATL',
										server_hostname: 'atlanta.voip.ms',
										server_ip: '1.2.3.4',
										server_country: 'US',
										server_pop: 'atlanta',
									},
								],
							}),
						);
					}
					if (urlStr.includes('getDIDsInfo')) {
						return new Response(JSON.stringify({ status: 'success', dids: [] }));
					}
					return new Response(
						JSON.stringify({
							status: 'success',
							balance: { current_balance: '10.00' },
						}),
					);
				}
				throw new Error('Unexpected fetch call');
			};

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(200);

			const xml = await response.text();
			expect(xml).toContain('<?xml version="1.0"');
			expect(xml).toContain('<account>');
			expect(xml).toContain('<username>12345_test</username>');
			expect(xml).toContain('<password>sippass</password>');
			expect(xml).toContain('<host>atlanta.voip.ms</host>');
		});

		test('should reject PUT method on provision endpoint', async () => {
			const request = new Request('https://example.com/provision', {
				method: 'PUT',
				headers: {
					'User-Agent': 'Groundwire/1.0',
				},
			});

			const response = await worker.fetch(request, env);
			expect(response.status).toBe(405);
		});
	});

	// =========================================================================
	// Utility Function Tests
	// =========================================================================

	describe('Secure Compare Function', () => {
		test('should return true for matching strings', () => {
			expect(secureCompare('abc', 'abc')).toBe(true);
			expect(secureCompare('', '')).toBe(true);
			expect(secureCompare('longer-token-here', 'longer-token-here')).toBe(true);
		});

		test('should return false for non-matching strings', () => {
			expect(secureCompare('abc', 'abd')).toBe(false);
			expect(secureCompare('abc', 'ab')).toBe(false);
			expect(secureCompare('abc', 'abcd')).toBe(false);
			expect(secureCompare('', 'a')).toBe(false);
		});

		test('should handle different length strings', () => {
			expect(secureCompare('short', 'much-longer-string')).toBe(false);
			expect(secureCompare('much-longer-string', 'short')).toBe(false);
		});
	});

	describe('Validate User Agent Function', () => {
		test('should return false for null user agent', () => {
			expect(validateUserAgent(null)).toBe(false);
		});

		test('should return false for non-Groundwire user agent', () => {
			expect(validateUserAgent('Mozilla/5.0')).toBe(false);
		});

		test('should return true for valid Groundwire user agent', () => {
			expect(validateUserAgent('Groundwire/1.0')).toBe(true);
			expect(validateUserAgent('Groundwire/25.2.34 (build 2335157; iOS 18.6.2; arm64-neon)')).toBe(true);
		});

		test('should return true for CloudSoftphone user agent', () => {
			expect(validateUserAgent('CloudSoftphone/1.0')).toBe(true);
		});

		test('should return true for Acrobits user agent', () => {
			expect(validateUserAgent('Acrobits Softphone/1.0')).toBe(true);
		});

		test('should return false for user agent exceeding max length', () => {
			const longUserAgent = 'Groundwire/' + 'a'.repeat(200);
			expect(validateUserAgent(longUserAgent)).toBe(false);
		});

		test('should return false for user agent with invalid characters', () => {
			expect(validateUserAgent('Groundwire/<script>')).toBe(false);
			expect(validateUserAgent('Groundwire/1.0&foo=bar')).toBe(false);
		});
	});

	describe('Parse Bearer Token Function', () => {
		test('should return null for null header', () => {
			expect(parseBearerToken(null)).toBe(null);
		});

		test('should return null for non-Bearer header', () => {
			expect(parseBearerToken('Basic abc123')).toBe(null);
		});

		test('should return token for valid Bearer header', () => {
			expect(parseBearerToken('Bearer my-token')).toBe('my-token');
		});

		test('should trim whitespace from token', () => {
			expect(parseBearerToken('Bearer   token-with-spaces   ')).toBe('token-with-spaces');
		});

		test('should return null for empty Bearer token', () => {
			expect(parseBearerToken('Bearer ')).toBe(null);
			expect(parseBearerToken('Bearer    ')).toBe(null);
		});
	});

	describe('Parse Basic Auth Function', () => {
		test('should return null for null header', () => {
			expect(parseBasicAuth(null)).toBe(null);
		});

		test('should return null for non-Basic header', () => {
			expect(parseBasicAuth('Bearer token')).toBe(null);
		});

		test('should parse valid Basic auth', () => {
			const credentials = btoa('user:password');
			const result = parseBasicAuth(`Basic ${credentials}`);
			expect(result).toEqual({ username: 'user', password: 'password' });
		});

		test('should handle password with colons', () => {
			const credentials = btoa('user:pass:with:colons');
			const result = parseBasicAuth(`Basic ${credentials}`);
			expect(result).toEqual({ username: 'user', password: 'pass:with:colons' });
		});

		test('should return null for invalid base64', () => {
			expect(parseBasicAuth('Basic !!invalid!!')).toBe(null);
		});

		test('should return null for missing colon', () => {
			const noColon = btoa('userwithoutpassword');
			expect(parseBasicAuth(`Basic ${noColon}`)).toBe(null);
		});
	});

	describe('Escape XML Function', () => {
		test('should escape ampersands', () => {
			expect(escapeXml('foo & bar')).toBe('foo &amp; bar');
		});

		test('should escape angle brackets', () => {
			expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
		});

		test('should escape quotes', () => {
			expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;');
			expect(escapeXml("'apostrophe'")).toBe('&apos;apostrophe&apos;');
		});

		test('should handle multiple special characters', () => {
			expect(escapeXml('<a href="test">foo & bar</a>')).toBe('&lt;a href=&quot;test&quot;&gt;foo &amp; bar&lt;/a&gt;');
		});
	});

	describe('Mask Sensitive Function', () => {
		test('should mask strings longer than 3 characters', () => {
			expect(maskSensitive('password123')).toBe('pas***');
			expect(maskSensitive('user@email.com')).toBe('use***');
		});

		test('should return *** for short strings', () => {
			expect(maskSensitive('ab')).toBe('***');
			expect(maskSensitive('abc')).toBe('***');
		});
	});

	// =========================================================================
	// XML Generation Tests
	// =========================================================================

	describe('XML Generation', () => {
		test('should generate single account XML', () => {
			const xml = generateAccountXml(
				[
					{
						account: '12345_test',
						password: 'sippass',
						serverHostname: 'atlanta.voip.ms',
						serverPop: 'atlanta',
					},
				],
				[{ did: '5551234567' }],
				{
					workerBaseUrl: 'https://worker.example.com',
					apiUsername: 'api@user.com',
					apiPassword: 'apipass',
				},
			);

			expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
			expect(xml).toContain('<account>');
			expect(xml).not.toContain('<accounts>');
			expect(xml).toContain('<username>12345_test</username>');
			expect(xml).toContain('<password>sippass</password>');
			expect(xml).toContain('<host>atlanta.voip.ms</host>');
			expect(xml).toContain('VoIP.ms - 555-123-4567');
			expect(xml).toContain('<apiUser>api@user.com</apiUser>');
			expect(xml).toContain('<apiPass>apipass</apiPass>');
			expect(xml).toContain('https://worker.example.com/balance');
			expect(xml).toContain('https://worker.example.com/provision');
		});

		test('should generate multi-account XML', () => {
			const xml = generateAccountXml(
				[
					{ account: 'acc1', password: 'pass1', serverHostname: 'atl.voip.ms', serverPop: 'atlanta' },
					{ account: 'acc2', password: 'pass2', serverHostname: 'nyc.voip.ms', serverPop: 'newyork' },
				],
				[],
				{
					workerBaseUrl: 'https://worker.example.com',
					apiUsername: 'api@user.com',
					apiPassword: 'apipass',
				},
			);

			expect(xml).toContain('<accounts>');
			expect(xml).toContain('</accounts>');
			expect(xml.match(/<account>/g)?.length).toBe(2);
		});

		test('should generate empty accounts XML when no sub-accounts', () => {
			const xml = generateAccountXml([], [], {
				workerBaseUrl: 'https://worker.example.com',
				apiUsername: 'api@user.com',
				apiPassword: 'apipass',
			});

			expect(xml).toContain('<accounts>');
			expect(xml).toContain('</accounts>');
			expect(xml).not.toContain('<account>');
		});

		test('should escape special characters in XML', () => {
			const xml = generateAccountXml(
				[
					{
						account: 'user<script>',
						password: 'pass&word',
						description: '"Test" Account',
						serverHostname: 'test.voip.ms',
						serverPop: 'test',
					},
				],
				[],
				{
					workerBaseUrl: 'https://worker.example.com',
					apiUsername: 'api@user.com',
					apiPassword: 'apipass',
				},
			);

			expect(xml).toContain('&lt;script&gt;');
			expect(xml).toContain('pass&amp;word');
			expect(xml).toContain('&quot;Test&quot;');
		});
	});

	// =========================================================================
	// Error Class Tests
	// =========================================================================

	describe('Error Classes', () => {
		test('should create AppError with correct properties', () => {
			const error = new AppError('Test error', 400, 'TEST_ERROR');
			expect(error.message).toBe('Test error');
			expect(error.statusCode).toBe(400);
			expect(error.code).toBe('TEST_ERROR');
			expect(error.name).toBe('AppError');
		});

		test('should create AuthenticationError with default message', () => {
			const error = new AuthenticationError();
			expect(error.message).toBe('Authentication required');
			expect(error.statusCode).toBe(401);
			expect(error.code).toBe('AUTHENTICATION_ERROR');
		});

		test('should create IpNotEnabledError with IP in message', () => {
			const error = new IpNotEnabledError('192.168.1.1');
			expect(error.message).toContain('192.168.1.1');
			expect(error.statusCode).toBe(403);
			expect(error.code).toBe('IP_NOT_ENABLED');
		});

		test('should create MethodNotAllowedError with method in message', () => {
			const error = new MethodNotAllowedError('POST');
			expect(error.message).toBe('Method POST not allowed');
			expect(error.statusCode).toBe(405);
			expect(error.code).toBe('METHOD_NOT_ALLOWED');
		});

		test('should create RateLimitError with correct status code', () => {
			const error = new RateLimitError();
			expect(error.statusCode).toBe(429);
			expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
		});

		test('should create BruteForceError with correct status code', () => {
			const error = new BruteForceError();
			expect(error.statusCode).toBe(429);
			expect(error.code).toBe('ACCOUNT_LOCKED');
		});
	});

	// =========================================================================
	// Constants Tests
	// =========================================================================

	describe('Constants', () => {
		test('should have correct constant values', () => {
			expect(CONSTANTS.GROUNDWIRE_USER_AGENT_PREFIX).toBe('Groundwire/');
			expect(CONSTANTS.USER_AGENT_MAX_LENGTH).toBe(200);
			expect(CONSTANTS.BEARER_PREFIX).toBe('Bearer ');
			expect(CONSTANTS.DEFAULT_CURRENCY).toBe('USD');
			expect(CONSTANTS.VOIP_MS_STUN_SERVER).toBe('stun.voip.ms:3478');
			expect(CONSTANTS.DEFAULT_VOICEMAIL_NUMBER).toBe('*97');
		});
	});

	// =========================================================================
	// Not Found Tests
	// =========================================================================

	describe('Not Found', () => {
		test('should return 404 for unknown paths', async () => {
			const request = new Request('https://example.com/unknown', {
				headers: { 'User-Agent': 'Groundwire/1.0' },
			});

			const response = await worker.fetch(request, env);
			const data = (await response.json()) as ErrorResponse;

			expect(response.status).toBe(404);
			expect(data.error).toBe(true);
			expect(data.message).toBe('Not found');
		});
	});
});
