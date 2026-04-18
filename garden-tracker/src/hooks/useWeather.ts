import { useEffect } from 'react';
import { useWeatherStore } from '@/src/store/weatherStore';

// Re-export types and pure helpers so existing import sites don't need to change.
export type { DayForecast, CurrentWeather, HourForecast, WeatherState } from '@/src/utils/weatherUtils';
export { wmoLabel, wmoEmoji, classifyWeatherError, fetchWeather, localDateStr } from '@/src/utils/weatherUtils';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWeather() {
  const weather = useWeatherStore(s => s.weather);
  const load    = useWeatherStore(s => s.load);

  useEffect(() => { load().catch(() => {}); }, [load]);

  return weather;
}
