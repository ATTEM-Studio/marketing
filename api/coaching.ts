import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  handleCoachingRequest,
  type CoachingHandlerDependencies,
} from "./_lib/coaching-handler";
import { classifyQuestion, composeCoachingResponse } from "./_lib/openai";
import { createSupabaseAdmin } from "./_lib/supabase-admin";

function productionDependencies(): CoachingHandlerDependencies {
  return {
    admin: createSupabaseAdmin(),
    classifyQuestion,
    composeCoachingResponse,
  };
}

export function createCoachingEndpoint(
  injectedDependencies?: CoachingHandlerDependencies,
): (request: VercelRequest, response: VercelResponse) => Promise<void> {
  return async (request, response) => {
    const result = await handleCoachingRequest(
      {
        headers: request.headers,
        body: request.body,
        ...(request.method ? { method: request.method } : {}),
      },
      injectedDependencies ?? productionDependencies(),
    );
    for (const [name, value] of Object.entries(result.headers ?? {})) {
      response.setHeader(name, value);
    }
    response.status(result.status).json(result.body);
  };
}

export default createCoachingEndpoint();
