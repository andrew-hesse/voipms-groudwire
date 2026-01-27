import { createVoipMsClient } from '../api/voipms.js';
import { generateAccountXml, generateErrorXml } from './xml-generator.js';
import { logProvisionRequest } from '../security/audit-log.js';
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
	accountIndex: number;
}

/**
 * Handle provisioning requests
 * Uses VoIP.ms credentials stored in Cloudflare secrets
 * Account index (1-based) selects which sub-account to provision
 */
export async function handleProvision(ctx: ProvisioningContext): Promise<Response> {
	const { request, env, debug, accountIndex } = ctx;
	const clientIp = getClientIp(request);
	const userAgent = request.headers.get('user-agent');

	debugLog(
		'Handling provisioning request',
		{
			method: request.method,
			clientIp,
			userAgent,
			accountIndex,
		},
		debug,
	);

	// Use stored VoIP.ms credentials
	const apiClient = createVoipMsClient(env.VOIP_MS_USERNAME, env.VOIP_MS_PASSWORD, debug);

	try {
		// Fetch provisioning data from VoIP.ms
		const provisioningData = await apiClient.getProvisioningData();

		debugLog(
			'Provisioning data fetched',
			{
				subAccountCount: provisioningData.subAccounts.length,
				didCount: provisioningData.dids.length,
				requestedIndex: accountIndex,
			},
			debug,
		);

		// Validate account index (1-based)
		if (accountIndex < 1 || accountIndex > provisioningData.subAccounts.length) {
			debugLog(
				'Invalid account index',
				{
					requestedIndex: accountIndex,
					availableAccounts: provisioningData.subAccounts.length,
				},
				debug,
			);
			return createXmlResponse(
				generateErrorXml(`Invalid account index. Available accounts: 1-${provisioningData.subAccounts.length}`),
				400,
			);
		}

		// Select the requested sub-account (convert to 0-based index)
		const selectedAccount = provisioningData.subAccounts[accountIndex - 1];

		// This should never happen after the bounds check, but TypeScript needs assurance
		if (!selectedAccount) {
			return createXmlResponse(generateErrorXml('Account not found'), 404);
		}

		// Generate the worker base URL
		const workerBaseUrl = env.WORKER_BASE_URL || `https://${request.headers.get('host')}`;

		// Generate Account XML for the single selected account
		const xml = generateAccountXml([selectedAccount], provisioningData.dids, {
			workerBaseUrl,
			accountIndex,
		});

		// Log provisioning request
		logProvisionRequest(clientIp, userAgent, selectedAccount.account, 1);

		debugLog(
			'Provisioning successful',
			{
				selectedAccount: selectedAccount.account,
				serverHostname: selectedAccount.serverHostname,
			},
			debug,
		);

		return createXmlResponse(xml, 200);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		debugLog('Provisioning failed', { error: errorMessage }, debug);

		return createXmlResponse(generateErrorXml('Failed to fetch account configuration from VoIP.ms'), 502);
	}
}
