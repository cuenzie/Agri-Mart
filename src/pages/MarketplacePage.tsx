import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  IonSpinner,
} from '@ionic/react';
import {
  addOutline,
  cartOutline,
  cubeOutline,
  createOutline,
  checkmarkCircleOutline,
  eyeOffOutline,
  eyeOutline,
  leafOutline,
  lockClosedOutline,
  logOutOutline,
  menuOutline,
  personCircleOutline,
  personOutline,
  receiptOutline,
  storefrontOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  onAuthStateChanged,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  setDoc,
} from 'firebase/firestore';
import MeetupLocationMap from '../components/MeetupLocationMap';
import OrderAddressMap from '../components/OrderAddressMap';
import { geocodeOrientalMindoroAddress } from '../utils/geocodeOrientalMindoroAddress';
import { auth, db } from '../firebase';
import './MarketplacePage.css';

type MarketplacePageName =
  | 'home'
  | 'marketplace'
  | 'seller-dashboard'
  | 'sell'
  | 'my-orders'
  | 'received-orders'
  | 'about'
  | 'account';
type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'completed'
  | 'cancelled';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerMeetupLocation: string;
  imageUrl: string;
  imagePath: string;
  status: string;
  createdAt?: Timestamp;
}

interface MarketplaceOrder {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  contactNumber: string;
  buyerMeetupLocation: string;
  deliveryMethod: 'delivery' | 'meetup_pickup' | 'pickup' | 'meetup';
  orderNotes: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerMeetupLocation: string;
  productId: string;
  productName: string;
  productImageUrl: string;
  locationLatitude?: number;
  locationLongitude?: number;
  quantity: number;
  unitPrice: number;
  total: number;
  status: OrderStatus;
  createdAt?: Timestamp;
}

interface CheckoutDetails {
  contactNumber: string;
  buyerMeetupLocation: string;
  meetupMunicipality: string;
  meetupBarangay: string;
  meetupAddress: string;
  meetupPosition: [number, number] | null;
  deliveryMethod: 'pickup' | 'meetup';
  orderNotes: string;
}

interface UserProfile {
  fullName: string;
  sellerName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}

interface ProductForm {
  name: string;
  description: string;
  municipality: string;
  barangay: string;
  meetupLocation: string;
  category: string;
  price: string;
  stock: string;
}

interface PsgcMunicipality {
  code: string;
  name: string;
  provinceCode: string;
}

interface PsgcBarangay {
  code: string;
  name: string;
  municipalityCode: string;
}

type SellerRole = 'farmer' | 'distributor' | 'retailer';
type SellerApplicationStatus = 'pending' | 'approved' | 'rejected';

const ORIENTAL_MINDORO_PROVINCE_CODE = '175200000';
const MUNICIPALITIES_API_URL = 'https://psgc.gitlab.io/api/municipalities/';
const getBarangaysApiUrl = (municipalityCode: string) =>
  `https://psgc.gitlab.io/api/municipalities/${municipalityCode}/barangays/`;

interface SellerApplication {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  requestedRole: SellerRole;
  businessName: string;
  businessDescription: string;
  meetupLocation: string;
  status: SellerApplicationStatus;
  reviewNote: string;
}

interface SellerApplicationForm {
  requestedRole: SellerRole;
  businessName: string;
  businessDescription: string;
  phone: string;
  meetupLocation: string;
}

const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_UPLOAD_TIMEOUT_MS = 60_000;
const PRODUCT_SAVE_TIMEOUT_MS = 30_000;
const allowedProductImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const sellerRoles: SellerRole[] = ['farmer', 'distributor', 'retailer'];
const isSellerRole = (role: string): role is SellerRole =>
  sellerRoles.some((sellerRole) => sellerRole === role);
const hasSellerAccess = (
  profile: Pick<UserProfile, 'role' | 'sellerName'>,
): boolean => isSellerRole(profile.role) && profile.sellerName.trim().length > 0;

const getFirestoreErrorCode = (error: unknown): string =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string'
    ? error.code
    : '';

const sellerRoleLabels: Record<SellerRole, string> = {
  farmer: 'Farmer / Producer',
  distributor: 'Distributor',
  retailer: 'Retailer / Reseller',
};

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

const isCloudinaryUploadResult = (
  value: unknown,
): value is CloudinaryUploadResult =>
  typeof value === 'object' &&
  value !== null &&
  'secure_url' in value &&
  typeof value.secure_url === 'string' &&
  'public_id' in value &&
  typeof value.public_id === 'string';

const uploadProductImage = (
  image: File,
  onProgress: (progress: number) => void,
) =>
  new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) {
      reject(new Error('cloudinary-config-missing'));
      return;
    }

    const formData = new FormData();
    formData.append('file', image);
    formData.append('upload_preset', uploadPreset);

    const request = new XMLHttpRequest();
    request.open(
      'POST',
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    );
    request.timeout = PRODUCT_IMAGE_UPLOAD_TIMEOUT_MS;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener('load', () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('cloudinary-upload-failed'));
        return;
      }
      let response: unknown;
      try {
        response = JSON.parse(request.responseText);
      } catch {
        reject(new Error('cloudinary-invalid-response'));
        return;
      }
      if (!isCloudinaryUploadResult(response)) {
        reject(new Error('cloudinary-invalid-response'));
        return;
      }
      resolve(response);
    });
    request.addEventListener('error', () =>
      reject(new Error('cloudinary-upload-failed')),
    );
    request.addEventListener('timeout', () =>
      reject(new Error('cloudinary-upload-timeout')),
    );
    request.send(formData);
  });

const withTimeout = <T,>(
  operation: Promise<T>,
  timeoutMs: number,
  errorCode: string,
) =>
  new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(errorCode)),
      timeoutMs,
    );
    operation.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });

const pageInfo: Record<MarketplacePageName, { title: string; subtitle: string }> = {
  home: {
    title: 'Welcome to Agri-Mart.',
    subtitle: 'Find the supplies and community connections you need to grow.',
  },
  marketplace: {
    title: 'Marketplace',
    subtitle: 'Explore agricultural products listed by the Agri-Mart community.',
  },
  'seller-dashboard': {
    title: 'Seller Dashboard',
    subtitle: 'Manage your store, listings, and incoming orders in one place.',
  },
  sell: {
    title: 'Sell Product',
    subtitle: 'Request seller access or manage your products after approval.',
  },
  'my-orders': {
    title: 'Order Tracking',
    subtitle: 'Follow your purchases from order received through ready for pickup to picked up.',
  },
  'received-orders': {
    title: 'Order Management',
    subtitle: 'Prepare customer orders for pickup, then mark them picked up when the order is delivered.',
  },
  about: {
    title: 'About Agri-Mart',
    subtitle: 'A practical digital marketplace built around agriculture.',
  },
  account: {
    title: 'My Account',
    subtitle: 'Manage your profile and account settings.',
  },
};

const navigation: {
  path: string;
  label: string;
  icon: string;
  page: MarketplacePageName;
}[] = [
  { path: '/marketplace/home', label: 'Home', icon: leafOutline, page: 'home' },
  { path: '/marketplace', label: 'Marketplace', icon: storefrontOutline, page: 'marketplace' },
  { path: '/order-tracking', label: 'Order Tracking', icon: receiptOutline, page: 'my-orders' },
  { path: '/about', label: 'About Us', icon: leafOutline, page: 'about' },
  { path: '/my-account', label: 'My Account', icon: personCircleOutline, page: 'account' },
];

const emptyProductForm: ProductForm = {
  name: '',
  description: '',
  municipality: '',
  barangay: '',
  meetupLocation: '',
  category: '',
  price: '',
  stock: '',
};

const toProduct = (id: string, value: Record<string, unknown>): Product => ({
  id,
  name: typeof value.name === 'string' ? value.name : '',
  description: typeof value.description === 'string' ? value.description : '',
  category: typeof value.category === 'string' ? value.category : 'Other',
  price: typeof value.price === 'number' ? value.price : 0,
  stock: typeof value.stock === 'number' ? value.stock : 0,
  sellerId: typeof value.sellerId === 'string' ? value.sellerId : '',
  sellerName: typeof value.sellerName === 'string' ? value.sellerName : 'Seller',
  sellerEmail: typeof value.sellerEmail === 'string' ? value.sellerEmail : '',
  sellerMeetupLocation:
    typeof value.sellerMeetupLocation === 'string'
      ? value.sellerMeetupLocation
      : '',
  imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : '',
  imagePath: typeof value.imagePath === 'string' ? value.imagePath : '',
  status: typeof value.status === 'string' ? value.status : 'active',
  createdAt: value.createdAt instanceof Timestamp ? value.createdAt : undefined,
});

const toOrder = (id: string, value: Record<string, unknown>): MarketplaceOrder => ({
  id,
  buyerId: typeof value.buyerId === 'string' ? value.buyerId : '',
  buyerName: typeof value.buyerName === 'string' ? value.buyerName : 'Buyer',
  buyerEmail: typeof value.buyerEmail === 'string' ? value.buyerEmail : '',
  contactNumber:
    typeof value.contactNumber === 'string' ? value.contactNumber : '',
  buyerMeetupLocation:
    typeof value.buyerMeetupLocation === 'string'
      ? value.buyerMeetupLocation
      : typeof value.deliveryAddress === 'string'
        ? value.deliveryAddress
        : '',
  deliveryMethod:
    value.deliveryMethod === 'pickup' ||
    value.deliveryMethod === 'meetup' ||
    value.deliveryMethod === 'delivery'
      ? value.deliveryMethod
      : 'meetup_pickup',
  orderNotes: typeof value.orderNotes === 'string' ? value.orderNotes : '',
  sellerId: typeof value.sellerId === 'string' ? value.sellerId : '',
  sellerName: typeof value.sellerName === 'string' ? value.sellerName : 'Seller',
  sellerEmail: typeof value.sellerEmail === 'string' ? value.sellerEmail : '',
  sellerMeetupLocation:
    typeof value.sellerMeetupLocation === 'string'
      ? value.sellerMeetupLocation
      : '',
  productId: typeof value.productId === 'string' ? value.productId : '',
  productName: typeof value.productName === 'string' ? value.productName : 'Product',
  productImageUrl:
    typeof value.productImageUrl === 'string' ? value.productImageUrl : '',
  locationLatitude:
    typeof value.locationLatitude === 'number' &&
    Number.isFinite(value.locationLatitude)
      ? value.locationLatitude
      : undefined,
  locationLongitude:
    typeof value.locationLongitude === 'number' &&
    Number.isFinite(value.locationLongitude)
      ? value.locationLongitude
      : undefined,
  quantity: typeof value.quantity === 'number' ? value.quantity : 0,
  unitPrice: typeof value.unitPrice === 'number' ? value.unitPrice : 0,
  total: typeof value.total === 'number' ? value.total : 0,
  status:
    value.status === 'ready_for_pickup' ||
    value.status === 'picked_up' ||
    value.status === 'confirmed' ||
    value.status === 'completed' ||
    value.status === 'cancelled'
      ? value.status
      : 'pending',
  createdAt: value.createdAt instanceof Timestamp ? value.createdAt : undefined,
});

const formatDate = (date?: Timestamp) =>
  date ? date.toDate().toLocaleString() : 'Just now';

const isPsgcMunicipality = (value: unknown): value is PsgcMunicipality =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof value.code === 'string' &&
  'name' in value &&
  typeof value.name === 'string' &&
  'provinceCode' in value &&
  typeof value.provinceCode === 'string';

const isPsgcBarangay = (value: unknown): value is PsgcBarangay =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof value.code === 'string' &&
  'name' in value &&
  typeof value.name === 'string' &&
  'municipalityCode' in value &&
  typeof value.municipalityCode === 'string';

const parseOrientalMindoroLocation = (
  location: string,
  municipalities: PsgcMunicipality[],
) => {
  const normalizedLocation = location.trim();
  const matchingMunicipality = [...municipalities]
    .sort((first, second) => second.name.length - first.name.length)
    .find((municipality) =>
      new RegExp(
        `(?:^|[\\s,]+)${municipality.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[\\s,]+Oriental Mindoro)?$`,
        'i',
      ).test(normalizedLocation),
    );

  if (!matchingMunicipality) {
    return { municipality: '', details: normalizedLocation };
  }

  const details = normalizedLocation
    .replace(
      new RegExp(
        `(?:[\\s,]+)?${matchingMunicipality.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[\\s,]+Oriental Mindoro)?$`,
        'i',
      ),
      '',
    )
    .trim()
    .replace(/,\s*$/, '');

  return { municipality: matchingMunicipality.name, details };
};

const formatOrientalMindoroLocation = (
  details: string,
  barangay: string,
  municipality: string,
) =>
  [barangay, details.trim(), municipality, 'Oriental Mindoro']
    .filter(Boolean)
    .join(', ');

const parseBarangayAndDetails = (
  locationDetails: string,
  barangays: PsgcBarangay[],
) => {
  const [firstPart, ...remainingParts] = locationDetails
    .split(',')
    .map((part) => part.trim());
  const matchingBarangay = barangays.find(
    (barangay) => barangay.name.toLowerCase() === firstPart?.toLowerCase(),
  );
  return matchingBarangay
    ? { barangay: matchingBarangay.name, details: remainingParts.join(', ') }
    : { barangay: '', details: locationDetails };
};

const getOrderStatusLabel = (status: OrderStatus) => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'confirmed':
      return 'Confirmed';
    case 'ready_for_pickup':
      return 'Ready for pickup';
    case 'picked_up':
      return 'Picked up (delivered)';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
};

