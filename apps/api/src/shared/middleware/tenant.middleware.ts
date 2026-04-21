import type { NextFunction, Request, Response } from 'express';
import { runWithTenant, type TenantContext } from '../context/tenant-context.js';

export interface AuthenticatedUser {
  agencyId: string;
  userId?: string;
  role?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user?.agencyId) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const context: TenantContext = {
    agencyId: user.agencyId,
    ...(user.userId !== undefined ? { actorId: user.userId } : {}),
    ...(user.role !== undefined ? { actorRole: user.role } : {}),
  };

  runWithTenant(context, () => {
    next();
  });
}
