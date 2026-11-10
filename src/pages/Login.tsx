import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonPage,
  IonSpinner,
  useIonViewWillLeave,
} from '@ionic/react';
import {
  arrowBackOutline,
  eyeOutline,
  eyeOffOutline,
} from 'ionicons/icons';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getRoleDestination } from '../auth/roleNavigation';
import './Auth.css';

const Login: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useIonViewWillLeave(() => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError('');
    setMessage('');
  });

  const getFirebaseError = (err: unknown): string => {
    const code =
      typeof err === 'object' &&
      err !== null &&
      'code' in err
        ? String(err.code)
        : '';

    const message =
      typeof err === 'object' &&
      err !== null &&
      'message' in err
        ? String(err.message)
        : '';

    console.error('Firebase error:', code, message);

    switch (code) {
      case 'auth/invalid-email':
        return 'The email address is invalid. Please check what you entered.';

      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'The email or password is incorrect. Please check and try again.';

      case 'auth/email-already-in-use':
        return 'An account already uses this email address. Please log in instead.';

      case 'auth/weak-password':
        return 'The password is too weak. Use at least 6 characters.';

      case 'auth/too-many-requests':
        return 'Firebase has temporarily limited sign-in or verification email requests. Please wait a few minutes, then try again.';

      case 'auth/network-request-failed':
        return 'Could not connect to Firebase. Please check your internet connection.';

      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled in Firebase Authentication.';

      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for sign-in. Add it to the authorized domains in Firebase Authentication settings.';

      case 'auth/popup-blocked':
        return 'The sign-in popup was blocked by your browser. Allow popups and try again.';

      case 'auth/popup-closed-by-user':
        return 'The sign-in popup was closed before sign-in was completed.';

      case 'auth/api-key-not-valid':
        return 'The Firebase API key is invalid. Please check your Firebase configuration.';

      case 'auth/auth-domain-config-required':
        return 'Firebase Authentication is missing its auth domain. In Netlify, set VITE_FIREBASE_AUTH_DOMAIN to the authDomain value from Firebase Console > Project settings > Your apps, then redeploy.';

      case 'auth/unauthorized-continue-uri':
        return 'The app domain is not authorized. Check Authorized domains in Firebase.';

      case 'auth/invalid-continue-uri':
        return 'The verification link configuration is invalid.';

      default:
        return `A Firebase error occurred (${code || 'unknown'}). Check the browser console for details.`;
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setMessage('');
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      const profile = await getDoc(doc(db, 'users', credential.user.uid));
      if (profile.data()?.status === 'deactivated') {
        await signOut(auth);
        setError('This account has been deactivated. Contact an administrator.');
        return;
      }
      navigate(getRoleDestination(profile.data()?.role), { replace: true });
    } catch (loginError) {
      setError(getFirebaseError(loginError));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (!cleanEmail || !cleanPassword) {
      setError('Enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        cleanEmail,
        cleanPassword,
      );

      await credential.user.reload();

      if (!credential.user.emailVerified) {
        try {
          await sendEmailVerification(credential.user);
          setMessage(
            'The verification email has been sent. Check your inbox and spam folder.',
          );
        } catch (verificationError) {
          setError(
            `The verification email could not be sent. ${getFirebaseError(
              verificationError,
            )}`,
          );
        }

        await signOut(auth);
        return;
      }

      const profile = await getDoc(doc(db, 'users', credential.user.uid));
      if (profile.data()?.status === 'deactivated') {
        await signOut(auth);
        setError('This account has been deactivated. Contact an administrator.');
        return;
      }

      setEmail('');
      setPassword('');
      setShowPassword(false);
      navigate(getRoleDestination(profile.data()?.role), { replace: true });
    } catch (loginError) {
      setError(getFirebaseError(loginError));
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerification = async () => {
    setError('');
    setMessage('');

    if (!email.trim() || !password) {
      setError(
        'Enter your email and password to send the verification email.',
      );
      return;
    }

    setSendingVerification(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      await credential.user.reload();

      if (credential.user.emailVerified) {
        await signOut(auth);
        setMessage('Your email is verified. You can now log in.');
        return;
      }

      await sendEmailVerification(credential.user);

      await signOut(auth);

      setMessage(
        'The verification email has been sent. Check your inbox, spam, and promotions folders.',
      );
    } catch (verificationError) {
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error('Sign-out error:', signOutError);
        }
      }

      setError(getFirebaseError(verificationError));
    } finally {
      setSendingVerification(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Enter your email address to receive a password reset link.');
      return;
    }

    setResetting(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());

      setMessage(
        'If the email address is registered, check your inbox and spam folder for the password reset email.',
      );
    } catch (resetError) {
      setError(getFirebaseError(resetError));
    } finally {
      setResetting(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="auth-content">
        <div className="auth-screen auth-login-screen">
        <section className="auth-card auth-login-card">
          <IonButton
            type="button"
            fill="clear"
            className="auth-back-button"
            onClick={() => navigate('/home')}
          >
            <IonIcon icon={arrowBackOutline} slot="start" />
            Back
          </IonButton>

          <div className="auth-logo auth-login-brand">
            <img className="auth-logo-image" src="/agri-mart-logo.png" alt="Agri-Mart" />

            <p>
              Welcome back! Log in to your Agri-Mart account.
            </p>
          </div>

          <form onSubmit={handleLogin} autoComplete="off">
            <div className="auth-field">
              <label htmlFor="login-email">
                Email Address
              </label>

              <IonInput
                id="login-email"
                type="email"
                value={email}
                placeholder="Enter your email"
                autocomplete="new-password"
                required
                fill="outline"
                onIonInput={(event) =>
                  setEmail(String(event.detail.value ?? ''))
                }
              />
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">
                Password
              </label>

              <div className="auth-password-wrap">
                <input
                  id="login-password"
                  className="auth-native-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <IonIcon
                    icon={showPassword ? eyeOutline : eyeOffOutline}
                  />
                </button>
              </div>
            </div>

            <div className="auth-login-options">
              <button
                type="button"
                className="auth-text-button"
                onClick={handleForgotPassword}
                disabled={loading || googleLoading || sendingVerification || resetting}
              >
                {resetting ? 'Sending...' : 'Forgot Password?'}
              </button>
            </div>

            {error && (
              <div role="alert" className="auth-message auth-message-error">
                {error}
              </div>
            )}

            {message && (
              <div role="status" className="auth-message auth-message-success">
                {message}
              </div>
            )}

            <IonButton
              type="submit"
              expand="block"
              disabled={loading || googleLoading || sendingVerification || resetting}
            >
              {loading ? (
                <>
                  <IonSpinner name="crescent" />
                  <span style={{ marginLeft: '8px' }}>Logging in...</span>
                </>
              ) : (
                'Login'
              )}
            </IonButton>

            <div className="login-divider" aria-hidden="true">
              <span>or</span>
            </div>

            <IonButton
              type="button"
              expand="block"
              fill="outline"
              className="login-google-button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading || sendingVerification || resetting}
            >
              {googleLoading ? (
                <>
                  <IonSpinner name="crescent" />
                  <span style={{ marginLeft: '8px' }}>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg
                    className="login-google-icon"
                    aria-hidden="true"
                    viewBox="0 0 48 48"
                    width="18"
                    height="18"
                  >
                    <path
                      fill="#FFC107"
                      d="M43.611 20.083H42V20H24v8h11.303C33.652 32.657 29.164 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.045 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                    />
                    <path
                      fill="#FF3D00"
                      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.045 6.053 29.268 4 24 4c-7.682 0-14.344 4.337-17.694 10.691z"
                    />
                    <path
                      fill="#4CAF50"
                      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.143 35.091 26.715 36 24 36c-5.144 0-9.62-3.318-11.28-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                    />
                    <path
                      fill="#1976D2"
                      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.97 39.062 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </IonButton>

            <p className="auth-switch auth-login-switch">
              Don’t have an account yet?{' '}
              <button
                type="button"
                className="auth-login-register-link"
                onClick={() => navigate('/register')}
              >
                Register
              </button>
            </p>
          </form>
        </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Login;
