import "../shell.css";

export default function HomeLoading() {
  return (
    <div className="app-viewport">
      <div className="shell-v2 shell-v2--gate" aria-busy="true">
        <header className="shell-v2__header">
          <div className="shell-v2__bar" />
        </header>
        <main id="main" className="shell-v2__main" tabIndex={-1}>
          <div className="page-frame">
            <h1>خانه</h1>
            <p className="liveHint">در حال بارگذاری خانه…</p>
          </div>
        </main>
        <div className="shell-v2__dock" aria-hidden="true">
          <div className="shell-tabs shell-tabs--dock" />
        </div>
      </div>
    </div>
  );
}