const MarketplacePage: React.FC<{ page: MarketplacePageName }> = ({ page }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [sellerView, setSellerView] = useState<
    'dashboard' | 'listings' | 'details'
  >(() => {
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'details' || view === 'listings') return view;
    return page === 'seller-dashboard' ? 'dashboard' : 'listings';
  });
  const [listingSearch, setListingSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [sellerApplication, setSellerApplication] =
    useState<SellerApplication | null>(null);
  const [sellerApplicationReadWarning, setSellerApplicationReadWarning] =
    useState('');
  const [sellerApplicationForm, setSellerApplicationForm] =
    useState<SellerApplicationForm>({
      requestedRole: 'farmer',
      businessName: '',
      businessDescription: '',
      phone: '',
      meetupLocation: '',
    });
  const [submittingSellerApplication, setSubmittingSellerApplication] =
    useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    fullName: '',
    sellerName: '',
    email: '',
    phone: '',
    role: 'user',
    status: 'active',
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [municipalities, setMunicipalities] = useState<PsgcMunicipality[]>([]);
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(false);
  const [municipalitiesError, setMunicipalitiesError] = useState('');
  const [municipalityRetry, setMunicipalityRetry] = useState(0);
  const [barangays, setBarangays] = useState<PsgcBarangay[]>([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [barangaysError, setBarangaysError] = useState('');
  const [barangayRetry, setBarangayRetry] = useState(0);
  const [checkoutBarangays, setCheckoutBarangays] = useState<PsgcBarangay[]>([]);
  const [checkoutBarangaysLoading, setCheckoutBarangaysLoading] =
    useState(false);
  const [checkoutBarangaysError, setCheckoutBarangaysError] = useState('');
  const [checkoutBarangayRetry, setCheckoutBarangayRetry] = useState(0);
  const [sellerAddressBarangays, setSellerAddressBarangays] = useState<
    PsgcBarangay[]
  >([]);
  const [sellerAddressBarangaysLoading, setSellerAddressBarangaysLoading] =
    useState(false);
  const [sellerAddressBarangaysError, setSellerAddressBarangaysError] =
    useState('');
  const [sellerAddressBarangayRetry, setSellerAddressBarangayRetry] =
    useState(0);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [resolvedOrderImages, setResolvedOrderImages] = useState<
    Record<string, string>
  >({});
  const [failedOrderImages, setFailedOrderImages] = useState<
    Record<string, boolean>
  >({});
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStage, setSavingStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [checkoutDetails, setCheckoutDetails] = useState<CheckoutDetails>({
    contactNumber: '',
    buyerMeetupLocation: '',
    meetupMunicipality: '',
    meetupBarangay: '',
    meetupAddress: '',
    meetupPosition: null,
    deliveryMethod: 'pickup',
    orderNotes: '',
  });
  const [meetupLookupLoading, setMeetupLookupLoading] = useState(false);
  const [meetupLookupError, setMeetupLookupError] = useState('');
  const [editingProductId, setEditingProductId] = useState('');
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [existingImage, setExistingImage] = useState({
    url: '',
    path: '',
  });
  const [accountName, setAccountName] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const selectedMunicipalityCode =
    municipalities.find(
      (municipality) => municipality.name === productForm.municipality,
    )?.code ?? '';
  const checkoutMunicipalityCode =
    municipalities.find(
      (municipality) =>
        municipality.name === checkoutDetails.meetupMunicipality,
    )?.code ?? '';
  const sellerAddressLocation = checkoutProduct
    ? parseOrientalMindoroLocation(
        checkoutProduct.sellerMeetupLocation,
        municipalities,
      )
    : { municipality: '', details: '' };
  const sellerAddressMunicipalityCode =
    municipalities.find(
      (municipality) =>
        municipality.name === sellerAddressLocation.municipality,
    )?.code ?? '';
  const sellerAddressBarangay = parseBarangayAndDetails(
    sellerAddressLocation.details,
    sellerAddressBarangays,
  );
  const shouldLoadLocationData =
    page === 'seller-dashboard' || checkoutProduct !== null;

  useEffect(() => {
    if (page !== 'my-orders' && page !== 'received-orders') return;

    let active = true;
    const ordersMissingImages = orders.filter(
      (order) =>
        !order.productImageUrl &&
        !resolvedOrderImages[order.id] &&
        order.productId,
    );
    const uniqueProductIds = [...new Set(
      ordersMissingImages.map((order) => order.productId),
    )];
    if (!uniqueProductIds.length) return;

    const loadMissingOrderImages = async () => {
      const imageEntries = await Promise.all(
        uniqueProductIds.map(async (productId) => {
          try {
            const productSnapshot = await getDoc(doc(db, 'products', productId));
            const imageUrl = productSnapshot.data()?.imageUrl;
            return productSnapshot.exists() &&
              typeof imageUrl === 'string' &&
              imageUrl
              ? ([productId, imageUrl] as const)
              : null;
          } catch (imageLoadError) {
            console.error(
              `Unable to load product image for order product ${productId}:`,
              imageLoadError,
            );
            return null;
          }
        }),
      );

      if (!active) return;
      const imageByProductId = Object.fromEntries(
        imageEntries.filter(
          (entry): entry is readonly [string, string] => entry !== null,
        ),
      );
      if (Object.keys(imageByProductId).length) {
        setResolvedOrderImages((current) => {
          const next = { ...current };
          ordersMissingImages.forEach((order) => {
            const imageUrl = imageByProductId[order.productId];
            if (imageUrl) next[order.id] = imageUrl;
          });
          return next;
        });
      }
    };

    void loadMissingOrderImages();
    return () => {
      active = false;
    };
  }, [orders, page, resolvedOrderImages]);

  useEffect(
    () => () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    },
    [imagePreviewUrl],
  );

  useEffect(() => {
    if (page !== 'seller-dashboard') return;
    const view = new URLSearchParams(location.search).get('view');
    setSellerView(
      view === 'details' || view === 'listings' ? view : 'dashboard',
    );
  }, [location.search, page]);

  useEffect(() => {
    if (!shouldLoadLocationData) return;

    const controller = new AbortController();
    const loadMunicipalities = async () => {
      setMunicipalitiesLoading(true);
      setMunicipalitiesError('');

      try {
        const response = await fetch(MUNICIPALITIES_API_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Municipality API returned HTTP ${response.status}.`);
        }

        const responseData: unknown = await response.json();
        if (!Array.isArray(responseData)) {
          throw new Error('Municipality API returned an invalid response.');
        }

        const filteredMunicipalities = responseData
          .filter(isPsgcMunicipality)
          .filter(
            (municipality) =>
              municipality.provinceCode === ORIENTAL_MINDORO_PROVINCE_CODE,
          )
          .sort((first, second) => first.name.localeCompare(second.name));
        if (filteredMunicipalities.length === 0) {
          throw new Error(
            'The municipality API did not return Oriental Mindoro locations.',
          );
        }
        setMunicipalities(filteredMunicipalities);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error('Unable to load Oriental Mindoro municipalities:', loadError);
        setMunicipalitiesError(
          'Could not load Oriental Mindoro municipalities. Check your connection and try again.',
        );
      } finally {
        if (!controller.signal.aborted) setMunicipalitiesLoading(false);
      }
    };

    void loadMunicipalities();
    return () => controller.abort();
  }, [municipalityRetry, shouldLoadLocationData]);

  useEffect(() => {
    if (page !== 'seller-dashboard' || !selectedMunicipalityCode) {
      setBarangays([]);
      setBarangaysLoading(false);
      setBarangaysError('');
      return;
    }

    const controller = new AbortController();
    const loadBarangays = async () => {
      setBarangaysLoading(true);
      setBarangaysError('');

      try {
        const response = await fetch(
          getBarangaysApiUrl(selectedMunicipalityCode),
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) {
          throw new Error(`Barangay API returned HTTP ${response.status}.`);
        }

        const responseData: unknown = await response.json();
        if (!Array.isArray(responseData)) {
          throw new Error('Barangay API returned an invalid response.');
        }

        const filteredBarangays = responseData
          .filter(isPsgcBarangay)
          .filter(
            (barangay) =>
              barangay.municipalityCode === selectedMunicipalityCode,
          )
          .sort((first, second) => first.name.localeCompare(second.name));
        if (filteredBarangays.length === 0) {
          throw new Error('No barangays were returned for this municipality.');
        }
        setBarangays(filteredBarangays);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error('Unable to load municipality barangays:', loadError);
        setBarangaysError(
          'Could not load barangays for this municipality. Check your connection and try again.',
        );
      } finally {
        if (!controller.signal.aborted) setBarangaysLoading(false);
      }
    };

    void loadBarangays();
    return () => controller.abort();
  }, [barangayRetry, page, selectedMunicipalityCode]);

  useEffect(() => {
    if (
      page !== 'marketplace' ||
      !checkoutProduct ||
      checkoutDetails.deliveryMethod !== 'meetup' ||
      !checkoutMunicipalityCode
    ) {
      setCheckoutBarangays([]);
      setCheckoutBarangaysLoading(false);
      setCheckoutBarangaysError('');
      return;
    }

    const controller = new AbortController();
    const loadCheckoutBarangays = async () => {
      setCheckoutBarangaysLoading(true);
      setCheckoutBarangaysError('');
      try {
        const response = await fetch(
          getBarangaysApiUrl(checkoutMunicipalityCode),
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) {
          throw new Error(`Barangay API returned HTTP ${response.status}.`);
        }
        const responseData: unknown = await response.json();
        if (!Array.isArray(responseData)) {
          throw new Error('Barangay API returned an invalid response.');
        }
        const filteredBarangays = responseData
          .filter(isPsgcBarangay)
          .filter(
            (barangay) =>
              barangay.municipalityCode === checkoutMunicipalityCode,
          )
          .sort((first, second) => first.name.localeCompare(second.name));
        if (!filteredBarangays.length) {
          throw new Error('No barangays were returned for this municipality.');
        }
        setCheckoutBarangays(filteredBarangays);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error('Unable to load meet-up location barangays:', loadError);
        setCheckoutBarangaysError(
          'Could not load barangays for this municipality. Check your connection and try again.',
        );
      } finally {
        if (!controller.signal.aborted) setCheckoutBarangaysLoading(false);
      }
    };

    void loadCheckoutBarangays();
    return () => controller.abort();
  }, [
    checkoutBarangayRetry,
    checkoutDetails.deliveryMethod,
    checkoutMunicipalityCode,
    checkoutProduct,
    page,
  ]);

  useEffect(() => {
    if (
      page !== 'marketplace' ||
      !checkoutProduct ||
      !sellerAddressMunicipalityCode
    ) {
      setSellerAddressBarangays([]);
      setSellerAddressBarangaysLoading(false);
      setSellerAddressBarangaysError('');
      return;
    }

    const controller = new AbortController();
    const loadSellerAddressBarangays = async () => {
      setSellerAddressBarangaysLoading(true);
      setSellerAddressBarangaysError('');
      try {
        const response = await fetch(
          getBarangaysApiUrl(sellerAddressMunicipalityCode),
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) {
          throw new Error(`Barangay API returned HTTP ${response.status}.`);
        }
        const responseData: unknown = await response.json();
        if (!Array.isArray(responseData)) {
          throw new Error('Barangay API returned an invalid response.');
        }
        const filteredBarangays = responseData
          .filter(isPsgcBarangay)
          .filter(
            (barangay) =>
              barangay.municipalityCode === sellerAddressMunicipalityCode,
          )
          .sort((first, second) => first.name.localeCompare(second.name));
        if (!filteredBarangays.length) {
          throw new Error('No barangays were returned for this municipality.');
        }
        setSellerAddressBarangays(filteredBarangays);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error('Unable to verify seller pickup address:', loadError);
        setSellerAddressBarangaysError(
          'Could not verify the seller barangay with the location service.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setSellerAddressBarangaysLoading(false);
        }
      }
    };

    void loadSellerAddressBarangays();
    return () => controller.abort();
  }, [
    checkoutProduct,
    page,
    sellerAddressBarangayRetry,
    sellerAddressMunicipalityCode,
  ]);

  useEffect(() => {
    if (!editingProductId || municipalities.length === 0) return;
    setProductForm((current) => {
      if (current.municipality || !current.meetupLocation) return current;
      const parsedLocation = parseOrientalMindoroLocation(
        current.meetupLocation,
        municipalities,
      );
      if (!parsedLocation.municipality) return current;
      return {
        ...current,
        municipality: parsedLocation.municipality,
        meetupLocation: parsedLocation.details,
      };
    });
  }, [editingProductId, municipalities]);

  useEffect(() => {
    if (!editingProductId || barangays.length === 0) return;
    setProductForm((current) => {
      if (current.barangay || !current.meetupLocation) return current;
      const parsedLocation = parseBarangayAndDetails(
        current.meetupLocation,
        barangays,
      );
      if (!parsedLocation.barangay) return current;
      return {
        ...current,
        barangay: parsedLocation.barangay,
        meetupLocation: parsedLocation.details,
      };
    });
  }, [editingProductId, barangays]);

  useEffect(() => {
    let active = true;
    let unsubscribeOrderUpdates: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser || !currentUser.emailVerified) {
        navigate('/login', { replace: true });
        return;
      }

      setLoading(true);
      setError('');
      setUserId(currentUser.uid);

      try {
        const profileSnapshot = await getDoc(doc(db, 'users', currentUser.uid));
        let data = profileSnapshot.data();
        if (!profileSnapshot.exists()) {
          if (!currentUser.email) {
            throw new Error('Authenticated account does not have an email address.');
          }
          const newProfile = {
            uid: currentUser.uid,
            fullName: currentUser.displayName?.trim() || 'Agri-Mart User',
            email: currentUser.email,
            phone: currentUser.phoneNumber ?? '',
            role: 'user',
            emailVerified: true,
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', currentUser.uid), newProfile);
          data = newProfile;
        } else if (typeof data?.role !== 'string') {
          await updateDoc(doc(db, 'users', currentUser.uid), { role: 'user' });
          data = { ...data, role: 'user' };
        }
        if (data?.status === 'deactivated') {
          await signOut(auth);
          navigate('/login', { replace: true });
          return;
        }

        const nextProfile: UserProfile = {
          fullName:
            typeof data?.fullName === 'string'
              ? data.fullName
              : currentUser.displayName ?? 'Agri-Mart User',
          sellerName:
            typeof data?.sellerName === 'string' ? data.sellerName : '',
          email: currentUser.email ?? '',
          phone: typeof data?.phone === 'string' ? data.phone : '',
          role: typeof data?.role === 'string' ? data.role : 'user',
          status: typeof data?.status === 'string' ? data.status : 'active',
        };
        if (!active) return;

        setProfile(nextProfile);
        setAccountName(nextProfile.fullName);
        setAccountPhone(nextProfile.phone);
        if (page === 'sell' && hasSellerAccess(nextProfile)) {
          navigate('/seller-dashboard', { replace: true });
        }

        if (page === 'home' || page === 'marketplace') {
          const productSnapshot = await getDocs(
            query(collection(db, 'products'), where('status', '==', 'active')),
          );
          if (active) {
            setProducts(
              productSnapshot.docs.map((product) =>
                toProduct(product.id, product.data()),
              ),
            );
          }
        } else if (page === 'sell' || page === 'seller-dashboard') {
          if (hasSellerAccess(nextProfile)) {
            const productRequest = getDocs(
              query(collection(db, 'products'), where('sellerId', '==', currentUser.uid)),
            );
            const [productSnapshot, categorySnapshot, orderSnapshot] =
              await Promise.all([
                productRequest,
                page === 'sell' || page === 'seller-dashboard'
                  ? getDocs(collection(db, 'categories'))
                  : Promise.resolve(null),
                page === 'seller-dashboard'
                  ? getDocs(
                      query(
                        collection(db, 'orders'),
                        where('sellerId', '==', currentUser.uid),
                      ),
                    )
                  : Promise.resolve(null),
              ]);
            if (active) {
              setProducts(
                productSnapshot.docs.map((product) =>
                  toProduct(product.id, product.data()),
                ),
              );
              if (categorySnapshot) {
                setCategories(
                  categorySnapshot.docs
                    .map((category) => category.data().name)
                    .filter((name): name is string => typeof name === 'string'),
                );
              }
              if (orderSnapshot) {
                setOrders(
                  orderSnapshot.docs.map((order) =>
                    toOrder(order.id, order.data()),
                  ),
                );
              }
            }
          } else if (page === 'seller-dashboard') {
            navigate('/sell', { replace: true });
          } else {
            let applicationSnapshot;
            try {
              applicationSnapshot = await getDoc(
                doc(db, 'sellerApplications', currentUser.uid),
              );
            } catch (applicationReadError) {
              if (getFirestoreErrorCode(applicationReadError) !== 'permission-denied') {
                throw applicationReadError;
              }
              console.error(
                'Seller application read denied. Publish the current Firestore rules:',
                applicationReadError,
              );
              if (active) {
                setSellerApplicationReadWarning(
                  'Seller requests are not enabled in the published Firestore rules yet. An administrator must publish the latest firestore.rules before you can submit or view a request.',
                );
              }
            }
            if (active && applicationSnapshot?.exists()) {
              const application = applicationSnapshot.data();
              if (
                typeof application.requestedRole === 'string' &&
                isSellerRole(application.requestedRole)
              ) {
                setSellerApplication({
                  uid: currentUser.uid,
                  fullName:
                    typeof application.fullName === 'string'
                      ? application.fullName
                      : nextProfile.fullName,
                  email:
                    typeof application.email === 'string'
                      ? application.email
                      : nextProfile.email,
                  phone:
                    typeof application.phone === 'string'
                      ? application.phone
                      : nextProfile.phone,
                  requestedRole: application.requestedRole,
                  businessName:
                    typeof application.businessName === 'string'
                      ? application.businessName
                      : '',
                  businessDescription:
                    typeof application.businessDescription === 'string'
                      ? application.businessDescription
                      : '',
                  meetupLocation:
                    typeof application.meetupLocation === 'string'
                      ? application.meetupLocation
                      : '',
                  status:
                    application.status === 'approved' ||
                    application.status === 'rejected'
                      ? application.status
                      : 'pending',
                  reviewNote:
                    typeof application.reviewNote === 'string'
                      ? application.reviewNote
                      : '',
                });
                setSellerApplicationForm({
                  requestedRole: application.requestedRole,
                  businessName:
                    typeof application.businessName === 'string'
                      ? application.businessName
                      : '',
                  businessDescription:
                    typeof application.businessDescription === 'string'
                      ? application.businessDescription
                      : '',
                  phone:
                    typeof application.phone === 'string'
                      ? application.phone
                      : nextProfile.phone,
                  meetupLocation:
                    typeof application.meetupLocation === 'string'
                      ? application.meetupLocation
                      : '',
                });
              }
            }
          }
        } else if (page === 'my-orders' || page === 'received-orders') {
          if (page === 'received-orders' && !hasSellerAccess(nextProfile)) {
            navigate('/marketplace/home', { replace: true });
            return;
          }
          const field = page === 'my-orders' ? 'buyerId' : 'sellerId';
          const orderQuery = query(
            collection(db, 'orders'),
            where(field, '==', currentUser.uid),
          );
          if (page === 'my-orders') {
            unsubscribeOrderUpdates = onSnapshot(
              orderQuery,
              (orderSnapshot) => {
                if (!active) return;
                setOrders(
                  orderSnapshot.docs.map((order) =>
                    toOrder(order.id, order.data()),
                  ),
                );
                setLoading(false);
              },
              (ordersError) => {
                if (!active) return;
                console.error('Unable to listen for order updates:', ordersError);
                setError(
                  getFirestoreErrorCode(ordersError) === 'permission-denied'
                    ? 'Firestore denied access to your orders. Confirm the latest firestore.rules are published.'
                    : 'Could not load live order updates. Check your connection and try again.',
                );
                setLoading(false);
              },
            );
          } else {
            const orderSnapshot = await getDocs(orderQuery);
            if (active) {
              setOrders(
                orderSnapshot.docs.map((order) =>
                  toOrder(order.id, order.data()),
                ),
              );
            }
          }
        }
      } catch (loadError) {
        if (!active) return;
        console.error(`Unable to load ${page} page:`, loadError);
        setError(
          getFirestoreErrorCode(loadError) === 'permission-denied'
            ? `Firestore denied access while loading ${page}. Confirm the latest firestore.rules are published and allow this account to read the required data.`
            : 'Could not load this page. Check your connection and try again.',
        );
      } finally {
        if (active && page !== 'my-orders') setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      unsubscribeOrderUpdates?.();
    };
  }, [navigate, page]);

  const sortedProducts = useMemo(
    () =>
      [...products].sort(
        (a, b) =>
          (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
      ),
    [products],
  );

  const sellerProducts = useMemo(() => {
    const term = listingSearch.trim().toLowerCase();
    return sortedProducts.filter((product) =>
      `${product.name} ${product.category}`.toLowerCase().includes(term),
    );
  }, [listingSearch, sortedProducts]);

  const activeListingCount = products.filter(
    (product) => product.status === 'active',
  ).length;
  const totalProductStock = products.reduce(
    (total, product) => total + product.stock,
    0,
  );
  const pendingSellerOrderCount = orders.filter(
    (order) => order.status === 'pending',
  ).length;
  const completedSellerRevenue = orders
    .filter((order) => order.status === 'picked_up' || order.status === 'completed')
    .reduce((total, order) => total + order.total, 0);
  const passwordStrength =
    newPassword.length === 0
      ? 0
      : newPassword.length < 6
        ? 1
        : newPassword.length < 10 ||
            !/[A-Z]/.test(newPassword) ||
            !/[0-9]/.test(newPassword)
          ? 2
          : 3;
  const accountCompletion = [
    accountName.trim(),
    profile.email,
    accountPhone.trim(),
  ].filter(Boolean).length;
  const accountRoleLabel =
    profile.role === 'farmer'
      ? 'Farmer / Producer'
      : profile.role === 'distributor'
        ? 'Distributor'
        : profile.role === 'retailer'
          ? 'Retailer / Reseller'
          : profile.role === 'consumer'
            ? 'Consumer / Buyer'
            : profile.role === 'admin'
              ? 'Administrator'
              : 'Marketplace member';
  const profileHasChanges =
    accountName.trim() !== profile.fullName ||
    accountPhone.trim() !== profile.phone;

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortedProducts.filter((product) => {
      const matchesSearch = `${product.name} ${product.description} ${product.category} ${product.sellerName}`
        .toLowerCase()
        .includes(term);
      const matchesCategory =
        categoryFilter === 'All' || product.category === categoryFilter;
      const isAvailable = product.status === 'active' && product.stock > 0;
      return matchesSearch && matchesCategory && isAvailable;
    });
  }, [categoryFilter, search, sortedProducts]);

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    if (
      municipalitiesLoading ||
      municipalitiesError ||
      municipalities.length === 0 ||
      barangaysLoading ||
      barangaysError ||
      barangays.length === 0
    ) {
      setError(
        'The municipality or barangay list is unavailable. Reload it before saving this listing.',
      );
      return;
    }

    const price = Number(productForm.price);
    const stock = Number(productForm.stock);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a price greater than zero.');
      return;
    }
    if (!Number.isInteger(stock) || stock < 1) {
      setError('Enter an available stock quantity of at least 1.');
      return;
    }
    if (!selectedMunicipalityCode) {
      setError(
        'Choose a municipality in Oriental Mindoro for this product listing.',
      );
      return;
    }
    if (!barangays.some((barangay) => barangay.name === productForm.barangay)) {
      setError('Choose a barangay in the selected municipality.');
      return;
    }
    if (!editingProductId && !productImage) {
      setError('Choose a product image before posting your listing.');
      return;
    }

    setSaving(true);
    setSavingStage('Preparing product listing...');
    setUploadProgress(0);
    setError('');
    setNotice('');
    let uploadedImage: { url: string; path: string } | null = null;
    const productData = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      sellerMeetupLocation: formatOrientalMindoroLocation(
        productForm.meetupLocation,
        productForm.barangay,
        productForm.municipality,
      ),
      category: productForm.category.trim() || 'Other',
      price,
      stock,
    };

    try {
      const productRef = editingProductId
        ? doc(db, 'products', editingProductId)
        : doc(collection(db, 'products'));

      if (productImage) {
        setSavingStage('Uploading product image...');
        const cloudinaryImage = await uploadProductImage(
          productImage,
          setUploadProgress,
        );
        uploadedImage = {
          url: cloudinaryImage.secure_url,
          path: cloudinaryImage.public_id,
        };
      }

      if (editingProductId) {
        const imageData = uploadedImage ?? existingImage;
        setSavingStage('Saving product details...');
        await withTimeout(
          updateDoc(productRef, {
            ...productData,
            imageUrl: imageData.url,
            imagePath: imageData.path,
            updatedAt: serverTimestamp(),
          }),
          PRODUCT_SAVE_TIMEOUT_MS,
          'product-save-timeout',
        );
        setProducts((current) =>
          current.map((product) =>
            product.id === editingProductId
              ? {
                  ...product,
                  name: productData.name,
                  description: productData.description,
                  category: productData.category,
                  price: productData.price,
                  stock: productData.stock,
                  imageUrl: imageData.url,
                  imagePath: imageData.path,
                  sellerMeetupLocation: productData.sellerMeetupLocation,
                }
              : product,
          ),
        );
        setNotice(
          uploadedImage && existingImage.url.includes('res.cloudinary.com')
            ? 'Product listing updated. The previous image remains in Cloudinary and can be removed from its Media Library.'
            : 'Product listing updated.',
        );
      } else {
        setSavingStage('Saving product details...');
        await withTimeout(
          setDoc(productRef, {
            ...productData,
            sellerId: userId,
            sellerName: profile.sellerName || profile.fullName,
            sellerEmail: profile.email,
            imageUrl: uploadedImage?.url ?? '',
            imagePath: uploadedImage?.path ?? '',
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          PRODUCT_SAVE_TIMEOUT_MS,
          'product-save-timeout',
        );
        setProducts((current) => [
          toProduct(productRef.id, {
            ...productData,
            sellerId: userId,
            sellerName: profile.sellerName || profile.fullName,
            sellerEmail: profile.email,
            imageUrl: uploadedImage?.url ?? '',
            imagePath: uploadedImage?.path ?? '',
            status: 'active',
          }),
          ...current,
        ]);
        setNotice('Your product is now listed in the marketplace.');
      }
      setProductForm(emptyProductForm);
      setProductImage(null);
      setImagePreviewUrl('');
      setExistingImage({ url: '', path: '' });
      setEditingProductId('');
      setSellerView('listings');
      navigate('/seller-dashboard?view=listings', { replace: true });
    } catch (saveError) {
      console.error('Unable to save product listing:', saveError);
      const errorMessage =
        saveError instanceof Error ? saveError.message : '';
      const code =
        typeof saveError === 'object' &&
        saveError !== null &&
        'code' in saveError
          ? String(saveError.code)
          : '';
      if (errorMessage === 'cloudinary-config-missing') {
        setError(
          import.meta.env.PROD
            ? 'Product image uploads are not configured for this deployed app. In Netlify, add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET under Site configuration > Environment variables, then trigger a new deploy.'
            : 'Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env.local, then restart the app.',
        );
      } else if (errorMessage === 'cloudinary-upload-timeout') {
        setError(
          'Cloudinary image upload timed out. Check your internet connection and Cloudinary upload preset, then try again.',
        );
      } else if (errorMessage === 'product-save-timeout') {
        setError(
          'Saving product details timed out. Check your internet connection and Firestore rules. Refresh My Listings before retrying.',
        );
      } else if (
        errorMessage === 'cloudinary-upload-failed' ||
        errorMessage === 'cloudinary-invalid-response'
      ) {
        setError(
          'Cloudinary could not accept the image. Verify the Cloud name and unsigned upload preset, then try again.',
        );
      } else if (code === 'permission-denied' || code === 'firestore/permission-denied') {
        setError(
          'Firestore denied the product save. Publish the updated Firestore rules and try again.',
        );
      } else {
        setError(
          'Could not save the product. Check the browser console for details, then verify your Cloudinary upload preset and Firestore rules.',
        );
      }
    } finally {
      setSaving(false);
      setSavingStage('');
      setUploadProgress(0);
    }
  };

  const submitSellerApplication = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== userId) {
      setError('Sign in again before submitting a seller request.');
      return;
    }

    setError('');
    setNotice('');
    setSubmittingSellerApplication(true);
    const applicationRef = doc(db, 'sellerApplications', currentUser.uid);
    const applicationData = {
      uid: currentUser.uid,
      fullName: profile.fullName.trim(),
      email: profile.email.trim(),
      phone: sellerApplicationForm.phone.trim(),
      requestedRole: sellerApplicationForm.requestedRole,
      businessName: sellerApplicationForm.businessName.trim(),
      businessDescription: sellerApplicationForm.businessDescription.trim(),
      meetupLocation: sellerApplicationForm.meetupLocation.trim(),
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(applicationRef, applicationData);
      setSellerApplication({
        ...applicationData,
        status: 'pending',
        reviewNote: '',
      });
      setNotice('Your seller request was sent to an administrator for review.');
    } catch (applicationError) {
      console.error('Unable to submit seller application:', applicationError);
      setError(
        getFirestoreErrorCode(applicationError) === 'permission-denied'
          ? 'Firestore denied this request. An administrator must publish the latest firestore.rules before seller requests can be submitted.'
          : 'Could not submit your seller request. Check your connection and try again.',
      );
    } finally {
      setSubmittingSellerApplication(false);
    }
  };

  const startEditingProduct = (product: Product) => {
    const parsedLocation = parseOrientalMindoroLocation(
      product.sellerMeetupLocation,
      municipalities,
    );
    setEditingProductId(product.id);
    setSellerView('details');
    setProductImage(null);
    setImagePreviewUrl('');
    setExistingImage({ url: product.imageUrl, path: product.imagePath });
    setProductForm({
      name: product.name,
      description: product.description,
      municipality: parsedLocation.municipality,
      barangay: '',
      meetupLocation: parsedLocation.details,
      category: product.category,
      price: String(product.price),
      stock: String(product.stock),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}" from your listings?`)) return;
    setError('');
    setNotice('');
    try {
      await deleteDoc(doc(db, 'products', product.id));
      setProducts((current) =>
        current.filter((entry) => entry.id !== product.id),
      );
      setNotice(
        product.imageUrl.includes('res.cloudinary.com')
          ? 'Product listing deleted. The image remains in Cloudinary; remove it from the Cloudinary Media Library if needed.'
          : 'Product listing deleted.',
      );
    } catch (deleteError) {
      console.error('Unable to delete product listing:', deleteError);
      setError('Could not delete this listing. Check your Firestore rules.');
    }
  };

  const placeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const product = checkoutProduct;
    const currentUser = auth.currentUser;
    if (!product) return;
    const quantity = Number(quantities[product.id] ?? '1');
    if (!currentUser || currentUser.uid === product.sellerId) {
      setError('You cannot place an order for your own product.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Enter a valid order quantity.');
      return;
    }
    if (!checkoutDetails.contactNumber.trim()) {
      setError('Enter a contact number the seller can call.');
      return;
    }
    if (
      checkoutDetails.deliveryMethod === 'meetup' &&
      (municipalitiesLoading ||
        !!municipalitiesError ||
        !checkoutDetails.meetupMunicipality ||
        !checkoutMunicipalityCode ||
        !checkoutBarangays.some(
          (barangay) => barangay.name === checkoutDetails.meetupBarangay,
        ) ||
        !checkoutDetails.meetupPosition ||
        checkoutBarangaysLoading ||
        !!checkoutBarangaysError)
    ) {
      setError(
        'Select a municipality and barangay, then pin your meet-up point on the map.',
      );
      return;
    }
    setError('');
    setNotice('');
    setSaving(true);
    const productRef = doc(db, 'products', product.id);
    const orderRef = doc(collection(db, 'orders'));

    try {
      await runTransaction(db, async (transaction) => {
        const productSnapshot = await transaction.get(productRef);
        if (!productSnapshot.exists()) {
          throw new Error('This product is no longer available.');
        }
        const currentProduct = productSnapshot.data();
        if (
          currentProduct.status !== 'active' ||
          currentProduct.sellerId === currentUser.uid
        ) {
          throw new Error('You cannot order this product.');
        }
        if (
          typeof currentProduct.sellerMeetupLocation !== 'string' ||
          !currentProduct.sellerMeetupLocation.trim()
        ) {
          throw new Error(
            'This seller has not added a meet-up / pickup location yet.',
          );
        }
        if (
          typeof currentProduct.stock !== 'number' ||
          currentProduct.stock < quantity
        ) {
          throw new Error('There is not enough stock for this order.');
        }

        transaction.update(productRef, {
          stock: currentProduct.stock - quantity,
          updatedAt: serverTimestamp(),
          lastOrderId: orderRef.id,
        });
        transaction.set(orderRef, {
          buyerId: currentUser.uid,
          buyerName: profile.fullName,
          buyerEmail: profile.email,
          contactNumber: checkoutDetails.contactNumber.trim(),
          buyerMeetupLocation:
            checkoutDetails.deliveryMethod === 'meetup'
              ? formatOrientalMindoroLocation(
                  checkoutDetails.meetupAddress,
                  checkoutDetails.meetupBarangay,
                  checkoutDetails.meetupMunicipality,
                )
              : '',
      ...(checkoutDetails.deliveryMethod === 'meetup' &&
      checkoutDetails.meetupPosition
        ? {
                locationLatitude: checkoutDetails.meetupPosition[0],
                locationLongitude: checkoutDetails.meetupPosition[1],
              }
        : {}),
          deliveryMethod: checkoutDetails.deliveryMethod,
          orderNotes: checkoutDetails.orderNotes.trim(),
          sellerId: currentProduct.sellerId,
          sellerName: currentProduct.sellerName,
          sellerEmail: currentProduct.sellerEmail,
          sellerMeetupLocation: currentProduct.sellerMeetupLocation,
          productId: product.id,
          productName: currentProduct.name,
          productImageUrl:
            typeof currentProduct.imageUrl === 'string'
              ? currentProduct.imageUrl
              : '',
          quantity,
          unitPrice: currentProduct.price,
          total: currentProduct.price * quantity,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      });

      setProducts((current) =>
        current.map((entry) =>
          entry.id === product.id
            ? { ...entry, stock: entry.stock - quantity }
            : entry,
        ),
      );
      setNotice('Order placed! You can track its status in Order Tracking.');
      setQuantities((current) => ({ ...current, [product.id]: '1' }));
      setCheckoutProduct(null);
      setCheckoutDetails({
        contactNumber: profile.phone,
        buyerMeetupLocation: '',
        meetupMunicipality: '',
        meetupBarangay: '',
        meetupAddress: '',
        meetupPosition: null,
        deliveryMethod: 'pickup',
        orderNotes: '',
      });
    } catch (orderError) {
      console.error('Unable to place order:', orderError);
      const errorCode = getFirestoreErrorCode(orderError);
      setError(
        errorCode === 'permission-denied'
          ? 'Firestore blocked this order. Publish the latest firestore.rules to Firebase, then try again.'
          : orderError instanceof Error
            ? orderError.message
            : 'Could not place this order. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const updateOrderStatus = async (
    order: MarketplaceOrder,
    status: OrderStatus,
  ) => {
    if (
      status === 'cancelled' &&
      !window.confirm(
        page === 'my-orders'
          ? `Cancel your order for "${order.productName}"? The reserved stock will be returned to the seller.`
          : `Decline the order for "${order.productName}"? The reserved stock will be returned.`,
      )
    ) {
      return;
    }

    setError('');
    setNotice('');
    setSaving(true);
    try {
      if (status === 'cancelled') {
        await runTransaction(db, async (transaction) => {
          const orderRef = doc(db, 'orders', order.id);
          const productRef = doc(db, 'products', order.productId);
          const [orderSnapshot, productSnapshot] = await Promise.all([
            transaction.get(orderRef),
            transaction.get(productRef),
          ]);
          if (!orderSnapshot.exists()) {
            throw new Error('This order could not be found.');
          }
          if (!productSnapshot.exists()) {
            throw new Error('The product listing could not be found.');
          }
          const currentOrder = orderSnapshot.data();
          const ownerField = page === 'my-orders' ? 'buyerId' : 'sellerId';
          if (currentOrder[ownerField] !== userId) {
            throw new Error('You are not allowed to cancel this order.');
          }
          if (!['pending', 'confirmed', 'ready_for_pickup'].includes(currentOrder.status)) {
            throw new Error('Only orders not yet picked up can be cancelled.');
          }
          const quantity = currentOrder.quantity;
          const stock = productSnapshot.data().stock;
          if (
            typeof quantity !== 'number' ||
            !Number.isInteger(quantity) ||
            quantity <= 0 ||
            typeof stock !== 'number' ||
            !Number.isInteger(stock) ||
            stock < 0
          ) {
            throw new Error('The order quantity or product stock is invalid.');
          }
          transaction.update(productRef, {
            stock: stock + quantity,
            updatedAt: serverTimestamp(),
            lastRefundOrderId: order.id,
          });
          transaction.update(orderRef, { status });
        });
      } else {
        await updateDoc(doc(db, 'orders', order.id), { status });
      }
      setOrders((current) =>
        current.map((entry) =>
          entry.id === order.id ? { ...entry, status } : entry,
        ),
      );
      setNotice(`Order marked ${getOrderStatusLabel(status)}.`);
    } catch (statusError) {
      console.error('Unable to update order status:', statusError);
      setError(
        statusError instanceof Error
          ? statusError.message
          : 'Could not update order status. Check your Firestore rules.',
      );
    } finally {
      setSaving(false);
    }
  };

  const findCheckoutMeetupLocation = async () => {
    const address = [
      checkoutDetails.meetupAddress,
      checkoutDetails.meetupBarangay,
      checkoutDetails.meetupMunicipality,
    ]
      .filter(Boolean)
      .join(', ');
    if (!checkoutDetails.meetupMunicipality || !checkoutDetails.meetupBarangay) {
      setMeetupLookupError('Select a municipality and barangay before finding the map pin.');
      return;
    }

    setMeetupLookupLoading(true);
    setMeetupLookupError('');
    try {
      const position = await geocodeOrientalMindoroAddress(address);
      if (!position) {
        setMeetupLookupError(
          'No matching map location was found. Try adding a nearby landmark, or tap the map to place the pin manually.',
        );
        return;
      }
      setCheckoutDetails((current) => ({ ...current, meetupPosition: position }));
    } catch (lookupError) {
      console.error('Unable to find checkout meet-up location:', lookupError);
      setMeetupLookupError(
        'Could not search the map. Check your connection or tap the map to place the pin manually.',
      );
    } finally {
      setMeetupLookupLoading(false);
    }
  };

  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        fullName: accountName.trim(),
        phone: accountPhone.trim(),
      });
      await updateProfile(currentUser, { displayName: accountName.trim() });
      setProfile((current) => ({
        ...current,
        fullName: accountName.trim(),
        phone: accountPhone.trim(),
      }));
      setNotice('Your profile has been updated.');
    } catch (saveError) {
      console.error('Unable to update account profile:', saveError);
      setError('Could not update your profile. Check your Firestore rules.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (newPassword.length < 6) {
      setError('The new password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      if (!auth.currentUser) throw new Error('No signed-in user.');
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setNotice('Password updated.');
    } catch (passwordError) {
      console.error('Unable to update account password:', passwordError);
      const code =
        typeof passwordError === 'object' &&
        passwordError !== null &&
        'code' in passwordError
          ? String(passwordError.code)
          : '';
      setError(
        code === 'auth/requires-recent-login'
          ? 'Please log out and sign in again before changing your password.'
          : 'Could not update your password. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (logoutError) {
      console.error('Unable to log out:', logoutError);
      setError('Could not log out. Please try again.');
    }
  };

  const renderProductCard = (product: Product, allowPurchase: boolean) => {
    const ownProduct = product.sellerId === userId;
    const selectedQuantity = Number(quantities[product.id] ?? '1');
    const validQuantity =
      Number.isInteger(selectedQuantity) &&
      selectedQuantity >= 1 &&
      selectedQuantity <= product.stock;
    return (
      <article className="market-product-card" key={product.id}>
        <div className="market-product-image">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" />
          ) : (
            <IonIcon icon={cubeOutline} />
          )}
        </div>
        <div className="market-product-body">
          <div className="market-product-topline">
            <span className="market-category">{product.category}</span>
            <span className={`market-stock ${product.stock > 0 ? 'available' : 'unavailable'}`}>
              {product.stock > 0
                ? product.stock <= 5
                  ? `Only ${product.stock} left`
                  : `${product.stock} in stock`
                : 'Out of stock'}
            </span>
          </div>
          <h3>{product.name}</h3>
          <p className="market-product-description">
            {product.description || 'No description provided.'}
          </p>
          <div className="market-seller-identity">
            <span className="market-seller-avatar">
              <IonIcon icon={personOutline} aria-hidden="true" />
            </span>
            <span>
              <small>Sold by</small>
              <strong>{product.sellerName}</strong>
              {product.sellerEmail && (
                <a href={`mailto:${encodeURIComponent(product.sellerEmail)}`}>
                  {product.sellerEmail}
                </a>
              )}
            </span>
          </div>
          <p className="market-seller-location">
            <strong>Pickup location</strong>
            {product.sellerMeetupLocation || 'Seller has not added an address yet'}
          </p>
          <div className="market-product-footer">
            <span className="market-product-price">
              <small>Price per item</small>
              <strong>₱{product.price.toLocaleString()}</strong>
            </span>
            {allowPurchase &&
              (ownProduct ? (
                <span className="market-own-label">Your listing</span>
              ) : product.stock < 1 ? (
                <span className="market-own-label">Out of stock</span>
              ) : (
                <div className="market-buy-controls">
                  <label>
                    <span>Qty</span>
                    <input
                      type="number"
                      aria-label={`Quantity for ${product.name}`}
                      min="1"
                      max={product.stock}
                      step="1"
                      inputMode="numeric"
                      value={quantities[product.id] ?? '1'}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [product.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <IonButton
                    disabled={saving || !product.sellerMeetupLocation || !validQuantity}
                    onClick={() => {
                      setError('');
                      setCheckoutDetails({
                        contactNumber: profile.phone,
                        buyerMeetupLocation: '',
                        meetupMunicipality: '',
                        meetupBarangay: '',
                        meetupAddress: '',
                        meetupPosition: null,
                        deliveryMethod: 'pickup',
                        orderNotes: '',
                      });
                      setCheckoutProduct(product);
                    }}
                  >
                    Order now
                  </IonButton>
                </div>
              ))}
          </div>
          {allowPurchase && !ownProduct && product.stock > 0 && !product.sellerMeetupLocation && (
            <p className="market-product-purchase-hint">
              Ordering is unavailable until the seller adds a pickup location.
            </p>
          )}
          {allowPurchase && !ownProduct && product.stock > 0 && validQuantity === false && (
            <p className="market-product-purchase-hint" role="status">
              Enter a quantity from 1 to {product.stock}.
            </p>
          )}
          {!allowPurchase && (
            <span className="market-listed-date">
              Listed {formatDate(product.createdAt)}
            </span>
          )}
        </div>
      </article>
    );
  };

  const filteredOrders = [...orders].sort(
    (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
  );

  if (loading) {
    return (
      <IonPage>
        <IonContent className="market-content">
          <div className="market-loading">
            <IonSpinner name="crescent" color="success" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="market-toolbar">
          <IonTitle>
            <img className="market-brand-logo" src="/agri-mart-logo.png" alt="Agri-Mart" />
          </IonTitle>
          <IonButton
            slot="end"
            fill="clear"
            className="market-seller-shortcut"
            aria-label={
              page === 'seller-dashboard' || page === 'sell'
                ? 'Return to marketplace home'
                : page === 'received-orders' && hasSellerAccess(profile)
                  ? 'Return to seller dashboard home'
                : hasSellerAccess(profile)
                  ? 'Open seller dashboard'
                  : 'Start selling'
            }
            onClick={() =>
              navigate(
                page === 'seller-dashboard' || page === 'sell'
                  ? '/marketplace/home'
                  : page === 'received-orders' && hasSellerAccess(profile)
                    ? '/seller-dashboard'
                  : hasSellerAccess(profile)
                    ? '/seller-dashboard'
                    : '/sell',
              )
            }
          >
            <IonIcon
              icon={
                page === 'seller-dashboard' ||
                page === 'sell' ||
                (page === 'received-orders' && hasSellerAccess(profile))
                  ? leafOutline
                  : storefrontOutline
              }
              slot="start"
            />
            {page === 'seller-dashboard' ||
            page === 'sell' ||
            (page === 'received-orders' && hasSellerAccess(profile))
              ? 'Home'
              : hasSellerAccess(profile)
                ? 'Seller dashboard'
                : 'Start selling'}
          </IonButton>
          <IonButton
            slot="end"
            fill="clear"
            className="market-logout"
            aria-label="Log out"
            onClick={() => void handleLogout()}
          >
            <IonIcon icon={logOutOutline} slot="start" />
            Logout
          </IonButton>
        </IonToolbar>
      </IonHeader>
      <IonContent className="market-content">
        <div
          className={[
            'market-shell',
            page !== 'seller-dashboard' &&
            page !== 'sell' &&
            !(page === 'received-orders' && hasSellerAccess(profile))
              ? 'has-market-sidebar'
              : '',
            page === 'seller-dashboard' || (page === 'received-orders' && hasSellerAccess(profile))
              ? 'has-seller-sidebar'
              : '',
            page === 'sell' ? 'has-seller-application' : '',
          ].filter(Boolean).join(' ')}
        >
          {page === 'seller-dashboard' ||
          (page === 'received-orders' && hasSellerAccess(profile)) ? (
            <div className="market-mobile-navigation">
              <button
                type="button"
                className="market-mobile-menu-toggle"
                aria-expanded={mobileNavigationOpen}
                aria-controls="seller-dashboard-navigation"
                aria-label="Toggle seller navigation"
                onClick={() => setMobileNavigationOpen((open) => !open)}
              >
                <IonIcon icon={menuOutline} />
                Seller menu
              </button>
              <nav
                id="seller-dashboard-navigation"
                className={`seller-dashboard-sidebar${mobileNavigationOpen ? ' mobile-navigation-open' : ''}`}
                aria-label="Seller dashboard"
              >
                <span className="seller-dashboard-sidebar-label">SELLER WORKSPACE</span>
                <button
                  type="button"
                  className={page === 'seller-dashboard' && sellerView === 'dashboard' ? 'active' : ''}
                  onClick={() => {
                    setMobileNavigationOpen(false);
                    navigate('/seller-dashboard');
                  }}
                >
                  <IonIcon icon={storefrontOutline} />
                  Overview
                </button>
                <button
                  type="button"
                  className={page === 'received-orders' ? 'active' : ''}
                  onClick={() => {
                    setMobileNavigationOpen(false);
                    navigate('/order-management');
                  }}
                >
                  <IonIcon icon={receiptOutline} />
                  Order management
                </button>
                <button
                  type="button"
                  className={page === 'seller-dashboard' && sellerView === 'listings' ? 'active' : ''}
                  onClick={() => {
                    setMobileNavigationOpen(false);
                    navigate('/seller-dashboard?view=listings');
                  }}
                >
                  <IonIcon icon={cubeOutline} />
                  Manage listings
                </button>
                <button
                  type="button"
                  className={page === 'seller-dashboard' && sellerView === 'details' ? 'active' : ''}
                  onClick={() => {
                    setMobileNavigationOpen(false);
                    navigate('/seller-dashboard?view=details');
                  }}
                >
                  <IonIcon icon={addOutline} />
                  Add product
                </button>
              </nav>
            </div>
          ) : (
            <div className="market-mobile-navigation">
              <button
                type="button"
                className="market-mobile-menu-toggle"
                aria-expanded={mobileNavigationOpen}
                aria-controls="marketplace-navigation"
                aria-label="Toggle marketplace navigation"
                onClick={() => setMobileNavigationOpen((open) => !open)}
              >
                <IonIcon icon={menuOutline} />
                Marketplace menu
              </button>
              <nav
                id="marketplace-navigation"
                className={`market-nav${mobileNavigationOpen ? ' mobile-navigation-open' : ''}`}
                aria-label="Marketplace pages"
              >
                {navigation.map((item) => (
                  <button
                    type="button"
                    key={item.path}
                    className={page === item.page ? 'active' : ''}
                    onClick={() => {
                      setMobileNavigationOpen(false);
                      navigate(item.path);
                    }}
                  >
                    <IonIcon icon={item.icon} />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          )}

          <main className="market-main">
            {page !== 'home' && (
              <header className="market-page-heading">
                <div>
                  <span className="market-eyebrow">AGRI-MART MARKETPLACE</span>
                  <h1>
                    {page === 'seller-dashboard' && sellerView === 'listings'
                      ? 'My listings'
                      : page === 'seller-dashboard' && sellerView === 'details'
                        ? editingProductId
                          ? 'Edit product'
                          : 'Add a product'
                        : pageInfo[page].title}
                  </h1>
                  <p>
                    {page === 'seller-dashboard' && sellerView === 'listings'
                      ? 'Manage your store products, stock, and listing details.'
                      : page === 'seller-dashboard' && sellerView === 'details'
                        ? 'Add the details buyers need to find and order your product.'
                        : pageInfo[page].subtitle}
                  </p>
                </div>
              </header>
            )}

            {error && <p className="market-message error" role="alert">{error}</p>}
            {notice && <p className="market-message success" role="status">{notice}</p>}

            {page === 'home' && (
              <section className="market-home">
                <div className="market-home-hero">
                  <div className="market-home-hero-copy">
                    <span className="market-home-kicker">
                      <IonIcon icon={leafOutline} />
                      GROW MORE WITH AGRI-MART
                    </span>
                    <h1>Welcome back, {profile.fullName.trim().split(/\s+/)[0] || 'there'}.</h1>
                    <p>
                      Your next great harvest starts with the right supplies.
                      Find trusted products and connect with agricultural sellers in your community.
                    </p>
                    <div className="market-home-hero-actions">
                      <IonButton onClick={() => navigate('/marketplace')}>
                        <IonIcon icon={storefrontOutline} slot="start" />
                        Explore marketplace
                      </IonButton>
                      <IonButton fill="outline" onClick={() => navigate('/order-tracking')}>
                        <IonIcon icon={cartOutline} slot="start" />
                        Track your orders
                      </IonButton>
                    </div>
                  </div>
                  <div className="market-home-overview" aria-label="Marketplace overview">
                    <div className="market-home-overview-icon">
                      <IonIcon icon={storefrontOutline} />
                    </div>
                    <span>COMMUNITY MARKETPLACE</span>
                    <strong>{products.length}</strong>
                    <p>products available to explore</p>
                    <div className="market-home-overview-divider" />
                    <div className="market-home-overview-meta">
                      <span><IonIcon icon={leafOutline} /> {new Set(products.map((product) => product.category)).size} categories</span>
                      <span><IonIcon icon={cartOutline} /> Simple order tracking</span>
                    </div>
                  </div>
                </div>

                <div className="market-home-section-heading">
                  <div>
                    <span className="market-eyebrow">A GOOD PLACE TO START</span>
                    <h2>What would you like to do?</h2>
                  </div>
                </div>
                <div className="market-home-action-grid">
                  <button type="button" onClick={() => navigate('/marketplace')}>
                    <span className="market-home-action-icon orange"><IonIcon icon={storefrontOutline} /></span>
                    <strong>Browse products</strong>
                    <small>Explore tools, seeds, and farm essentials.</small>
                    <span className="market-home-action-link">Explore marketplace <span aria-hidden="true">→</span></span>
                  </button>
                  <button type="button" onClick={() => navigate('/order-tracking')}>
                    <span className="market-home-action-icon green"><IonIcon icon={cartOutline} /></span>
                    <strong>Track your orders</strong>
                    <small>See when a seller prepares your order for pickup.</small>
                    <span className="market-home-action-link">Order tracking <span aria-hidden="true">→</span></span>
                  </button>
                  <button type="button" onClick={() => navigate('/my-account')}>
                    <span className="market-home-action-icon navy"><IonIcon icon={personCircleOutline} /></span>
                    <strong>Update your account</strong>
                    <small>Keep your contact details ready for sellers.</small>
                    <span className="market-home-action-link">Manage account <span aria-hidden="true">→</span></span>
                  </button>
                </div>

                <section className="market-home-categories">
                  <div className="market-home-section-heading">
                    <div>
                      <span className="market-eyebrow">SHOP YOUR WAY</span>
                      <h2>Explore categories</h2>
                    </div>
                    <button type="button" onClick={() => navigate('/marketplace')}>See all products <span aria-hidden="true">→</span></button>
                  </div>
                  {products.length > 0 ? (
                    <div className="market-home-category-list">
                      {[...new Set(products.map((product) => product.category))]
                        .sort()
                        .slice(0, 6)
                        .map((category) => (
                          <button
                            type="button"
                            key={category}
                            onClick={() => {
                              setCategoryFilter(category);
                              navigate('/marketplace');
                            }}
                          >
                            <IonIcon icon={cubeOutline} />
                            <span>{category}</span>
                            <span aria-hidden="true">↗</span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <div className="market-home-category-empty">
                      <IonIcon icon={leafOutline} />
                      <p>Product categories will appear here as community sellers add listings.</p>
                      <IonButton fill="outline" onClick={() => navigate('/marketplace')}>Visit marketplace</IonButton>
                    </div>
                  )}
                </section>

                <div className="market-home-trust">
                  <IonIcon icon={checkmarkCircleOutline} />
                  <div>
                    <strong>Built around your farming community</strong>
                    <p>Discover local listings, connect with sellers, and keep your orders organized in one place.</p>
                  </div>
                  <IonButton fill="outline" onClick={() => navigate('/about')}>About Agri-Mart</IonButton>
                </div>
              </section>
            )}

            {page === 'seller-dashboard' && sellerView === 'dashboard' && (
              <section className="seller-dashboard">
                <header className="seller-dashboard-welcome">
                  <div>
                    <span className="market-eyebrow">YOUR SELLER WORKSPACE</span>
                    <h2>Welcome back, {profile.sellerName || profile.fullName}</h2>
                    <p>
                      Here’s what’s happening with your store. Manage your
                      listings and keep incoming orders moving.
                    </p>
                  </div>
                </header>

                <div className="seller-dashboard-stats">
                  <article>
                    <span className="seller-dashboard-stat-icon"><IonIcon icon={cubeOutline} /></span>
                    <div><small>Active listings</small><strong>{activeListingCount}</strong></div>
                    <span className="seller-dashboard-stat-note">of {products.length} total</span>
                  </article>
                  <article>
                    <span className="seller-dashboard-stat-icon orange"><IonIcon icon={receiptOutline} /></span>
                    <div><small>Orders to review</small><strong>{pendingSellerOrderCount}</strong></div>
                    <span className="seller-dashboard-stat-note">awaiting your response</span>
                  </article>
                  <article>
                    <span className="seller-dashboard-stat-icon green"><IonIcon icon={storefrontOutline} /></span>
                    <div><small>Units in stock</small><strong>{totalProductStock.toLocaleString()}</strong></div>
                    <span className="seller-dashboard-stat-note">across your listings</span>
                  </article>
                  <article>
                    <span className="seller-dashboard-stat-icon gold"><IonIcon icon={cartOutline} /></span>
                    <div><small>Completed sales</small><strong>₱{completedSellerRevenue.toLocaleString()}</strong></div>
                    <span className="seller-dashboard-stat-note">from completed orders</span>
                  </article>
                </div>

                <div className="seller-dashboard-panels">
                  <section className="seller-dashboard-panel">
                    <div className="seller-dashboard-panel-heading">
                      <div>
                        <span className="market-eyebrow">LATEST ACTIVITY</span>
                        <h2>Incoming orders</h2>
                      </div>
                      <button type="button" onClick={() => navigate('/order-management')}>
                        View all
                      </button>
                    </div>
                    {filteredOrders.length ? (
                      <div className="seller-dashboard-order-list">
                        {filteredOrders.slice(0, 5).map((order) => (
                          <article className="seller-dashboard-order" key={order.id}>
                            <span className="seller-dashboard-order-icon"><IonIcon icon={cartOutline} /></span>
                            <div className="seller-dashboard-order-main">
                              <strong>{order.productName}</strong>
                              <span>{order.buyerName} · {order.quantity} {order.quantity === 1 ? 'unit' : 'units'}</span>
                              <small>{formatDate(order.createdAt)}</small>
                            </div>
                            <div className="seller-dashboard-order-side">
                              <strong>₱{order.total.toLocaleString()}</strong>
                              <span className={`market-order-status ${order.status}`}>
                                {getOrderStatusLabel(order.status)}
                              </span>
                              {order.status === 'pending' && (
                                <div>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void updateOrderStatus(order, 'ready_for_pickup')}
                                  >
                                    Ready for pickup
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    disabled={saving}
                                    onClick={() => void updateOrderStatus(order, 'cancelled')}
                                  >
                                    Decline
                                  </button>
                                </div>
                              )}
                              {order.status === 'confirmed' && (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void updateOrderStatus(order, 'ready_for_pickup')}
                                >
                                  Ready for pickup
                                </button>
                              )}
                              {order.status === 'ready_for_pickup' && (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void updateOrderStatus(order, 'picked_up')}
                                >
                                  Picked up (delivered)
                                </button>
                              )}
                            </div>
                            {order.deliveryMethod === 'meetup' &&
                              order.locationLatitude !== undefined &&
                              order.locationLongitude !== undefined && (
                                <div className="seller-dashboard-order-map">
                                  <strong>Customer meet-up point</strong>
                                  <MeetupLocationMap
                                    label={`Customer meet-up location for ${order.productName}`}
                                    position={[
                                      order.locationLatitude,
                                      order.locationLongitude,
                                    ]}
                                  />
                                </div>
                              )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="seller-dashboard-empty">
                        <IonIcon icon={receiptOutline} />
                        <strong>No orders yet</strong>
                        <span>New customer orders will show up here.</span>
                      </div>
                    )}
                  </section>
                </div>
              </section>
            )}

            {page === 'marketplace' && (
              <>
                <div className="market-filters">
                  <input
                    type="search"
                    value={search}
                    placeholder="Search products, categories, or sellers..."
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                  >
                    <option value="All">All categories</option>
                    {[...new Set(products.map((product) => product.category))]
                      .sort()
                      .map((category) => (
                        <option value={category} key={category}>{category}</option>
                      ))}
                  </select>
                </div>
                {filteredProducts.length ? (
                  <div className="market-product-grid">
                    {filteredProducts.map((product) =>
                      renderProductCard(product, true),
                    )}
                  </div>
                ) : (
                  <div className="market-empty">
                    <IonIcon icon={storefrontOutline} />
                    <h2>No products found</h2>
                    <p>Try changing your search or category filter.</p>
                  </div>
                )}
              </>
            )}

            {((page === 'sell' && !hasSellerAccess(profile)) ||
              (page === 'seller-dashboard' && sellerView !== 'dashboard')) && (
              !hasSellerAccess(profile) ? (
                <section className="seller-application-panel">
                  <div className="seller-application-intro">
                    <span className="seller-application-icon">
                      <IonIcon icon={storefrontOutline} />
                    </span>
                    <span className="market-eyebrow">SELL ON AGRI-MART</span>
                    <h2>Request seller access</h2>
                    <p>
                      Tell us about your agricultural business. An administrator
                      will review your request before you can publish products.
                    </p>
                  </div>

                  {sellerApplicationReadWarning && (
                    <p className="market-message error" role="alert">
                      {sellerApplicationReadWarning}
                    </p>
                  )}

                  {sellerApplication?.status === 'pending' ? (
                    <div className="seller-application-status pending" role="status">
                      <strong>Request under review</strong>
                      <span>
                        Your {sellerRoleLabels[sellerApplication.requestedRole].toLowerCase()}
                        {' '}application has been sent to an administrator. You can
                        continue browsing while it is reviewed.
                      </span>
                    </div>
                  ) : sellerApplication?.status === 'approved' ? (
                    <div className="seller-application-status approved" role="status">
                      <strong>Seller access approved</strong>
                      <span>Refresh this page to open your seller workspace.</span>
                      <IonButton onClick={() => window.location.reload()}>
                        Refresh seller access
                      </IonButton>
                    </div>
                  ) : (
                    <form
                      className="seller-application-form"
                      onSubmit={(event) => void submitSellerApplication(event)}
                    >
                      {sellerApplication?.status === 'rejected' && (
                        <div className="seller-application-status rejected" role="status">
                          <strong>More information is needed</strong>
                          <span>
                            {sellerApplication.reviewNote ||
                              'Your previous request was not approved. Update your details and resubmit.'}
                          </span>
                        </div>
                      )}
                      <div className="seller-application-fields">
                        <label>
                          Seller type
                          <select
                            required
                            value={sellerApplicationForm.requestedRole}
                            onChange={(event) => {
                              const requestedRole = event.target.value;
                              if (isSellerRole(requestedRole)) {
                                setSellerApplicationForm({
                                  ...sellerApplicationForm,
                                  requestedRole,
                                });
                              }
                            }}
                          >
                            {sellerRoles.map((role) => (
                              <option value={role} key={role}>
                                {sellerRoleLabels[role]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Farm or business name
                          <input
                            required
                            maxLength={100}
                            value={sellerApplicationForm.businessName}
                            onChange={(event) =>
                              setSellerApplicationForm({
                                ...sellerApplicationForm,
                                businessName: event.target.value,
                              })
                            }
                            placeholder="Your farm, cooperative, or store"
                          />
                        </label>
                        <label>
                          Contact phone
                          <input
                            required
                            maxLength={30}
                            value={sellerApplicationForm.phone}
                            onChange={(event) =>
                              setSellerApplicationForm({
                                ...sellerApplicationForm,
                                phone: event.target.value,
                              })
                            }
                            placeholder="A number buyers can reach"
                          />
                        </label>
                        <label>
                          Farm or business location
                          <textarea
                            required
                            maxLength={500}
                            rows={3}
                            value={sellerApplicationForm.meetupLocation}
                            onChange={(event) =>
                              setSellerApplicationForm({
                                ...sellerApplicationForm,
                                meetupLocation: event.target.value,
                              })
                            }
                            placeholder="Barangay, city, and province"
                          />
                        </label>
                        <label className="seller-application-wide">
                          What agricultural products do you plan to sell?
                          <textarea
                            required
                            maxLength={1000}
                            rows={4}
                            value={sellerApplicationForm.businessDescription}
                            onChange={(event) =>
                              setSellerApplicationForm({
                                ...sellerApplicationForm,
                                businessDescription: event.target.value,
                              })
                            }
                            placeholder="Describe your products, production, or supply business"
                          />
                        </label>
                      </div>
                      <div className="seller-application-submit">
                        <p>
                          Submitted as <strong>{profile.fullName}</strong>
                          {profile.email && <> ({profile.email})</>}.
                        </p>
                        <IonButton type="submit" disabled={submittingSellerApplication}>
                          {submittingSellerApplication
                            ? 'Submitting request...'
                            : sellerApplication?.status === 'rejected'
                              ? 'Resubmit request'
                              : 'Send seller request'}
                        </IonButton>
                      </div>
                    </form>
                  )}
                </section>
              ) : (
              <section className="seller-workspace">
                <nav className="seller-view-tabs" aria-label="Seller product sections">
                  <button
                    type="button"
                    className={sellerView === 'listings' ? 'active' : ''}
                    aria-pressed={sellerView === 'listings'}
                    onClick={() => {
                      setError('');
                      setSellerView('listings');
                      navigate('/seller-dashboard?view=listings', { replace: true });
                    }}
                  >
                    <IonIcon icon={storefrontOutline} />
                    My listings
                    <span>{products.length}</span>
                  </button>
                  <button
                    type="button"
                    className={sellerView === 'details' ? 'active' : ''}
                    aria-pressed={sellerView === 'details'}
                    onClick={() => {
                      setError('');
                      setSellerView('details');
                      navigate('/seller-dashboard?view=details', { replace: true });
                    }}
                  >
                    <IonIcon icon={cubeOutline} />
                    Product details
                  </button>
                </nav>

                {sellerView === 'listings' ? (
                  <section className="seller-listings-panel">
                    <div className="seller-listings-heading">
                      <div>
                        <span className="market-eyebrow">YOUR STORE</span>
                        <h2>Manage your products</h2>
                        <p>Review stock, update product details, or remove a listing.</p>
                      </div>
                    </div>

                    <div className="seller-summary-grid">
                      <article>
                        <span>All listings</span>
                        <strong>{products.length}</strong>
                      </article>
                      <article>
                        <span>Active listings</span>
                        <strong>{activeListingCount}</strong>
                      </article>
                      <article>
                        <span>Total units in stock</span>
                        <strong>{totalProductStock.toLocaleString()}</strong>
                      </article>
                    </div>

                    {products.length > 0 && (
                      <label className="seller-listing-search">
                        <span className="sr-only">Search your listings</span>
                        <IonIcon icon={storefrontOutline} aria-hidden="true" />
                        <input
                          type="search"
                          value={listingSearch}
                          onChange={(event) => setListingSearch(event.target.value)}
                          placeholder="Search your products..."
                        />
                      </label>
                    )}

                    {sellerProducts.length ? (
                      <div className="seller-listing-grid">
                        {sellerProducts.map((product) => (
                          <article className="seller-listing-card" key={product.id}>
                            <div className="seller-listing-image">
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.name} loading="lazy" />
                              ) : (
                                <IonIcon icon={cubeOutline} aria-hidden="true" />
                              )}
                              <span className={`seller-listing-status ${product.status === 'active' ? 'active' : 'removed'}`}>
                                {product.status === 'active' ? 'Active' : 'Removed by admin'}
                              </span>
                            </div>
                            <div className="seller-listing-content">
                              <div className="seller-listing-title">
                                <div>
                                  <span>{product.category}</span>
                                  <h3>{product.name}</h3>
                                </div>
                                <strong>₱{product.price.toLocaleString()}</strong>
                              </div>
                              <p className="seller-listing-description">
                                {product.description || 'No description provided.'}
                              </p>
                              <div className="seller-listing-meta">
                                <span><strong>{product.stock.toLocaleString()}</strong> in stock</span>
                                <span>Listed {formatDate(product.createdAt)}</span>
                              </div>
                              <div className="seller-listing-actions">
                                <IonButton
                                  fill="outline"
                                  disabled={product.status !== 'active'}
                                  onClick={() => startEditingProduct(product)}
                                >
                                  <IonIcon icon={createOutline} slot="start" />
                                  Edit details
                                </IonButton>
                                <button
                                  type="button"
                                  className="seller-delete-button"
                                  disabled={saving}
                                  onClick={() => void deleteProduct(product)}
                                >
                                  <IonIcon icon={trashOutline} />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : products.length ? (
                      <div className="seller-empty-state">
                        <IonIcon icon={storefrontOutline} />
                        <h3>No matching products</h3>
                        <p>Try a different product name or category.</p>
                      </div>
                    ) : (
                      <div className="seller-empty-state">
                        <IonIcon icon={cubeOutline} />
                        <h3>Your store is ready for its first listing</h3>
                        <p>Add product details and a photo to start reaching buyers.</p>
                      </div>
                    )}
                  </section>
                ) : (
                  <form className="market-form-card seller-details-panel" onSubmit={(event) => void saveProduct(event)}>
                    <div className="seller-details-heading">
                      <div>
                        <span className="market-eyebrow">
                          {editingProductId ? 'UPDATE YOUR STORE' : 'NEW LISTING'}
                        </span>
                        <h2>{editingProductId ? 'Edit product details' : 'Add product details'}</h2>
                        <p>
                          {editingProductId
                            ? 'Keep your listing accurate so buyers know what to expect.'
                            : 'Share clear information to help buyers find the right product.'}
                        </p>
                      </div>
                      <button
                        className="seller-back-button"
                        type="button"
                        onClick={() => {
                          setError('');
                          setSellerView('listings');
                          navigate('/seller-dashboard?view=listings', { replace: true });
                        }}
                      >
                        Back to listings
                      </button>
                    </div>
                  <label>
                    Product name
                    <input
                      required
                      maxLength={100}
                      value={productForm.name}
                      onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
                      placeholder="e.g. Hybrid corn seeds"
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      maxLength={1000}
                      rows={4}
                      value={productForm.description}
                      onChange={(event) => setProductForm({ ...productForm, description: event.target.value })}
                      placeholder="Describe the product and its condition"
                    />
                  </label>
                  <label>
                    Municipality in Oriental Mindoro
                    <select
                      required
                      value={productForm.municipality}
                      disabled={municipalitiesLoading || !!municipalitiesError}
                      onChange={(event) =>
                        setProductForm({
                          ...productForm,
                          municipality: event.target.value,
                          barangay: '',
                        })
                      }
                    >
                      <option value="" disabled>
                        {municipalitiesLoading
                          ? 'Loading municipalities...'
                          : 'Select a municipality'}
                      </option>
                      {municipalities.map((municipality) => (
                        <option value={municipality.name} key={municipality.code}>
                          {municipality.name}
                        </option>
                      ))}
                    </select>
                    {municipalitiesError && (
                      <span className="market-location-error" role="alert">
                        {municipalitiesError}
                        <button
                          type="button"
                          onClick={() => setMunicipalityRetry((retry) => retry + 1)}
                        >
                          Try again
                        </button>
                      </span>
                    )}
                  </label>
                  <label>
                    Barangay
                    <select
                      required
                      value={productForm.barangay}
                      disabled={
                        !selectedMunicipalityCode ||
                        barangaysLoading ||
                        !!barangaysError
                      }
                      onChange={(event) =>
                        setProductForm({
                          ...productForm,
                          barangay: event.target.value,
                        })
                      }
                    >
                      <option value="" disabled>
                        {!selectedMunicipalityCode
                          ? 'Select a municipality first'
                          : barangaysLoading
                            ? 'Loading barangays...'
                            : 'Select a barangay'}
                      </option>
                      {barangays
                        .filter(
                          (barangay) =>
                            barangay.municipalityCode ===
                            selectedMunicipalityCode,
                        )
                        .map((barangay) => (
                          <option value={barangay.name} key={barangay.code}>
                            {barangay.name}
                          </option>
                        ))}
                    </select>
                    {barangaysError && (
                      <span className="market-location-error" role="alert">
                        {barangaysError}
                        <button
                          type="button"
                          onClick={() => setBarangayRetry((retry) => retry + 1)}
                        >
                          Try again
                        </button>
                      </span>
                    )}
                  </label>
                  <label>
                    Street address / landmark
                    <textarea
                      maxLength={500}
                      rows={3}
                      value={productForm.meetupLocation}
                      onChange={(event) =>
                        setProductForm({
                          ...productForm,
                          meetupLocation: event.target.value,
                        })
                      }
                      placeholder="Optional details, such as barangay, street, or landmark"
                    />
                  </label>
                  <label>
                    Product image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const selectedFile = event.target.files?.[0];
                        if (!selectedFile) return;
                        if (!allowedProductImageTypes.includes(selectedFile.type)) {
                          setError('Choose a JPG, PNG, or WebP image.');
                          event.target.value = '';
                          return;
                        }
                        if (selectedFile.size > MAX_PRODUCT_IMAGE_SIZE) {
                          setError('Product images must be 5 MB or smaller.');
                          event.target.value = '';
                          return;
                        }
                        setError('');
                        setProductImage(selectedFile);
                        setImagePreviewUrl(URL.createObjectURL(selectedFile));
                      }}
                    />
                    <span className="market-file-hint">
                      JPG, PNG, or WebP. Maximum file size: 5 MB.
                    </span>
                  </label>
                  {(imagePreviewUrl || existingImage.url) && (
                    <div className="market-image-preview">
                      <img
                        src={imagePreviewUrl || existingImage.url}
                        alt="Product preview"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setProductImage(null);
                          setImagePreviewUrl('');
                          setExistingImage({ url: '', path: '' });
                        }}
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                  <label>
                    Category
                    <input
                      list="market-category-options"
                      required
                      maxLength={60}
                      value={productForm.category}
                      onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}
                      placeholder="Seeds, tools, equipment..."
                    />
                    <datalist id="market-category-options">
                      {categories.map((category) => <option value={category} key={category} />)}
                    </datalist>
                  </label>
                  <div className="market-form-row">
                    <label>
                      Price (₱)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={productForm.price}
                        onChange={(event) => setProductForm({ ...productForm, price: event.target.value })}
                      />
                    </label>
                    <label>
                      Available stock
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={productForm.stock}
                        onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="market-form-actions">
                    {editingProductId && (
                      <IonButton
                        type="button"
                        fill="outline"
                        onClick={() => {
                          setEditingProductId('');
                          setProductForm(emptyProductForm);
                          setProductImage(null);
                          setImagePreviewUrl('');
                          setExistingImage({ url: '', path: '' });
                        }}
                      >
                        Cancel edit
                      </IonButton>
                    )}
                    <IonButton type="submit" disabled={saving}>
                      {saving
                        ? savingStage === 'Uploading product image...'
                          ? `Uploading image ${uploadProgress}%`
                          : savingStage
                        : editingProductId
                          ? 'Save changes'
                          : 'Post product'}
                    </IonButton>
                  </div>
                  {saving && savingStage === 'Uploading product image...' && (
                    <progress
                      className="market-upload-progress"
                      max="100"
                      value={uploadProgress}
                      aria-label="Product image upload progress"
                    />
                  )}
                  </form>
                )}
              </section>
              )
            )}

            {(page === 'my-orders' || page === 'received-orders') && (
              <section className="market-orders">
                {filteredOrders.length ? (
                  filteredOrders.map((order) => {
                    const received = page === 'received-orders';
                    const orderLocationPosition =
                      order.locationLatitude !== undefined &&
                      order.locationLongitude !== undefined
                        ? ([
                            order.locationLatitude,
                            order.locationLongitude,
                          ] as [number, number])
                        : null;
                    const productImageUrl =
                      order.productImageUrl || resolvedOrderImages[order.id];
                    const showProductImage =
                      productImageUrl && !failedOrderImages[order.id];
                    return (
                      <article className="market-order-card" key={order.id}>
                        <div className="market-order-top">
                        {showProductImage ? (
                          <img
                            className="market-order-product-image"
                            src={productImageUrl}
                            alt={order.productName}
                            loading="lazy"
                            onError={() =>
                              setFailedOrderImages((current) => ({
                                ...current,
                                [order.id]: true,
                              }))
                            }
                          />
                        ) : (
                          <div
                            className="market-order-product-image market-order-product-image-empty"
                            aria-hidden="true"
                          >
                            <IonIcon icon={cubeOutline} />
                          </div>
                        )}
                        <div className="market-order-product-heading">
                          <span className="market-eyebrow">
                            {received ? 'BUYER ORDER' : 'ORDER'}
                          </span>
                            <h2>{order.productName}</h2>
                          </div>
                          <span className={`market-order-status ${order.status}`}>
                            {getOrderStatusLabel(order.status)}
                          </span>
                        </div>
                        <div className="market-order-details">
                          <p><strong>{received ? 'Buyer' : 'Seller'}</strong><span>{received ? order.buyerName : order.sellerName}</span></p>
                          {received && (
                            <>
                              <p><strong>Contact number</strong><span>{order.contactNumber || 'Not provided'}</span></p>
                              <p><strong>Delivery method</strong><span>
                                {order.deliveryMethod === 'pickup'
                                  ? 'Pick up from seller'
                                  : order.deliveryMethod === 'meetup'
                                    ? 'Meet up at another location'
                                    : order.deliveryMethod === 'meetup_pickup'
                                      ? 'Meet-up / Pickup'
                                      : 'Delivery'}
                              </span></p>
                              <p className="market-order-wide"><strong>Seller address</strong><span>{order.sellerMeetupLocation || 'Not provided'}</span></p>
                              {order.sellerMeetupLocation && (
                                <OrderAddressMap
                                  address={order.sellerMeetupLocation}
                                  label="Show pickup location map"
                                />
                              )}
                              {order.deliveryMethod === 'meetup' &&
                                order.buyerMeetupLocation && (
                                <p className="market-order-wide"><strong>Buyer preferred meet-up location</strong><span>{order.buyerMeetupLocation}</span></p>
                              )}
                              {order.orderNotes && (
                                <p className="market-order-wide"><strong>Order notes</strong><span>{order.orderNotes}</span></p>
                              )}
                            </>
                          )}
                          {!received && (
                            <>
                              <p><strong>Delivery method</strong><span>
                                {order.deliveryMethod === 'pickup'
                                  ? 'Pick up from seller'
                                  : order.deliveryMethod === 'meetup'
                                    ? 'Meet up at another location'
                                    : order.deliveryMethod === 'meetup_pickup'
                                      ? 'Meet-up / Pickup'
                                      : 'Delivery'}
                              </span></p>
                              <p className="market-order-wide"><strong>Seller address</strong><span>{order.sellerMeetupLocation || 'Not provided'}</span></p>
                              {order.sellerMeetupLocation && (
                                <OrderAddressMap
                                  address={order.sellerMeetupLocation}
                                  label="Show pickup location map"
                                />
                              )}
                              {order.deliveryMethod === 'meetup' &&
                                order.buyerMeetupLocation && (
                                <p className="market-order-wide"><strong>Your preferred meet-up location</strong><span>{order.buyerMeetupLocation}</span></p>
                              )}
                            </>
                          )}
                          <p><strong>Quantity</strong><span>{order.quantity}</span></p>
                          <p><strong>Unit price</strong><span>₱{order.unitPrice.toLocaleString()}</span></p>
                          <p><strong>Total</strong><span>₱{order.total.toLocaleString()}</span></p>
                          <p><strong>Placed</strong><span>{formatDate(order.createdAt)}</span></p>
                        </div>
                        {order.deliveryMethod === 'meetup' &&
                          orderLocationPosition && (
                            <div className="market-order-location-map">
                              <strong>
                                {received
                                  ? 'Customer meet-up point'
                                  : 'Your meet-up point'}
                              </strong>
                              <MeetupLocationMap
                                label={`Meet-up location for ${order.productName}`}
                                position={orderLocationPosition}
                              />
                            </div>
                          )}
                        <div
                          className={`market-order-tracking ${order.status}`}
                          aria-label={`Order tracking status: ${getOrderStatusLabel(order.status)}`}
                        >
                          {order.status === 'cancelled' ? (
                            <p className="market-tracking-cancelled">
                              This order was cancelled.
                            </p>
                          ) : (
                            <ol>
                              {(['pending', 'ready_for_pickup', 'picked_up'] as const).map(
                                (step, index) => {
                                  const currentStep =
                                    order.status === 'pending'
                                      ? 0
                                      : order.status === 'ready_for_pickup' ||
                                          order.status === 'confirmed'
                                        ? 1
                                        : 2;
                                  return (
                                    <li
                                      className={index <= currentStep ? 'complete' : ''}
                                      key={step}
                                    >
                                      <span>{index + 1}</span>
                                      <strong>
                                        {step === 'pending'
                                          ? 'On process'
                                          : step === 'ready_for_pickup'
                                            ? 'Ready for pickup'
                                            : 'Picked up (delivered)'}
                                      </strong>
                                    </li>
                                  );
                                },
                              )}
                            </ol>
                          )}
                        </div>
                        {received && <div className="market-order-actions">
                          {received && order.status === 'pending' && (
                            <>
                              <IonButton fill="outline" disabled={saving} onClick={() => void updateOrderStatus(order, 'cancelled')}>
                                Decline
                              </IonButton>
                              <IonButton disabled={saving} onClick={() => void updateOrderStatus(order, 'ready_for_pickup')}>
                                Mark ready for pickup
                              </IonButton>
                            </>
                          )}
                          {received && order.status === 'confirmed' && (
                            <IonButton disabled={saving} onClick={() => void updateOrderStatus(order, 'ready_for_pickup')}>
                              Mark ready for pickup
                            </IonButton>
                          )}
                          {received && order.status === 'ready_for_pickup' && (
                            <IonButton disabled={saving} onClick={() => void updateOrderStatus(order, 'picked_up')}>
                              Picked up (delivered)
                            </IonButton>
                          )}
                        </div>}
                        {!received &&
                          (order.status === 'pending' ||
                            order.status === 'confirmed' ||
                            order.status === 'ready_for_pickup') && (
                            <div className="market-order-actions">
                              <IonButton
                                className="market-cancel-order"
                                fill="outline"
                                color="danger"
                                disabled={saving}
                                onClick={() =>
                                  void updateOrderStatus(order, 'cancelled')
                                }
                              >
                                Cancel order
                              </IonButton>
                            </div>
                          )}
                      </article>
                    );
                  })
                ) : (
                  <div className="market-empty">
                    <IonIcon icon={cartOutline} />
                    <h2>No {page === 'my-orders' ? 'orders to track' : 'orders received'} yet</h2>
                    <p>
                      {page === 'my-orders'
                        ? 'After you place an order, its latest status will appear here.'
                        : 'Orders placed for your listings will appear here.'}
                    </p>
                    {page === 'my-orders' && (
                      <IonButton onClick={() => navigate('/marketplace')}>Browse marketplace</IonButton>
                    )}
                  </div>
                )}
              </section>
            )}

            {page === 'about' && (
              <section className="market-about-card">
                <span className="market-about-icon"><IonIcon icon={leafOutline} /></span>
                <h2>Connecting agricultural buyers and sellers</h2>
                <p>
                  Agri-Mart is a web-based buy-and-sell system designed to
                  connect buyers and sellers of agricultural tools, equipment,
                  seeds, and other farm supplies. It provides a convenient
                  platform for users to browse, purchase, and sell agricultural
                  resources online.
                </p>
                <div className="market-about-points">
                  <div><strong>Discover</strong><span>Browse listings from the Agri-Mart community.</span></div>
                  <div><strong>Sell</strong><span>Post and manage your own farm supplies.</span></div>
                  <div><strong>Order</strong><span>Track purchases and manage orders from buyers.</span></div>
                </div>
              </section>
            )}

            {page === 'account' && (
              <div className="account-page">
                <section className="account-overview">
                  <div className="account-avatar" aria-hidden="true">
                    {(accountName.trim() || profile.email || 'A')
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part.charAt(0).toUpperCase())
                      .join('')}
                  </div>
                  <div className="account-overview-main">
                    <span className="market-eyebrow">YOUR AGRI-MART PROFILE</span>
                    <h2>{accountName.trim() || 'Welcome to Agri-Mart'}</h2>
                    <p>{profile.email || 'Email not available'}</p>
                    <div className="account-badges">
                      <span className="account-role-badge">{accountRoleLabel}</span>
                      <span className="account-verified-badge">
                        <IonIcon icon={checkmarkCircleOutline} />
                        Email verified
                      </span>
                    </div>
                  </div>
                  <div className="account-completion">
                    <div>
                      <span>Profile completion</span>
                      <strong>{Math.round((accountCompletion / 3) * 100)}%</strong>
                    </div>
                    <progress value={accountCompletion} max="3" aria-label="Profile completion" />
                    <small>
                      {accountCompletion === 3
                        ? 'Your contact details are up to date.'
                        : 'Add your name and contact number to complete your profile.'}
                    </small>
                  </div>
                </section>

                <div className="market-account-grid">
                  <form
                    className="market-form-card account-form-card"
                    onSubmit={(event) => void saveAccount(event)}
                  >
                    <div className="account-card-heading">
                      <span className="account-card-icon"><IonIcon icon={personCircleOutline} /></span>
                      <div>
                        <span className="market-eyebrow">PERSONAL DETAILS</span>
                        <h2>Profile information</h2>
                        <p>Update how you’re identified on Agri-Mart.</p>
                      </div>
                    </div>
                    <label>
                      Full name
                      <input
                        required
                        maxLength={100}
                        autoComplete="name"
                        value={accountName}
                        onChange={(event) => setAccountName(event.target.value)}
                        placeholder="Enter your full name"
                      />
                    </label>
                    <label>
                      Sign-in email
                      <input value={profile.email} readOnly autoComplete="email" />
                      <span className="account-field-hint">
                        Your email is managed by your sign-in provider.
                      </span>
                    </label>
                    <label>
                      Phone number
                      <input
                        type="tel"
                        maxLength={30}
                        autoComplete="tel"
                        value={accountPhone}
                        onChange={(event) => setAccountPhone(event.target.value)}
                        placeholder="Add a number buyers or support can reach"
                      />
                    </label>
                    <div className="account-readonly-row">
                      <span>Account type</span>
                      <strong>{accountRoleLabel}</strong>
                    </div>
                    <div className="account-form-footer">
                      <span>{profileHasChanges ? 'You have unsaved changes.' : 'Your profile is up to date.'}</span>
                      <IonButton type="submit" disabled={saving || !profileHasChanges}>
                        {saving ? 'Saving...' : 'Save changes'}
                      </IonButton>
                    </div>
                  </form>

                  <form
                    className="market-form-card account-form-card"
                    onSubmit={(event) => void changePassword(event)}
                  >
                    <div className="account-card-heading">
                      <span className="account-card-icon"><IonIcon icon={lockClosedOutline} /></span>
                      <div>
                        <span className="market-eyebrow">ACCOUNT SECURITY</span>
                        <h2>Change password</h2>
                        <p>Choose a password that’s difficult to guess.</p>
                      </div>
                    </div>
                    <label>
                      New password
                      <span className="account-password-field">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          minLength={6}
                          autoComplete="new-password"
                          required
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          placeholder="At least 6 characters"
                        />
                        <button
                          type="button"
                          aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                          onClick={() => setShowNewPassword((visible) => !visible)}
                        >
                          <IonIcon icon={showNewPassword ? eyeOffOutline : eyeOutline} />
                        </button>
                      </span>
                    </label>
                    {newPassword.length > 0 && (
                      <div className={`account-password-strength level-${passwordStrength}`}>
                        <div>
                          <span>Password strength</span>
                          <strong>
                            {passwordStrength === 1
                              ? 'Too short'
                              : passwordStrength === 2
                                ? 'Fair'
                                : 'Strong'}
                          </strong>
                        </div>
                        <progress value={passwordStrength} max="3" aria-label="Password strength" />
                        {passwordStrength < 3 && (
                          <small>Use 10 or more characters, including an uppercase letter and a number.</small>
                        )}
                      </div>
                    )}
                    <label>
                      Confirm new password
                      <span className="account-password-field">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          minLength={6}
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Enter the new password again"
                        />
                        <button
                          type="button"
                          aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                          onClick={() => setShowConfirmPassword((visible) => !visible)}
                        >
                          <IonIcon icon={showConfirmPassword ? eyeOffOutline : eyeOutline} />
                        </button>
                      </span>
                      {confirmPassword && (
                        <span className={`account-match-hint ${confirmPassword === newPassword ? 'match' : ''}`}>
                          {confirmPassword === newPassword ? 'Passwords match.' : 'Passwords do not match.'}
                        </span>
                      )}
                    </label>
                    <div className="account-security-note">
                      <IonIcon icon={lockClosedOutline} />
                      <span>
                        For your protection, Firebase may require you to sign in
                        again before updating your password.
                      </span>
                    </div>
                    <div className="account-form-footer">
                      <span>Password must contain at least 6 characters.</span>
                      <IonButton
                        type="submit"
                        disabled={saving || newPassword.length < 6 || newPassword !== confirmPassword}
                      >
                        Update password
                      </IonButton>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </main>
        </div>
        {checkoutProduct && (
          <div className="market-checkout-backdrop">
            <form
              className="market-checkout-modal"
              onSubmit={(event) => void placeOrder(event)}
              aria-labelledby="market-checkout-title"
            >
              <div className="market-checkout-heading">
                <div>
                  <span className="market-eyebrow">ORDER DETAILS</span>
                  <h2 id="market-checkout-title">Complete your order</h2>
                  <p>{checkoutProduct.name} · Quantity {quantities[checkoutProduct.id] ?? '1'}</p>
                </div>
                <strong>₱{(checkoutProduct.price * Number(quantities[checkoutProduct.id] ?? '1')).toLocaleString()}</strong>
              </div>
              {error && (
                <p className="market-message error" role="alert">
                  {error}
                </p>
              )}
              <label>
                Full Name
                <input value={profile.fullName} readOnly required />
              </label>
              <label>
                Contact Number
                <input
                  type="tel"
                  required
                  maxLength={30}
                  autoComplete="tel"
                  value={checkoutDetails.contactNumber}
                  onChange={(event) =>
                    setCheckoutDetails({
                      ...checkoutDetails,
                      contactNumber: event.target.value,
                    })
                  }
                  placeholder="Mobile number the seller can call"
                />
              </label>
              <fieldset className="market-fulfillment-options">
                <legend>Choose how you’ll receive your order</legend>
                <label className={checkoutDetails.deliveryMethod === 'pickup' ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="pickup"
                    checked={checkoutDetails.deliveryMethod === 'pickup'}
                    onChange={() =>
                      setCheckoutDetails({
                        ...checkoutDetails,
                        deliveryMethod: 'pickup',
                        buyerMeetupLocation: '',
                      })
                    }
                  />
                  <span>
                    <strong>Pick up from seller</strong>
                    <small>Collect your order at the seller’s listed address.</small>
                  </span>
                </label>
                <label className={checkoutDetails.deliveryMethod === 'meetup' ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="meetup"
                    checked={checkoutDetails.deliveryMethod === 'meetup'}
                    onChange={() =>
                      setCheckoutDetails({
                        ...checkoutDetails,
                        deliveryMethod: 'meetup',
                      })
                    }
                  />
                  <span>
                    <strong>Meet up</strong>
                    <small>Suggest a public location to meet the seller.</small>
                  </span>
                </label>
              </fieldset>
              {sellerAddressLocation.municipality &&
              sellerAddressBarangay.barangay ? (
                <>
                  <label>
                    Seller pickup municipality
                    <select value={sellerAddressLocation.municipality} disabled>
                      <option value={sellerAddressLocation.municipality}>
                        {sellerAddressLocation.municipality}, Oriental Mindoro
                      </option>
                    </select>
                  </label>
                  <label>
                    Seller pickup barangay
                    <select value={sellerAddressBarangay.barangay} disabled>
                      <option value={sellerAddressBarangay.barangay}>
                        {sellerAddressBarangay.barangay}
                      </option>
                    </select>
                  </label>
                  {sellerAddressBarangaysError && (
                    <span className="market-location-error" role="status">
                      {sellerAddressBarangaysError}
                      <button
                        type="button"
                        onClick={() =>
                          setSellerAddressBarangayRetry((retry) => retry + 1)
                        }
                      >
                        Try again
                      </button>
                    </span>
                  )}
                  {sellerAddressBarangaysLoading && (
                    <span className="market-file-hint">
                      Verifying seller pickup location...
                    </span>
                  )}
                </>
              ) : (
                <>
                  <label>
                    Seller pickup address
                    <input
                      value={checkoutProduct.sellerMeetupLocation}
                      readOnly
                      required
                    />
                  </label>
                  {sellerAddressBarangaysError && (
                    <span className="market-location-error" role="status">
                      {sellerAddressBarangaysError}
                      <button
                        type="button"
                        onClick={() =>
                          setSellerAddressBarangayRetry((retry) => retry + 1)
                        }
                      >
                        Try again
                      </button>
                    </span>
                  )}
                </>
              )}
              {checkoutDetails.deliveryMethod === 'meetup' && (
                <>
                  <label>
                    Meet-up municipality
                    <select
                      required
                      value={checkoutDetails.meetupMunicipality}
                      disabled={municipalitiesLoading || !!municipalitiesError}
                      onChange={(event) =>
                        setCheckoutDetails({
                          ...checkoutDetails,
                          meetupMunicipality: event.target.value,
                          meetupBarangay: '',
                          meetupPosition: null,
                        })
                      }
                    >
                      <option value="" disabled>
                        {municipalitiesLoading
                          ? 'Loading municipalities...'
                          : 'Select a municipality'}
                      </option>
                      {municipalities.map((municipality) => (
                        <option value={municipality.name} key={municipality.code}>
                          {municipality.name}
                        </option>
                      ))}
                    </select>
                    {municipalitiesError && (
                      <span className="market-location-error" role="alert">
                        {municipalitiesError}
                        <button
                          type="button"
                          onClick={() =>
                            setMunicipalityRetry((retry) => retry + 1)
                          }
                        >
                          Try again
                        </button>
                      </span>
                    )}
                  </label>
                  <label>
                    Meet-up barangay
                    <select
                      required
                      value={checkoutDetails.meetupBarangay}
                      disabled={
                        !checkoutMunicipalityCode ||
                        checkoutBarangaysLoading ||
                        !!checkoutBarangaysError
                      }
                      onChange={(event) =>
                        setCheckoutDetails({
                          ...checkoutDetails,
                          meetupBarangay: event.target.value,
                          meetupPosition: null,
                        })
                      }
                    >
                      <option value="" disabled>
                        {!checkoutMunicipalityCode
                          ? 'Select a municipality first'
                          : checkoutBarangaysLoading
                            ? 'Loading barangays...'
                            : 'Select a barangay'}
                      </option>
                      {checkoutBarangays
                        .filter(
                          (barangay) =>
                            barangay.municipalityCode ===
                            checkoutMunicipalityCode,
                        )
                        .map((barangay) => (
                        <option value={barangay.name} key={barangay.code}>
                          {barangay.name}
                        </option>
                        ))}
                    </select>
                    {checkoutBarangaysError && (
                      <span className="market-location-error" role="alert">
                        {checkoutBarangaysError}
                        <button
                          type="button"
                          onClick={() =>
                            setCheckoutBarangayRetry((retry) => retry + 1)
                          }
                        >
                          Try again
                        </button>
                      </span>
                    )}
                  </label>
                  <label>
                    Street address / landmark{' '}
                    <span className="market-checkout-optional">(optional)</span>
                    <textarea
                      maxLength={500}
                      value={checkoutDetails.meetupAddress}
                      onChange={(event) => {
                        setMeetupLookupError('');
                        setCheckoutDetails((current) => ({
                          ...current,
                          meetupAddress: event.target.value,
                          meetupPosition: null,
                        }));
                      }}
                      placeholder="Add a public landmark or meeting point"
                    />
                  </label>
                  <IonButton
                    className="market-meetup-map-search"
                    type="button"
                    fill="outline"
                    disabled={
                      meetupLookupLoading ||
                      !checkoutDetails.meetupMunicipality ||
                      !checkoutDetails.meetupBarangay
                    }
                    onClick={() => void findCheckoutMeetupLocation()}
                  >
                    {meetupLookupLoading ? 'Searching map...' : 'Find address on map'}
                  </IonButton>
                  {meetupLookupError && (
                    <span className="market-location-error" role="alert">
                      {meetupLookupError}
                    </span>
                  )}
                  <MeetupLocationMap
                    interactive
                    label="Choose the meet-up point on the map"
                    position={checkoutDetails.meetupPosition}
                    onPositionChange={(meetupPosition) => {
                      setMeetupLookupError('');
                      setCheckoutDetails((current) => ({
                        ...current,
                        meetupPosition,
                      }));
                    }}
                  />
                </>
              )}
              <label>
                Order Notes <span className="market-checkout-optional">(optional)</span>
                <textarea
                  maxLength={500}
                  value={checkoutDetails.orderNotes}
                  onChange={(event) =>
                    setCheckoutDetails({
                      ...checkoutDetails,
                      orderNotes: event.target.value,
                    })
                  }
                  placeholder="Additional instructions for the seller"
                />
              </label>
              <div className="market-checkout-actions">
                <IonButton
                  type="button"
                  fill="outline"
                  disabled={saving}
                  onClick={() => setCheckoutProduct(null)}
                >
                  Cancel
                </IonButton>
                <IonButton type="submit" disabled={saving}>
                  {saving ? 'Placing order...' : 'Place order'}
                </IonButton>
              </div>
            </form>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default MarketplacePage;
