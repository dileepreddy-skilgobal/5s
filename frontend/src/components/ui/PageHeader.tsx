import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Route to link to; the last crumb (current page) has none. */
  to?: string;
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small label above the title (e.g. the section the page belongs to). */
  eyebrow?: React.ReactNode;
  breadcrumbs?: Crumb[];
  /** Buttons shown on the right (wrap below the title on narrow screens). */
  actions?: React.ReactNode;
  /** Badge or status next to the title. */
  meta?: React.ReactNode;
}

/** Standard page heading: breadcrumbs, title, short description and page actions. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, eyebrow, breadcrumbs, actions, meta }) => (
  <header className="page-header">
    <div className="page-header-content">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          {breadcrumbs.map((c, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${c.label}-${i}`}>
                {c.to && !last ? <Link to={c.to}>{c.label}</Link> : <span aria-current={last ? 'page' : undefined}>{c.label}</span>}
                {!last && <ChevronRight size={14} aria-hidden="true" />}
              </React.Fragment>
            );
          })}
        </nav>
      )}
      {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h1 className="page-title">{title}</h1>
        {meta}
      </div>
      {description && <p className="page-subtitle">{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
);
