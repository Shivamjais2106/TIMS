import { MAP_DEFAULTS, PILOT } from '../config/bhopal';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { createLogger } from '../utils/logger';

const log = createLogger('weather');

/**
 * Weather context for the Bhopal pilot.
 *
 * Weather is presented as CONTEXT ONLY. TIMS does not model fire behaviour and
 * makes no claim that these values predict spread. They are shown so an analyst
 * can see, for example, that a detection coincided with a dry windy afternoon.
 *
 * Provider strategy, in strict order:
 *
 *   1. IMD, when credentials are configured. IMD is the authoritative Indian
 *      source but publishes no documented open REST API, so the adapter below
 *      is an interface against a configurable base URL rather than a working
 *      integration against a guessed endpoint. Inventing an IMD URL would be
 *      worse than admitting it is unavailable.
 *   2. Open-Meteo, keyless and free, used as an EXPLICITLY LABELLED fallback.
 *   3. Nothing. The API returns `available: false` and the UI renders
 *      "Weather data unavailable". It never fabricates an observation.
 */

export interface WeatherReading {
  observedAt: string;
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  rainfallMm: number | null;
  warning: string | null;
  /** Who supplied this reading. Never blank, never guessed. */
  provider: string;
  providerLabel: string;
  /** False when the provider is not an official Indian government source. */
  isOfficialSource: boolean;
  sourceUrl: string | null;
}

export interface WeatherResult {
  available: boolean;
  reading: WeatherReading | null;
  /** Why weather is unavailable, or which fallback was used. Always surfaced. */
  note: string;
  attemptedProviders: string[];
}

interface WeatherProvider {
  readonly key: string;
  readonly label: string;
  readonly isOfficialSource: boolean;
  readonly isConfigured: boolean;
  fetchCurrent(latitude: number, longitude: number): Promise<WeatherReading | null>;
}

// ---------------------------------------------------------------------------
// IMD — interface only, pending credentials
// ---------------------------------------------------------------------------

class ImdProvider implements WeatherProvider {
  readonly key = 'imd';
  readonly label = 'India Meteorological Department';
  readonly isOfficialSource = true;

  get isConfigured(): boolean {
    return env.imdEnabled;
  }

