import { useEffect, useRef, type FC } from 'react';
import {
  latLngBounds,
  Map as LeafletMap,
  Marker,
  TileLayer,
  type LeafletMouseEvent,
} from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MeetupLocationMapProps {
  position: [number, number] | null;
  interactive?: boolean;
  onPositionChange?: (position: [number, number]) => void;
  label: string;
}

const orientalMindoroBounds = latLngBounds(
  [12.1, 120.3],
  [13.75, 121.8],
);
const orientalMindoroCenter: [number, number] = [13.05, 121.2];

const MeetupLocationMap: FC<MeetupLocationMapProps> = ({
  position,
  interactive = false,
  onPositionChange,
  label,
}) => {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const initialPositionRef = useRef(position);
  const onPositionChangeRef = useRef(onPositionChange);

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = new LeafletMap(mapElementRef.current, {
      center: initialPositionRef.current ?? orientalMindoroCenter,
      zoom: initialPositionRef.current ? 14 : 9,
      minZoom: 8,
      maxBounds: orientalMindoroBounds,
      maxBoundsViscosity: 0.9,
      scrollWheelZoom: false,
    });
    new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    if (interactive) {
      map.on('click', (event: LeafletMouseEvent) => {
        if (!orientalMindoroBounds.contains(event.latlng)) return;
        onPositionChangeRef.current?.([event.latlng.lat, event.latlng.lng]);
      });
    }

    mapRef.current = map;
    const mapElement = mapElementRef.current;
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    resizeObserver.observe(mapElement);
    const resizeFrame = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
    });

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!position) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current
        .setLatLng(position)
        .bindPopup(label)
        .openPopup();
    } else {
      markerRef.current = new Marker(position)
        .addTo(map)
        .bindPopup(label)
        .openPopup();
    }
    map.setView(position, Math.max(map.getZoom(), 14));
    map.invalidateSize({ pan: false });
  }, [label, position]);

  return (
    <div
      className={`meetup-location-map${interactive ? ' interactive' : ''}`}
      role="group"
      aria-label={label}
    >
      <div ref={mapElementRef} className="meetup-location-map-canvas" />
      {interactive && (
        <p className="meetup-location-map-hint">
          Search the address above or tap the map to pin your meeting point.
          Map tiles by OpenStreetMap.
        </p>
      )}
    </div>
  );
};

export default MeetupLocationMap;
