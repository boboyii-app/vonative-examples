import { applyOperatorAction, IncidentServiceError } from "@/server/incident-service";
import type { OperatorActionInput } from "@/server/incident-service";
import { getRuntimeEnv } from "@/server/env";
import { jsonError, jsonOk, requireOperator } from "@/server/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const env = await getRuntimeEnv();
  const operator = await requireOperator(request, env);
  if (operator instanceof Response) return operator;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON", 400);
  }
  if (typeof body !== "object" || body === null) {
    return jsonError("An operator action is required", 400);
  }

  try {
    const result = await applyOperatorAction(
      env,
      id,
      body as OperatorActionInput,
      operator.name,
    );
    return jsonOk(result);
  } catch (error) {
    if (error instanceof IncidentServiceError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Unable to apply operator action", 500);
  }
}
