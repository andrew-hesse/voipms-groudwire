import { fetchVoipMsBalance, VoipMsError } from './voipms.js';

const VERSION = '1.0.0';
const DEFAULT_CURRENCY = 'CAD';
const GROUNDWIRE_USER_AGENT_PREFIX = 'Groundwire/';
const USER_AGENT_MAX_LENGTH = 200;
const USER_AGENT_PATTERN = /^[a-zA-Z0-9\s./\-_();]+$/;

export interface Env {
	VOIP_MS_USERNAME?: string;
	VOIP_MS_PASSWORD?: string;
	CURRENCY?: string;
	DEBUG?: string;
}

interface Config {
	voipMsUsername: string;
	voipMsPassword: string;
	currency: string;
	debug: boolean;
}

interface ErrorResponse {
	error: true;
	message: string;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function createJsonResponse(body: unknown, status: number = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

function createErrorResponse(message: string, status: number): Response {
	const body: ErrorResponse = {
		error: true,
		message,
	};

	return createJsonResponse(body, status);
}

function readConfig(env: Env): Config | null {
	if (!isNonEmptyString(env.VOIP_MS_USERNAME) || !isNonEmptyString(env.VOIP_MS_PASSWORD)) {
		return null;
	}

	return {
		voipMsUsername: env.VOIP_MS_USERNAME,
		voipMsPassword: env.VOIP_MS_PASSWORD,
		currency: isNonEmptyString(env.CURRENCY) ? env.CURRENCY.trim() : DEFAULT_CURRENCY,
		debug: env.DEBUG === 'true',
	};
}

function isGroundwireUserAgent(userAgent: string | null): boolean {
	return (
		typeof userAgent === 'string' &&
		userAgent.includes(GROUNDWIRE_USER_AGENT_PREFIX) &&
		userAgent.length < USER_AGENT_MAX_LENGTH &&
		USER_AGENT_PATTERN.test(userAgent)
	);
}

function debugLog(config: Config, message: string, data?: Record<string, unknown>): void {
	if (!config.debug) {
		return;
	}

	if (data) {
		console.log(`[debug] ${message}`, JSON.stringify(data));
		return;
	}

	console.log(`[debug] ${message}`);
}

function handleHealth(): Response {
	return createJsonResponse({
		status: 'healthy',
		version: VERSION,
		timestamp: new Date().toISOString(),
	});
}

async function handleBalance(request: Request, config: Config): Promise<Response> {
	if (!isGroundwireUserAgent(request.headers.get('user-agent'))) {
		return createErrorResponse('Unauthorized', 401);
	}

	try {
		debugLog(config, 'Fetching VoIP.ms balance');
		const balance = await fetchVoipMsBalance({
			username: config.voipMsUsername,
			password: config.voipMsPassword,
		});

		return createJsonResponse({
			balanceString: `${config.currency} ${balance}`,
		});
	} catch (error) {
		if (error instanceof VoipMsError) {
			console.error(`VoIP.ms balance error: ${error.code}`);
			debugLog(config, 'VoIP.ms balance error detail', {
				code: error.code,
				message: error.message,
			});
			return createErrorResponse(error.statusCode === 504 ? 'Balance provider timed out' : 'Failed to retrieve balance', error.statusCode);
		}

		console.error('Unexpected balance error');
		return createErrorResponse('Failed to retrieve balance', 502);
	}
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);

	if (url.pathname === '/health') {
		if (request.method !== 'GET') {
			return createErrorResponse(`Method ${request.method} not allowed`, 405);
		}

		return handleHealth();
	}

	if (url.pathname !== '/balance') {
		return createErrorResponse('Not found', 404);
	}

	if (request.method !== 'GET') {
		return createErrorResponse(`Method ${request.method} not allowed`, 405);
	}

	const config = readConfig(env);
	if (!config) {
		console.error('Worker is missing required secrets');
		return createErrorResponse('Server configuration error', 500);
	}

	return handleBalance(request, config);
}

export default {
	fetch(request: Request, env: Env): Promise<Response> {
		return handleRequest(request, env);
	},
};
