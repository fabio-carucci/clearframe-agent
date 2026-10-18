import type { ResponseSink } from "./compose";

export async function sendJson(sink: ResponseSink, statusCode: number, body: unknown) {
  sink.start(statusCode, "application/json");
  sink.write(JSON.stringify(body));
  await sink.end();
}
