"use client";

import {
  StickerSvg,
  stickerForScene,
  type MotionSceneKind,
} from "@/components/visual/stickers";
import { useOptionalTheme } from "@/lib/theme";
import styles from "./motion-scene.module.css";

const SCENE_COPY: Record<
  MotionSceneKind,
  { title: string; line: string }
> = {
  home: {
    title: "مرکز فضاها",
    line: "حوزه و گزارش تجمیعی — داده از API زنده",
  },
  building: {
    title: "فضاهای ساختمانی",
    line: "واحد، شارژ و هزینه‌های مشترک",
  },
  finance: {
    title: "عملیات مالی",
    line: "خرج، تسویه و اسناد ثبت‌شده",
  },
  partners: {
    title: "همکاری و شرکا",
    line: "اعضا، سهم و قرارداد",
  },
  procurement: {
    title: "تدارکات",
    line: "از نیاز تا تحویل",
  },
  personal: {
    title: "مالی شخصی",
    line: "حساب، هدف و روند واقعی",
  },
  success: {
    title: "ثبت شد",
    line: "تغییر از سرویس تأیید شد",
  },
  invite: {
    title: "دعوت",
    line: "عضویت با لینک معتبر",
  },
  security: {
    title: "سازمان و دسترسی",
    line: "تیم، نقش و رخدادهای واقعی",
  },
};

/**
 * Colorful page accent — bare sticker + copy (no frame around the mark).
 */
export function MotionSceneStrip({
  kind,
  className,
  compact = false,
  prominence = "banner",
}: {
  kind: MotionSceneKind;
  className?: string;
  compact?: boolean;
  prominence?: "hero" | "banner" | "compact";
}) {
  const theme = useOptionalTheme();
  const copy = SCENE_COPY[kind];
  const sticker = stickerForScene(kind);
  const animate = theme
    ? Boolean(theme.allowsNarrative || theme.allowsAmbient)
    : true;
  const mode = compact ? "compact" : prominence;
  const mainSize = mode === "hero" ? 52 : mode === "compact" ? 30 : 44;

  return (
    <aside
      className={[
        styles.strip,
        mode === "hero" ? styles.hero : "",
        mode === "compact" ? styles.compact : "",
        mode === "banner" ? styles.banner : "",
        animate ? styles.alive : styles.still,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={copy.title}
    >
      <div className={styles.iconWell} aria-hidden>
        <StickerSvg
          name={sticker}
          animated={animate}
          size={mainSize}
          motionClass={animate ? "dang-sticker--bob" : undefined}
          className={styles.mainSticker}
        />
      </div>
      {mode !== "compact" ? (
        <div className={styles.copy}>
          <strong>{copy.title}</strong>
          <span>{copy.line}</span>
        </div>
      ) : null}
    </aside>
  );
}

export function MotionSuccessMark({ active }: { active: boolean }) {
  const theme = useOptionalTheme();
  if (!active) return null;
  const animate = Boolean(theme?.allowsFeedback || theme?.allowsNarrative);
  return (
    <span className={styles.successMark} aria-hidden>
      <StickerSvg
        name="sparkOk"
        size={30}
        animated={false}
        motionClass={animate ? "dang-sticker--pop" : undefined}
      />
    </span>
  );
}
