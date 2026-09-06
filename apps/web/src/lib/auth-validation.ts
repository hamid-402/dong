export function validateEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
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

export function validateRegisterInput(
  email: string,
  password: string,
  displayName: string,
): string | null {
  return (
    validateDisplayName(displayName) ??
    validateEmail(email) ??
    validatePassword(password)
  );
}
