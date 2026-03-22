import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  photos: any[];
  onPhotoClick: (photo: any) => void;
  thumbnails: Record<string, string>;
}

export const MapView: React.FC<MapViewProps> = ({ photos, onPhotoClick, thumbnails }) => {
  const geoPhotos = photos.filter(p => p.lat && p.lon);

  const center: [number, number] = geoPhotos.length > 0 
    ? [geoPhotos[0].lat, geoPhotos[0].lon] 
    : [0, 0];

  return (
    <div className="flex-1 w-full h-full relative overflow-hidden bg-gray-950">
      <MapContainer 
        center={center} 
        zoom={2} 
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {geoPhotos.map((p, i) => {
          const thumb = thumbnails[p.absPath];
          
          return (
            <Marker key={i} position={[p.lat, p.lon]}>
              <Popup>
                <div 
                  className="flex flex-col gap-2 cursor-pointer" 
                  style={{ width: '120px' }}
                  onClick={() => onPhotoClick(p)}
                >
                  <div className="aspect-square bg-gray-100 overflow-hidden flex items-center justify-center">
                    {thumb ? (
                      <img 
                        src={`data:image/jpeg;base64,${thumb}`} 
                        alt={p.rel}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-[10px] text-gray-500">No Thumb</div>
                    )}
                  </div>
                  <div className="text-[10px] truncate font-medium text-black">{p.rel.split('/').pop()}</div>
                  <div className="text-[9px] text-gray-600">
                    {p.location?.city || 'Unknown City'}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      {/* Legend / Status Overlay */}
      <div className="absolute bottom-4 left-4 glass p-2 rounded text-[10px] z-[1000] flex gap-4">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span>{geoPhotos.length} Geotagged</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span>{photos.length - geoPhotos.length} Without GPS</span>
        </div>
      </div>
    </div>
  );
};
