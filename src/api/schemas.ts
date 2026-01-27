import { z } from 'zod';

// ============================================================================
// Base VoIP.ms API Response Schema
// ============================================================================

export const VoipBaseResponseSchema = z.object({
	status: z.string(),
	message: z.string().optional(),
});

// ============================================================================
// getBalance Response
// ============================================================================

export const VoipBalanceResponseSchema = VoipBaseResponseSchema.extend({
	balance: z
		.object({
			current_balance: z.string(),
		})
		.optional(),
});

export type VoipBalanceResponse = z.infer<typeof VoipBalanceResponseSchema>;

// ============================================================================
// getSubAccounts Response
// ============================================================================

export const VoipSubAccountSchema = z.object({
	account: z.string(), // e.g., "123456_subaccount"
	description: z.string().optional(),
	password: z.string(),
	callerid_number: z.string().optional(),
	protocol: z.string().optional(), // "1" for UDP, "3" for TLS
	device_type: z.string().optional(),
	lock_international: z.string().optional(),
	international_route: z.string().optional(),
	music_on_hold: z.string().optional(),
	allowed_codecs: z.string().optional(),
	dtmf_mode: z.string().optional(),
	nat: z.string().optional(), // "yes", "no", "route"
	pop: z.string().optional(), // Server location code
	internal_extension: z.string().optional(),
	internal_voicemail: z.string().optional(),
	internal_dialtime: z.string().optional(),
	reseller_client: z.string().optional(),
	reseller_package: z.string().optional(),
	reseller_nextbilling: z.string().optional(),
	canada_routing: z.string().optional(),
	authtype: z.string().optional(),
	ip_address: z.string().optional(),
});

export type VoipSubAccount = z.infer<typeof VoipSubAccountSchema>;

export const VoipSubAccountsResponseSchema = VoipBaseResponseSchema.extend({
	accounts: z.array(VoipSubAccountSchema).optional(),
});

export type VoipSubAccountsResponse = z.infer<typeof VoipSubAccountsResponseSchema>;

// ============================================================================
// getServersInfo Response
// ============================================================================

export const VoipServerSchema = z.object({
	server_name: z.string(),
	server_shortname: z.string(),
	server_hostname: z.string(),
	server_ip: z.string(),
	server_country: z.string(),
	server_pop: z.string(),
	// Optional fields for recommended servers
	recommended: z.string().optional(),
});

export type VoipServer = z.infer<typeof VoipServerSchema>;

export const VoipServersResponseSchema = VoipBaseResponseSchema.extend({
	servers: z.array(VoipServerSchema).optional(),
});

export type VoipServersResponse = z.infer<typeof VoipServersResponseSchema>;

// ============================================================================
// getDIDsInfo Response
// ============================================================================

export const VoipDIDSchema = z.object({
	did: z.string(), // Phone number (e.g., "5551234567")
	description: z.string().optional(),
	routing: z.string().optional(),
	failover_busy: z.string().optional(),
	failover_unreachable: z.string().optional(),
	failover_noanswer: z.string().optional(),
	voicemail: z.string().optional(),
	pop: z.string().optional(),
	dialtime: z.string().optional(),
	cnam: z.string().optional(),
	callerid_prefix: z.string().optional(),
	note: z.string().optional(),
	billing_type: z.string().optional(),
	next_billing: z.string().optional(),
	order_reference: z.string().optional(),
	sms_available: z.string().optional(),
	sms_enabled: z.string().optional(),
});

export type VoipDID = z.infer<typeof VoipDIDSchema>;

export const VoipDIDsResponseSchema = VoipBaseResponseSchema.extend({
	dids: z.array(VoipDIDSchema).optional(),
});

export type VoipDIDsResponse = z.infer<typeof VoipDIDsResponseSchema>;

// ============================================================================
// Combined types for provisioning
// ============================================================================

export interface SubAccountWithServer extends VoipSubAccount {
	serverHostname: string;
	serverPop: string;
}

export interface ProvisioningData {
	subAccounts: SubAccountWithServer[];
	dids: VoipDID[];
	apiUsername: string;
}
