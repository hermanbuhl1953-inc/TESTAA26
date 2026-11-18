import type { SourceDefinition } from '../../data/sources/types.ts';
import type { IngestionStatus } from '../../domain/measures/model.ts';

export interface HttpSourceClientOptions {
  timeoutMs?: number;
  delayBetweenRequestsMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  allowedHosts?: readonly string[];
}

export interface HttpSourceResponse {
  status: IngestionStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  body: string | null;
  error: string | null;
  warnings: string[];
  requestsMade: number;
}

const DEFAULT_USER_AGENT = 'Scadenzario-SourceMonitor/1.0 (+manual institutional-source checks)';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_DELAY_MS = 1_000;
const DEFAULT_MAX_REDIRECTS = 3;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class HttpSourceClient {
  private readonly options: Required<Omit<HttpSourceClientOptions, 'allowedHosts'>> & {
    allowedHosts: readonly string[];
  };

  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt: number | null = null;

  constructor(options: HttpSourceClientOptions = {}) {
    if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
      throw new Error('timeoutMs deve essere maggiore di zero.');
    }
    if (options.delayBetweenRequestsMs !== undefined && options.delayBetweenRequestsMs < 0) {
      throw new Error('delayBetweenRequestsMs non può essere negativo.');
    }
    if (options.maxRedirects !== undefined && options.maxRedirects < 0) {
      throw new Error('maxRedirects non può essere negativo.');
    }
    this.options = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      delayBetweenRequestsMs: options.delayBetweenRequestsMs ?? DEFAULT_DELAY_MS,
      maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      fetchImpl: options.fetchImpl ?? fetch,
      sleep: options.sleep ?? defaultSleep,
      now: options.now ?? Date.now,
      allowedHosts: options.allowedHosts ?? [],
    };
  }

  async get(source: SourceDefinition): Promise<HttpSourceResponse> {
    let releaseQueue: () => void = () => {};
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { releaseQueue = resolve; });
    await previous;
    try {
      return await this.performGet(source);
    } finally {
      releaseQueue();
    }
  }

  private async performGet(source: SourceDefinition): Promise<HttpSourceResponse> {
    if (!isHttpUrl(source.baseUrl)) {
      return this.failed('La sorgente non usa un URL HTTP/HTTPS valido.');
    }
    const sourceHost = new URL(source.baseUrl).host.toLocaleLowerCase('en-US');
    const allowedHosts = new Set([sourceHost, ...this.options.allowedHosts.map((host) => host.toLocaleLowerCase('en-US'))]);
    let currentUrl = source.baseUrl;
    let requestsMade = 0;

    for (let redirectCount = 0; redirectCount <= this.options.maxRedirects; redirectCount += 1) {
      await this.waitForRateLimit();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('timeout')), this.options.timeoutMs);
      let response: Response;
      try {
        requestsMade += 1;
        this.lastRequestAt = this.options.now();
        response = await this.options.fetchImpl(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': this.options.userAgent },
        });
      } catch (error) {
        clearTimeout(timeout);
        const timedOut = controller.signal.aborted;
        return {
          status: 'FAILED',
          httpStatus: null,
          finalUrl: currentUrl,
          body: null,
          error: timedOut ? `Timeout dopo ${this.options.timeoutMs} ms.` : errorMessage(error),
          warnings: [],
          requestsMade,
        };
      }

      if (response.status === 301 || response.status === 302) {
        clearTimeout(timeout);
        const location = response.headers.get('location');
        if (!location) return this.failed('Redirect senza header Location.', currentUrl, response.status, requestsMade);
        if (redirectCount === this.options.maxRedirects) {
          return this.failed('Superato il numero massimo di redirect.', currentUrl, response.status, requestsMade);
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return this.failed('URL di redirect non valido.', currentUrl, response.status, requestsMade);
        }
        if ((nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:')
          || !allowedHosts.has(nextUrl.host.toLocaleLowerCase('en-US'))) {
          return {
            ...this.failed('Redirect rifiutato: host o protocollo non consentito.', currentUrl, response.status, requestsMade),
            status: 'BLOCKED',
          };
        }
        currentUrl = nextUrl.toString();
        continue;
      }

      if (response.status === 403) {
        clearTimeout(timeout);
        return {
          ...this.failed('La fonte ha risposto HTTP 403; nessun tentativo di aggiramento effettuato.', currentUrl, 403, requestsMade),
          status: 'BLOCKED',
        };
      }
      if (response.status === 404) {
        clearTimeout(timeout);
        return this.failed('La fonte ha risposto HTTP 404.', currentUrl, 404, requestsMade);
      }
      if (response.status === 429) {
        clearTimeout(timeout);
        return {
          ...this.failed('La fonte ha risposto HTTP 429; richiesta non ripetuta automaticamente.', currentUrl, 429, requestsMade),
          warnings: ['Rate limit ricevuto: nessun retry automatico eseguito.'],
        };
      }
      if (response.status >= 500) {
        clearTimeout(timeout);
        return this.failed(`La fonte ha risposto HTTP ${response.status}.`, currentUrl, response.status, requestsMade);
      }
      if (!response.ok) {
        clearTimeout(timeout);
        return this.failed(`Risposta HTTP non riuscita: ${response.status}.`, currentUrl, response.status, requestsMade);
      }

      try {
        const body = await response.text();
        clearTimeout(timeout);
        return {
          status: 'SUCCESS',
          httpStatus: response.status,
          finalUrl: currentUrl,
          body,
          error: null,
          warnings: ['Contenuto acquisito; estrazione automatica delle misure non implementata.'],
          requestsMade,
        };
      } catch (error) {
        clearTimeout(timeout);
        const timedOut = controller.signal.aborted;
        return this.failed(
          timedOut ? `Timeout dopo ${this.options.timeoutMs} ms.` : errorMessage(error),
          currentUrl,
          response.status,
          requestsMade,
        );
      }
    }

    return this.failed('Acquisizione interrotta per numero massimo di redirect.', currentUrl, null, requestsMade);
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.lastRequestAt === null) return;
    const remaining = this.options.delayBetweenRequestsMs - (this.options.now() - this.lastRequestAt);
    if (remaining > 0) await this.options.sleep(remaining);
  }

  private failed(
    error: string,
    finalUrl: string | null = null,
    httpStatus: number | null = null,
    requestsMade = 0,
  ): HttpSourceResponse {
    return {
      status: 'FAILED',
      httpStatus,
      finalUrl,
      body: null,
      error,
      warnings: [],
      requestsMade,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore HTTP sconosciuto.';
}
