import { handleHealth } from '../../worker/health.js'

export const onRequest = ({ request }) => handleHealth(request)
