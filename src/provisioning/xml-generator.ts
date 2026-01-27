import { CONSTANTS } from '../utils/constants.js';
import { escapeXml } from '../utils/helpers.js';
import type { SubAccountWithServer, VoipDID } from '../api/schemas.js';

// ============================================================================
// XML Generation for Acrobits/Groundwire Account Configuration
// ============================================================================

export interface AccountXmlOptions {
	/** Base URL of this worker (e.g., "https://groundwire.example.workers.dev") */
	workerBaseUrl: string;
	/** Account index (1-based) for re-provisioning URL */
	accountIndex: number;
}

/**
 * Format a phone number for display (e.g., "5551234567" -> "555-123-4567")
 */
function formatPhoneNumber(did: string): string {
	// Handle 10-digit US/CA numbers
	if (/^\d{10}$/.test(did)) {
		return `${did.slice(0, 3)}-${did.slice(3, 6)}-${did.slice(6)}`;
	}
	// Handle 11-digit numbers starting with 1
	if (/^1\d{10}$/.test(did)) {
		return `${did.slice(1, 4)}-${did.slice(4, 7)}-${did.slice(7)}`;
	}
	return did;
}

/**
 * Find the best DID to use as the account title
 * Prefers DIDs that match the sub-account's caller ID
 */
function findMatchingDid(subAccount: SubAccountWithServer, dids: VoipDID[]): VoipDID | undefined {
	const callerIdNumber = subAccount.callerid_number?.replace(/\D/g, '');

	// First, try to find a DID that matches the caller ID
	if (callerIdNumber) {
		const match = dids.find((did) => {
			const didNumber = did.did.replace(/\D/g, '');
			return didNumber === callerIdNumber || didNumber.endsWith(callerIdNumber);
		});
		if (match) {
			return match;
		}
	}

	// Otherwise, return the first DID (if any)
	return dids[0];
}

/**
 * Generate the title for an account
 */
function generateAccountTitle(subAccount: SubAccountWithServer, matchingDid?: VoipDID): string {
	if (matchingDid) {
		const formattedNumber = formatPhoneNumber(matchingDid.did);
		const description = matchingDid.description || subAccount.description;
		if (description) {
			return `${description} - ${formattedNumber}`;
		}
		return `VoIP.ms - ${formattedNumber}`;
	}

	if (subAccount.description) {
		return `VoIP.ms - ${subAccount.description}`;
	}

	return `VoIP.ms - ${subAccount.account}`;
}

/**
 * Generate XML for a single Groundwire account
 */
function generateSingleAccountXml(subAccount: SubAccountWithServer, matchingDid: VoipDID | undefined, options: AccountXmlOptions): string {
	const title = generateAccountTitle(subAccount, matchingDid);
	const escapedTitle = escapeXml(title);
	const escapedUsername = escapeXml(subAccount.account);
	const escapedPassword = escapeXml(subAccount.password);
	const escapedHost = escapeXml(subAccount.serverHostname);
	const escapedBaseUrl = escapeXml(options.workerBaseUrl);

	// Determine caller ID to display
	const callerId = matchingDid?.did || subAccount.callerid_number || '';
	const escapedCallerId = escapeXml(callerId);

	return `<account>
    <!-- Identity -->
    <title>${escapedTitle}</title>
    <username>${escapedUsername}</username>
    <password>${escapedPassword}</password>
    <host>${escapedHost}</host>

    <!-- Caller ID -->
    <displayNumber>${escapedCallerId}</displayNumber>

    <!-- NAT Traversal -->
    <natTraversal>ice</natTraversal>
    <STUN>${escapeXml(CONSTANTS.VOIP_MS_STUN_SERVER)}</STUN>

    <!-- Codecs (WiFi: quality-first, Cellular: bandwidth-first) -->
    <codecOrder>${escapeXml(CONSTANTS.CODEC_ORDER_WIFI)}</codecOrder>
    <codecOrder3G>${escapeXml(CONSTANTS.CODEC_ORDER_CELLULAR)}</codecOrder3G>

    <!-- Voicemail -->
    <voiceMailNumber>${escapeXml(CONSTANTS.DEFAULT_VOICEMAIL_NUMBER)}</voiceMailNumber>

    <!-- Balance Checker (uses Bearer auth token) -->
    <genericBalanceCheckUrl>${escapedBaseUrl}/balance</genericBalanceCheckUrl>
    <genericBalanceCheckParse>balanceString</genericBalanceCheckParse>

    <!-- Re-provisioning (uses Bearer auth token) -->
    <extProvUrl>${escapedBaseUrl}/provision/${options.accountIndex}</extProvUrl>
    <extProvInterval>${CONSTANTS.PROVISION_CHECK_INTERVAL_SECONDS}</extProvInterval>

    <!-- Push Notifications -->
    <icm>push</icm>

    <!-- Security (SRTP) -->
    <sdesIncoming>enabled</sdesIncoming>
    <sdesOutgoing>enabled</sdesOutgoing>
  </account>`;
}

/**
 * Generate complete Acrobits Account XML for Groundwire provisioning
 *
 * @param subAccounts - Array of sub-accounts with server info (should be single account)
 * @param dids - Array of DIDs (phone numbers)
 * @param options - Configuration options including worker URL
 * @returns XML string for Groundwire configuration
 */
export function generateAccountXml(subAccounts: SubAccountWithServer[], dids: VoipDID[], options: AccountXmlOptions): string {
	// Only provision single account (Groundwire limitation)
	const subAccount = subAccounts[0];

	if (!subAccount) {
		return `<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message>No accounts available</message>
</error>`;
	}

	const matchingDid = findMatchingDid(subAccount, dids);
	const accountXml = generateSingleAccountXml(subAccount, matchingDid, options);

	return `<?xml version="1.0" encoding="UTF-8"?>
${accountXml}`;
}

/**
 * Generate a simple error XML response for Groundwire
 */
export function generateErrorXml(message: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message>${escapeXml(message)}</message>
</error>`;
}
