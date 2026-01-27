import { CONSTANTS } from '../utils/constants.js';
import { debugLog, getMyIpAddress } from '../utils/helpers.js';
import { InvalidDataError, IpNotEnabledError, AppError } from '../utils/errors.js';
import {
	VoipBalanceResponseSchema,
	VoipSubAccountsResponseSchema,
	VoipServersResponseSchema,
	VoipDIDsResponseSchema,
	type VoipSubAccount,
	type VoipServer,
	type VoipDID,
	type SubAccountWithServer,
	type ProvisioningData,
} from './schemas.js';

// ============================================================================
// VoIP.ms API Client
// ============================================================================

export class VoipMsApiClient {
	private readonly apiUrl = CONSTANTS.VOIP_MS_API_URL;
	private readonly userAgent = CONSTANTS.WORKER_USER_AGENT;

	constructor(
		private readonly username: string,
		private readonly password: string,
		private readonly debug: boolean = false,
	) {}

	/**
	 * Make an authenticated request to the VoIP.ms API
	 */
	private async makeRequest<T>(method: string, params: Record<string, string> = {}): Promise<T> {
		const url = new URL(this.apiUrl);
		url.searchParams.set('content_type', 'json');
		url.searchParams.set('api_username', this.username);
		url.searchParams.set('api_password', this.password);
		url.searchParams.set('method', method);

		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const maskedUrl = url.toString().replace(/api_password=[^&]+/, 'api_password=***');
		debugLog(`Making VoIP API request: ${method}`, { url: maskedUrl }, this.debug);

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				'User-Agent': this.userAgent,
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data: unknown = await response.json();
		return data as T;
	}

	/**
	 * Handle common API error statuses
	 */
	private async handleApiStatus(status: string, message?: string): Promise<void> {
		if (status === 'ip_not_enabled') {
			const ip = await getMyIpAddress(this.debug);
			throw new IpNotEnabledError(ip);
		}

		if (status !== 'success') {
			const errorMessage = message || 'Unknown error';
			debugLog('VoIP API error', { status, message: errorMessage }, this.debug);
			throw new InvalidDataError(`${errorMessage} (${status})`);
		}
	}

	/**
	 * Get account balance
	 */
	async getBalance(): Promise<string> {
		debugLog('Fetching balance', { username: this.username }, this.debug);

		try {
			const rawData = await this.makeRequest('getBalance');
			const parseResult = VoipBalanceResponseSchema.safeParse(rawData);

			if (!parseResult.success) {
				debugLog('Invalid API response format', { errors: parseResult.error.issues }, this.debug);
				throw new InvalidDataError('Invalid API response format');
			}

			const data = parseResult.data;
			await this.handleApiStatus(data.status, data.message);

			if (!data.balance?.current_balance) {
				debugLog('Invalid balance data structure', { balance: data.balance }, this.debug);
				throw new InvalidDataError('Invalid balance data in API response');
			}

			const balance = parseFloat(data.balance.current_balance);
			if (isNaN(balance)) {
				debugLog('Invalid balance value', { rawBalance: data.balance.current_balance }, this.debug);
				throw new InvalidDataError('Invalid balance value received');
			}

			const formattedBalance = balance.toFixed(2);
			debugLog('Balance retrieved', { balance: formattedBalance }, this.debug);

			return formattedBalance;
		} catch (error) {
			if (error instanceof AppError) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new InvalidDataError(`Failed to fetch balance: ${errorMessage}`);
		}
	}

	/**
	 * Get all sub-accounts for this VoIP.ms account
	 */
	async getSubAccounts(): Promise<VoipSubAccount[]> {
		debugLog('Fetching sub-accounts', { username: this.username }, this.debug);

		try {
			const rawData = await this.makeRequest('getSubAccounts');
			const parseResult = VoipSubAccountsResponseSchema.safeParse(rawData);

			if (!parseResult.success) {
				debugLog('Invalid API response format', { errors: parseResult.error.issues }, this.debug);
				throw new InvalidDataError('Invalid API response format');
			}

			const data = parseResult.data;
			await this.handleApiStatus(data.status, data.message);

			const accounts = data.accounts || [];
			debugLog('Sub-accounts retrieved', { count: accounts.length }, this.debug);

			return accounts;
		} catch (error) {
			if (error instanceof AppError) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new InvalidDataError(`Failed to fetch sub-accounts: ${errorMessage}`);
		}
	}

