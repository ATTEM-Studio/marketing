import { createClient } from "@supabase/supabase-js";

interface RpcClient {
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

export interface AdminLoginLimiter {
  isAllowed(ipHash: string): Promise<boolean>;
  recordFailure(ipHash: string): Promise<boolean>;
  clearFailures(ipHash: string): Promise<void>;
}

export type AdminDataStore = AdminLoginLimiter;

function requiredServerEnvironment(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("ADMIN_SERVER_ENV_MISSING");
  return { url, serviceRoleKey };
}

function rpcClient(): RpcClient {
  const { url, serviceRoleKey } = requiredServerEnvironment();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as unknown as RpcClient;
}

export function createAdminDataStore(
  injectedClient?: RpcClient,
): AdminDataStore {
  const client = injectedClient ?? rpcClient();

  async function call(name: string, ipHash: string): Promise<unknown> {
    const { data, error } = await client.rpc(name, { p_ip_hash: ipHash });
    if (error) throw new Error("ADMIN_DATA_ERROR");
    return data;
  }

  return {
    async isAllowed(ipHash) {
      return (await call("check_admin_login_attempt", ipHash)) === true;
    },
    async recordFailure(ipHash) {
      return (await call("record_admin_login_failure", ipHash)) === true;
    },
    async clearFailures(ipHash) {
      await call("clear_admin_login_failures", ipHash);
    },
  };
}
