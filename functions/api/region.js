import { handleRegion } from '../../worker/region.js'

export const onRequest = ({ request }) => handleRegion(request)
