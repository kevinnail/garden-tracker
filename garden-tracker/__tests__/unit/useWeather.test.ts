// * ==================================================
// *
// *    Unit tests — useWeather pure helpers
// *
// *    Covers:
// *      - wmoLabel / wmoEmoji boundary conditions
// *      - classifyWeatherError (no_network vs error)
// *      - fetchWeather response parsing
// *      - fetchWeather HTTP error handling
// *
// * ==================================================

import { wmoLabel, wmoEmoji, classifyWeatherError, fetchWeather, localDateStr } from '@/src/utils/weatherUtils';

// ── localDateStr ──────────────────────────────────────────────────────────────

describe('localDateStr', () => {
  it('returns YYYY-MM-DD using local time, not UTC', () => {
    const result = localDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});

// ── wmoLabel ──────────────────────────────────────────────────────────────────

describe('wmoLabel', () => {
  it.each([
    [0,  'Clear'],
    [1,  'Cloudy'],
    [2,  'Cloudy'],
    [3,  'Cloudy'],
    [45, 'Fog'],
    [48, 'Fog'],
    [51, 'Drizzle'],
    [55, 'Drizzle'],
    [57, 'Drizzle'],
    [61, 'Rain'],
    [65, 'Rain'],
    [67, 'Rain'],
    [71, 'Snow'],
    [75, 'Snow'],
    [77, 'Snow'],
    [80, 'Showers'],
    [81, 'Showers'],
    [82, 'Showers'],
    [85, 'Snow showers'],
    [86, 'Snow showers'],
    [95, 'Thunderstorm'],
    [99, 'Thunderstorm'],
  ])('code %i → "%s"', (code, expected) => {
    expect(wmoLabel(code)).toBe(expected);
  });

  it('returns "Unknown" for unrecognised codes', () => {
    expect(wmoLabel(4)).toBe('Unknown');
    expect(wmoLabel(44)).toBe('Unknown');
    expect(wmoLabel(58)).toBe('Unknown');
  });
});

// ── wmoEmoji ──────────────────────────────────────────────────────────────────

describe('wmoEmoji', () => {
  it('returns ☀️ for clear sky (0)', () => {
    expect(wmoEmoji(0)).toBe('☀️');
  });

  it('returns ⛅ for partly cloudy (1–3)', () => {
    expect(wmoEmoji(1)).toBe('⛅');
    expect(wmoEmoji(3)).toBe('⛅');
  });

  it('returns 🌫️ for fog (45, 48)', () => {
    expect(wmoEmoji(45)).toBe('🌫️');
    expect(wmoEmoji(48)).toBe('🌫️');
  });

  it('returns 🌦️ for drizzle (51–57)', () => {
    expect(wmoEmoji(51)).toBe('🌦️');
    expect(wmoEmoji(57)).toBe('🌦️');
  });

  it('returns 🌧️ for rain (61–67)', () => {
    expect(wmoEmoji(61)).toBe('🌧️');
    expect(wmoEmoji(67)).toBe('🌧️');
  });

  it('returns ❄️ for snow (71–77)', () => {
    expect(wmoEmoji(71)).toBe('❄️');
    expect(wmoEmoji(77)).toBe('❄️');
  });

  it('returns 🌦️ for showers (80–82)', () => {
    expect(wmoEmoji(80)).toBe('🌦️');
    expect(wmoEmoji(82)).toBe('🌦️');
  });

  it('returns 🌨️ for snow showers (85, 86)', () => {
    expect(wmoEmoji(85)).toBe('🌨️');
    expect(wmoEmoji(86)).toBe('🌨️');
  });

  it('returns ⛈️ for thunderstorm (95+)', () => {
    expect(wmoEmoji(95)).toBe('⛈️');
    expect(wmoEmoji(99)).toBe('⛈️');
  });

  it('returns 🌡️ for unrecognised codes', () => {
    expect(wmoEmoji(4)).toBe('🌡️');
    expect(wmoEmoji(44)).toBe('🌡️');
  });
});

// ── classifyWeatherError ──────────────────────────────────────────────────────

describe('classifyWeatherError', () => {
  it('returns no_network for TypeError with "Network request failed"', () => {
    const err = new TypeError('Network request failed');
    expect(classifyWeatherError(err)).toEqual({ status: 'no_network' });
  });

  it('is case-insensitive for the network request failed message', () => {
    const err = new TypeError('network request failed');
    expect(classifyWeatherError(err)).toEqual({ status: 'no_network' });
  });

  it('returns error for TypeError with a different message', () => {
    const err = new TypeError('undefined is not a function');
    const result = classifyWeatherError(err);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toBe('undefined is not a function');
    }
  });

  it('returns error with message for a regular Error', () => {
    const err = new Error('API error 500: Internal Server Error');
    const result = classifyWeatherError(err);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toBe('API error 500: Internal Server Error');
    }
  });

  it('returns error with stringified value for non-Error throws', () => {
    const result = classifyWeatherError('something went wrong');
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toBe('something went wrong');
    }
  });
});

// ── fetchWeather response parsing ─────────────────────────────────────────────

