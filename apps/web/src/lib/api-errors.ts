import { ApiError } from "@/lib/api";

const AUTH_MESSAGES: Record<number, string> = {
  401: "ایمیل یا رمز اشتباه است",
  403: "دسترسی مجاز نیست",
  409: "این ایمیل قبلاً ثبت شده است",
  429: "درخواست زیاد — چند لحظه بعد دوباره تلاش کنید",
  503: "ارتباط با سرور API قطع است — چند لحظه بعد دوباره تلاش کنید",
};

const UPLOAD_MESSAGES: Record<number, string> = {
  400: "فایل نامعتبر است — فقط JPEG، PNG، WebP یا PDF",
  413: "حجم فایل بیش از حد مجاز است (حداکثر ۱۰ مگابایت)",
};

export function authErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return AUTH_MESSAGES[err.status] ?? (err.message.trim() || fallback);
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

export function uploadErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return UPLOAD_MESSAGES[err.status] ?? (err.message.trim() || fallback);
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status >= 500) return "خطای سرور — بعداً دوباره تلاش کنید";
    if (
      err.code === "plan_required" ||
      /Plan upgrade required|در پلن .+ فعال نیست/i.test(err.message)
    ) {
      return "این نمودار روی پلن فعلی فعال نیست — پلن را ارتقا دهید یا از گزارش تجمیعی حوزه استفاده کنید.";
    }
    const detail = err.message.trim();
    if (
      /FINANCE_QUORUM|finance manager quorum|Backup treasurer|دو مادرخرج|مدیر مالی فعال/i.test(
        detail,
      )
    ) {
      return "قبل از افزودن عضو عادی، حداقل دو مادرخرج لازم است. نقش را روی «مادرخرج / مدیر مالی» بگذارید و دوباره اضافه کنید.";
    }
    if (/PERIOD_SCHEMA_OUTDATED|cadence|auto_rollover|اسکیمای دوره/i.test(detail)) {
      return "اسکیمای دوره‌های مالی قدیمی است — migration 0073 را روی دیتابیس اعمال کنید، بعد صفحه را تازه کنید.";
    }
    if (/JOIN_REQUEST_PENDING|already pending/i.test(detail)) {
      return "درخواست عضویت شما از قبل در انتظار تأیید است.";
    }
    if (/گروهی با این شناسه|WORKSPACE_NOT_FOUND|Workspace not found/i.test(detail)) {
      return "گروهی با این شناسه پیدا نشد — شناسه را از صاحب گروه بگیرید.";
    }
    if (/INVALID_GROUP_ID|شناسه گروه نامعتبر|slug_FORMAT/i.test(detail)) {
      return "شناسه نامعتبر است — فقط حروف انگلیسی کوچک، عدد و خط تیره (مثل friends-trip).";
    }
    if (/MEMBER_ALREADY_EXISTS|already.*member|Member already exists/i.test(detail)) {
      return "این کاربر از قبل عضو این فضاست — نقشش را از جزئیات عضو تغییر دهید.";
    }
    if (/MEMBERSHIP_FORBIDDEN|forbidden/i.test(detail)) {
      return "نقش شما اجازهٔ این کار را ندارد — مالک، ادمین یا مادرخرج لازم است.";
    }
    if (/user.*not found|یافت نشد|DIRECTORY|LOOKUP/i.test(detail)) {
      return "کاربر در سامانه پیدا نشد — اول باید ثبت‌نام کرده باشد؛ بعد با نام‌کاربری اضافه‌اش کنید.";
    }
    return detail || fallback;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
