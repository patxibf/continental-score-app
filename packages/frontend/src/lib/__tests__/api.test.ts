import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api'

// Replace global fetch with a vi.fn() before each test
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('api — Content-Type header', () => {
  it('does NOT send Content-Type when no body is provided (GET, DELETE)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse({ data: 1 }))

    await api.get('/test')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.['Content-Type']).toBeUndefined()
  })

  it('sends Content-Type: application/json when a body is provided (POST)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse({ ok: true }))

    await api.post('/test', { name: 'value' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })
})

describe('api — error handling', () => {
  it('throws with the error.error field on a plain error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse({ error: 'Not found' }, 404),
    )

    await expect(api.get('/missing')).rejects.toThrow('Not found')
  })

  it('extracts and joins fieldErrors from a Zod validation response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(
        {
          error: 'Invalid request',
          details: {
            fieldErrors: {
              username: ['String must contain at least 3 character(s)'],
              password: ['String must contain at least 6 character(s)'],
            },
          },
        },
        400,
      ),
    )

    await expect(api.post('/groups', {})).rejects.toThrow(
      'String must contain at least 3 character(s), String must contain at least 6 character(s)',
    )
  })

  it('falls back to "Request failed" when response body cannot be parsed as JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    } as unknown as Response)

    await expect(api.get('/error')).rejects.toThrow('Request failed')
  })
})