const MOCK_RESPONSE = {
  current: {
    time:                   '2026-04-13T12:00',
    temperature_2m:         68.5,
    relative_humidity_2m:   65,
    apparent_temperature:   66.2,
    weather_code:           0,
    wind_speed_10m:         10.5,
    precipitation:          0.0,
  },
  hourly: {
    time:                     ['2026-04-13T12:00', '2026-04-13T13:00', '2026-04-13T14:00'],
    temperature_2m:           [68.5,               70.1,               71.3              ],
    relative_humidity_2m:     [65,                 62,                 60                ],
    precipitation_probability:[0,                  10,                 20                ],
    precipitation:            [0.0,                0.0,                0.01              ],
    weather_code:             [0,                  0,                  1                 ],
    wind_speed_10m:           [10.5,               11.0,               12.3              ],
  },
  daily: {
    time:                         ['2026-04-13', '2026-04-14', '2026-04-15'],
    weather_code:                 [0,            61,           95           ],
    temperature_2m_max:           [72.4,         65.1,         58.9         ],
    temperature_2m_min:           [52.3,         48.7,         45.0         ],
    precipitation_sum:            [0.0,          0.34,         1.10         ],
    precipitation_probability_max:[0,            70,           90           ],
    uv_index_max:                 [8.2,          4.5,          2.0          ],
    wind_speed_10m_max:           [10.5,         18.3,         25.0         ],
  },
};

function mockFetch(body: unknown, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

describe('fetchWeather', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('zips daily arrays into DayForecast objects', async () => {
    mockFetch(MOCK_RESPONSE);
    const { days } = await fetchWeather(45.0, -93.0);

    expect(days).toHaveLength(3);

    expect(days[0]).toMatchObject({
      date:      '2026-04-13',
      code:      0,
      tempMax:   72,
      tempMin:   52,
      precipIn:  0.0,
      precipPct: 0,
      uvIndex:   8,
      windMph:   11,
    });

    expect(days[1]).toMatchObject({
      date:      '2026-04-14',
      code:      61,
      tempMax:   65,
      tempMin:   49,
      precipIn:  0.34,
      precipPct: 70,
    });
  });

  it('rounds temperatures, UV, and wind', async () => {
    mockFetch(MOCK_RESPONSE);
    const { days } = await fetchWeather(45.0, -93.0);
    expect(days[0].tempMax).toBe(72);   // Math.round(72.4)
    expect(days[0].tempMin).toBe(52);   // Math.round(52.3)
    expect(days[0].uvIndex).toBe(8);    // Math.round(8.2)
    expect(days[0].windMph).toBe(11);   // Math.round(10.5)
  });

  it('defaults precipIn and precipPct to 0 when null in response', async () => {
    const sparse = {
      current: MOCK_RESPONSE.current,
      hourly:  MOCK_RESPONSE.hourly,
      daily: {
        ...MOCK_RESPONSE.daily,
        precipitation_sum:            [null, null, null],
        precipitation_probability_max:[null, null, null],
        uv_index_max:                 [null, null, null],
        wind_speed_10m_max:           [null, null, null],
      },
    };
    mockFetch(sparse);
    const { days } = await fetchWeather(45.0, -93.0);
    expect(days[0].precipIn).toBe(0);
    expect(days[0].precipPct).toBe(0);
    expect(days[0].uvIndex).toBe(0);
    expect(days[0].windMph).toBe(0);
  });

  it('throws with status code when API returns non-2xx', async () => {
    mockFetch({ reason: 'bad params' }, 400);
    await expect(fetchWeather(0, 0)).rejects.toThrow('400');
  });

  it('passes imperial unit params in the request URL', async () => {
    mockFetch(MOCK_RESPONSE);
    await fetchWeather(45.0, -93.0);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('temperature_unit=fahrenheit');
    expect(url).toContain('wind_speed_unit=mph');
    expect(url).toContain('precipitation_unit=inch');
  });

  it('requests 10 forecast days', async () => {
    mockFetch(MOCK_RESPONSE);
    await fetchWeather(45.0, -93.0);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('forecast_days=10');
  });

  it('parses current conditions correctly', async () => {
    mockFetch(MOCK_RESPONSE);
    const { current } = await fetchWeather(45.0, -93.0);
    expect(current).toMatchObject({
      code:       0,
      tempF:      69,   // Math.round(68.5)
      feelsLikeF: 66,   // Math.round(66.2)
      humidity:   65,
      windMph:    11,   // Math.round(10.5)
      precipIn:   0.0,
    });
  });

  it('slices hourly to next 24 entries starting from current.time', async () => {
    mockFetch(MOCK_RESPONSE);
    const { hourly } = await fetchWeather(45.0, -93.0);
    expect(hourly).toHaveLength(3); // mock only has 3 hourly entries
    expect(hourly[0].time).toBe('2026-04-13T12:00');
    expect(hourly[0]).toMatchObject({ code: 0, tempF: 69, humidity: 65, precipPct: 0, windMph: 11 });
    expect(hourly[2]).toMatchObject({ code: 1, tempF: 71, precipPct: 20 });
  });

  it('requests current and hourly params in the URL', async () => {
    mockFetch(MOCK_RESPONSE);
    await fetchWeather(45.0, -93.0);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('current=');
    expect(url).toContain('hourly=');
  });
});
