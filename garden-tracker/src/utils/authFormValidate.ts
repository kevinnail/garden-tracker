import Toast from 'react-native-toast-message';

// Practical input caps. Email: real addresses are far shorter than the RFC 5321
// ceiling of 254, so we cap at 100 — covers every realistic address and matches
// the 100-char cap used by the app's other text fields. Password: 8-char minimum
// (NIST floor) and 128-char maximum, the latter matching better-auth's default
// so the client cap can't reject a password the backend would accept.
export const EMAIL_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Returns a message when a new password fails the strength rule, else null.
 * Rule: must contain a letter and a number (length is checked separately by the
 * caller). This rejects predictable inputs like "11111111" or "password" without
 * being onerous; symbols and case are allowed but not required.
 */
export function weakPasswordError(password: string): string | null {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return 'Use a mix of letters and numbers.';
  }
  return null;
}

/**
 * Build an onChangeText handler that hard-caps input at `max`. When the incoming
 * value exceeds the cap (typing past it or pasting a long string), it truncates
 * to `max` and shows a toast so the user knows why their input stopped growing.
 * We intentionally do not use the TextInput `maxLength` prop because that would
 * truncate silently, with no feedback.
 */
export function cappedOnChange(
  setter: (value: string) => void,
  max: number,
  fieldLabel: string,
): (text: string) => void {
  return (text: string) => {
    if (text.length > max) {
      setter(text.slice(0, max));
      Toast.show({
        type: 'error',
        text1: `${fieldLabel} can't exceed ${max} characters.`,
      });
      return;
    }
    setter(text);
  };
}
