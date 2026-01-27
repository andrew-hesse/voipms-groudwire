import { CONSTANTS } from '../utils/constants.js';
import { debugLog } from '../utils/helpers.js';

// ============================================================================
// IP-Based Rate Limiting
// ============================================================================

export interface RateLimitConfig {
	maxRequests: number;
	windowSeconds: number;
}

interface RateLimitEntry {
	count: number;
	windowStart: number;
}

/**
 * Check if a client IP is within rate limits
 * Returns true if allowed, false if rate limit exceeded
 */
export async function checkRateLimit(
	clientIp: string,
	kvNamespace: KVNamespace | undefined,
	config: RateLimitConfig = {
		maxRequests: CONSTANTS.RATE_LIMIT_REQUESTS,
		windowSeconds: CONSTANTS.RATE_LIMIT_WINDOW_SECONDS,
	},
	debug: boolean = false,
): Promise<boolean> {
	if (!kvNamespace) {
		debugLog('Rate limiting disabled - no KV namespace configured', null, debug);
		return true;
	}

	const now = Date.now();
	const key = `rate:${clientIp}`;

	try {
		const stored = (await kvNamespace.get(key, 'json')) as RateLimitEntry | null;

		if (!stored) {
			// First request from this IP
			const entry: RateLimitEntry = { count: 1, windowStart: now };
			await kvNamespace.put(key, JSON.stringify(entry), {
				expirationTtl: config.windowSeconds,
			});
			debugLog('Rate limit: first request', { clientIp, count: 1 }, debug);
			return true;
		}

		const windowAgeSeconds = (now - stored.windowStart) / 1000;

		if (windowAgeSeconds > config.windowSeconds) {
			// Window expired, start new one
			const entry: RateLimitEntry = { count: 1, windowStart: now };
			await kvNamespace.put(key, JSON.stringify(entry), {
				expirationTtl: config.windowSeconds,
			});
			debugLog('Rate limit: window expired, reset', { clientIp, count: 1 }, debug);
			return true;
		}

		if (stored.count >= config.maxRequests) {
			debugLog('Rate limit exceeded', { clientIp, count: stored.count }, debug);
			return false;
		}

		// Increment counter
		const entry: RateLimitEntry = {
			count: stored.count + 1,
			windowStart: stored.windowStart,
		};
		await kvNamespace.put(key, JSON.stringify(entry), {
			expirationTtl: config.windowSeconds,
		});
		debugLog('Rate limit: incremented', { clientIp, count: entry.count }, debug);
		return true;
	} catch (error) {
		// On error, allow the request but log it
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Rate limit check error:', errorMessage);
		debugLog('Rate limit check failed, allowing request', { error: errorMessage }, debug);
		return true;
	}
}

/**
 * Get client IP from request headers
 */
export function getClientIp(request: Request): string {
	// Cloudflare provides the real IP in this header
	const cfIp = request.headers.get('cf-connecting-ip');
	if (cfIp) {
		return cfIp;
	}

	// Fallback to X-Forwarded-For
	const xForwardedFor = request.headers.get('x-forwarded-for');
	if (xForwardedFor) {
		// Take the first IP (original client)
		const firstIp = xForwardedFor.split(',')[0]?.trim();
		if (firstIp) {
			return firstIp;
		}
	}

	// Last resort: X-Real-IP
	const xRealIp = request.headers.get('x-real-ip');
	if (xRealIp) {
		return xRealIp;
	}

	return 'unknown';
}
