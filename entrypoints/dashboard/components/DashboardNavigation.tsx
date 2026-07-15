import { ThemeControl } from '../../../components/ThemeControl';
import { PROJECT_NAME } from '../../../lib/project';

export function DashboardNavigation() {
  return (
    <header className="dashboard-nav-wrap">
      <nav className="floating-nav" aria-label="Dashboard sections">
        <a className="nav-brand" href="#search" aria-label={`${PROJECT_NAME}, go to search`}>
          <span className="mark" aria-hidden="true">OC</span>
          <span className="nav-brand-copy"><strong>{PROJECT_NAME}</strong><span>Private, on-device search</span></span>
        </a>
        <div className="nav-links">
          <a href="#search">Search</a>
          <a href="#saved-memories">Library</a>
          <a href="#privacy-settings">Privacy</a>
        </div>
        <div className="nav-tools">
          <span className="local-status"><span aria-hidden="true" />Local only</span>
          <ThemeControl className="nav-theme" label="Theme" />
        </div>
      </nav>
    </header>
  );
}
