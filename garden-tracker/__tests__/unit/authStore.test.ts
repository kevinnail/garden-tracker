import { useAuthStore, messageFromAuthError } from '@/src/store/authStore';
import { authClient } from '@/src/services/authClient';

jest.mock('@/src/services/authClient', () => ({
  authClient: {
    signUp: { email: jest.fn() },
    signIn: { email: jest.fn() },
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
  },
}));

const signUpEmailMock = authClient.signUp.email as unknown as jest.Mock;
const signInEmailMock = authClient.signIn.email as unknown as jest.Mock;
const requestPasswordResetMock = authClient.requestPasswordReset as unknown as jest.Mock;
const resetPasswordMock = authClient.resetPassword as unknown as jest.Mock;

function resetStore() {
  useAuthStore.setState({ status: 'signed-out', email: null, error: null });
}

describe('messageFromAuthError', () => {
  it('prefers the server-provided message', () => {
    expect(messageFromAuthError({ message: 'User already exists', status: 422 })).toBe(
      'User already exists',
    );
  });

  it('falls back to a generic message when none is given', () => {
    expect(messageFromAuthError(null)).toBe('Something went wrong. Please try again.');
    expect(messageFromAuthError({ status: 500 })).toBe('Something went wrong. Please try again.');
  });
});

describe('authStore.signUp', () => {
  beforeEach(() => {
    resetStore();
    signUpEmailMock.mockReset();
  });

  it('calls signUp.email with email, password, and a name derived from the email', async () => {
    signUpEmailMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    await useAuthStore.getState().signUp('  Grower@Example.com  ', 'supersecret');

    expect(signUpEmailMock).toHaveBeenCalledTimes(1);
    expect(signUpEmailMock).toHaveBeenCalledWith({
      email: 'Grower@Example.com',
      password: 'supersecret',
      name: 'Grower',
    });
  });

  it('sets signed-in state and the email on success', async () => {
    signUpEmailMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const ok = await useAuthStore.getState().signUp('grower@example.com', 'supersecret');

    expect(ok).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed-in',
      email: 'grower@example.com',
      error: null,
    });
  });

  it('stays signed-out and surfaces the error message on failure (duplicate email)', async () => {
    signUpEmailMock.mockResolvedValue({
      data: null,
      error: { message: 'User already exists', status: 422 },
    });

    const ok = await useAuthStore.getState().signUp('taken@example.com', 'supersecret');

    expect(ok).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed-out',
      email: null,
      error: 'User already exists',
    });
  });
});

describe('authStore.signIn', () => {
  beforeEach(() => {
    resetStore();
    signInEmailMock.mockReset();
  });

  it('calls signIn.email with the trimmed email and password', async () => {
    signInEmailMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    await useAuthStore.getState().signIn('  Grower@Example.com  ', 'supersecret');

    expect(signInEmailMock).toHaveBeenCalledTimes(1);
    expect(signInEmailMock).toHaveBeenCalledWith({
      email: 'Grower@Example.com',
      password: 'supersecret',
    });
  });

  it('sets signed-in state and the email on success', async () => {
    signInEmailMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const ok = await useAuthStore.getState().signIn('grower@example.com', 'supersecret');

    expect(ok).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed-in',
      email: 'grower@example.com',
      error: null,
    });
  });

  it('stays signed-out and surfaces the error on a wrong password (401)', async () => {
    signInEmailMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid email or password', status: 401 },
    });

    const ok = await useAuthStore.getState().signIn('grower@example.com', 'wrongpass');

    expect(ok).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed-out',
      email: null,
      error: 'Invalid email or password',
    });
  });
});

describe('authStore.requestPasswordReset', () => {
  beforeEach(() => {
    resetStore();
    requestPasswordResetMock.mockReset();
  });

  it('calls requestPasswordReset with the trimmed email and no redirectTo', async () => {
    requestPasswordResetMock.mockResolvedValue({ data: { status: true }, error: null });

    const ok = await useAuthStore.getState().requestPasswordReset('  Grower@Example.com  ');

    expect(ok).toBe(true);
    expect(requestPasswordResetMock).toHaveBeenCalledTimes(1);
    expect(requestPasswordResetMock).toHaveBeenCalledWith({ email: 'Grower@Example.com' });
  });

  it('does not change auth status on success', async () => {
    requestPasswordResetMock.mockResolvedValue({ data: { status: true }, error: null });

    await useAuthStore.getState().requestPasswordReset('grower@example.com');

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed-out',
      email: null,
      error: null,
    });
  });

  it('surfaces the error message on failure', async () => {
    requestPasswordResetMock.mockResolvedValue({
      data: null,
      error: { message: 'Too many requests', status: 429 },
    });

    const ok = await useAuthStore.getState().requestPasswordReset('grower@example.com');

    expect(ok).toBe(false);
    expect(useAuthStore.getState().error).toBe('Too many requests');
  });
});

describe('authStore.resetPassword', () => {
  beforeEach(() => {
    resetStore();
    resetPasswordMock.mockReset();
  });

  it('calls resetPassword with the token and new password', async () => {
    resetPasswordMock.mockResolvedValue({ data: { status: true }, error: null });

    const ok = await useAuthStore.getState().resetPassword('tok_123', 'brandnewpass');

    expect(ok).toBe(true);
    expect(resetPasswordMock).toHaveBeenCalledTimes(1);
    expect(resetPasswordMock).toHaveBeenCalledWith({
      newPassword: 'brandnewpass',
      token: 'tok_123',
    });
  });

  it('does not sign the user in on success (they sign in with the new password)', async () => {
    resetPasswordMock.mockResolvedValue({ data: { status: true }, error: null });

    await useAuthStore.getState().resetPassword('tok_123', 'brandnewpass');

    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', error: null });
  });

  it('surfaces the error on an invalid or expired token', async () => {
    resetPasswordMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid or expired token', status: 400 },
    });

    const ok = await useAuthStore.getState().resetPassword('tok_expired', 'brandnewpass');

    expect(ok).toBe(false);
    expect(useAuthStore.getState().error).toBe('Invalid or expired token');
  });
});

describe('authStore.setSession', () => {
  beforeEach(resetStore);

  it('mirrors a restored session into signed-in state with the email', () => {
    useAuthStore
      .getState()
      .setSession({ user: { id: 'u1', email: 'grower@example.com' } } as never);

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed-in',
      email: 'grower@example.com',
    });
  });

  it('returns to signed-out when the session is null (signed out / expired)', () => {
    useAuthStore.setState({ status: 'signed-in', email: 'grower@example.com' });

    useAuthStore.getState().setSession(null);

    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', email: null });
  });

  it('treats a session without an email as signed-out', () => {
    useAuthStore.setState({ status: 'signed-in', email: 'grower@example.com' });

    useAuthStore.getState().setSession({ user: null } as never);

    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', email: null });
  });
});
