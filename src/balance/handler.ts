import { createVoipMsClient } from '../api/voipms.js';
import { logBalanceRequest } from '../security/audit-log.js';
import { getClientIp } from '../security/rate-limiter.js';
import { debugLog, createJsonResponse, createErrorResponse } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';
import type { Env, BalanceResponse } from '../types.js';

// ============================================================================
// Balance Caching
// ============================================================================

interface CachedBalance {
	balance: string;
	cachedAt: number;
}

async function getCachedBalance(cacheKey: string, kvNamespace: KVNamespace | undefined, debug: boolean = false): Promise<string | null> {
	if (!kvNamespace) {
		return null;
	}

	try {
		const cached = (await kvNamespace.get(cacheKey, 'json')) as CachedBalance | null;

		if (!cached) {
			debugLog('Cache miss', { cacheKey }, debug);
			return null;
		}

		const age = (Date.now() - cached.cachedAt) / 1000;

		if (age > CONSTANTS.CACHE_TTL_SECONDS) {
			debugLog('Cache expired', { cacheKey, age }, debug);
			return null;
		}

		debugLog('Cache hit', { cacheKey, balance: cached.balance, age }, debug);
		return cached.balance;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		debugLog('Cache read error', { error: errorMessage }, debug);
		return null;
	}
}

async function setCachedBalance(
	cacheKey: string,
	balance: string,
	kvNamespace: KVNamespace | undefined,
	debug: boolean = false,
): Promise<void> {
	if (!kvNamespace) {
		return;
	}

	try {
		const entry: CachedBalance = { balance, cachedAt: Date.now() };
		await kvNamespace.put(cacheKey, JSON.stringify(entry), {
			expirationTtl: CONSTANTS.CACHE_TTL_SECONDS * 2,
		});
		debugLog('Cache set', { cacheKey, balance }, debug);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		debugLog('Cache write error', { error: errorMessage }, debug);
	}
}

// ============================================================================
// Balance Handler
// ============================================================================

export interface BalanceContext {
	request: Request;
	env: Env;
	debug: boolean;
}

/**
 * Handle balance check requests
 * Uses VoIP.ms credentials stored in Cloudflare secrets
 * Auth is already validated at router level via Bearer token
 */
export async function handleBalance(ctx: BalanceContext): Promise<Response> {
	const { request, env, debug } = ctx;
	const clientIp = getClientIp(request);
	const userAgent = request.headers.get('user-agent');

	debugLog(
		'Handling balance request',
		{
			method: request.method,
			clientIp,
		},
		debug,
	);

	// Check cache first (keyed by VoIP.ms username)
	const cacheKey = `balance:${env.VOIP_MS_USERNAME}`;
	const cachedBalance = await getCachedBalance(cacheKey, env.BALANCE_CACHE, debug);

	if (cachedBalance !== null) {
		const response: BalanceResponse = {
			balanceString: `${env.CURRENCY} ${cachedBalance}`,
			balance: parseFloat(cachedBalance),
			currency: env.CURRENCY,
			timestamp: new Date().toISOString(),
		};
		logBalanceRequest(clientIp, userAgent, true);
		return createJsonResponse(response);
	}

	// Fetch fresh balance from VoIP.ms API using stored credentials
	try {
		const apiClient = createVoipMsClient(env.VOIP_MS_USERNAME, env.VOIP_MS_PASSWORD, debug);
		const balance = await apiClient.getBalance();

		// Cache the result
		await setCachedBalance(cacheKey, balance, env.BALANCE_CACHE, debug);

		const response: BalanceResponse = {
			balanceString: `${env.CURRENCY} ${balance}`,
			balance: parseFloat(balance),
			currency: env.CURRENCY,
			timestamp: new Date().toISOString(),
		};

		logBalanceRequest(clientIp, userAgent, true);
		debugLog('Balance retrieved successfully', { balance }, debug);

		return createJsonResponse(response);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		debugLog('Balance retrieval failed', { error: errorMessage }, debug);
		logBalanceRequest(clientIp, userAgent, false);

		return createErrorResponse('Failed to retrieve balance', 502);
	}
}
