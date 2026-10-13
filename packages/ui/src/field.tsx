"use client";

import {
  useId,
  useState,
  type FormHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx.js";

function describedBy(...ids: Array<string | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

const LTR_TYPES = new Set(["email", "password", "tel", "url"]);
const LTR_AUTOCOMPLETE = new Set([
  "email",
  "username",
  "tel",
  "one-time-code",
  "current-password",
  "new-password",
]);

function wantsLtr(type: string | undefined, autoComplete: string | undefined, dir: string | undefined): boolean {
  if (dir === "ltr") return true;
  if (type && LTR_TYPES.has(type)) return true;
  if (autoComplete && LTR_AUTOCOMPLETE.has(autoComplete)) return true;
  return false;
}

export function FieldMessages({
  hintId,
  errorId,
  hint,
  error,
  requiredId,
  required,
}: {
  hintId?: string;
  errorId?: string;
  hint?: ReactNode;
  error?: ReactNode;
  requiredId?: string;
  required?: boolean;
}) {
  return (
    <>
      {required ? (
        <span id={requiredId} className="dang-sr">
          الزامی
        </span>
      ) : null}
      {hint ? (
        <span id={hintId} className="dang-field__hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="dang-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

function FieldLabel({
  label,
  required,
  htmlFor,
}: {
  label: ReactNode;
  required?: boolean;
  htmlFor: string;
}) {
  return (
    <label className="dang-label" htmlFor={htmlFor}>
      {label}
      {required ? (
        <span className="dang-label__mark" aria-hidden="true">
          {" *"}
        </span>
      ) : null}
    </label>
  );
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function TextField({
  label,
  hint,
  error,
  required,
  id,
  className,
  dir,
  type,
  autoComplete,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const requiredId = required ? `${inputId}-req` : undefined;
  const invalid = Boolean(error);
  const ltr = wantsLtr(type, typeof autoComplete === "string" ? autoComplete : undefined, dir);

  return (
    <div className="dang-field">
      <FieldLabel label={label} required={required} htmlFor={inputId} />
      <input
        {...rest}
        id={inputId}
        type={type}
        autoComplete={autoComplete}
        dir={ltr ? "ltr" : dir}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(hintId, errorId, requiredId, ariaDescribedBy)}
        suppressHydrationWarning
        className={cx("dang-control", className)}
      />
      <FieldMessages
        hintId={hintId}
        errorId={errorId}
        hint={hint}
        error={error}
        required={required}
        requiredId={requiredId}
      />
    </div>
  );
}

export type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function TextareaField({
  label,
  hint,
  error,
  required,
  id,
  className,
  dir,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: TextareaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const requiredId = required ? `${inputId}-req` : undefined;
  const invalid = Boolean(error);

  return (
    <div className="dang-field">
      <FieldLabel label={label} required={required} htmlFor={inputId} />
      <textarea
        {...rest}
        id={inputId}
        dir={dir}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(hintId, errorId, requiredId, ariaDescribedBy)}
        className={cx("dang-control", className)}
      />
      <FieldMessages
        hintId={hintId}
        errorId={errorId}
        hint={hint}
        error={error}
        required={required}
        requiredId={requiredId}
      />
    </div>
  );
}

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function SelectField({
  label,
  hint,
  error,
  required,
  id,
  className,
  children,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const requiredId = required ? `${selectId}-req` : undefined;
  const invalid = Boolean(error);

  return (
    <div className="dang-field">
      <FieldLabel label={label} required={required} htmlFor={selectId} />
      <select
        {...rest}
        id={selectId}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(hintId, errorId, requiredId, ariaDescribedBy)}
        className={cx("dang-control", className)}
      >
        {children}
      </select>
      <FieldMessages
        hintId={hintId}
        errorId={errorId}
        hint={hint}
        error={error}
        required={required}
        requiredId={requiredId}
      />
    </div>
  );
}

export type PasswordInputProps = Omit<TextFieldProps, "type">;

export function PasswordInput({
  label,
  hint,
  error,
  required,
  id,
  className,
  disabled,
  autoComplete,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: PasswordInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const requiredId = required ? `${inputId}-req` : undefined;
  const invalid = Boolean(error);

  return (
    <div className="dang-field">
      <FieldLabel label={label} required={required} htmlFor={inputId} />
      <div className="dang-password">
        <input
          {...rest}
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          dir="ltr"
          disabled={disabled}
          required={required}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(hintId, errorId, requiredId, ariaDescribedBy)}
          suppressHydrationWarning
          className={cx("dang-control", className)}
        />
        <button
          type="button"
          className="dang-password__toggle"
          aria-pressed={visible}
          aria-controls={inputId}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "پنهان" : "نمایش"}
        </button>
      </div>
      <FieldMessages
        hintId={hintId}
        errorId={errorId}
        hint={hint}
        error={error}
        required={required}
        requiredId={requiredId}
      />
    </div>
  );
}

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Checkbox({ label, hint, error, id, className, required, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const invalid = Boolean(error);

  return (
    <div className="dang-field">
      <label className="dang-choice" htmlFor={inputId}>
        <input
          {...rest}
          id={inputId}
          type="checkbox"
          required={required}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(hintId, errorId)}
          className={cx("dang-choice__input", className)}
        />
        <span>{label}</span>
      </label>
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  );
}

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

export function Radio({ label, id, className, ...rest }: RadioProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label className="dang-choice" htmlFor={inputId}>
      <input
        {...rest}
        id={inputId}
        type="radio"
        className={cx("dang-choice__input", className)}
      />
      <span>{label}</span>
    </label>
  );
}

export type RadioGroupProps = {
  label: ReactNode;
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  options: Array<{ value: string; label: ReactNode; disabled?: boolean }>;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function RadioGroup({
  label,
  name,
  value,
  onChange,
  options,
  hint,
  error,
  required,
}: RadioGroupProps) {
  const autoId = useId();
  const hintId = hint ? `${autoId}-hint` : undefined;
  const errorId = error ? `${autoId}-error` : undefined;

  return (
    <fieldset className="dang-field" aria-describedby={describedBy(hintId, errorId)}>
      <legend className="dang-label">
        {label}
        {required ? (
          <span className="dang-label__mark" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
      </legend>
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          label={option.label}
          value={option.value}
          disabled={option.disabled}
          required={required}
          {...(value !== undefined ? { checked: value === option.value } : {})}
          onChange={() => onChange?.(option.value)}
        />
      ))}
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </fieldset>
  );
}

export type SwitchProps = {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
};

export function Switch({ label, checked, onCheckedChange, hint, disabled, id }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const hintId = hint ? `${switchId}-hint` : undefined;

  return (
    <div className="dang-field">
      <button
        type="button"
        id={switchId}
        role="switch"
        className="dang-switch"
        aria-checked={checked}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className="dang-switch__track" aria-hidden="true">
          <span className="dang-switch__thumb" />
        </span>
        <span>{label}</span>
      </button>
      <FieldMessages hintId={hintId} hint={hint} />
    </div>
  );
}

export function Form({ className, children, ...rest }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cx("dang-form", className)} {...rest}>
      {children}
    </form>
  );
}
