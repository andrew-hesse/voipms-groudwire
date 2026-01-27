import { z } from 'zod';
import { CONSTANTS } from './utils/constants.js';

// ============================================================================
// Environment Schema
// ============================================================================

export const EnvSchema = z.object({
	// Display settings
	CURRENCY: z.string().default(CONSTANTS.DEFAULT_CURRENCY),

	// Worker settings
	WORKER_BASE_URL: z.string().optional(),
	DEBUG: z
		.string()
		.optional()
		.transform((val) => val === 'true'),

	// Rate limiting settings
	RATE_LIMIT_REQUESTS: z
		.string()
		.optional()
		.transform((val) => (val ? parseInt(val, 10) : CONSTANTS.RATE_LIMIT_REQUESTS)),
	RATE_LIMIT_WINDOW_SECONDS: z
		.string()
		.optional()
		.transform((val) => (val ? parseInt(val, 10) : CONSTANTS.RATE_LIMIT_WINDOW_SECONDS)),

	// Brute force settings
	BRUTE_FORCE_MAX_ATTEMPTS: z
		.string()
		.optional()
		.transform((val) => (val ? parseInt(val, 10) : CONSTANTS.BRUTE_FORCE_MAX_ATTEMPTS)),
	BRUTE_FORCE_LOCKOUT_SECONDS: z
		.string()
		.optional()
		.transform((val) => (val ? parseInt(val, 10) : CONSTANTS.BRUTE_FORCE_LOCKOUT_SECONDS)),

	// KV namespace for security (rate limiting & brute force)
	SECURITY_KV: z.custom<KVNamespace>().optional(),

	// Cache for balance responses (optional)
	BALANCE_CACHE: z.custom<KVNamespace>().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface BalanceResponse {
	balanceString: string;
	balance: number;
	currency: string;
	timestamp: string;
}

export interface HealthResponse {
	status: 'healthy';
	timestamp: string;
	version: string;
}
