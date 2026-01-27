import { EnvSchema, type HealthResponse } from './types.js';
import { CONSTANTS } from './utils/constants.js';
import { debugLog, validateUserAgent, createJsonResponse, createErrorResponse } from './utils/helpers.js';
import { AppError } from './utils/errors.js';
import { checkRateLimit, getClientIp } from './security/rate-limiter.js';
import { logRateLimitExceeded } from './security/audit-log.js';
import { validateBearerAuth } from './security/auth.js';
import { handleProvision } from './provisioning/handler.js';
import { handleBalance } from './balance/handler.js';

// ============================================================================
// Health Check Handler
// ============================================================================

function handleHealth(): Response {
	const response: HealthResponse = {
		status: 'healthy',
		timestamp: new Date().toISOString(),
		version: CONSTANTS.VERSION,
	};
	return createJsonResponse(response);
}

// ============================================================================
// Request Router
// ============================================================================

async function handleRequest(request: Request, rawEnv: Record<string, unknown>): Promise<Response> {
	const url = new URL(request.url);
	const pathname = url.pathname;

	// Health check - no auth required, works even without env config
	if (pathname === '/health') {
		return handleHealth();
	}

	// Parse and validate environment
	const envResult = EnvSchema.safeParse(rawEnv);
	if (!envResult.success) {
		console.error('Environment validation failed:', envResult.error.issues);
		return createErrorResponse('Server configuration error', 500);
	}

	const env = envResult.data;
	const debug = env.DEBUG;
	const clientIp = getClientIp(request);
	const userAgent = request.headers.get('user-agent');

	debugLog(
		'INCOMING REQUEST',
		{
			pathname,
			method: request.method,
			clientIp,
			userAgent,
		},
		debug,
	);

	// Helper to check rate limit (only called for valid Groundwire requests)
	const checkRateLimitForRequest = async (): Promise<Response | null> => {
		const rateLimitConfig = {
			maxRequests: env.RATE_LIMIT_REQUESTS,
			windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
		};
		const withinRateLimit = await checkRateLimit(clientIp, env.SECURITY_KV, rateLimitConfig, debug);
		if (!withinRateLimit) {
			logRateLimitExceeded(clientIp, userAgent, pathname);
			return createErrorResponse('Too many requests', 429);
		}
		return null;
	};

	// Helper to validate Bearer token auth
	const validateAuth = (): Response | null => {
		const authHeader = request.headers.get('authorization');
		if (!validateBearerAuth(authHeader, env.AUTH_TOKEN, debug)) {
			debugLog('Bearer token validation failed', null, debug);
			return createErrorResponse('Unauthorized', 401);
		}
		return null;
	};

	// Parse provision route: /provision/1, /provision/2, etc.
	const provisionMatch = pathname.match(/^\/provision\/(\d+)$/);

	try {
		// Route to appropriate handler
		if (provisionMatch && provisionMatch[1]) {
			const accountIndex = parseInt(provisionMatch[1], 10);

			// Provisioning supports GET (re-provision) and POST (initial)
			if (request.method !== 'GET' && request.method !== 'POST') {
				return createErrorResponse(`Method ${request.method} not allowed`, 405);
			}

			// User-Agent validation BEFORE rate limiting (don't waste KV on garbage requests)
			if (!validateUserAgent(userAgent)) {
				debugLog('User-agent validation failed for provisioning', { userAgent }, debug);
				return createErrorResponse('Unauthorized', 401);
			}

			// Validate Bearer token
			const authResponse = validateAuth();
			if (authResponse) return authResponse;

			// Rate limit only valid Groundwire requests
			const rateLimitResponse = await checkRateLimitForRequest();
			if (rateLimitResponse) return rateLimitResponse;

			return handleProvision({ request, env, debug, accountIndex });
		}

		switch (pathname) {
			case '/balance': {
				// Balance only supports GET
				if (request.method !== 'GET') {
					return createErrorResponse(`Method ${request.method} not allowed`, 405);
				}

				// User-Agent validation BEFORE rate limiting (don't waste KV on garbage requests)
				if (!validateUserAgent(userAgent)) {
					debugLog('User-agent validation failed for balance', { userAgent }, debug);
					return createErrorResponse('Unauthorized', 401);
				}

				// Validate Bearer token
				const authResponse = validateAuth();
				if (authResponse) return authResponse;

				// Rate limit only valid Groundwire requests
				const rateLimitResponse = await checkRateLimitForRequest();
				if (rateLimitResponse) return rateLimitResponse;

				return handleBalance({ request, env, debug });
			}

			case '/': {
				// Root path - show health info
				if (request.method !== 'GET') {
					return createErrorResponse(`Method ${request.method} not allowed`, 405);
				}
				return handleHealth();
			}

			default: {
				return createErrorResponse('Not found', 404);
			}
		}
	} catch (error) {
		if (error instanceof AppError) {
			debugLog(
				'Request handling error',
				{
					errorMessage: error.message,
					errorCode: error.code,
					statusCode: error.statusCode,
				},
				debug,
			);
			return createErrorResponse(error.message, error.statusCode);
		}

		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Unexpected error in handleRequest:', errorMessage);
		debugLog(
			'Unexpected error',
			{
				errorMessage,
				errorType: error instanceof Error ? error.constructor.name : typeof error,
			},
			debug,
		);

		return createErrorResponse('Service temporarily unavailable', 503);
	}
}

// ============================================================================
// Worker Export
// ============================================================================

export default {
	async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
		return handleRequest(request, env);
	},
};

// ============================================================================
// Exports for Testing
// ============================================================================

export { CONSTANTS } from './utils/constants.js';
export {
	AppError,
	AuthenticationError,
	AuthorizationError,
	ConfigurationError,
	IpNotEnabledError,
	InvalidDataError,
	RateLimitError,
	BruteForceError,
	MethodNotAllowedError,
	NotFoundError,
	ValidationError,
} from './utils/errors.js';
export {
	debugLog,
	secureCompare,
	maskSensitive,
	validateUserAgent,
	getMyIpAddress,
	escapeXml,
	createJsonResponse,
	createXmlResponse,
	createErrorResponse,
} from './utils/helpers.js';
export { parseBasicAuth, parseBearerToken, validateBearerAuth, extractCredentials } from './security/auth.js';
export { checkRateLimit, getClientIp } from './security/rate-limiter.js';
export { isAccountLocked, recordFailedAttempt, clearFailedAttempts } from './security/brute-force.js';
export { VoipMsApiClient, createVoipMsClient } from './api/voipms.js';
export { generateAccountXml, generateErrorXml } from './provisioning/xml-generator.js';
export { EnvSchema, type Env, type BalanceResponse, type HealthResponse } from './types.js';
export type { ErrorResponse } from './utils/helpers.js';
