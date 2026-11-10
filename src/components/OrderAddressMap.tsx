import { useEffect, useRef, useState, type FC } from 'react';
import MeetupLocationMap from './MeetupLocationMap';

interface OrderAddressMapProps {
  address: string;
  label: string;
}

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

const geocodeOrderAddress = async (address: string) => {
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

const OrderAddressMap: FC<OrderAddressMapProps> = ({ address, label }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestActiveRef = useRef(true);

  useEffect(() => {
    requestActiveRef.current = true;
    return () => {
      requestActiveRef.current = false;
    };
  }, []);

  const loadLocation = async () => {
    requestActiveRef.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await geocodeOrderAddress(address);
      if (!requestActiveRef.current) return;
      if (!result) {
        setError(
          'OpenStreetMap could not find this pickup address. Please confirm the seller address with them.',
        );
        return;
      }
      setPosition(result);
    } catch (geocodeError) {
      if (!requestActiveRef.current) return;
      console.error('Unable to find order pickup address on OpenStreetMap:', geocodeError);
      setError('Could not load the map. Check your connection and try again.');
    } finally {
      if (requestActiveRef.current) setLoading(false);
    }
  };

  const toggleMap = () => {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    if (!position) void loadLocation();
  };

  return (
    <div className="order-address-map">
      <button
        className="order-address-map-toggle"
        type="button"
        aria-expanded={open}
        onClick={toggleMap}
      >
        {open ? 'Hide pickup map' : label}
      </button>
      {open && (
        <div className="order-address-map-content">
          {loading && <span role="status">Finding pickup location...</span>}
          {error && (
            <span className="order-address-map-error" role="alert">
              {error}
              <button type="button" onClick={() => void loadLocation()}>
                Try again
              </button>
            </span>
          )}
          {position ? (
            <>
              <p className="order-address-map-note">
                Approximate address match. Confirm the exact pickup point with
                the seller. Map data &copy; OpenStreetMap.
              </p>
            </>
          ) : (
            <p className="order-address-map-note">
              Showing the Oriental Mindoro area while we look for the address.
              A precise pin appears when OpenStreetMap can match it.
            </p>
          )}
          <MeetupLocationMap
            label={
              position
                ? `Approximate seller pickup location: ${address}`
                : 'Oriental Mindoro pickup area map'
            }
            position={position}
          />
        </div>
      )}
    </div>
  );
};

export default OrderAddressMap;
