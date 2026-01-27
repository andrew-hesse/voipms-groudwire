// ============================================================================
// Application Constants
// ============================================================================

export const CONSTANTS = {
	// User-Agent validation
	GROUNDWIRE_USER_AGENT_PREFIX: 'Groundwire/',
	CLOUDSOFTPHONE_USER_AGENT_PREFIX: 'CloudSoftphone/',
	ACROBITS_USER_AGENT_PREFIX: 'Acrobits',
	USER_AGENT_MAX_LENGTH: 200,
	USER_AGENT_PATTERN: /^[a-zA-Z0-9\s./\-_();]+$/,

	// Authentication
	BEARER_PREFIX: 'Bearer ',
	BASIC_PREFIX: 'Basic ',

	// VoIP.ms API
	VOIP_MS_API_URL: 'https://voip.ms/api/v1/rest.php',
	VOIP_MS_STUN_SERVER: 'stun.voip.ms:3478',

	// External services
	IP_CHECK_URL: 'https://ifconfig.me',
	WORKER_USER_AGENT: 'Cloudflare-Worker/1.0',

	// Defaults
	DEFAULT_CURRENCY: 'USD',
	DEFAULT_VOICEMAIL_NUMBER: '*97',
	DEFAULT_SIP_SERVER: 'ca.voip.ms', // Fallback when no POP is configured

	// Caching
	CACHE_TTL_SECONDS: 30,

	// Rate limiting (defaults - can be overridden via env)
	RATE_LIMIT_REQUESTS: 10,
	RATE_LIMIT_WINDOW_SECONDS: 60,

	// Brute force protection (defaults - can be overridden via env)
	BRUTE_FORCE_MAX_ATTEMPTS: 5,
	BRUTE_FORCE_LOCKOUT_SECONDS: 900, // 15 minutes

	// Provisioning
	PROVISION_CHECK_INTERVAL_SECONDS: 86400, // 24 hours

	// Codec preferences
	CODEC_ORDER_WIFI: 'opus,g722,g711u,g711a,g729',
	CODEC_ORDER_CELLULAR: 'g729,opus,g722,g711u',

	// Version
	VERSION: '3.0.0',
} as const;

export type Constants = typeof CONSTANTS;
