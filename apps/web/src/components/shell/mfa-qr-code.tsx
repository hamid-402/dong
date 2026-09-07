"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

/** Client-side QR for otpauth URLs — no third-party image host. */
export function MfaQrCode({ otpauthUrl }: { otpauthUrl: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await QRCode.toDataURL(otpauthUrl, {
          width: 180,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) {
          setDataUrl(url);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setDataUrl(null);
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otpauthUrl]);

  const openLabel = useMemo(() => "باز کردن در Authenticator", []);

  return (
    <div className="mfa-qr">
      {dataUrl ? (
        <img className="mfa-qr__img" src={dataUrl} width={180} height={180} alt="کد QR برای فعال‌سازی MFA" />
      ) : failed ? (
        <p className="liveHint">ساخت QR ممکن نشد — از لینک یا secret دستی استفاده کنید.</p>
      ) : (
        <p className="liveHint">در حال ساخت QR…</p>
      )}
      <a className="mfa-qr__link" href={otpauthUrl}>
        {openLabel}
      </a>
    </div>
  );
}
