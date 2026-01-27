import { CONSTANTS } from './constants.js';

// ============================================================================
// Debug Logging
// ============================================================================

export function debugLog(message: string, data: Record<string, unknown> | null = null, debug: boolean = false): void {
	if (debug) {
		const timestamp = new Date().toISOString();
		if (data) {
			console.log(`[DEBUG ${timestamp}] ${message}:`, JSON.stringify(data, null, 2));
		} else {
			console.log(`[DEBUG ${timestamp}] ${message}`);
		}
	}
}

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
	if (a.length !== b.length) {
		// Still do the comparison to maintain constant time
		// but we know the result will be false
		let _result = 1;
		for (let i = 0; i < a.length; i++) {
			_result |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
		}
		return false;
	}

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

/**
 * Mask sensitive data for logging (show first 3 characters only)
 */
export function maskSensitive(value: string): string {
	if (value.length <= 3) {
		return '***';
	}
	return value.substring(0, 3) + '***';
}

// ============================================================================
// User-Agent Validation
// ============================================================================

/**
 * Check if a User-Agent is from an allowed Groundwire/Acrobits client
 */
export function validateUserAgent(userAgent: string | null): boolean {
	if (!userAgent) {
		return false;
	}

	const isAllowedClient =
		userAgent.includes(CONSTANTS.GROUNDWIRE_USER_AGENT_PREFIX) ||
		userAgent.includes(CONSTANTS.CLOUDSOFTPHONE_USER_AGENT_PREFIX) ||
		userAgent.includes(CONSTANTS.ACROBITS_USER_AGENT_PREFIX);

	return isAllowedClient && userAgent.length < CONSTANTS.USER_AGENT_MAX_LENGTH && CONSTANTS.USER_AGENT_PATTERN.test(userAgent);
}

// ============================================================================
// Network Utilities
// ============================================================================

export async function getMyIpAddress(debug: boolean = false): Promise<string> {
	try {
		debugLog('Fetching external IP address', null, debug);
		const response = await fetch(CONSTANTS.IP_CHECK_URL);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const ipAddress = await response.text();
		debugLog('External IP address fetched', { ip: ipAddress.trim() }, debug);
		return ipAddress.trim();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error fetching IP address:', errorMessage);
		debugLog('Failed to fetch IP address', { error: errorMessage }, debug);
		return 'unknown';
	}
}

// ============================================================================
// XML Utilities
// ============================================================================

/**
 * Escape special characters for XML content
 */
export function escapeXml(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ============================================================================
// Response Helpers
// ============================================================================

export interface ErrorResponse {
	error: true;
	message: string;
	timestamp: string;
}

export function createJsonResponse(body: unknown, status: number = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

export function createXmlResponse(body: string, status: number = 200): Response {
	return new Response(body, {
		status,
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

export function createErrorResponse(message: string, statusCode: number): Response {
	const body: ErrorResponse = {
		error: true,
		message,
		timestamp: new Date().toISOString(),
	};

	return createJsonResponse(body, statusCode);
}
