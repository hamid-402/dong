import { Suspense } from "react";
import { HomeClient } from "./home-client";

/**
 * The balance line is the home LCP element. It stays in the server HTML so
 * the first paint does not wait for the spaces-hub client bundle.
 */
export default function AppHomePage() {
  return (
    <>
      <section className="homeDay" aria-labelledby="home-day-title">
        <h1 id="home-day-title">خانه</h1>
        <div className="homeDay__lead">
          <div className="homeBalance">
            <p className="homeBalance__label">مانده</p>
            <p className="homeBalance__amount" id="home-balance-amount">
              در حال جمع…
            </p>
            <p className="homeBalance__meta" id="home-balance-meta" />
          </div>
        </div>
      </section>
      <Suspense fallback={<p className="liveHint">در حال بارگذاری خانه…</p>}>
        <HomeClient />
      </Suspense>
    </>
  );
}
