import { create } from 'zustand';
import * as Location from 'expo-location';
import { fetchWeather, classifyWeatherError, type WeatherState } from '@/src/utils/weatherUtils';

interface WeatherStore {
  weather: WeatherState;
  load: () => Promise<void>;
}

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  weather: { status: 'loading' },

  load: async () => {
    // Only fetch once — skip if already loading or resolved
    const current = get().weather;
    if (current.status !== 'loading') return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      set({ weather: { status: 'no_location' } });
      return;
    }

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });

    try {
      const [days, geo] = await Promise.all([
        fetchWeather(loc.coords.latitude, loc.coords.longitude),
        Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
      ]);
      const place = geo[0];
      const locationLabel = place
        ? [place.city, place.region].filter(Boolean).join(', ')
        : `${loc.coords.latitude.toFixed(2)}, ${loc.coords.longitude.toFixed(2)}`;
      set({ weather: { status: 'ok', days, locationLabel } });
    } catch (err) {
      set({ weather: classifyWeatherError(err) });
    }
  },
}));
