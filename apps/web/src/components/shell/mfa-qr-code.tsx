"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { t } from "@/lib/i18n";

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

  const openLabel = useMemo(() => t("shell.mfaOpenAuthenticator"), []);

  return (
    <div className="mfa-qr">
      {dataUrl ? (
        <Image
          className="mfa-qr__img"
          src={dataUrl}
          width={180}
          height={180}
          unoptimized
          alt={t("shell.mfaQrAlt")}
        />
      ) : failed ? (
        <p className="liveHint">{t("shell.mfaQrFail")}</p>
      ) : (
        <p className="liveHint">{t("shell.mfaQrBuilding")}</p>
      )}
      <a className="mfa-qr__link" href={otpauthUrl}>
        {openLabel}
      </a>
    </div>
  );
}
