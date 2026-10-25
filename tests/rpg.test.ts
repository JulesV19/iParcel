import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRpgParcels, pickPolygon } from '@/lib/rpg'

// Carrés [lon, lat] : A autour de (1, 48), B plus grand autour de (3, 48)
const A = [[0.9, 47.9], [1.1, 47.9], [1.1, 48.1], [0.9, 48.1], [0.9, 47.9]]
const B = [[2.5, 47.5], [3.5, 47.5], [3.5, 48.5], [2.5, 48.5], [2.5, 47.5]]
const HOLE = [[0.95, 47.95], [1.05, 47.95], [1.05, 48.05], [0.95, 48.05], [0.95, 47.95]]

describe('pickPolygon', () => {
  it('garde la partie cliquée d’un MultiPolygon', () => {
    const g = pickPolygon({ type: 'MultiPolygon', coordinates: [[A], [B]] }, [1, 48])
    expect(g).toEqual({ type: 'Polygon', coordinates: [A] })
  })

  it('prend la plus grande partie si le clic tombe entre deux', () => {
    const g = pickPolygon({ type: 'MultiPolygon', coordinates: [[A], [B]] }, [2, 48])
    expect(g.coordinates[0]).toEqual(B)
  })

  it('abandonne les trous : une parcelle iParcel n’a qu’un anneau', () => {
    const g = pickPolygon({ type: 'Polygon', coordinates: [A, HOLE] }, [1, 48])
    expect(g.coordinates).toEqual([A])
  })

  it('ferme l’anneau et retire une éventuelle altitude', () => {
    const open = [[0.9, 47.9, 120], [1.1, 47.9, 120], [1.1, 48.1, 120], [0.9, 48.1, 120]]
    const g = pickPolygon({ type: 'Polygon', coordinates: [open] }, [1, 48])
    expect(g.coordinates[0]).toEqual(A)
  })
})

describe('fetchRpgParcels', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubFetch(body: unknown) {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json(body))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('demande l’emprise en latitude, longitude (axes EPSG:4326 du WFS 2.0)', async () => {
    const fetchMock = stubFetch({ features: [] })
    await fetchRpgParcels({ south: 48.3, west: 1.4, north: 48.5, east: 1.7 }, new AbortController().signal)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin).toBe('https://data.geopf.fr')
    expect(url.searchParams.get('TYPENAMES')).toBe('RPG.LATEST:parcelles_graphiques')
    expect(url.searchParams.get('BBOX')).toBe('48.3,1.4,48.5,1.7,urn:ogc:def:crs:EPSG::4326')
  })

  it('écarte les objets sans géométrie surfacique et signale une zone incomplète', async () => {
    const ok = { type: 'Feature', properties: { code_cultu: 'BTH' }, geometry: { type: 'MultiPolygon', coordinates: [[A]] } }
    stubFetch({
      numberMatched: 5,
      features: [ok, { type: 'Feature', properties: {}, geometry: null }, { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 48] } }],
    })
    const res = await fetchRpgParcels({ south: 48, west: 1, north: 48.1, east: 1.1 }, new AbortController().signal)
    expect(res.features).toEqual([ok])
    expect(res.truncated).toBe(true)
  })

  it('lève une erreur si le service répond en erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(fetchRpgParcels({ south: 48, west: 1, north: 48.1, east: 1.1 }, new AbortController().signal)).rejects.toThrow('HTTP 503')
  })
})
