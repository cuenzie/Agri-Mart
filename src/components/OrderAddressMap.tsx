import { useEffect, useRef, useState, type FC } from 'react';
import MeetupLocationMap from './MeetupLocationMap';
import { geocodeOrientalMindoroAddress } from '../utils/geocodeOrientalMindoroAddress';

interface OrderAddressMapProps {
  address: string;
  label: string;
}

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
      const result = await geocodeOrientalMindoroAddress(address);
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
