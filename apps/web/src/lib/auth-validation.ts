import {
  isValidPhone,
  isValidUsername,
  normalizeUsername,
  validateUsername,
} from "@dang/contracts";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (
    !normalized ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
    normalized.length > 254
  ) {
    return "آدرس ایمیل نامعتبر است";
  }
  return null;
}

export function validateDisplayName(displayName: string): string | null {
  const name = displayName.trim();
  if (!name || name.length > 80) {
    return "نام نمایشی را وارد کنید (حداکثر ۸۰ کاراکتر)";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "رمز عبور حداقل ۱۰ کاراکتر باشد";
  if (password.length > 128) return "رمز عبور بیش از حد طولانی است";
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    return "رمز عبور باید شامل حرف و عدد باشد";
  }
  return null;
}

const USERNAME_MESSAGES: Record<string, string> = {
  USERNAME_EMPTY: "نام کاربری را وارد کنید",
  USERNAME_TOO_SHORT: "نام کاربری حداقل ۳ کاراکتر باشد",
  USERNAME_TOO_LONG: "نام کاربری حداکثر ۳۲ کاراکتر باشد",
  USERNAME_CHARSET: "فقط حروف لاتین، عدد، نقطه و خط‌زیر",
  USERNAME_START: "نام کاربری باید با حرف شروع شود",
  USERNAME_END: "نباید با نقطه یا خط‌زیر تمام شود",
  USERNAME_DOUBLE_SEPARATOR: "دو نقطه یا خط‌زیر پشت‌سرهم مجاز نیست",
  USERNAME_RESERVED: "این نام کاربری رزرو شده است",
};

export function validateUsernameInput(username: string): string | null {
  const problem = validateUsername(username);
  if (!problem) return null;
  return USERNAME_MESSAGES[problem] ?? "نام کاربری نامعتبر است";
}

export function validatePhoneOptional(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (!isValidPhone(trimmed)) return "شماره موبایل نامعتبر است";
  return null;
}

/** Login accepts email, username, or phone — only empty is invalid. */
export function validateLoginIdentifier(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "ایمیل، نام کاربری یا شماره موبایل را وارد کنید";
  if (trimmed.includes("@")) return validateEmail(trimmed);
  if (isValidPhone(trimmed)) return null;
  if (isValidUsername(normalizeUsername(trimmed))) return null;
  return "شناسه ورود نامعتبر است";
}

export function validateRegisterInput(
  email: string,
  password: string,
  displayName: string,
  username: string,
  phone?: string,
): string | null {
  return (
    validateDisplayName(displayName) ??
    validateUsernameInput(username) ??
    validateEmail(email) ??
    validatePhoneOptional(phone ?? "") ??
    validatePassword(password)
  );
}
