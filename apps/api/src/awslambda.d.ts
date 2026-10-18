import type { Writable } from "node:stream";

/** Globals the Node.js Lambda runtime provides for response streaming; no package ships these. */
declare global {
  namespace awslambda {
    type ResponseStream = Writable;

    function streamifyResponse<TEvent>(
      handler: (event: TEvent, responseStream: ResponseStream, context: unknown) => Promise<void>,
    ): (event: TEvent, context: unknown) => Promise<void>;

    namespace HttpResponseStream {
      function from(
        stream: ResponseStream,
        metadata: { statusCode: number; headers?: Record<string, string> },
      ): ResponseStream;
    }
  }
}

export {};
