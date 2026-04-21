import type { NextFunction, Request, Response } from 'express';
import { isRole, requiresMfa, type Role } from '@interim/domain';

export interface TokenVerifier {
  verifyIdToken(token: string): Promise<DecodedAuthToken>;
}

export interface DecodedAuthToken {
  uid: string;
  agencyId: string;
  role: Role;
  emailVerified: boolean;
  mfaVerified: boolean;
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

export function createAuthMiddleware(verifier: TokenVerifier) {
  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = extractBearer(req.header('authorization'));
    if (!token) {
      res.status(401).json({ error: 'missing_bearer_token' });
      return;
    }

    let decoded: DecodedAuthToken;
    try {
      decoded = await verifier.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    if (!isRole(decoded.role)) {
      res.status(403).json({ error: 'unknown_role' });
      return;
    }

    if (requiresMfa(decoded.role) && !decoded.mfaVerified) {
      res.status(403).json({ error: 'mfa_required' });
      return;
    }

    if (!decoded.emailVerified) {
      res.status(403).json({ error: 'email_not_verified' });
      return;
    }

    req.user = {
      agencyId: decoded.agencyId,
      userId: decoded.uid,
      role: decoded.role,
    };
    next();
  };
}
