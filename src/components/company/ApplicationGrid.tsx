import type { Lead } from '../../data/types';
import { applicationFields } from '../../lib/application';

export function ApplicationGrid({ lead }: { lead: Lead }) {
  const fields = applicationFields(lead);
  return (
    <div className="app-grid">
      {fields.map((f) => (
        <div key={f.key} className={`app-item${f.span ? ` ${f.span}` : ''}`}>
          <div className="app-key">{f.key}</div>
          <div className="app-val">
            {f.key === 'Website' ? (
              <a className="link" href={`https://${f.value}`} target="_blank" rel="noopener">
                {f.value}
              </a>
            ) : (
              f.value
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
