import { maskSensitive } from '../utils/helpers.js';

// ============================================================================
// Security Audit Logging
// ============================================================================

export type AuditEventType =
	| 'auth_attempt'
	| 'auth_success'
	| 'auth_failure'
	| 'rate_limit_exceeded'
	| 'account_locked'
	| 'provision_request'
	| 'balance_request';

export interface AuditLogEntry {
	event: AuditEventType;
	timestamp: string;
	username?: string;
	ip: string;
	userAgent: string | null;
	endpoint: string;
	success?: boolean;
	details?: Record<string, unknown>;
}

/**
 * Log a security audit event
 * Never logs passwords or full tokens
 */
export function auditLog(entry: AuditLogEntry): void {
	// Mask sensitive data
	const safeEntry = {
		...entry,
		username: entry.username ? maskSensitive(entry.username) : undefined,
	};

	console.log(JSON.stringify(safeEntry));
}

/**
 * Log an authentication attempt
 */
export function logAuthAttempt(
	ip: string,
	userAgent: string | null,
	endpoint: string,
	username: string | undefined,
	success: boolean,
): void {
	auditLog({
		event: success ? 'auth_success' : 'auth_failure',
		timestamp: new Date().toISOString(),
		username,
		ip,
		userAgent,
		endpoint,
		success,
	});
}

/**
 * Log a rate limit exceeded event
 */
export function logRateLimitExceeded(ip: string, userAgent: string | null, endpoint: string): void {
	auditLog({
		event: 'rate_limit_exceeded',
		timestamp: new Date().toISOString(),
		ip,
		userAgent,
		endpoint,
	});
}

/**
 * Log an account lockout event
 */
export function logAccountLocked(ip: string, userAgent: string | null, endpoint: string, username: string): void {
	auditLog({
		event: 'account_locked',
		timestamp: new Date().toISOString(),
		username,
		ip,
		userAgent,
		endpoint,
	});
}

/**
 * Log a provisioning request
 */
export function logProvisionRequest(ip: string, userAgent: string | null, username: string, subAccountCount: number): void {
	auditLog({
		event: 'provision_request',
		timestamp: new Date().toISOString(),
		username,
		ip,
		userAgent,
		endpoint: '/provision',
		success: true,
		details: { subAccountCount },
	});
}

/**
 * Log a balance check request
 */
export function logBalanceRequest(ip: string, userAgent: string | null, success: boolean): void {
	auditLog({
		event: 'balance_request',
		timestamp: new Date().toISOString(),
		ip,
		userAgent,
		endpoint: '/balance',
		success,
	});
}
