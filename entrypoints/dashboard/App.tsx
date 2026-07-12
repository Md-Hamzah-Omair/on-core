import { PROJECT_NAME, SEARCH_PLACEHOLDER } from '../../lib/project';

export default function App() {
  return (
    <main>
      <header>
        <span className="mark">LWM</span>
        <span>{PROJECT_NAME}</span>
      </header>
      <section>
        <p className="eyebrow">Milestone 1</p>
        <h1>Your corner of the web,<br />remembered locally.</h1>
        <label htmlFor="memory-search">Search your web memory</label>
        <input id="memory-search" type="search" placeholder={SEARCH_PLACEHOLDER} disabled />
        <aside>
          <strong>Foundation ready</strong>
          <p>Page capture and semantic search are not implemented in this milestone.</p>
        </aside>
      </section>
    </main>
  );
}
