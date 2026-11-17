class HosisApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HosisApiError'
    this.status = status
  }
}

function createHosisApi({
  baseUrl = process.env.HOSIS_API_BASE_URL,
  token = process.env.HOSIS_INTEGRATION_TOKEN,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function request(path, options = {}) {
    if (!baseUrl || !token) {
      throw new HosisApiError(503, 'The HOSIS room connector is not configured.')
    }
    if (typeof fetchImpl !== 'function') {
      throw new HosisApiError(503, 'This Node.js runtime does not provide fetch.')
    }

    let response
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      throw new HosisApiError(502, 'The HOSIS room service could not be reached.')
    }

    let body
    try {
      body = await response.json()
    } catch {
      throw new HosisApiError(502, 'The HOSIS room service returned an invalid response.')
    }
    if (!response.ok) {
      const message = typeof body?.error?.message === 'string'
        ? body.error.message
        : 'The HOSIS room service rejected the request.'
      const status = [400, 404, 409].includes(response.status) ? response.status : 502
      throw new HosisApiError(status, message)
    }
    if (!body || !Object.hasOwn(body, 'data')) {
      throw new HosisApiError(502, 'The HOSIS room service returned an invalid response.')
    }
    return body.data
  }

  return {
    async getRooms(status) {
      const query = status ? `?status=${encodeURIComponent(status)}` : ''
      const rooms = await request(`/rooms${query}`)
      if (!Array.isArray(rooms)) throw new HosisApiError(502, 'The HOSIS room service returned an invalid room list.')
      return rooms
    },
    async getRoom(roomId) {
      return request(`/rooms/${encodeURIComponent(roomId)}`)
    },
    async reportRoomEvent(roomId, event) {
      return request(`/rooms/${encodeURIComponent(roomId)}/events`, {
        method: 'POST',
        body: JSON.stringify(event),
      })
    },
  }
}

module.exports = { createHosisApi, HosisApiError }
