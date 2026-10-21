import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { SubscriptionBanners } from './SubscriptionBanners';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Below 1024px the sidebar becomes a slide-in drawer opened from the top bar's menu button
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="app-shell">
      {/* Keyboard users can jump past the navigation straight to the page */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className={`app-sidebar-backdrop${navOpen ? ' is-open' : ''}`} onClick={() => setNavOpen(false)} aria-hidden="true" />
      <div className="app-main-wrapper">
        <TopNavbar onMenuClick={() => setNavOpen(true)} />
        <SubscriptionBanners />
        <main id="main-content" tabIndex={-1} className="app-main-content">{children}</main>
      </div>
    </div>
  );
};
