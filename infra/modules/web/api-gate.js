// CloudFront Function (cloudfront-js-2.0), viewer request on /api. It turns away, without invoking
// the Lambda, requests with no well-formed, unexpired access token. It cannot check the token's
// signature (the runtime has no RSA), so a forged token still reaches the Lambda, which rejects
// it: a flood of forged tokens is bounded only by the account's Lambda concurrency.
//
// The runtime calls a top-level function named handler and does not support `export`.

function handler(event) {
  const request = event.request;
  if (request.method !== "POST") return reject(405, "Method Not Allowed");
  // Lambda refuses unsigned payloads, and CloudFront can only sign a POST that carries this hash.
  if (!request.headers["x-amz-content-sha256"]) return reject(400, "Bad Request");

  const token = request.headers["x-clearframe-access-token"];
  const claims = token ? claimsOf(token.value) : null;
  if (
    !claims ||
    claims.token_use !== "access" ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= Date.now()
  ) {
    return reject(401, "Unauthorized");
  }
  return request;
}

function claimsOf(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  // atob expects padded standard base64; a JWT segment is unpadded base64url.
  let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  try {
    return JSON.parse(atob(base64));
  } catch (e) {
    return null;
  }
}

function reject(statusCode, statusDescription) {
  return {
    statusCode: statusCode,
    statusDescription: statusDescription,
    headers: { "cache-control": { value: "no-store" } },
  };
}
