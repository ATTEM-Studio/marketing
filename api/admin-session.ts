import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createAdminHandler,
  type AdminHandlerDependencies,
  type AdminHttpResponse,
} from "./_lib/admin-handler.js";

function applyAdminResponse(
  response: VercelResponse,
  result: AdminHttpResponse,
): void {
  for (const [name, value] of Object.entries(result.headers)) {
    response.setHeader(name, value);
  }
  if (result.body) {
    response.status(result.status).json(result.body);
    return;
  }
  response.status(result.status).end();
}

export function createAdminSessionEndpoint(
  injectedDependencies?: AdminHandlerDependencies,
): (request: VercelRequest, response: VercelResponse) => Promise<void> {
  return async (request, response) => {
    const result = await createAdminHandler(injectedDependencies ?? {}).session(
      {
        headers: request.headers,
        body: request.body,
        ...(request.method ? { method: request.method } : {}),
      },
    );
    applyAdminResponse(response, result);
  };
}

export default createAdminSessionEndpoint();
