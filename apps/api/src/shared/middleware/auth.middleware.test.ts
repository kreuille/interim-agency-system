import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createAuthMiddleware,
  type DecodedAuthToken,
  type TokenVerifier,
} from './auth.middleware.js';
import { tenantMiddleware } from './tenant.middleware.js';
import { currentTenant } from '../context/tenant-context.js';

function stubVerifier(decoded: DecodedAuthToken): TokenVerifier {
  return {
    verifyIdToken: () => Promise.resolve(decoded),
  };
}

const throwingVerifier: TokenVerifier = {
  verifyIdToken: () => Promise.reject(new Error('expired_token')),
};

function buildApp(verifier: TokenVerifier) {
  const app = express();
  app.use((req, res, next) => {
    void createAuthMiddleware(verifier)(req, res, next);
  });
  app.use(tenantMiddleware);
  app.get('/me', (_req, res) => {
    const ctx = currentTenant();
    res.json({ agencyId: ctx.agencyId, actorId: ctx.actorId ?? null });
  });
  return app;
}

const okDispatcher: DecodedAuthToken = {
  uid: 'user-1',
  agencyId: 'agency-a',
  role: 'dispatcher',
  emailVerified: true,
  mfaVerified: false,
};

const adminWithoutMfa: DecodedAuthToken = {
  uid: 'user-admin',
  agencyId: 'agency-a',
  role: 'agency_admin',
  emailVerified: true,
  mfaVerified: false,
};

const adminWithMfa: DecodedAuthToken = {
  uid: 'user-admin',
  agencyId: 'agency-a',
  role: 'agency_admin',
  emailVerified: true,
  mfaVerified: true,
};

const unverifiedEmail: DecodedAuthToken = {
  uid: 'user-1',
  agencyId: 'agency-a',
  role: 'dispatcher',
  emailVerified: false,
  mfaVerified: false,
};

describe('authMiddleware', () => {
  it('returns 401 when no bearer token is present', async () => {
    const response = await request(buildApp(stubVerifier(okDispatcher))).get('/me');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'missing_bearer_token' });
  });

  it('returns 401 when the verifier throws (invalid/expired)', async () => {
    const response = await request(buildApp(throwingVerifier))
      .get('/me')
      .set('authorization', 'Bearer broken');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_token' });
  });

  it('returns 403 when email is not verified', async () => {
    const response = await request(buildApp(stubVerifier(unverifiedEmail)))
      .get('/me')
      .set('authorization', 'Bearer ok');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'email_not_verified' });
  });

  it('returns 403 when MFA is required but missing', async () => {
    const response = await request(buildApp(stubVerifier(adminWithoutMfa)))
      .get('/me')
      .set('authorization', 'Bearer ok');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'mfa_required' });
  });

  it('exposes tenant context when all gates pass (admin with MFA)', async () => {
    const response = await request(buildApp(stubVerifier(adminWithMfa)))
      .get('/me')
      .set('authorization', 'Bearer ok');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ agencyId: 'agency-a', actorId: 'user-admin' });
  });

  it('dispatcher (no MFA required) passes without mfa_verified', async () => {
    const response = await request(buildApp(stubVerifier(okDispatcher)))
      .get('/me')
      .set('authorization', 'Bearer ok');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ agencyId: 'agency-a', actorId: 'user-1' });
  });
});
