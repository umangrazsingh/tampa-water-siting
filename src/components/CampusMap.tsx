import { useEffect, useMemo, useRef } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type FilterSpecification, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'
import type { RankedSite, SiteFeature } from '@/lib/sites'

interface Props {
  features: SiteFeature[]
  ranked: RankedSite[]
  selectedId: string | null
  onSelect: (id: string) => void
}

// Vite moves maplibre-gl into a bundle, which breaks its default worker path.
// Point it at the real worker file (absolute URL, served as a module worker).
if (typeof window !== 'undefined') setWorkerUrl(new URL(workerUrl, window.location.href).href)

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function CampusMap({ features, ranked, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Re-attach the current score to every feature so the fill color follows the weights.
  const data = useMemo<FeatureCollection>(() => {
    const scores = new Map(ranked.map((r) => [r.id, r.score]))
    return {
      type: 'FeatureCollection',
      features: features.map((f) => ({
        ...f,
        properties: { ...f.properties, score: scores.get(String(f.properties?.siteId)) ?? 0 },
      })),
    }
  }, [features, ranked])

  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    if (!el.current) return
    const map = new MapLibreMap({
      container: el.current,
      center: [-82.4139, 28.0587],
      zoom: 14.6,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    map.on('error', (e) => console.error('[map]', e.error ?? e))

    map.on('load', () => {
      map.addSource('sites', { type: 'geojson', data: dataRef.current })
      map.addLayer({
        id: 'sites-fill',
        type: 'fill',
        source: 'sites',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 'score'], 0, '#cbd5e1', 40, '#38bdf8', 70, '#0ea5e9', 100, '#0c4a6e'],
          'fill-opacity': 0.75,
        },
      })
      map.addLayer({
        id: 'sites-line',
        type: 'line',
        source: 'sites',
        paint: { 'line-color': '#0f172a', 'line-width': 0.6, 'line-opacity': 0.6 },
      })
      map.addLayer({
        id: 'sites-selected-fill',
        type: 'fill',
        source: 'sites',
        filter: ['==', ['get', 'siteId'], ''],
        paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.45 },
      })
      map.addLayer({
        id: 'sites-selected',
        type: 'line',
        source: 'sites',
        filter: ['==', ['get', 'siteId'], ''],
        paint: { 'line-color': '#dc2626', 'line-width': 3 },
      })
      map.on('click', 'sites-fill', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.siteId
        if (id) onSelectRef.current(String(id))
      })
      map.on('mouseenter', 'sites-fill', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'sites-fill', () => (map.getCanvas().style.cursor = ''))
      readyRef.current = true
      const src = map.getSource('sites') as GeoJSONSource
      src.setData(dataRef.current)
    })

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    ;(map.getSource('sites') as GeoJSONSource | undefined)?.setData(data ?? EMPTY)
  }, [data])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const site = ranked.find((r) => r.id === selectedId)
    if (site) map.flyTo({ center: [site.lon, site.lat], zoom: 17, duration: 800 })
  }, [selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !map.getLayer('sites-selected')) return
    const f: FilterSpecification = ['==', ['get', 'siteId'], selectedId ?? '']
    map.setFilter('sites-selected', f)
    map.setFilter('sites-selected-fill', f)
  }, [selectedId, data])

  return <div ref={el} className="h-full w-full rounded-lg border border-border" />
}
