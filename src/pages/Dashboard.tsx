import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonSpinner,
} from '@ionic/react';
import {
  storefrontOutline,
  cartOutline,
  cubeOutline,
  logOutOutline,
  personCircleOutline,
} from 'ionicons/icons';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isMarketplaceCustomer } from '../auth/roleNavigation';
import './Dashboard.css';

interface UserProfile {
  fullName?: string;
  email?: string;
  role?: string;
  phone?: string;
  status?: string;
}

interface DashboardModule {
  title: string;
  description: string;
  icon: typeof storefrontOutline;
}

interface RoleDashboard {
  eyebrow: string;
  description: string;
  sectionTitle: string;
  modules: DashboardModule[];
}

const roleDashboards: Record<string, RoleDashboard> = {
  farmer: {
    eyebrow: 'FARMER & SUPPLIER WORKSPACE',
    description:
      'Share your farm products and keep track of the supplies you offer to the Agri-Mart community.',
    sectionTitle: 'Growing your business',
    modules: [
      {
        title: 'Product listings',
        description:
          'Showcase seeds, crops, tools, and other farm supplies to potential buyers.',
        icon: storefrontOutline,
      },
      {
        title: 'Sales & orders',
        description:
          'Keep your buyer requests and sales organized in one place.',
        icon: cartOutline,
      },
      {
        title: 'Farm inventory',
        description:
          'Stay on top of available products and stock for the next growing season.',
        icon: cubeOutline,
      },
    ],
  },
  distributor: {
    eyebrow: 'DISTRIBUTOR WORKSPACE',
    description:
      'Coordinate agricultural supplies between producers, retailers, and the wider farming community.',
    sectionTitle: 'Managing distribution',
    modules: [
      {
        title: 'Supply catalog',
        description:
          'Organize the agricultural products available through your distribution network.',
        icon: storefrontOutline,
      },
      {
        title: 'Purchase orders',
        description:
          'Keep incoming retailer and customer requests easy to follow.',
        icon: cartOutline,
      },
      {
        title: 'Stock overview',
        description:
          'Review your supply levels and plan for replenishment.',
        icon: cubeOutline,
      },
    ],
  },
  retailer: {
    eyebrow: 'RETAILER & RESELLER WORKSPACE',
    description:
      'Find the farm essentials your customers need and keep your store supplies organized.',
    sectionTitle: 'Running your store',
    modules: [
      {
        title: 'Source supplies',
        description:
          'Discover tools, seeds, equipment, and other products to bring into your store.',
        icon: storefrontOutline,
      },
      {
        title: 'Restock orders',
        description:
          'Keep supplier purchases and restock requests organized.',
        icon: cartOutline,
      },
      {
        title: 'Store inventory',
        description:
          'Stay aware of the supplies available for your customers.',
        icon: cubeOutline,
      },
    ],
  },
  consumer: {
    eyebrow: 'BUYER WORKSPACE',
    description:
      'Find dependable tools, seeds, equipment, and other supplies for your farm or garden.',
    sectionTitle: 'Your farm essentials',
    modules: [
      {
        title: 'Explore supplies',
        description:
          'Browse agricultural products from suppliers and sellers in the marketplace.',
        icon: storefrontOutline,
      },
      {
        title: 'Your orders',
        description:
          'Keep track of the farm supplies you plan to purchase.',
        icon: cartOutline,
      },
      {
        title: 'Shopping list',
        description:
          'Keep the tools and supplies you need in mind for your next visit.',
        icon: cubeOutline,
      },
    ],
  },
};

