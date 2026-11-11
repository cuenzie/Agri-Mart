interface NominatimResult {
  lat: string;
  lon: string;
}

const locationBounds = {
  south: 12.1,
  west: 120.3,
  north: 13.75,
  east: 121.8,
};
const geocodeCache = new Map<string, [number, number] | null>();
let geocodeQueue = Promise.resolve();
let lastGeocodeRequestAt = 0;

const isNominatimResult = (value: unknown): value is NominatimResult =>
  typeof value === 'object' &&
  value !== null &&
  'lat' in value &&
  typeof value.lat === 'string' &&
  'lon' in value &&
  typeof value.lon === 'string';

export const geocodeOrientalMindoroAddress = async (address: string) => {
  const cacheKey = address.trim().toLowerCase();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey) ?? null;

  const request = geocodeQueue.then(async () => {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastGeocodeRequestAt));
    if (waitMs) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs));
    }

    const params = new URLSearchParams({
      q: `${address}, Oriental Mindoro, Philippines`,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'ph',
      viewbox: `${locationBounds.west},${locationBounds.north},${locationBounds.east},${locationBounds.south}`,
      bounded: '1',
    });
    lastGeocodeRequestAt = Date.now();
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) {
      throw new Error(`OpenStreetMap search returned HTTP ${response.status}.`);
    }

    const results: unknown = await response.json();
    if (!Array.isArray(results)) {
      throw new Error('OpenStreetMap returned an invalid location response.');
    }

    const result = results.find(isNominatimResult);
    if (!result) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < locationBounds.south ||
      latitude > locationBounds.north ||
      longitude < locationBounds.west ||
      longitude > locationBounds.east
    ) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const position: [number, number] = [latitude, longitude];
    geocodeCache.set(cacheKey, position);
    return position;
  });

  geocodeQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
};
