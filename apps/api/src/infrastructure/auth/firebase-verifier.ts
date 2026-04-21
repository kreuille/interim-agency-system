import type { Auth } from 'firebase-admin/auth';
import { isRole } from '@interim/domain';
import type { DecodedAuthToken, TokenVerifier } from '../../shared/middleware/auth.middleware.js';

interface RawClaims {
  uid?: string;
  agencyId?: string;
  role?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
  mfa_verified?: boolean;
}

export class FirebaseTokenVerifier implements TokenVerifier {
  constructor(private readonly auth: Auth) {}

  async verifyIdToken(token: string): Promise<DecodedAuthToken> {
    const decoded = (await this.auth.verifyIdToken(token, true)) as unknown as RawClaims;

    const uid = decoded.uid;
    const agencyId = decoded.agencyId;
    const role = decoded.role;

    if (!uid || !agencyId || !role || !isRole(role)) {
      throw new Error('missing_or_invalid_claims');
    }

    return {
      uid,
      agencyId,
      role,
      emailVerified: decoded.email_verified === true,
      mfaVerified: decoded.mfa_verified === true,
    };
  }
}
