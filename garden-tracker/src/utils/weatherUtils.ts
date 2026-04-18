// Pure weather utilities — no React, no native modules.

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

export interface CurrentWeather {
  code: number;
  tempF: number;       // °F
  feelsLikeF: number;  // °F
  humidity: number;    // 0–100
  windMph: number;
  precipIn: number;    // inches
}

export interface HourForecast {
  time: string;        // "2026-04-18T14:00"
  code: number;
  tempF: number;
  humidity: number;    // 0–100
  precipPct: number;   // 0–100
  precipIn: number;
  windMph: number;
}

export type WeatherState =
  | { status: 'loading' }
  | { status: 'no_network' }
  | { status: 'no_location' }
  | { status: 'error'; message: string }
  | { status: 'ok'; current: CurrentWeather; hourly: HourForecast[]; days: DayForecast[]; locationLabel: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

export function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

export async function fetchWeather(lat: number, lon: number): Promise<{
  current: CurrentWeather;
  hourly: HourForecast[];
  days: DayForecast[];
}> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'weather_code',
      'wind_speed_10m',
      'precipitation',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
    ].join(','),
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
    current: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
      precipitation: number;
    };
    hourly: {
      time: string[];
      temperature_2m: number[];
      relative_humidity_2m: number[];
      precipitation_probability: number[];
      precipitation: number[];
      weather_code: number[];
      wind_speed_10m: number[];
    };
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

  const c = json.current;
  const current: CurrentWeather = {
    code:       c.weather_code,
    tempF:      Math.round(c.temperature_2m),
    feelsLikeF: Math.round(c.apparent_temperature),
    humidity:   Math.round(c.relative_humidity_2m ?? 0),
    windMph:    Math.round(c.wind_speed_10m ?? 0),
    precipIn:   c.precipitation ?? 0,
  };

  // Slice next 24 hours starting from the current timestamp
  const h = json.hourly;
  const startIdx = h.time.findIndex(t => t >= c.time);
  const base = startIdx >= 0 ? startIdx : 0;
  const hourly: HourForecast[] = h.time.slice(base, base + 24).map((time, i) => {
    const idx = base + i;
    return {
      time,
      code:      h.weather_code[idx],
      tempF:     Math.round(h.temperature_2m[idx]),
      humidity:  Math.round(h.relative_humidity_2m[idx] ?? 0),
      precipPct: h.precipitation_probability[idx] ?? 0,
      precipIn:  h.precipitation[idx] ?? 0,
      windMph:   Math.round(h.wind_speed_10m[idx] ?? 0),
    };
  });

  const d = json.daily;
  const days: DayForecast[] = d.time.map((date, i) => ({
    date,
    code:      d.weather_code[i],
    tempMax:   Math.round(d.temperature_2m_max[i]),
    tempMin:   Math.round(d.temperature_2m_min[i]),
    precipIn:  d.precipitation_sum[i] ?? 0,
    precipPct: d.precipitation_probability_max[i] ?? 0,
    uvIndex:   Math.round(d.uv_index_max[i] ?? 0),
    windMph:   Math.round(d.wind_speed_10m_max[i] ?? 0),
  }));

  return { current, hourly, days };
}
