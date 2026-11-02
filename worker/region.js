export function handleRegion(request) {
  const country = typeof request.cf?.country === 'string'
    ? request.cf.country.toUpperCase()
    : null
  const isVietnam = country === 'VN'

  return Response.json({
    region: isVietnam ? 'VN' : 'OTHER',
    country,
    suggestedLanguage: isVietnam ? 'vi' : 'en',
  }, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
    },
  })
}
