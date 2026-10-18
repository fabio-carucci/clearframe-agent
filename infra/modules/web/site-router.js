// CloudFront Function (cloudfront-js-2.0), viewer request on the site. The static export writes a
// page such as /verify as verify.html, and S3 behind origin access control answers 403 for a key
// it does not hold, so a path whose last segment has no extension gets ".html". "/" is left to
// default_root_object.

function handler(event) {
  const request = event.request;
  const uri = request.uri;
  const lastSegment = uri.slice(uri.lastIndexOf("/") + 1);
  if (uri !== "/" && lastSegment.indexOf(".") === -1) {
    request.uri = (uri.charAt(uri.length - 1) === "/" ? uri.slice(0, -1) : uri) + ".html";
  }
  return request;
}
