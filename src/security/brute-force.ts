import { CONSTANTS } from '../utils/constants.js';
import { debugLog, maskSensitive } from '../utils/helpers.js';

// ============================================================================
// Brute Force Protection (Credential Lockout)
// ============================================================================

export interface BruteForceConfig {
	maxAttempts: number;
	lockoutSeconds: number;
}

interface LockoutEntry {
	failedAttempts: number;
	lastFailure: number;
	lockedUntil: number | null;
}

/**
 * Check if an account is currently locked out
 * Returns true if locked (request should be blocked), false if allowed
 */
export async function isAccountLocked(
	username: string,
	kvNamespace: KVNamespace | undefined,
	_config: BruteForceConfig = {
		maxAttempts: CONSTANTS.BRUTE_FORCE_MAX_ATTEMPTS,
		lockoutSeconds: CONSTANTS.BRUTE_FORCE_LOCKOUT_SECONDS,
	},
	debug: boolean = false,
): Promise<boolean> {
	if (!kvNamespace) {
		debugLog('Brute force protection disabled - no KV namespace configured', null, debug);
		return false;
	}

	const key = `lockout:${username}`;

	try {
		const stored = (await kvNamespace.get(key, 'json')) as LockoutEntry | null;

		if (!stored) {
			return false;
		}

		const now = Date.now();

		// Check if currently locked
		if (stored.lockedUntil && now < stored.lockedUntil) {
			const remainingSeconds = Math.ceil((stored.lockedUntil - now) / 1000);
			debugLog(
				'Account is locked',
				{
					username: maskSensitive(username),
					remainingSeconds,
				},
				debug,
			);
			return true;
		}

		// Lock has expired, but entry still exists
		return false;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Brute force check error:', errorMessage);
		debugLog('Brute force check failed, allowing request', { error: errorMessage }, debug);
		return false;
	}
}

/**
 * Record a failed authentication attempt
 * Returns true if account is now locked
 */
export async function recordFailedAttempt(
	username: string,
	kvNamespace: KVNamespace | undefined,
	config: BruteForceConfig = {
		maxAttempts: CONSTANTS.BRUTE_FORCE_MAX_ATTEMPTS,
		lockoutSeconds: CONSTANTS.BRUTE_FORCE_LOCKOUT_SECONDS,
	},
	debug: boolean = false,
): Promise<boolean> {
	if (!kvNamespace) {
		return false;
	}

	const key = `lockout:${username}`;
	const now = Date.now();

	try {
		const stored = (await kvNamespace.get(key, 'json')) as LockoutEntry | null;

		let entry: LockoutEntry;

		if (!stored || (stored.lockedUntil && now >= stored.lockedUntil)) {
			// No entry or lock expired - start fresh
			entry = {
				failedAttempts: 1,
				lastFailure: now,
				lockedUntil: null,
			};
		} else {
			// Increment failed attempts
			entry = {
				failedAttempts: stored.failedAttempts + 1,
				lastFailure: now,
				lockedUntil: stored.lockedUntil,
			};

			// Check if we should lock the account
			if (entry.failedAttempts >= config.maxAttempts) {
				entry.lockedUntil = now + config.lockoutSeconds * 1000;
				debugLog(
					'Account locked due to failed attempts',
					{
						username: maskSensitive(username),
						failedAttempts: entry.failedAttempts,
						lockoutSeconds: config.lockoutSeconds,
					},
					debug,
				);
			}
		}

		// Store with expiration longer than lockout period
		await kvNamespace.put(key, JSON.stringify(entry), {
			expirationTtl: config.lockoutSeconds * 2,
		});

		debugLog(
			'Failed attempt recorded',
			{
				username: maskSensitive(username),
				failedAttempts: entry.failedAttempts,
				isLocked: !!entry.lockedUntil,
			},
			debug,
		);

		return !!entry.lockedUntil;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Failed to record failed attempt:', errorMessage);
		return false;
	}
}

/**
 * Clear failed attempts after successful authentication
 */
export async function clearFailedAttempts(username: string, kvNamespace: KVNamespace | undefined, debug: boolean = false): Promise<void> {
	if (!kvNamespace) {
		return;
	}

	const key = `lockout:${username}`;

	try {
		await kvNamespace.delete(key);
		debugLog('Cleared failed attempts', { username: maskSensitive(username) }, debug);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Failed to clear failed attempts:', errorMessage);
	}
}
