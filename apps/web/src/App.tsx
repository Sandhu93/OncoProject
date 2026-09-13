import { useEffect, useState } from 'react';
import type { HealthResponse } from '@oncotrack/contracts';

type ServiceState = 'Checking' | 'Available' | 'Unavailable';

async function checkService(path: string, signal: AbortSignal): Promise<ServiceState> {
  try {
    const response = await fetch(`/api/v1/health/${path}`, { signal });
    if (!response.ok) return 'Unavailable';
    const data = (await response.json()) as HealthResponse;
    return data.status === 'ok' && data.service === 'oncotrack-api' ? 'Available' : 'Unavailable';
  } catch {
    return 'Unavailable';
  }
}

export function App() {
  const [api, setApi] = useState<ServiceState>('Checking');
  const [database, setDatabase] = useState<ServiceState>('Checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let mounted = true;
    void Promise.all([
      checkService('live', controller.signal),
      checkService('ready', controller.signal),
    ])
      .then(([live, ready]) => {
        if (mounted) {
          setApi(live);
          setDatabase(ready);
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [attempt]);

  return (
    <div className="workspace">
      <header>
        <a className="brand" href="/">
          Onco<span>Track</span>
        </a>
        <span className="environment">Development workspace</span>
      </header>
      <main>
        <p className="eyebrow">Radiation therapy · Workflow foundation</p>
        <h1>
          Every handoff,
          <br />
          accounted for.
        </h1>
        <p className="intro">
          A shared view of RT preparation, ownership and the next action. The development foundation
          is ready for the first staff workflow.
        </p>
        <section className="status-panel" aria-labelledby="services-title">
          <div className="section-top">
            <h2 id="services-title">Local services</h2>
            <button
              onClick={() => {
                setApi('Checking');
                setDatabase('Checking');
                setAttempt((value) => value + 1);
              }}
            >
              Check again
            </button>
          </div>
          <div className="services" aria-live="polite">
            <Service name="API" state={api} />
            <Service name="Database and migrations" state={database} />
          </div>
          <p className="hint">
            Database unavailable? Follow the repository's local setup guide to start PostgreSQL and
            apply migrations.
          </p>
        </section>
        <section className="next" aria-labelledby="next-title">
          <p className="eyebrow">First delivery milestone</p>
          <h2 id="next-title">One complete staff handoff</h2>
          <ol>
            <li>Secure staff login</li>
            <li>Create and assign an RT chart</li>
            <li>Submit work to the next reviewer</li>
            <li>Record the action in audit history</li>
          </ol>
          <p className="notice">
            This is a development shell. Staff login and patient workflows are not implemented. Use
            synthetic data only; the clinical stage definitions are still awaiting confirmation.
          </p>
        </section>
      </main>
      <footer>OncoTrack / On-premise RT coordination</footer>
    </div>
  );
}

function Service({ name, state }: { name: string; state: ServiceState }) {
  return (
    <div className="service">
      <span>{name}</span>
      <strong className={`badge ${state.toLowerCase()}`}>{state}</strong>
    </div>
  );
}
