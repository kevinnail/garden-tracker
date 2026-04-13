// Pure weather utilities — no React, no native modules.
// Imported by both useWeather.ts and weatherStore.ts without circular deps.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayForecast {
  date: string;       // "2026-04-13"
  code: number;       // WMO weather code
  tempMax: number;    // °F
  tempMin: number;    // °F
  precipIn: number;   // inches
  precipPct: number;  // 0–100
  uvIndex: number;
  windMph: number;
}

export type WeatherState =
  | { status: 'loading' }
  | { status: 'no_network' }
  | { status: 'no_location' }
  | { status: 'error'; message: string }
  | { status: 'ok'; days: DayForecast[]; locationLabel: string };

// ── WMO code → label / emoji ──────────────────────────────────────────────────

export function wmoLabel(code: number): string {
  if (code === 0)                   return 'Clear';
  if (code <= 3)                    return 'Cloudy';
  if (code === 45 || code === 48)   return 'Fog';
  if (code >= 51 && code <= 57)     return 'Drizzle';
  if (code >= 61 && code <= 67)     return 'Rain';
  if (code >= 71 && code <= 77)     return 'Snow';
  if (code >= 80 && code <= 82)     return 'Showers';
  if (code === 85 || code === 86)   return 'Snow showers';
  if (code >= 95)                   return 'Thunderstorm';
  return 'Unknown';
}

export function wmoEmoji(code: number): string {
  if (code === 0)                   return '☀️';
  if (code <= 3)                    return '⛅';
  if (code === 45 || code === 48)   return '🌫️';
  if (code >= 51 && code <= 57)     return '🌦️';
  if (code >= 61 && code <= 67)     return '🌧️';
  if (code >= 71 && code <= 77)     return '❄️';
  if (code >= 80 && code <= 82)     return '🌦️';
  if (code === 85 || code === 86)   return '🌨️';
  if (code >= 95)                   return '⛈️';
  return '🌡️';
}

// ── Error classification ──────────────────────────────────────────────────────

export function classifyWeatherError(err: unknown): Extract<WeatherState, { status: 'no_network' | 'error' }> {
  if (err instanceof TypeError && /network request failed/i.test(err.message)) {
    return { status: 'no_network' };
  }
  return { status: 'error', message: err instanceof Error ? err.message : String(err) };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchWeather(lat: number, lon: number): Promise<DayForecast[]> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'uv_index_max',
      'wind_speed_10m_max',
    ].join(','),
    forecast_days: '10',
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Weather API error ${res.status}: ${text}`);
  }

  const json = await res.json() as {
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      precipitation_probability_max: number[];
      uv_index_max: number[];
      wind_speed_10m_max: number[];
    };
  };

  const d = json.daily;
  return d.time.map((date, i) => ({
    date,
    code:      d.weather_code[i],
    tempMax:   Math.round(d.temperature_2m_max[i]),
    tempMin:   Math.round(d.temperature_2m_min[i]),
    precipIn:  d.precipitation_sum[i] ?? 0,
    precipPct: d.precipitation_probability_max[i] ?? 0,
    uvIndex:   Math.round(d.uv_index_max[i] ?? 0),
    windMph:   Math.round(d.wind_speed_10m_max[i] ?? 0),
  }));
}
