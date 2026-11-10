
import { useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  useLocation,
} from 'react-router-dom';
import {
  IonApp,
  IonRouterOutlet,
  IonSpinner,
  setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import MarketplacePage from './pages/MarketplacePage';
import { auth, db } from './firebase';
import { getRoleDestination, isMarketplaceCustomer } from './auth/roleNavigation';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

import './theme/variables.css';
import './theme/agrimart.css';

setupIonicReact();

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userRole, setUserRole] = useState<unknown>();
  const [authProfileError, setAuthProfileError] = useState('');

  useEffect(() => {
    let active = true;
    let checkId = 0;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const currentCheck = ++checkId;
      setUser(currentUser);
      setUserRole(undefined);
      setAuthProfileError('');

      if (!currentUser || !currentUser.emailVerified) {
        setCheckingAuth(false);
        return;
      }

      setCheckingAuth(true);

      try {
        const profile = await getDoc(doc(db, 'users', currentUser.uid));
        if (!active || currentCheck !== checkId) {
          return;
        }
        if (profile.data()?.status === 'deactivated') {
          await signOut(auth);
          return;
        }
        setUserRole(profile.data()?.role);
      } catch (error) {
        console.error('Unable to load account role:', error);
        if (active && currentCheck === checkId) {
          setAuthProfileError(
            'Could not verify your account status. Reload the page to try again.',
          );
        }
      } finally {
        if (active && currentCheck === checkId) {
          setCheckingAuth(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const pageName =
      location.pathname.replace('/', '').toUpperCase() || 'HOME';

    document.title = `${pageName} | Agri-Mart`;
  }, [location.pathname]);

  if (checkingAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--agri-background)',
        }}
      >
        <IonSpinner name="crescent" color="success" />
      </div>
    );
  }

  if (authProfileError) {
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          alignContent: 'center',
          justifyItems: 'center',
          gap: '1rem',
          padding: '2rem',
          background: 'var(--agri-background)',
          color: 'var(--agri-navy)',
          textAlign: 'center',
        }}
      >
        <p>{authProfileError}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }

  return (
    <IonRouterOutlet>
      {/* Public landing page */}
      <Route path="/home" element={<Home />} />

      {/* Protected dashboard: login only after email verification */}
      <Route
        path="/dashboard"
        element={
          user && user.emailVerified ? (
            isMarketplaceCustomer(userRole) ? (
              <Navigate to="/marketplace" replace />
            ) : (
              <Dashboard />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/admin"
        element={
          user && user.emailVerified ? (
            <AdminPanel page="overview" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin/users"
        element={
          user && user.emailVerified ? (
            <AdminPanel page="users" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin/seller-applications"
        element={
          user && user.emailVerified ? (
            <AdminPanel page="seller-applications" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin/products"
        element={
          user && user.emailVerified ? (
            <AdminPanel page="products" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin/orders"
        element={
          user && user.emailVerified ? (
            <AdminPanel page="orders" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin/categories"
        element={
          user && user.emailVerified ? (
            <AdminPanel page="categories" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin/settings"
        element={
          user && user.emailVerified ? (
            <AdminPanel page="settings" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/marketplace/home"
        element={user && user.emailVerified ? <MarketplacePage page="home" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/marketplace"
        element={user && user.emailVerified ? <MarketplacePage page="marketplace" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/seller-dashboard"
        element={user && user.emailVerified ? <MarketplacePage page="seller-dashboard" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/sell"
        element={user && user.emailVerified ? <MarketplacePage page="sell" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/order-tracking"
        element={user && user.emailVerified ? <MarketplacePage page="my-orders" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/my-orders"
        element={<Navigate to="/order-tracking" replace />}
      />
      <Route
        path="/order-management"
        element={user && user.emailVerified ? <MarketplacePage page="received-orders" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/received-orders"
        element={<Navigate to="/order-management" replace />}
      />
      <Route
        path="/about"
        element={user && user.emailVerified ? <MarketplacePage page="about" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/my-account"
        element={user && user.emailVerified ? <MarketplacePage page="account" /> : <Navigate to="/login" replace />}
      />

      <Route
        path="/login"
        element={
          user && user.emailVerified ? (
            <Navigate to={getRoleDestination(userRole)} replace />
          ) : (
            <Login />
          )
        }
      />

      <Route
        path="/register"
        element={
          user && user.emailVerified ? (
            <Navigate to={getRoleDestination(userRole)} replace />
          ) : (
            <Register />
          )
        }
      />

      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </IonRouterOutlet>
  );
};

const App: React.FC = () => (
  <IonApp>
    <IonReactRouter>
      <AppRoutes />
    </IonReactRouter>
  </IonApp>
);

export default App;
