import { CONSTANTS } from '../utils/constants.js';
import { debugLog, secureCompare } from '../utils/helpers.js';

// ============================================================================
// Authentication Utilities
// ============================================================================

export interface BasicAuthCredentials {
	username: string;
	password: string;
}

/**
 * Parse Basic Authentication header
 * Returns credentials if valid, null otherwise
 */
export function parseBasicAuth(authHeader: string | null): BasicAuthCredentials | null {
	if (!authHeader || !authHeader.startsWith(CONSTANTS.BASIC_PREFIX)) {
		return null;
	}

	const encoded = authHeader.slice(CONSTANTS.BASIC_PREFIX.length).trim();
	if (!encoded) {
		return null;
	}

	try {
		const decoded = atob(encoded);
		const colonIndex = decoded.indexOf(':');

		if (colonIndex === -1) {
			return null;
		}

		const username = decoded.substring(0, colonIndex);
		const password = decoded.substring(colonIndex + 1);

		if (!username || !password) {
			return null;
		}

		return { username, password };
	} catch {
		// Invalid base64
		return null;
	}
}

/**
 * Parse Bearer token from Authorization header
 */
export function parseBearerToken(authHeader: string | null, debug: boolean = false): string | null {
	if (!authHeader) {
		debugLog('No authorization header provided by client', { authHeader: null }, debug);
		return null;
	}

	if (!authHeader.startsWith(CONSTANTS.BEARER_PREFIX)) {
		debugLog(
			'Authorization header is not Bearer token',
			{
				startsWithBearer: authHeader.startsWith(CONSTANTS.BEARER_PREFIX),
				headerType: authHeader.split(' ')[0],
			},
			debug,
		);
		return null;
	}

	const token = authHeader.slice(CONSTANTS.BEARER_PREFIX.length).trim();
	if (!token) {
		debugLog('Empty Bearer token', null, debug);
		return null;
	}

	debugLog('Bearer token parsed successfully', { tokenLength: token.length }, debug);
	return token;
}

/**
 * Validate Bearer token authentication
 * Returns true if valid, false otherwise
 */
export function validateBearerAuth(authHeader: string | null, expectedToken: string | undefined, debug: boolean = false): boolean {
	if (!expectedToken) {
		debugLog('Authentication not required - no token configured', { hasExpectedToken: false }, debug);
		return true;
	}

	debugLog(
		'Authentication IS REQUIRED - server expects Bearer token',
		{
			expectedTokenLength: expectedToken.length,
			clientProvidedAuthHeader: !!authHeader,
		},
		debug,
	);

	if (!authHeader) {
		debugLog(
			'CLIENT ERROR: Groundwire must provide Authorization header with Bearer token',
			{
				requiredFormat: 'Authorization: Bearer <your-token>',
				configureIn: 'Groundwire Settings > Advanced > Web Services > Balance Checker > Custom Headers',
			},
			debug,
		);
		return false;
	}

	const token = parseBearerToken(authHeader, debug);
	if (!token) {
		debugLog('AUTHENTICATION FAILED: Invalid authorization header format', null, debug);
		return false;
	}

	// Use constant-time comparison to prevent timing attacks
	const isValid = secureCompare(token, expectedToken);

	debugLog(
		'Token validation result',
		{
			providedTokenLength: token.length,
			tokenMatch: isValid,
		},
		debug,
	);

	return isValid;
}

/**
 * Extract credentials from request - supports multiple methods:
 * 1. Basic Auth header
 * 2. Query parameters (username, password)
 * 3. Form body (for POST requests)
 */
export async function extractCredentials(request: Request, debug: boolean = false): Promise<BasicAuthCredentials | null> {
	const authHeader = request.headers.get('authorization');

	// Try Basic Auth header first
	const basicAuth = parseBasicAuth(authHeader);
	if (basicAuth) {
		debugLog(
			'Credentials extracted from Basic Auth header',
			{
				usernameLength: basicAuth.username.length,
			},
			debug,
		);
		return basicAuth;
	}

	// Try query parameters
	const url = new URL(request.url);
	const queryUsername = url.searchParams.get('username');
	const queryPassword = url.searchParams.get('password');

	if (queryUsername && queryPassword) {
		debugLog(
			'Credentials extracted from query parameters',
			{
				usernameLength: queryUsername.length,
			},
			debug,
		);
		return { username: queryUsername, password: queryPassword };
	}

	// Try form body for POST requests
	if (request.method === 'POST') {
		const contentType = request.headers.get('content-type');

		if (contentType?.includes('application/x-www-form-urlencoded')) {
			try {
				const formData = await request.formData();
				const formUsername = formData.get('username');
				const formPassword = formData.get('password');

				if (typeof formUsername === 'string' && typeof formPassword === 'string') {
					debugLog(
						'Credentials extracted from form body',
						{
							usernameLength: formUsername.length,
						},
						debug,
					);
					return { username: formUsername, password: formPassword };
				}
			} catch {
				debugLog('Failed to parse form body', null, debug);
			}
		}

		if (contentType?.includes('application/json')) {
			try {
				const body = (await request.json()) as Record<string, unknown>;
				const jsonUsername = body.username;
				const jsonPassword = body.password;

				if (typeof jsonUsername === 'string' && typeof jsonPassword === 'string') {
					debugLog(
						'Credentials extracted from JSON body',
						{
							usernameLength: jsonUsername.length,
						},
						debug,
					);
					return { username: jsonUsername, password: jsonPassword };
				}
			} catch {
				debugLog('Failed to parse JSON body', null, debug);
			}
		}
	}

	debugLog('No credentials found in request', null, debug);
	return null;
}
