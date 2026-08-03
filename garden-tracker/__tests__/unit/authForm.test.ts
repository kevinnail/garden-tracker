import Toast from 'react-native-toast-message';

import {
  isValidEmail,
  cappedOnChange,
  weakPasswordError,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@/src/utils/authFormValidate';

jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));

const toastShowMock = Toast.show as unknown as jest.Mock;

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('grower@example.com')).toBe(true);
  });

  it('rejects missing @, missing domain, and whitespace', () => {
    expect(isValidEmail('grower.example.com')).toBe(false);
    expect(isValidEmail('grower@')).toBe(false);
    expect(isValidEmail('grow er@example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('cappedOnChange', () => {
  beforeEach(() => toastShowMock.mockReset());

  it('passes through input at or under the cap without a toast', () => {
    const setter = jest.fn();
    const onChange = cappedOnChange(setter, 5, 'Field');

    onChange('abcde');

    expect(setter).toHaveBeenCalledWith('abcde');
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('truncates over-cap input to the cap and toasts the user', () => {
    const setter = jest.fn();
    const onChange = cappedOnChange(setter, 5, 'Email');

    onChange('abcdefgh');

    expect(setter).toHaveBeenCalledWith('abcde');
    expect(toastShowMock).toHaveBeenCalledTimes(1);
    expect(toastShowMock).toHaveBeenCalledWith({
      type: 'error',
      text1: "Email can't exceed 5 characters.",
    });
  });

  it('uses the real email/password caps with the field label in the message', () => {
    const setter = jest.fn();
    cappedOnChange(setter, EMAIL_MAX_LENGTH, 'Email')('x'.repeat(EMAIL_MAX_LENGTH + 1));
    cappedOnChange(setter, PASSWORD_MAX_LENGTH, 'Password')('y'.repeat(PASSWORD_MAX_LENGTH + 1));

    expect(setter).toHaveBeenNthCalledWith(1, 'x'.repeat(EMAIL_MAX_LENGTH));
    expect(setter).toHaveBeenNthCalledWith(2, 'y'.repeat(PASSWORD_MAX_LENGTH));
    expect(toastShowMock).toHaveBeenCalledWith({
      type: 'error',
      text1: `Email can't exceed ${EMAIL_MAX_LENGTH} characters.`,
    });
    expect(toastShowMock).toHaveBeenCalledWith({
      type: 'error',
      text1: `Password can't exceed ${PASSWORD_MAX_LENGTH} characters.`,
    });
  });
});

describe('weakPasswordError', () => {
  it('rejects all-digit and all-letter passwords (missing a letter or number)', () => {
    expect(weakPasswordError('11111111')).not.toBeNull();
    expect(weakPasswordError('12345678')).not.toBeNull();
    expect(weakPasswordError('password')).not.toBeNull();
  });

  it('accepts a password mixing letters and numbers', () => {
    expect(weakPasswordError('garden2024')).toBeNull();
    expect(weakPasswordError('Gx7mq2vWoP')).toBeNull();
  });
});
