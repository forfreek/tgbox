/** Browser-only summary mutations require an exact Origin, including scheme and port. */
export function summaryWriteOriginAllowed(request: Request) {
  return request.method === "POST" && request.headers.get("Origin") === new URL(request.url).origin;
}