	/**
	 * Get available SIP servers
	 */
	async getServersInfo(): Promise<VoipServer[]> {
		debugLog('Fetching servers info', null, this.debug);

		try {
			const rawData = await this.makeRequest('getServersInfo');
			const parseResult = VoipServersResponseSchema.safeParse(rawData);

			if (!parseResult.success) {
				debugLog('Invalid API response format', { errors: parseResult.error.issues }, this.debug);
				throw new InvalidDataError('Invalid API response format');
			}

			const data = parseResult.data;
			await this.handleApiStatus(data.status, data.message);

			const servers = data.servers || [];
			debugLog('Servers retrieved', { count: servers.length }, this.debug);

			return servers;
		} catch (error) {
			if (error instanceof AppError) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new InvalidDataError(`Failed to fetch servers: ${errorMessage}`);
		}
	}

	/**
	 * Get DIDs (phone numbers) for this account
	 */
	async getDIDsInfo(): Promise<VoipDID[]> {
		debugLog('Fetching DIDs info', { username: this.username }, this.debug);

		try {
			const rawData = await this.makeRequest('getDIDsInfo');
			const parseResult = VoipDIDsResponseSchema.safeParse(rawData);

			if (!parseResult.success) {
				debugLog('Invalid API response format', { errors: parseResult.error.issues }, this.debug);
				throw new InvalidDataError('Invalid API response format');
			}

			const data = parseResult.data;
			await this.handleApiStatus(data.status, data.message);

			const dids = data.dids || [];
			debugLog('DIDs retrieved', { count: dids.length }, this.debug);

			return dids;
		} catch (error) {
			if (error instanceof AppError) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new InvalidDataError(`Failed to fetch DIDs: ${errorMessage}`);
		}
	}

	/**
	 * Validate credentials by attempting to fetch balance
	 * Returns true if credentials are valid, false otherwise
	 */
	async validateCredentials(): Promise<boolean> {
		try {
			await this.getBalance();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get all provisioning data needed to configure Groundwire
	 * This fetches sub-accounts, servers, and DIDs in parallel
	 */
	async getProvisioningData(): Promise<ProvisioningData> {
		debugLog('Fetching provisioning data', { username: this.username }, this.debug);

		// Fetch all data in parallel
		const [subAccounts, servers, dids] = await Promise.all([this.getSubAccounts(), this.getServersInfo(), this.getDIDsInfo()]);

		// Build a map of server POP codes to hostnames
		const serverMap = new Map<string, VoipServer>();
		for (const server of servers) {
			serverMap.set(server.server_pop, server);
		}

		// Match each sub-account with its configured server
		const subAccountsWithServers: SubAccountWithServer[] = subAccounts.map((account) => {
			const pop = account.pop || '';
			const server = serverMap.get(pop);

			// Determine server hostname with proper fallback
			let serverHostname: string;
			if (server?.server_hostname) {
				serverHostname = server.server_hostname;
			} else if (pop && pop.length > 0) {
				serverHostname = `${pop}.voip.ms`;
			} else {
				// No POP configured - use default server
				serverHostname = CONSTANTS.DEFAULT_SIP_SERVER;
			}

			debugLog('Sub-account server mapping', { account: account.account, pop, serverHostname }, this.debug);

			return {
				...account,
				serverHostname,
				serverPop: pop,
			};
		});

		debugLog(
			'Provisioning data assembled',
			{
				subAccountCount: subAccountsWithServers.length,
				didCount: dids.length,
				serverCount: servers.length,
			},
			this.debug,
		);

		return {
			subAccounts: subAccountsWithServers,
			dids,
			apiUsername: this.username,
		};
	}
}

// ============================================================================
// Factory function for creating API clients
// ============================================================================

export function createVoipMsClient(username: string, password: string, debug: boolean = false): VoipMsApiClient {
	return new VoipMsApiClient(username, password, debug);
}
