import { createVoipMsClient } from '../api/voipms.js';
import { generateAccountXml, generateErrorXml } from './xml-generator.js';
import { extractCredentials } from '../security/auth.js';
import { isAccountLocked, recordFailedAttempt, clearFailedAttempts } from '../security/brute-force.js';
import { logAuthAttempt, logAccountLocked, logProvisionRequest } from '../security/audit-log.js';
import { getClientIp } from '../security/rate-limiter.js';
import { debugLog, createXmlResponse } from '../utils/helpers.js';
import type { Env } from '../types.js';

// ============================================================================
// Provisioning Handler
// ============================================================================

export interface ProvisioningContext {
	request: Request;
	env: Env;
	debug: boolean;
}

/**
 * Handle provisioning requests (both initial and re-provisioning)
 *
 * Initial provisioning: User enters VoIP.ms API credentials in Groundwire
 * Re-provisioning: Groundwire uses stored credentials to refresh config
 */
export async function handleProvision(ctx: ProvisioningContext): Promise<Response> {
	const { request, env, debug } = ctx;
	const clientIp = getClientIp(request);
	const userAgent = request.headers.get('user-agent');

	debugLog(
		'Handling provisioning request',
		{
			method: request.method,
			clientIp,
			userAgent,
		},
		debug,
	);

	// Extract credentials from request
	const credentials = await extractCredentials(request, debug);

	if (!credentials) {
		debugLog('No credentials provided', null, debug);
		logAuthAttempt(clientIp, userAgent, '/provision', undefined, false);
		return createXmlResponse(generateErrorXml('Authentication required. Provide VoIP.ms API credentials.'), 401);
	}

	const { username, password } = credentials;

	// Check brute force protection
	const isLocked = await isAccountLocked(username, env.SECURITY_KV, undefined, debug);
	if (isLocked) {
		logAccountLocked(clientIp, userAgent, '/provision', username);
		return createXmlResponse(generateErrorXml('Account temporarily locked due to too many failed attempts.'), 429);
	}

	// Validate credentials against VoIP.ms API
	const apiClient = createVoipMsClient(username, password, debug);

	try {
		// Try to fetch provisioning data - this validates credentials
		const provisioningData = await apiClient.getProvisioningData();

		// Clear any failed attempts on successful auth
		await clearFailedAttempts(username, env.SECURITY_KV, debug);

		// Log successful auth
		logAuthAttempt(clientIp, userAgent, '/provision', username, true);

		// Generate the worker base URL
		const workerBaseUrl = env.WORKER_BASE_URL || `https://${request.headers.get('host')}`;

		// Generate Account XML
		const xml = generateAccountXml(provisioningData.subAccounts, provisioningData.dids, {
			workerBaseUrl,
			apiUsername: username,
			apiPassword: password,
		});

		// Log provisioning request
		logProvisionRequest(clientIp, userAgent, username, provisioningData.subAccounts.length);

		debugLog(
			'Provisioning successful',
			{
				subAccountCount: provisioningData.subAccounts.length,
				didCount: provisioningData.dids.length,
			},
			debug,
		);

		return createXmlResponse(xml, 200);
	} catch (error) {
		// Record failed attempt
		const isNowLocked = await recordFailedAttempt(username, env.SECURITY_KV, undefined, debug);

		// Log failed auth
		logAuthAttempt(clientIp, userAgent, '/provision', username, false);

		if (isNowLocked) {
			logAccountLocked(clientIp, userAgent, '/provision', username);
		}

		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		debugLog('Provisioning failed', { error: errorMessage }, debug);

		// Return generic error to avoid leaking information
		return createXmlResponse(generateErrorXml('Authentication failed. Check your VoIP.ms API credentials.'), 401);
	}
}
