import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';

interface Values {
  name: string;
  email: string;
  plan: 'free' | 'pro';
  newsletter: boolean;
  country: string;
  frequency: string;
}

const INITIAL: Values = { name: '', email: '', plan: 'free', newsletter: false, country: 'sg', frequency: '' };

function App() {
  const [values, setValues] = useState(INITIAL);
  const [submitted, setSubmitted] = useState<Values>();
  const [ready, setReady] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  // Simulates data loading: the form renders well after document_idle. `?delay=6000` for slower.
  useEffect(() => {
    const delay = Number(new URLSearchParams(location.search).get('delay') ?? 400);
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, []);

  // `?reset=2000` simulates an app that re-initialises its form once its data arrives
  // (Formik `enableReinitialize`, a refetched record), wiping whatever was restored before.
  useEffect(() => {
    const reset = Number(new URLSearchParams(location.search).get('reset') ?? 0);
    if (!reset) return;
    const timer = setTimeout(() => setValues(INITIAL), reset);
    return () => clearTimeout(timer);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(values);
  };

  if (!ready) return <p>Loading…</p>;

  return (
    <form id="signup" onSubmit={onSubmit}>
      <label>Name <input name="name" value={values.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label>Email <input name="email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} /></label>
      <fieldset>
        <legend>Plan</legend>
        {(['free', 'pro'] as const).map((plan) => (
          <label key={plan}>
            <input type="radio" name="plan" value={plan} checked={values.plan === plan} onChange={() => set('plan', plan)} /> {plan}
          </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" name="newsletter" checked={values.newsletter} onChange={(e) => set('newsletter', e.target.checked)} />{' '}
        Newsletter
      </label>
      {values.newsletter && (
        <label>Frequency
          <select name="frequency" value={values.frequency} onChange={(e) => set('frequency', e.target.value)}>
            <option value="">Choose…</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      )}
      <label>Country
        <select name="country" value={values.country} onChange={(e) => set('country', e.target.value)}>
          <option value="sg">Singapore</option>
          <option value="id">Indonesia</option>
        </select>
      </label>
      <button type="submit">Submit</button>
      <h2>React state</h2>
      <output data-testid="state">{JSON.stringify(values, null, 2)}</output>
      {submitted && (
        <>
          <h2>Submitted</h2>
          <output data-testid="submitted">{JSON.stringify(submitted, null, 2)}</output>
        </>
      )}
    </form>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
