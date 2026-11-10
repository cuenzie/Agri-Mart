
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonPage,
} from '@ionic/react';
import {
  arrowForwardOutline,
  peopleOutline,
  storefrontOutline,
  menuOutline,
  constructOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';

import './MarketplaceHome.css';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth',
    });
    setMenuOpen(false);
  };

  return (
    <IonPage>
      <IonContent fullscreen className="rh-home-content">
        <main className="rh-site">
          <section className="rh-hero" id="home">
            <div className="rh-hero-overlay" />

            <header className="rh-header">
              <a
                className="rh-brand"
                href="#home"
                aria-label="Agri-Mart Home"
              >
                <img className="rh-brand-image" src="/agri-mart-logo.png" alt="Agri-Mart" />
              </a>

              <button
                type="button"
                className="rh-menu-toggle"
                aria-label="Toggle navigation menu"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <IonIcon icon={menuOutline} />
              </button>

              <nav
                className={`rh-nav ${menuOpen ? 'rh-nav-open' : ''}`}
                aria-label="Main navigation"
              >
                <button
                  type="button"
                  className="rh-nav-current"
                  onClick={() => scrollToSection('home')}
                >
                  Home
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('about')}
                >
                  About
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('features')}
                >
                  Features
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/login')}
                >
                  Login
                </button>
              </nav>
            </header>

            <div className="rh-hero-content">
              <div className="rh-copy">
                <p className="rh-kicker">
                  YOUR FARM, FULLY EQUIPPED
                </p>

                <h1>
                  Everything your
                  <br />
                  farm needs.
                </h1>

                <p className="rh-hero-subtitle">
                  Discover trusted tools, equipment, seeds, and farm
                  supplies from sellers who know agriculture.
                </p>
              </div>

              <aside className="rh-hero-actions" aria-label="Get started">
                <span className="rh-action-label">A BETTER WAY TO GROW</span>
                <p className="rh-action-title">Your next great harvest starts here.</p>
                <div className="rh-hero-buttons">
                  <IonButton
                    className="rh-button rh-button-green"
                    onClick={() => navigate('/register')}
                  >
                    Explore marketplace
                    <IonIcon slot="end" icon={arrowForwardOutline} />
                  </IonButton>

                  <IonButton
                    className="rh-button rh-button-outline"
                    fill="outline"
                    onClick={() => scrollToSection('about')}
                  >
                    Learn more
                  </IonButton>
                </div>
                <span className="rh-action-footnote">Supplies, sellers, and support for every season.</span>
              </aside>
            </div>

            <div className="rh-hero-footer">
              <span>
                <IonIcon icon={checkmarkCircleOutline} />
                Quality farm essentials
              </span>

              <span className="rh-footer-divider" />

              <span>Supporting local growers</span>
            </div>
          </section>

          <section className="rh-about" id="about">
            <span className="rh-section-label">
              WELCOME TO AGRI-MART
            </span>

            <h2>Good tools make good work grow.</h2>

            <p>
              Agri-Mart is a convenient buy-and-sell marketplace for
              agricultural tools, equipment, seeds, and other farm
              supplies. Find what your farm needs or connect with
              customers looking for quality products.
            </p>

            <IonButton
              className="rh-button rh-button-green"
              onClick={() => navigate('/register')}
            >
              Join Agri-Mart
              <IonIcon slot="end" icon={arrowForwardOutline} />
            </IonButton>
          </section>

          <section className="rh-features" id="features">
            <span className="rh-section-label">
              EVERYTHING IN ONE PLACE
            </span>

            <h2>Helping your farm get ready for what’s next.</h2>

            <div className="rh-feature-grid">
              <article className="rh-feature-card">
                <IonIcon icon={constructOutline} />
                <h3>Shop farm essentials</h3>
                <p>
                  Browse tools, machinery, seeds, irrigation, and
                  everyday agricultural supplies.
                </p>
              </article>

              <article className="rh-feature-card">
                <IonIcon icon={storefrontOutline} />
                <h3>Sell to your community</h3>
                <p>
                  Give your products a place to be discovered by
                  farmers, growers, and other buyers.
                </p>
              </article>

              <article className="rh-feature-card">
                <IonIcon icon={peopleOutline} />
                <h3>Built for agriculture</h3>
                <p>
                  Connect agricultural suppliers and customers in
                  one practical marketplace.
                </p>
              </article>
            </div>
          </section>

          <footer className="rh-footer">
            <strong>AGRI-MART</strong>
            <p>Agricultural Marketplace for Agricultural Resources and Tools</p>
            <small>
              © {new Date().getFullYear()} Agri-Mart
            </small>
          </footer>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Home;