  /**
   * Calls a configured IMD-compatible endpoint.
   *
   * The response shape is intentionally read defensively: because IMD has no
   * published schema for this, the adapter maps only fields it can find and
   * leaves the rest null rather than asserting a structure that may not hold.
   */
  async fetchCurrent(latitude: number, longitude: number): Promise<WeatherReading | null> {
    if (!this.isConfigured) return null;

    const url = new URL(env.IMD_BASE_URL);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));

    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${env.IMD_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`IMD responded ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;

    const numeric = (...keys: string[]): number | null => {
      for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
          return Number(value);
        }
      }
      return null;
    };

    return {
      observedAt: new Date().toISOString(),
      latitude,
      longitude,
      temperatureC: numeric('temperature', 'temp', 'temp_c'),
      humidityPct: numeric('humidity', 'rh'),
      windSpeedMs: numeric('wind_speed', 'windSpeed'),
      windDirectionDeg: numeric('wind_direction', 'windDirection', 'wind_dir'),
      rainfallMm: numeric('rainfall', 'rain', 'precipitation'),
      warning: typeof payload['warning'] === 'string' ? payload['warning'] : null,
      provider: this.key,
      providerLabel: this.label,
      isOfficialSource: true,
      sourceUrl: 'https://mausam.imd.gov.in/',
    };
  }
}

// ---------------------------------------------------------------------------
// Open-Meteo — keyless fallback, clearly labelled as non-official
// ---------------------------------------------------------------------------

class OpenMeteoProvider implements WeatherProvider {
  readonly key = 'open-meteo';
  readonly label = 'Open-Meteo (non-official fallback)';
  readonly isOfficialSource = false;

  get isConfigured(): boolean {
    return env.WEATHER_FALLBACK_ENABLED;
  }

  async fetchCurrent(latitude: number, longitude: number): Promise<WeatherReading | null> {
    if (!this.isConfigured) return null;

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m',
    );
    url.searchParams.set('wind_speed_unit', 'ms');
    url.searchParams.set('timezone', PILOT.timezone);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo responded ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      current?: Record<string, number | string>;
    };
    const current = payload.current;
    if (!current) return null;

    const asNumber = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    return {
      observedAt: typeof current['time'] === 'string' ? new Date(current['time']).toISOString() : new Date().toISOString(),
      latitude,
      longitude,
      temperatureC: asNumber(current['temperature_2m']),
      humidityPct: asNumber(current['relative_humidity_2m']),
      windSpeedMs: asNumber(current['wind_speed_10m']),
      windDirectionDeg: asNumber(current['wind_direction_10m']),
      rainfallMm: asNumber(current['precipitation']),
      // Open-Meteo issues no official warnings; asserting one would be a
      // fabrication, so this stays null on this provider.
      warning: null,
      provider: this.key,
      providerLabel: this.label,
      isOfficialSource: false,
      sourceUrl: 'https://open-meteo.com/',
    };
  }
}

const providers: WeatherProvider[] = [new ImdProvider(), new OpenMeteoProvider()];

/**
 * Fetches current weather for a point, trying each provider in priority order.
 *
 * Returns `available: false` with an explanatory note rather than throwing or
 * inventing a reading.
 */
export async function getCurrentWeather(
  latitude: number = MAP_DEFAULTS.center[0],
  longitude: number = MAP_DEFAULTS.center[1],
): Promise<WeatherResult> {
  const attempted: string[] = [];

  for (const provider of providers) {
    if (!provider.isConfigured) {
      attempted.push(`${provider.key} (not configured)`);
      continue;
    }

    attempted.push(provider.key);

    try {
      const reading = await provider.fetchCurrent(latitude, longitude);
      if (!reading) continue;

      await persist(reading);

      return {
        available: true,
        reading,
        note: provider.isOfficialSource
          ? `Observation from ${provider.label}. Context only — TIMS does not model fire behaviour.`
          : `IMD access is not configured, so this reading comes from ${provider.label}. ` +
            'It is not an official Indian government observation, and is context only.',
        attemptedProviders: attempted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`Weather provider ${provider.key} failed`, { error: message });
      attempted.push(`${provider.key} (failed: ${message})`);
    }
  }

  return {
    available: false,
    reading: null,
    note:
      'Weather data unavailable. IMD publishes no documented open REST API and no ' +
      'credentials are configured; the keyless fallback also did not return a reading. ' +
      'No weather values have been fabricated.',
    attemptedProviders: attempted,
  };
}

/** Stores a reading so the incident view can show weather as it was at the time. */
async function persist(reading: WeatherReading): Promise<void> {
  try {
    await prisma.weatherObservation.upsert({
      where: {
        provider_observedAt_latitude_longitude: {
          provider: reading.provider,
          observedAt: new Date(reading.observedAt),
          latitude: reading.latitude,
          longitude: reading.longitude,
        },
      },
      update: {},
      create: {
        observedAt: new Date(reading.observedAt),
        latitude: reading.latitude,
        longitude: reading.longitude,
        temperatureC: reading.temperatureC,
        humidityPct: reading.humidityPct,
        windSpeedMs: reading.windSpeedMs,
        windDirectionDeg: reading.windDirectionDeg,
        rainfallMm: reading.rainfallMm,
        warning: reading.warning,
        provider: reading.provider,
        sourceUrl: reading.sourceUrl,
        raw: reading as unknown as Prisma.InputJsonObject,
      },
    });
  } catch (error) {
    // A storage failure must not deny the caller a reading it already has.
    log.warn('Could not persist weather observation', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/** Provider availability, for the Data Sources transparency page. */
export function getWeatherProviderStatus(): Array<{
  key: string;
  label: string;
  configured: boolean;
  isOfficialSource: boolean;
}> {
  return providers.map((provider) => ({
    key: provider.key,
    label: provider.label,
    configured: provider.isConfigured,
    isOfficialSource: provider.isOfficialSource,
  }));
}
