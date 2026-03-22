import fs from 'fs';
import path from 'path';
import axios from 'axios';

export interface GeocodeResult {
  city: string;
  county: string;
  state: string;
  country: string;
  display: string;
}

export class GeocoderCache {
  private cachePath: string;
  private cache: Record<string, GeocodeResult> = {};
  private lastRequestTime = 0;
  private RATE_LIMIT_MS = 1100;

  constructor(cachePath: string) {
    this.cachePath = cachePath;
    this.load();
  }

  private load() {
    if (fs.existsSync(this.cachePath)) {
      try {
        this.cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        this.purgeEmpty();
      } catch (e) {
        console.error('Failed to load geocode cache', e);
      }
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (e) {
      console.error('Failed to save geocode cache', e);
    }
  }

  private purgeEmpty() {
    let changed = false;
    for (const key in this.cache) {
      const res = this.cache[key];
      if (!res.city && !res.state && !res.country) {
        delete this.cache[key];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  private getCacheKey(lat: number, lon: number): string {
    return `${lat.toFixed(3)},${lon.toFixed(3)}`;
  }

  public getCached(lat: number, lon: number): GeocodeResult | null {
    const key = this.getCacheKey(lat, lon);
    return this.cache[key] || null;
  }

  public async reverseGeocode(lat: number, lon: number): Promise<GeocodeResult | null> {
    const cached = this.getCached(lat, lon);
    if (cached) return cached;

    // Rate limiting
    const now = Date.now();
    const wait = this.RATE_LIMIT_MS - (now - this.lastRequestTime);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    this.lastRequestTime = Date.now();

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'picasa-electron/0.1.0' }
      });

      const data = response.data;
      if (data && data.address) {
        const addr = data.address;
        const result: GeocodeResult = {
          city: addr.city || addr.town || addr.village || addr.suburb || '',
          county: addr.county || '',
          state: addr.state || '',
          country: addr.country || '',
          display: data.display_name || ''
        };

        if (result.city || result.state || result.country) {
          const key = this.getCacheKey(lat, lon);
          this.cache[key] = result;
          this.save();
          return result;
        }
      }
    } catch (e) {
      console.error('Reverse geocode error', e);
    }
    return null;
  }
}
