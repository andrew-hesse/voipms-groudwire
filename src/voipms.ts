const VOIP_MS_API_URL = 'https://voip.ms/api/v1/rest.php';
const WORKER_USER_AGENT = 'Cloudflare-Worker/1.0';
const DEFAULT_TIMEOUT_MS = 5000;

export interface VoipMsCredentials {
	username: string;
	password: string;
}

export type VoipMsErrorCode = 'http_error' | 'api_error' | 'ip_not_enabled' | 'invalid_response' | 'timeout' | 'network_error';

export class VoipMsError extends Error {
	constructor(
		public readonly code: VoipMsErrorCode,
		message: string,
		public readonly statusCode: number = code === 'timeout' ? 504 : 502,
	) {
		super(message);
		this.name = 'VoipMsError';
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readUpstreamMessage(data: Record<string, unknown>): string | undefined {
	return typeof data.message === 'string' && data.message.trim() ? data.message.trim() : undefined;
}

export function parseVoipMsBalance(data: unknown): string {
	if (!isRecord(data)) {
		throw new VoipMsError('invalid_response', 'VoIP.ms response was not an object');
	}

	const status = data.status;
	if (typeof status !== 'string' || !status) {
		throw new VoipMsError('invalid_response', 'VoIP.ms response did not include a status');
	}

	if (status === 'ip_not_enabled') {
		throw new VoipMsError('ip_not_enabled', 'VoIP.ms API access is not enabled for this Worker IP');
	}

	if (status !== 'success') {
		const message = readUpstreamMessage(data);
		throw new VoipMsError('api_error', message ? `VoIP.ms API returned ${status}: ${message}` : `VoIP.ms API returned ${status}`);
	}

	if (!isRecord(data.balance)) {
		throw new VoipMsError('invalid_response', 'VoIP.ms response did not include balance data');
	}

	const rawBalance = data.balance.current_balance;
	if ((typeof rawBalance !== 'string' && typeof rawBalance !== 'number') || String(rawBalance).trim() === '') {
		throw new VoipMsError('invalid_response', 'VoIP.ms response included an invalid balance value');
	}

	const balance = Number(rawBalance);
	if (!Number.isFinite(balance)) {
		throw new VoipMsError('invalid_response', 'VoIP.ms response included a non-numeric balance value');
	}

	return balance.toFixed(2);
}

export async function fetchVoipMsBalance(credentials: VoipMsCredentials, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
	const url = new URL(VOIP_MS_API_URL);
	url.searchParams.set('content_type', 'json');
	url.searchParams.set('api_username', credentials.username);
	url.searchParams.set('api_password', credentials.password);
	url.searchParams.set('method', 'getBalance');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				'User-Agent': WORKER_USER_AGENT,
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new VoipMsError('http_error', `VoIP.ms returned HTTP ${response.status}`);
		}

		return parseVoipMsBalance(await response.json());
	} catch (error) {
		if (error instanceof VoipMsError) {
			throw error;
		}

		if (controller.signal.aborted) {
			throw new VoipMsError('timeout', 'VoIP.ms balance request timed out');
		}

		const message = error instanceof Error ? error.message : 'Unknown network error';
		throw new VoipMsError('network_error', `Failed to reach VoIP.ms: ${message}`);
	} finally {
		clearTimeout(timeout);
	}
}
