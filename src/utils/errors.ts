// ============================================================================
// Custom Error Classes
// ============================================================================

export class AppError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number,
		public readonly code: string,
	) {
		super(message);
		this.name = 'AppError';
	}
}

export class AuthenticationError extends AppError {
	constructor(message: string = 'Authentication required') {
		super(message, 401, 'AUTHENTICATION_ERROR');
		this.name = 'AuthenticationError';
	}
}

export class AuthorizationError extends AppError {
	constructor(message: string = 'Unauthorized') {
		super(message, 401, 'AUTHORIZATION_ERROR');
		this.name = 'AuthorizationError';
	}
}

export class ConfigurationError extends AppError {
	constructor(message: string = 'Server configuration error') {
		super(message, 500, 'CONFIGURATION_ERROR');
		this.name = 'ConfigurationError';
	}
}

export class IpNotEnabledError extends AppError {
	constructor(ip: string) {
		super(`IP not permitted by VOIP.MS. Source IP: ${ip}`, 403, 'IP_NOT_ENABLED');
		this.name = 'IpNotEnabledError';
	}
}

export class InvalidDataError extends AppError {
	constructor(message: string = 'Invalid data received from API') {
		super(message, 502, 'INVALID_DATA');
		this.name = 'InvalidDataError';
	}
}

export class RateLimitError extends AppError {
	constructor(message: string = 'Too many requests') {
		super(message, 429, 'RATE_LIMIT_EXCEEDED');
		this.name = 'RateLimitError';
	}
}

export class BruteForceError extends AppError {
	constructor(message: string = 'Account temporarily locked') {
		super(message, 429, 'ACCOUNT_LOCKED');
		this.name = 'BruteForceError';
	}
}

export class MethodNotAllowedError extends AppError {
	constructor(method: string) {
		super(`Method ${method} not allowed`, 405, 'METHOD_NOT_ALLOWED');
		this.name = 'MethodNotAllowedError';
	}
}

export class NotFoundError extends AppError {
	constructor(message: string = 'Not found') {
		super(message, 404, 'NOT_FOUND');
		this.name = 'NotFoundError';
	}
}

export class ValidationError extends AppError {
	constructor(message: string = 'Validation failed') {
		super(message, 400, 'VALIDATION_ERROR');
		this.name = 'ValidationError';
	}
}
