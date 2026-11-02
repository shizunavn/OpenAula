export function handleHealth(request) {
  return Response.json({
    status: 'ok',
    service: 'openhero68-worker',
    edge: {
      colo: request.cf?.colo ?? 'DEV',
      country: request.cf?.country ?? null,
      city: request.cf?.city ?? null,
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache, no-store, max-age=0',
    },
  })
}
