import { AsyncLocalStorage } from 'async_hooks';

export interface ITenantContext {
  tenantId: string;
  userId?: string;
  userRole?: string;
  isSuperAdmin?: boolean;
}

const tenantStorage = new AsyncLocalStorage<ITenantContext>();

export class TenantContext {
  static run<R>(context: ITenantContext, callback: () => R): R {
    return tenantStorage.run(context, callback);
  }

  static get(): ITenantContext | undefined {
    return tenantStorage.getStore();
  }

  static getTenantId(): string {
    const ctx = tenantStorage.getStore();
    if (!ctx || !ctx.tenantId) {
      throw new Error('Tenant context is missing in current execution thread.');
    }
    return ctx.tenantId;
  }
}
