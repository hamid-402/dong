"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Generic client-side QR — no third-party image host (G04 invite + MFA). */
export function LinkQrCode({
  value,
  alt = "QR",
  size = 160,
}: {
  value: string;
  alt?: string;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await QRCode.toDataURL(value, {
          width: size,
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
  }, [value, size]);

  if (failed) return <p className="liveHint">ساخت QR ناموفق بود</p>;
  if (!dataUrl) return <p className="liveHint">در حال ساخت QR…</p>;
  return (
    <Image
      src={dataUrl}
      width={size}
      height={size}
      unoptimized
      alt={alt}
      style={{ borderRadius: 8 }}
    />
  );
}
