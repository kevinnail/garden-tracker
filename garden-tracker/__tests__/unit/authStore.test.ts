import { useAuthStore, messageFromAuthError } from '@/src/store/authStore';
import { authClient } from '@/src/services/authClient';

jest.mock('@/src/services/authClient', () => ({
  authClient: {
    signUp: { email: jest.fn() },
  },
}));

const signUpEmailMock = authClient.signUp.email as unknown as jest.Mock;

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
