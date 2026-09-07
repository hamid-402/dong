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
    return err.message.trim() || fallback;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
