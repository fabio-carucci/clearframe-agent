import { z } from "zod";

/** An error with a message written for the person using the page. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const ErrorBodySchema = z.object({ error: z.string() });

/** The error for a response the API refused, with its own message when it sent one. */
export async function refusal(response: Response): Promise<ApiError> {
  if (response.status === 401) {
    return new ApiError("Your session has expired. Sign in again to compose a dataset.", 401);
  }
  const body = ErrorBodySchema.safeParse(await response.json().catch(() => undefined));
  return new ApiError(
    body.success ? body.data.error : `The API answered with status ${response.status}.`,
    response.status,
  );
}
