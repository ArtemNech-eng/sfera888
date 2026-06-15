import Script from "next/script";

/**
 * Optional Yandex.Metrika counter. Only renders when
 * `NEXT_PUBLIC_YANDEX_METRIKA_ID` is defined at build time (Next.js inlines
 * `NEXT_PUBLIC_*` into the client bundle, so the absence of the env var
 * means literally nothing related to Metrika ends up in HTML).
 *
 * The counter is loaded with strategy="afterInteractive" so it never blocks
 * first paint or RSC streaming. We don't pass any PII into `ym(...)` —
 * `reachGoal` calls in LeadForm only carry `serviceSlug` / `citySlug` /
 * `error`, never phone, name, comment, or IP.
 */
export function YandexMetrika() {
  const id = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;
  if (!id) return null;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;

  // Official Metrika init snippet (https://yandex.ru/support/metrica/code/counter-initialize.html)
  // — adapted to be syntactically safe inside a JS template literal and to
  // pass our four feature flags. We pass the counter id as a literal number
  // via JSON.stringify so the embedded value is always a valid JS literal.
  const init = `
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

ym(${JSON.stringify(numId)}, "init", {
  clickmap: true,
  trackLinks: true,
  accurateTrackBounce: true,
  webvisor: true
});
`;

  // noscript pixel for visitors without JS — purely cosmetic, kept off-screen.
  // Using a raw <img> here is intentional (next/image doesn't run in noscript);
  // disabling the lint warning explicitly so `next build` stays clean.
  return (
    <>
      <Script id="yandex-metrika-init" strategy="afterInteractive">
        {init}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${encodeURIComponent(String(numId))}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
