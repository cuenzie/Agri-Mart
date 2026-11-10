
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonPage,
  IonSpinner,
} from '@ionic/react';
import {
  arrowBackOutline,
  eyeOutline,
  eyeOffOutline,
} from 'ionicons/icons';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Auth.css';

const Register: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('The password and confirmation password do not match.');
      return;
    }

    if (password.length < 6) {
      setError('The password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      await updateProfile(credential.user, {
        displayName: fullName.trim(),
      });

      await setDoc(doc(db, 'users', credential.user.uid), {
        uid: credential.user.uid,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: 'user',
        emailVerified: false,
        createdAt: serverTimestamp(),
      });

      await sendEmailVerification(credential.user);

      alert(
        'Registration successful! Check your email for the verification link before logging in.',
      );

      await auth.signOut();
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const code =
        typeof err === 'object' &&
        err !== null &&
        'code' in err
          ? String(err.code)
          : '';

      const messages: Record<string, string> = {
        'auth/email-already-in-use':
          'An account already uses this email address.',
        'auth/invalid-email':
          'The email address is invalid.',
        'auth/weak-password':
          'The password is too weak.',
        'auth/operation-not-allowed':
          'Email/Password sign-in is not enabled in Firebase Authentication.',
        'permission-denied':
          'You do not have permission to write to Firestore. Check your Firestore security rules.',
        'auth/network-request-failed':
          'Could not connect. Please check your internet connection.',
      };

      setError(
        messages[code] ??
          'Registration could not be completed. Check your Firebase settings and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="auth-content">
        <div className="auth-screen register-screen">
          <div className="auth-leaf leaf-one">❧</div>
          <div className="auth-leaf leaf-two">❧</div>
          <div className="auth-leaf leaf-three">❧</div>

          <div className="auth-card register-card">
            <IonButton
              type="button"
              fill="clear"
              className="auth-back-button"
              onClick={() => navigate('/home')}
            >
              <IonIcon icon={arrowBackOutline} slot="start" />
              Back
            </IonButton>

            <div className="auth-logo register-logo">
              <img className="auth-logo-image" src="/agri-mart-logo.png" alt="Agri-Mart" />
            </div>

            <div className="auth-heading register-heading">
              <h2>Create Your Account</h2>
              <p>
                Join Agri-Mart and be part of a growing
                <br />
                agricultural marketplace.
              </p>
            </div>

            <form onSubmit={handleRegister}>
              <div className="auth-field">
                <label htmlFor="register-name">Full Name</label>
                <IonInput
                  id="register-name"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onIonInput={(e) => setFullName(e.detail.value ?? '')}
                  autocomplete="name"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="register-email">Email</label>
                <IonInput
                  id="register-email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onIonInput={(e) => setEmail(e.detail.value ?? '')}
                  autocomplete="email"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="register-phone">Phone Number</label>
                <IonInput
                  id="register-phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onIonInput={(e) => setPhone(e.detail.value ?? '')}
                  autocomplete="tel"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="register-password">Password</label>
                <div className="auth-password-wrap">
                  <input
                    id="register-password"
                    className="auth-native-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (!e.target.value) setShowPassword(false);
                    }}
                    autoComplete="new-password"
                    required
                  />

                  {password.length > 0 && (
                    <button
                      type="button"
                      className="auth-eye"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      <IonIcon
                        icon={showPassword ? eyeOutline : eyeOffOutline}
                      />
                    </button>
                  )}
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="register-confirm">Confirm Password</label>
                <div className="auth-password-wrap">
                  <input
                    id="register-confirm"
                    className="auth-native-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (!e.target.value) setShowConfirmPassword(false);
                    }}
                    autoComplete="new-password"
                    required
                  />

                  {confirmPassword.length > 0 && (
                    <button
                      type="button"
                      className="auth-eye"
                      aria-label={
                        showConfirmPassword ? 'Hide password' : 'Show password'
                      }
                      onClick={() =>
                        setShowConfirmPassword((value) => !value)
                      }
                    >
                      <IonIcon
                        icon={
                          showConfirmPassword ? eyeOutline : eyeOffOutline
                        }
                      />
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <p role="alert" style={{ color: '#b42318', fontSize: 12 }}>
                  {error}
                </p>
              )}

              <IonButton
                type="submit"
                expand="block"
                className="auth-primary-button register-submit"
                disabled={loading}
              >
                {loading ? <IonSpinner name="crescent" /> : 'Create Account'}
              </IonButton>
            </form>

            <p className="auth-switch register-switch">
              Already have an account?{' '}
              <button type="button" onClick={() => navigate('/login')}>
                Login
              </button>
            </p>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Register;