const defaultDashboard: RoleDashboard = {
  eyebrow: 'YOUR AGRICULTURAL MARKETPLACE',
  description: 'Buy and sell agricultural supplies in one marketplace.',
  sectionTitle: 'Marketplace pages',
  modules: [
    {
      title: 'Marketplace',
      description: 'Browse products from other sellers.',
      icon: storefrontOutline,
    },
    {
      title: 'Order Tracking',
      description: 'See the latest status of products you ordered.',
      icon: cartOutline,
    },
    {
      title: 'My Account',
      description: 'Update your profile and account settings.',
      icon: personCircleOutline,
    },
  ],
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dashboard =
    roleDashboards[profile?.role ?? ''] ?? defaultDashboard;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || !user.emailVerified) {
        setLoading(false);
        navigate('/login', { replace: true });
        return;
      }

      try {
        const profileRef = doc(db, 'users', user.uid);
        const profileSnapshot = await getDoc(profileRef);

        if (profileSnapshot.exists()) {
          const userProfile = profileSnapshot.data() as UserProfile;

          if (userProfile.status === 'deactivated') {
            await signOut(auth);
            navigate('/login', { replace: true });
            return;
          }

          if (!userProfile.role) {
            await updateDoc(profileRef, { role: 'user' });
            userProfile.role = 'user';
          }

          if (userProfile.role === 'admin') {
            navigate('/admin', { replace: true });
            return;
          }

          if (isMarketplaceCustomer(userProfile.role)) {
            navigate('/marketplace', { replace: true });
            return;
          }

          setProfile(userProfile);
        } else {
          const userProfile: UserProfile = {
            fullName: user.displayName ?? 'Agri-Mart User',
            email: user.email ?? '',
            role: 'user',
          };
          if (isMarketplaceCustomer(userProfile.role)) {
            navigate('/marketplace', { replace: true });
            return;
          }
          setProfile(userProfile);
        }
      } catch (err) {
        console.error('Unable to load user profile:', err);
        setError(
          'Could not load your profile. Check your Firestore security rules.',
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    setError('');

    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
      setError('Could not log out. Please try again.');
    }
  };

  if (loading) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div
            className="dashboard-loading"
          >
            <IonSpinner name="crescent" color="success" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="success" className="dashboard-toolbar">
          <IonTitle>
            <img className="dashboard-brand-logo" src="/agri-mart-logo.png" alt="Agri-Mart" />
          </IonTitle>
          <IonButton
            slot="end"
            fill="clear"
            onClick={handleLogout}
            className="dashboard-toolbar-logout"
          >
            <IonIcon icon={logOutOutline} slot="start" />
            Logout
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding dashboard-content">
        <div className="dashboard-layout">
          <section className="dashboard-heading">
            <span className="dashboard-eyebrow">{dashboard.eyebrow}</span>
            <h1>
              Welcome, {profile?.fullName || 'Agri-Mart User'}!
            </h1>

            <p>{dashboard.description}</p>
          </section>

          <section className="dashboard-services">
            <div className="dashboard-section-heading">
              <span className="dashboard-eyebrow">GET STARTED</span>
              <h2>{dashboard.sectionTitle}</h2>
            </div>

            <div className="dashboard-service-grid">
              {dashboard.modules.map((module) => (
                <IonCard
                  className="dashboard-service-card"
                  key={module.title}
                  button
                  onClick={() => {
                    const destinations: Record<string, string> = {
                      Marketplace: '/marketplace',
                      'Product listings': '/sell',
                      'Supply catalog': '/sell',
                      'Farm inventory': '/sell',
                      'Store inventory': '/sell',
                      'My Orders': '/order-tracking',
                      'Order Tracking': '/order-tracking',
                      'Received Orders': '/order-management',
                      'Sales & orders': '/order-management',
                      'My Account': '/my-account',
                    };
                    const destination = destinations[module.title];
                    if (destination) navigate(destination);
                  }}
                >
                  <IonCardHeader>
                    <IonIcon icon={module.icon} />
                    <IonCardTitle>{module.title}</IonCardTitle>
                  </IonCardHeader>

                  <IonCardContent>{module.description}</IonCardContent>
                </IonCard>
              ))}
            </div>
          </section>

          {error && (
            <p
              role="alert"
              className="dashboard-error"
            >
              {error}
            </p>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default Dashboard;
