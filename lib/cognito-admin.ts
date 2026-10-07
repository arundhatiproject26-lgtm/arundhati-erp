// Server-only Cognito calls. Username = email (lowercased).
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

function config() {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_APP_CLIENT_ID;
  const region = process.env.COGNITO_REGION;
  if (!poolId || !clientId || !region) {
    throw new Error('Missing COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID, or COGNITO_REGION');
  }
  return { poolId, clientId, region };
}

let client: CognitoIdentityProviderClient | null = null;
// Created on first use so `next build` works without Cognito env.
function cognito() {
  return (client ??= new CognitoIdentityProviderClient({ region: config().region }));
}

/** The pool is case-sensitive; every call goes through this so any casing signs in. */
const normEmail = (email: string) => email.trim().toLowerCase();

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface NewPasswordChallenge {
  challenge: 'NEW_PASSWORD_REQUIRED';
  session: string;
}

function toTokens(result: { IdToken?: string; AccessToken?: string; RefreshToken?: string; ExpiresIn?: number } | undefined): AuthTokens {
  if (!result?.IdToken || !result.AccessToken) throw new Error('Cognito did not return tokens');
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn ?? 3600,
  };
}

/**
 * Normal sign-in returns tokens. A user created by HR with a temporary
 * password gets NEW_PASSWORD_REQUIRED instead, to be completed with
 * completeNewPassword().
 */
export async function initiateAuth(email: string, password: string): Promise<AuthTokens | NewPasswordChallenge> {
  const res = await cognito().send(new InitiateAuthCommand({
    ClientId: config().clientId,
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: normEmail(email), PASSWORD: password },
  }));
  if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    if (!res.Session) throw new Error('Cognito challenge did not return a session');
    return { challenge: 'NEW_PASSWORD_REQUIRED', session: res.Session };
  }
  return toTokens(res.AuthenticationResult);
}

export async function completeNewPassword(email: string, session: string, newPassword: string): Promise<AuthTokens> {
  const res = await cognito().send(new RespondToAuthChallengeCommand({
    ClientId: config().clientId,
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    Session: session,
    ChallengeResponses: { USERNAME: normEmail(email), NEW_PASSWORD: newPassword },
  }));
  return toTokens(res.AuthenticationResult);
}

export async function refreshTokens(refreshToken: string): Promise<Omit<AuthTokens, 'refreshToken'>> {
  const res = await cognito().send(new InitiateAuthCommand({
    ClientId: config().clientId,
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  }));
  const { idToken, accessToken, expiresIn } = toTokens(res.AuthenticationResult);
  return { idToken, accessToken, expiresIn };
}

/**
 * Create a login with a temporary password (first sign-in forces a new one).
 * If the user already exists, their password is reset to the new temporary
 * one — this is also HR's "reset password". Returns the Cognito `sub`.
 */
export async function createOrResetLogin(email: string, tempPassword: string, name: string): Promise<{ sub: string; isNew: boolean }> {
  const { poolId } = config();
  const username = normEmail(email);
  let isNew = true;
  try {
    await cognito().send(new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: username },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
      ],
      MessageAction: 'SUPPRESS',
    }));
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err;
    isNew = false;
  }
  await cognito().send(new AdminSetUserPasswordCommand({
    UserPoolId: poolId,
    Username: username,
    Password: tempPassword,
    Permanent: false,
  }));
  const user = await cognito().send(new AdminGetUserCommand({ UserPoolId: poolId, Username: username }));
  const sub = user.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error('Cognito did not return a sub for the user');
  return { sub, isNew };
}
