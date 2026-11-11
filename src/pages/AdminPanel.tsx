import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonPage,
  IonSpinner,
} from '@ionic/react';
import {
  addOutline,
  cubeOutline,
  createOutline,
  gridOutline,
  logOutOutline,
  menuOutline,
  peopleOutline,
  personAddOutline,
  personCircleOutline,
  pricetagOutline,
  receiptOutline,
  searchOutline,
  settingsOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  onAuthStateChanged,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import './AdminPanel.css';

type AdminPage =
  | 'overview'
  | 'users'
  | 'seller-applications'
  | 'products'
  | 'orders'
  | 'categories'
  | 'settings';
type UserStatus = 'active' | 'deactivated';

interface ManagedUser {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  status: UserStatus;
}

interface ManagedProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  imageUrl: string;
  status: string;
  createdAt?: Timestamp;
}

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'completed'
  | 'cancelled';

interface ManagedOrder {
  id: string;
  buyerName: string;
  buyerEmail: string;
  contactNumber: string;
  buyerMeetupLocation: string;
  deliveryMethod: string;
  orderNotes: string;
  sellerId: string;
  sellerName: string;
  productId: string;
  productName: string;
  quantity: number;
  total: number;
  status: OrderStatus;
  createdAt?: Timestamp;
}

interface ManagedCategory {
  id: string;
  name: string;
  productCount: number;
}

interface AdminProfile {
  fullName: string;
  phone: string;
}

type SellerRole = 'farmer' | 'distributor' | 'retailer';
type SellerApplicationStatus = 'pending' | 'approved' | 'rejected';

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
  createdAt?: Timestamp;
}

const sellerRoleLabels: Record<SellerRole, string> = {
  farmer: 'Farmer / Producer',
  distributor: 'Distributor',
  retailer: 'Retailer / Reseller',
};

const orderStatusLabels: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  ready_for_pickup: 'Ready for pickup',
  picked_up: 'Picked up',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'ready_for_pickup', 'cancelled'],
  confirmed: ['ready_for_pickup', 'completed', 'cancelled'],
  ready_for_pickup: ['picked_up', 'cancelled'],
  picked_up: ['completed'],
  completed: [],
  cancelled: [],
};

const pageDetails: Record<AdminPage, { title: string; description: string }> = {
  overview: {
    title: 'Dashboard',
    description: 'Overall statistics and activity in Agri-Mart.',
  },
  users: {
    title: 'User Management',
    description: 'Search, edit, and manage registered accounts.',
  },
  'seller-applications': {
    title: 'Seller Requests',
    description: 'Review applications from users requesting permission to sell.',
  },
  products: {
    title: 'Product Management',
    description: 'Review marketplace listings and moderate inappropriate posts.',
  },
  orders: {
    title: 'Order Management',
    description: 'Review buyer orders and order details.',
  },
  categories: {
    title: 'Category Management',
    description: 'Manage the categories used to organize products.',
  },
  settings: {
    title: 'Admin Profile / Settings',
    description: 'Update your admin profile and password.',
  },
};

const navigation: {
  page: AdminPage;
  label: string;
  icon: string;
}[] = [
  { page: 'overview', label: 'Dashboard', icon: gridOutline },
  { page: 'users', label: 'User Management', icon: peopleOutline },
  { page: 'seller-applications', label: 'Seller Requests', icon: personAddOutline },
  { page: 'products', label: 'Product Management', icon: cubeOutline },
  { page: 'orders', label: 'Order Management', icon: receiptOutline },
  { page: 'categories', label: 'Category Management', icon: pricetagOutline },
  { page: 'settings', label: 'Admin Profile / Settings', icon: settingsOutline },
];

const AdminPanel: React.FC<{ page: AdminPage }> = ({ page }) => {
  const navigate = useNavigate();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [sellerApplications, setSellerApplications] = useState<SellerApplication[]>([]);
  const [reviewingSellerApplicationId, setReviewingSellerApplicationId] = useState('');
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [orders, setOrders] = useState<ManagedOrder[]>([]);
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [search, setSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderStatusDrafts, setOrderStatusDrafts] = useState<Record<string, OrderStatus | ''>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<ManagedCategory | null>(null);
  const [savingOrderId, setSavingOrderId] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editingProduct, setEditingProduct] = useState<ManagedProduct | null>(null);
  const [profile, setProfile] = useState<AdminProfile>({
    fullName: '',
    phone: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const loadedUsers = snapshot.docs.map((userDoc) => {
        const data = userDoc.data();
        return {
          uid: userDoc.id,
          fullName: typeof data.fullName === 'string' ? data.fullName : '',
          email: typeof data.email === 'string' ? data.email : '',
          phone: typeof data.phone === 'string' ? data.phone : '',
          role: typeof data.role === 'string' ? data.role : 'user',
          status: data.status === 'deactivated' ? 'deactivated' : 'active',
        } satisfies ManagedUser;
      });

      setUsers(loadedUsers);
      setUserCount(loadedUsers.length);
    } catch (loadError) {
      console.error('Unable to load registered users:', loadError);
      setError(
        'Could not load users. Publish the updated Firestore rules and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSellerApplications = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const snapshot = await getDocs(collection(db, 'sellerApplications'));
      const loadedApplications = snapshot.docs
        .map((applicationDoc) => {
          const data = applicationDoc.data();
          const requestedRole =
            data.requestedRole === 'distributor' || data.requestedRole === 'retailer'
              ? data.requestedRole
              : 'farmer';
          return {
            uid: applicationDoc.id,
            fullName: typeof data.fullName === 'string' ? data.fullName : '',
            email: typeof data.email === 'string' ? data.email : '',
            phone: typeof data.phone === 'string' ? data.phone : '',
            requestedRole,
            businessName:
              typeof data.businessName === 'string' ? data.businessName : '',
            businessDescription:
              typeof data.businessDescription === 'string'
                ? data.businessDescription
                : '',
            meetupLocation:
              typeof data.meetupLocation === 'string' ? data.meetupLocation : '',
            status:
              data.status === 'approved' || data.status === 'rejected'
                ? data.status
                : 'pending',
            reviewNote: typeof data.reviewNote === 'string' ? data.reviewNote : '',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
          } satisfies SellerApplication;
        })
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      setSellerApplications(loadedApplications);
    } catch (loadError) {
      console.error('Unable to load seller applications:', loadError);
      setError(
        'Could not load seller requests. Publish the updated Firestore rules and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const snapshot = await getDocs(collection(db, 'products'));
      const loadedProducts = snapshot.docs.map((productDoc) => {
        const data = productDoc.data();
        return {
          id: productDoc.id,
          name: typeof data.name === 'string' ? data.name : 'Untitled product',
          description: typeof data.description === 'string' ? data.description : '',
          category: typeof data.category === 'string' ? data.category : 'Other',
          price: typeof data.price === 'number' ? data.price : 0,
          stock: typeof data.stock === 'number' ? data.stock : 0,
          sellerId: typeof data.sellerId === 'string' ? data.sellerId : '',
          sellerName: typeof data.sellerName === 'string' ? data.sellerName : 'Unknown seller',
          sellerEmail: typeof data.sellerEmail === 'string' ? data.sellerEmail : '',
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
          status: typeof data.status === 'string' ? data.status : 'unknown',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
        } satisfies ManagedProduct;
      });

      setProducts(
        loadedProducts.sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        ),
      );
    } catch (loadError) {
      console.error('Unable to load marketplace products:', loadError);
      setError(
        'Could not load products. Confirm the admin product read rule is published, then refresh.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const snapshot = await getDocs(collection(db, 'orders'));
      const loadedOrders = snapshot.docs
        .map((orderDoc) => {
          const data = orderDoc.data();
          const status: OrderStatus = [
            'pending',
            'confirmed',
            'ready_for_pickup',
            'picked_up',
            'completed',
            'cancelled',
          ].includes(data.status)
            ? data.status as OrderStatus
            : 'pending';
          return {
            id: orderDoc.id,
            buyerName: typeof data.buyerName === 'string' ? data.buyerName : 'Buyer',
            buyerEmail: typeof data.buyerEmail === 'string' ? data.buyerEmail : '',
            contactNumber: typeof data.contactNumber === 'string' ? data.contactNumber : '',
            buyerMeetupLocation:
              typeof data.buyerMeetupLocation === 'string' ? data.buyerMeetupLocation : '',
            deliveryMethod:
              typeof data.deliveryMethod === 'string' ? data.deliveryMethod : 'pickup',
            orderNotes: typeof data.orderNotes === 'string' ? data.orderNotes : '',
            sellerId: typeof data.sellerId === 'string' ? data.sellerId : '',
            sellerName: typeof data.sellerName === 'string' ? data.sellerName : 'Seller',
            productId: typeof data.productId === 'string' ? data.productId : '',
            productName: typeof data.productName === 'string' ? data.productName : 'Product',
            quantity: typeof data.quantity === 'number' ? data.quantity : 0,
            total: typeof data.total === 'number' ? data.total : 0,
            status,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
          } satisfies ManagedOrder;
        })
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      setOrders(loadedOrders);
      setOrderCount(loadedOrders.length);
    } catch (loadError) {
      console.error('Unable to load marketplace orders:', loadError);
      setError('Could not load orders. Confirm the admin order read rule is published, then refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [categorySnapshot, productSnapshot] = await Promise.all([
        getDocs(collection(db, 'categories')),
        getDocs(collection(db, 'products')),
      ]);
      const productCounts = new Map<string, number>();
      productSnapshot.docs.forEach((productDoc) => {
        const categoryName = productDoc.data().category;
        if (typeof categoryName === 'string') {
          productCounts.set(categoryName, (productCounts.get(categoryName) ?? 0) + 1);
        }
      });
      setCategories(
        categorySnapshot.docs
          .map((categoryDoc) => {
            const name = categoryDoc.data().name;
            if (typeof name !== 'string' || !name.trim()) return null;
            return {
              id: categoryDoc.id,
              name: name.trim(),
              productCount: productCounts.get(name.trim()) ?? 0,
            };
          })
          .filter((category): category is ManagedCategory => category !== null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (loadError) {
      console.error('Unable to load product categories:', loadError);
      setError('Could not load categories. Confirm the admin category read rule is published, then refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    const snapshot = await getDoc(doc(db, 'users', uid));
    const data = snapshot.data();
    setProfile({
      fullName:
        typeof data?.fullName === 'string'
          ? data.fullName
          : auth.currentUser?.displayName ?? '',
      phone: typeof data?.phone === 'string' ? data.phone : '',
    });
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser || !currentUser.emailVerified) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        const profileSnapshot = await getDoc(
          doc(db, 'users', currentUser.uid),
        );
        if (!active) return;

        const userProfile = profileSnapshot.data();
        if (
          userProfile?.role !== 'admin' ||
          userProfile?.status === 'deactivated'
        ) {
          navigate('/dashboard', { replace: true });
          return;
        }

        setAuthorized(true);
        setCheckingAccess(false);
        if (page === 'users') {
          await loadUsers();
        } else if (page === 'seller-applications') {
          await loadSellerApplications();
        } else if (page === 'products') {
          await loadProducts();
        } else if (page === 'orders') {
          await loadOrders();
        } else if (page === 'categories') {
          await loadCategories();
        } else if (page === 'overview') {
          setLoading(true);
          try {
            const [userSnapshot, productSnapshot, orderSnapshot] =
              await Promise.all([
                getDocs(collection(db, 'users')),
                getDocs(collection(db, 'products')),
                getDocs(collection(db, 'orders')),
              ]);
            if (active) {
              setUserCount(userSnapshot.size);
              setProductCount(productSnapshot.size);
              setOrderCount(orderSnapshot.size);
            }
          } catch (loadError) {
            console.error('Unable to load admin dashboard statistics:', loadError);
            if (active) {
              setError(
                'Could not load dashboard statistics. Check the Firestore rules.',
              );
            }
          } finally {
            if (active) setLoading(false);
          }
        } else if (page === 'settings') {
          await loadProfile(currentUser.uid);
        }
      } catch (accessError) {
        if (!active) return;
        console.error('Unable to verify admin access:', accessError);
        setError(
          'Could not verify admin access. Check the Firestore security rules.',
        );
        setCheckingAccess(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    loadCategories,
    loadOrders,
    loadProducts,
    loadProfile,
    loadSellerApplications,
    loadUsers,
    navigate,
    page,
  ]);

  const reviewSellerApplication = async (
    application: SellerApplication,
    decision: Exclude<SellerApplicationStatus, 'pending'>,
  ) => {
    const reviewer = auth.currentUser;
    if (!reviewer || application.status !== 'pending') return;

    const reviewNote =
      decision === 'rejected'
        ? window.prompt('Optional note for the applicant:', '')
        : '';
    if (reviewNote === null) return;

    setError('');
    setNotice('');
    setReviewingSellerApplicationId(application.uid);
    try {
      const batch = writeBatch(db);
      const applicationRef = doc(db, 'sellerApplications', application.uid);
      batch.update(applicationRef, {
        status: decision,
        reviewNote: reviewNote.trim(),
        reviewedBy: reviewer.uid,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (decision === 'approved') {
        batch.update(doc(db, 'users', application.uid), {
          role: application.requestedRole,
          sellerName: application.businessName,
        });
      }
      await batch.commit();
      setSellerApplications((current) =>
        current.map((entry) =>
          entry.uid === application.uid
            ? { ...entry, status: decision, reviewNote: reviewNote.trim() }
            : entry,
        ),
      );
      setNotice(
        decision === 'approved'
          ? `${application.fullName || 'Applicant'} is now approved as a ${sellerRoleLabels[application.requestedRole]}.`
          : 'Seller request declined.',
      );
    } catch (reviewError) {
      console.error('Unable to review seller application:', reviewError);
      setError(
        'Could not update this seller request. Confirm the latest Firestore rules are published.',
      );
    } finally {
      setReviewingSellerApplicationId('');
    }
  };

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.fullName, user.email, user.phone, user.role, user.status]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [search, users]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [
        product.name,
        product.description,
        product.category,
        product.sellerName,
        product.sellerEmail,
        product.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [products, search]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus =
        orderStatusFilter === 'all' || order.status === orderStatusFilter;
      const matchesSearch =
        !term ||
        [
          order.id,
          order.productName,
          order.buyerName,
          order.buyerEmail,
          order.sellerName,
          order.sellerId,
          order.contactNumber,
          order.status,
        ]
          .join(' ')
          .toLowerCase()
          .includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [orderStatusFilter, orders, search]);

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const categoryName = (editingCategory?.name ?? newCategoryName).trim();
    if (!categoryName) {
      setError('Enter a category name.');
      return;
    }
    if (
      categories.some(
        (category) =>
          category.id !== editingCategory?.id &&
          category.name.toLowerCase() === categoryName.toLowerCase(),
      )
    ) {
      setError('A category with this name already exists.');
      return;
    }

    setError('');
    setNotice('');
    setSavingCategory(true);
    try {
      if (editingCategory) {
        const previousName = editingCategory.name;
        if (previousName !== categoryName) {
          const matchingProducts = await getDocs(
            query(
              collection(db, 'products'),
              where('category', '==', previousName),
            ),
          );
          for (let start = 0; start < matchingProducts.docs.length; start += 450) {
            const batch = writeBatch(db);
            matchingProducts.docs
              .slice(start, start + 450)
              .forEach((productDoc) => {
                batch.update(productDoc.ref, {
                  category: categoryName,
                  updatedAt: serverTimestamp(),
                });
              });
            await batch.commit();
          }
        }
        await updateDoc(doc(db, 'categories', editingCategory.id), {
          name: categoryName,
          updatedAt: serverTimestamp(),
        });
        setCategories((current) =>
          current
            .map((category) =>
              category.id === editingCategory.id
                ? { ...category, name: categoryName }
                : category,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setEditingCategory(null);
        setNotice(
          previousName === categoryName
            ? 'Category saved.'
            : `Category renamed. Products in "${previousName}" were updated.`,
        );
      } else {
        const categoryRef = await addDoc(collection(db, 'categories'), {
          name: categoryName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setCategories((current) =>
          [...current, { id: categoryRef.id, name: categoryName, productCount: 0 }]
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setNewCategoryName('');
        setNotice('Category created.');
      }
    } catch (saveError) {
      console.error('Unable to save product category:', saveError);
      setError(
        'Could not save this category. Confirm the admin category write rule is published, then refresh to check product updates.',
      );
    } finally {
      setSavingCategory(false);
    }
  };

  const deleteCategory = async (category: ManagedCategory) => {
    if (category.productCount > 0) {
      setError(
        `Cannot delete "${category.name}" while ${category.productCount} product(s) use it. Rename it instead or update those products first.`,
      );
      return;
    }
    try {
      const currentProducts = await getDocs(
        query(collection(db, 'products'), where('category', '==', category.name)),
      );
      if (!currentProducts.empty) {
        setCategories((current) =>
          current.map((entry) =>
            entry.id === category.id
              ? { ...entry, productCount: currentProducts.size }
              : entry,
          ),
        );
        setError(
          `Cannot delete "${category.name}" while ${currentProducts.size} product(s) use it. Rename it instead or update those products first.`,
        );
        return;
      }
    } catch (checkError) {
      console.error('Unable to verify category usage before deletion:', checkError);
      setError('Could not verify whether this category is in use. Refresh and try again.');
      return;
    }
    if (!window.confirm(`Delete the "${category.name}" category? This cannot be undone.`)) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await deleteDoc(doc(db, 'categories', category.id));
      setCategories((current) =>
        current.filter((entry) => entry.id !== category.id),
      );
      setNotice('Category deleted.');
    } catch (deleteError) {
      console.error('Unable to delete product category:', deleteError);
      setError('Could not delete this category. Check the Firestore rules and try again.');
    }
  };

  const updateManagedOrderStatus = async (
    order: ManagedOrder,
    nextStatus: OrderStatus,
  ) => {
    if (!orderStatusTransitions[order.status].includes(nextStatus)) return;
    if (
      nextStatus === 'cancelled' &&
      !window.confirm(
        `Cancel order ${order.id.slice(0, 8)} and return ${order.quantity} item(s) to product stock?`,
      )
    ) {
      return;
    }
    setError('');
    setNotice('');
    setSavingOrderId(order.id);
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', order.id);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) {
          throw new Error('This order could not be found.');
        }
        const currentOrder = orderSnapshot.data();
        if (currentOrder.status !== order.status) {
          throw new Error('This order changed. Refresh the list and try again.');
        }
        if (!orderStatusTransitions[order.status].includes(nextStatus)) {
          throw new Error('This status change is no longer available.');
        }

        if (nextStatus === 'cancelled') {
          const productId = currentOrder.productId;
          const quantity = currentOrder.quantity;
          if (
            typeof productId !== 'string' ||
            !productId ||
            typeof quantity !== 'number' ||
            quantity <= 0
          ) {
            throw new Error('This order is missing product or quantity details.');
          }
          const productRef = doc(db, 'products', productId);
          const productSnapshot = await transaction.get(productRef);
          if (!productSnapshot.exists()) {
            throw new Error('The product listing could not be found, so this order cannot be cancelled.');
          }
          const stock = productSnapshot.data().stock;
          if (typeof stock !== 'number') {
            throw new Error('The product stock is invalid, so this order cannot be cancelled.');
          }
          transaction.update(productRef, {
            stock: stock + quantity,
            updatedAt: serverTimestamp(),
            lastRefundOrderId: order.id,
          });
        }
        transaction.update(orderRef, { status: nextStatus });
      });

      setOrders((current) =>
        current.map((entry) =>
          entry.id === order.id ? { ...entry, status: nextStatus } : entry,
        ),
      );
      setOrderStatusDrafts((current) => ({ ...current, [order.id]: '' }));
      setNotice(
        nextStatus === 'cancelled'
          ? 'Order cancelled and product stock restored.'
          : `Order marked ${orderStatusLabels[nextStatus].toLowerCase()}.`,
      );
    } catch (statusError) {
      console.error('Unable to update marketplace order:', statusError);
      setError(
        statusError instanceof Error
          ? statusError.message
          : 'Could not update this order. Check the Firestore rules.',
      );
    } finally {
      setSavingOrderId('');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (logoutError) {
      console.error('Admin logout failed:', logoutError);
      setError('Could not log out. Please try again.');
    }
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    setError('');
    setNotice('');

    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        fullName: editingUser.fullName.trim(),
        phone: editingUser.phone.trim(),
      });
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.uid === editingUser.uid ? editingUser : user,
        ),
      );
      setEditingUser(null);
      setNotice('User profile updated.');
    } catch (saveError) {
      console.error('Unable to update user profile:', saveError);
      setError('Could not update this user. Check the Firestore rules.');
    }
  };

  const toggleUserStatus = async (user: ManagedUser) => {
    if (user.uid === auth.currentUser?.uid) {
      setError('You cannot deactivate the admin account currently in use.');
      return;
    }
    const nextStatus: UserStatus =
      user.status === 'active' ? 'deactivated' : 'active';
    const action = nextStatus === 'deactivated' ? 'deactivate' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} this account?`)) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { status: nextStatus });
      setUsers((currentUsers) =>
        currentUsers.map((entry) =>
          entry.uid === user.uid ? { ...entry, status: nextStatus } : entry,
        ),
      );
      setNotice(`Account ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.`);
    } catch (statusError) {
      console.error('Unable to change user status:', statusError);
      setError('Could not change account status. Check the Firestore rules.');
    }
  };

  const deleteManagedProduct = async (product: ManagedProduct) => {
    if (!window.confirm(`Permanently delete "${product.name}"? This cannot be undone.`)) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await deleteDoc(doc(db, 'products', product.id));
      setProducts((current) =>
        current.filter((entry) => entry.id !== product.id),
      );
      setNotice('Product listing permanently deleted.');
    } catch (deleteError) {
      console.error('Unable to remove marketplace product:', deleteError);
      setError(
        'Could not remove this product. Confirm the admin product delete rule is published.',
      );
    }
  };

  const saveManagedProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProduct) return;

    setError('');
    setNotice('');
    const updatedProduct = {
      name: editingProduct.name.trim(),
      description: editingProduct.description.trim(),
      category: editingProduct.category.trim(),
      price: Number(editingProduct.price),
      stock: Number(editingProduct.stock),
      status: editingProduct.status,
    };
    if (
      !updatedProduct.name ||
      !updatedProduct.category ||
      !Number.isFinite(updatedProduct.price) ||
      updatedProduct.price <= 0 ||
      !Number.isInteger(updatedProduct.stock) ||
      updatedProduct.stock < 0 ||
      !['active', 'removed'].includes(updatedProduct.status)
    ) {
      setError('Enter valid product details before saving.');
      return;
    }

    try {
      await updateDoc(doc(db, 'products', editingProduct.id), {
        ...updatedProduct,
        updatedAt: serverTimestamp(),
      });
      setProducts((current) =>
        current.map((product) =>
          product.id === editingProduct.id
            ? { ...product, ...updatedProduct }
            : product,
        ),
      );
      setEditingProduct(null);
      setNotice('Product listing updated.');
    } catch (saveError) {
      console.error('Unable to update marketplace product:', saveError);
      setError(
        'Could not update this product. Confirm the admin product update rule is published.',
      );
    }
  };

  const setManagedProductStatus = async (
    product: ManagedProduct,
    status: 'active' | 'removed',
  ) => {
    const action = status === 'removed' ? 'remove' : 'restore';
    if (!window.confirm(`${action === 'remove' ? 'Remove' : 'Restore'} "${product.name}" ${action === 'remove' ? 'from' : 'to'} the marketplace?`)) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await updateDoc(doc(db, 'products', product.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setProducts((current) =>
        current.map((entry) =>
          entry.id === product.id ? { ...entry, status } : entry,
        ),
      );
      setNotice(
        status === 'removed'
          ? 'Listing removed from the marketplace. It remains visible here for moderation.'
          : 'Listing restored to the marketplace.',
      );
    } catch (statusError) {
      console.error('Unable to change marketplace product status:', statusError);
      setError(
        'Could not change this listing status. Confirm the admin product update rule is published.',
      );
    }
  };

  const saveAdminProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setError('');
    setNotice('');
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        fullName: profile.fullName.trim(),
        phone: profile.phone.trim(),
      });
      await updateProfile(currentUser, {
        displayName: profile.fullName.trim(),
      });
      setNotice('Admin profile updated.');
    } catch (saveError) {
      console.error('Unable to update admin profile:', saveError);
      setError('Could not update your profile. Check the Firestore rules.');
    }
  };

  const changeAdminPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (newPassword.length < 6) {
      setError('The new password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }

    try {
      if (!auth.currentUser) throw new Error('No admin account is signed in.');
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Admin password changed.');
    } catch (passwordError) {
      console.error('Unable to change admin password:', passwordError);
      const code =
        typeof passwordError === 'object' &&
        passwordError !== null &&
        'code' in passwordError
          ? String(passwordError.code)
          : '';
      setError(
        code === 'auth/requires-recent-login'
          ? 'For security, log out and sign in again before changing your password.'
          : 'Could not change your password. Please try again.',
      );
    }
  };

  if (checkingAccess) {
    return (
      <IonPage>
        <IonContent className="admin-content">
          <div className="admin-loading">
            <IonSpinner name="crescent" color="success" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (!authorized) {
    return (
      <IonPage>
        <IonContent className="admin-content">
          <div className="admin-loading">
            <p className="admin-error" role="alert">
              {error || 'Admin access is required to view this page.'}
            </p>
            <IonButton onClick={() => navigate('/dashboard', { replace: true })}>
              Return to dashboard
            </IonButton>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const pageInfo = pageDetails[page];

  return (
    <IonPage>
      <IonContent fullscreen className="admin-content">
        <div className="admin-shell">
          <aside className="admin-sidebar">
            <div className="admin-brand">
              <img src="/agri-mart-logo.png" alt="Agri-Mart" />
              <div>
                <span>ADMIN PANEL</span>
              </div>
              <button
                type="button"
                className="admin-menu-toggle"
                aria-expanded={mobileNavigationOpen}
                aria-controls="admin-navigation"
                onClick={() => setMobileNavigationOpen((open) => !open)}
              >
                <IonIcon icon={menuOutline} />
                Menu
              </button>
            </div>

            <nav
              id="admin-navigation"
              className={`admin-nav${mobileNavigationOpen ? ' mobile-navigation-open' : ''}`}
              aria-label="Admin navigation"
            >
              {navigation.map((item) => (
                <button
                  type="button"
                  key={item.page}
                  className={page === item.page ? 'active' : ''}
                  onClick={() => {
                    setMobileNavigationOpen(false);
                    navigate(
                      item.page === 'overview'
                        ? '/admin'
                        : `/admin/${item.page}`,
                    );
                  }}
                >
                  <IonIcon icon={item.icon} />
                  {item.label}
                </button>
              ))}
            </nav>

            <button
              type="button"
              className="admin-logout"
              onClick={handleLogout}
            >
              <IonIcon icon={logOutOutline} />
              Log out
            </button>
          </aside>

          <main className="admin-main">
            <header className="admin-topbar">
              <span>AGRI-MART / ADMIN</span>
              <span className="admin-role-badge">Administrator</span>
            </header>

            <section className="admin-page-heading">
              <div>
                <span className="admin-eyebrow">MARKETPLACE MANAGEMENT</span>
                <h1>{pageInfo.title}</h1>
                <p>{pageInfo.description}</p>
              </div>
              {page === 'users' && (
                <IonButton
                  fill="outline"
                  className="admin-refresh"
                  onClick={loadUsers}
                  disabled={loading}
                >
                  Refresh users
                </IonButton>
              )}
              {page === 'products' && (
                <IonButton
                  fill="outline"
                  className="admin-refresh"
                  onClick={loadProducts}
                  disabled={loading}
                >
                  Refresh products
                </IonButton>
              )}
              {page === 'seller-applications' && (
                <IonButton
                  fill="outline"
                  className="admin-refresh"
                  onClick={loadSellerApplications}
                  disabled={loading}
                >
                  Refresh requests
                </IonButton>
              )}
              {page === 'orders' && (
                <IonButton
                  fill="outline"
                  className="admin-refresh"
                  onClick={loadOrders}
                  disabled={loading}
                >
                  Refresh orders
                </IonButton>
              )}
              {page === 'categories' && (
                <IonButton
                  fill="outline"
                  className="admin-refresh"
                  onClick={loadCategories}
                  disabled={loading || savingCategory}
                >
                  Refresh categories
                </IonButton>
              )}
            </section>

            {error && (
              <p className="admin-error" role="alert">
                {error}
              </p>
            )}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            {page === 'overview' && (
              <section className="admin-stat-grid" aria-label="System statistics">
                <article className="admin-stat-card">
                  <span className="admin-stat-icon">
                    <IonIcon icon={peopleOutline} />
                  </span>
                  <span className="admin-stat-label">Registered users</span>
                  <strong>{loading ? '—' : userCount}</strong>
                  <span className="admin-stat-hint">Accounts in Firestore</span>
                </article>
                <article className="admin-stat-card pending">
                  <span className="admin-stat-icon">
                    <IonIcon icon={cubeOutline} />
                  </span>
                  <span className="admin-stat-label">Products</span>
                  <strong>{loading ? '—' : productCount}</strong>
                  <span className="admin-stat-hint">Listings in Firestore</span>
                </article>
                <article className="admin-stat-card pending">
                  <span className="admin-stat-icon">
                    <IonIcon icon={receiptOutline} />
                  </span>
                  <span className="admin-stat-label">Orders</span>
                  <strong>{loading ? '—' : orderCount}</strong>
                  <span className="admin-stat-hint">Orders in Firestore</span>
                </article>
              </section>
            )}

            {page === 'users' && (
              <section className="admin-table-card">
                <div className="admin-table-toolbar">
                  <label className="admin-search">
                    <IonIcon icon={searchOutline} />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name, email, phone, role..."
                    />
                  </label>
                  <span>{filteredUsers.length} account(s)</span>
                </div>

                {loading ? (
                  <div className="admin-table-loading">
                    <IonSpinner name="crescent" color="success" />
                    <span>Loading registered users...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="admin-empty">
                    <IonIcon icon={peopleOutline} />
                    <h2>{users.length ? 'No matching users' : 'No users found'}</h2>
                    <p>
                      {users.length
                        ? 'Try another search term.'
                        : 'Registered accounts will appear here.'}
                    </p>
                  </div>
                ) : (
                  <div className="admin-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Phone</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((user) => (
                          <tr key={user.uid}>
                            <td>{user.fullName || '—'}</td>
                            <td>{user.email || '—'}</td>
                            <td><span className="admin-user-role">{user.role}</span></td>
                            <td>
                              <span className={`admin-status ${user.status}`}>
                                {user.status}
                              </span>
                            </td>
                            <td>{user.phone || '—'}</td>
                            <td className="admin-actions">
                              <button
                                type="button"
                                onClick={() => setEditingUser({ ...user })}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className={user.status === 'active' ? 'danger' : 'restore'}
                                disabled={user.uid === auth.currentUser?.uid}
                                onClick={() => void toggleUserStatus(user)}
                              >
                                {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {page === 'seller-applications' && (
              <section className="seller-review-list">
                {loading ? (
                  <div className="admin-table-loading">
                    <IonSpinner name="crescent" color="success" />
                    <span>Loading seller requests...</span>
                  </div>
                ) : sellerApplications.length === 0 ? (
                  <div className="admin-empty">
                    <IonIcon icon={personAddOutline} />
                    <h2>No seller requests yet</h2>
                    <p>New applications will appear here for review.</p>
                  </div>
                ) : (
                  sellerApplications.map((application) => (
                    <article className="seller-review-card" key={application.uid}>
                      <header>
                        <div>
                          <span className="admin-eyebrow">
                            {application.createdAt
                              ? application.createdAt.toDate().toLocaleDateString()
                              : 'Recently submitted'}
                          </span>
                          <h2>{application.businessName}</h2>
                          <p>
                            {sellerRoleLabels[application.requestedRole]} ·{' '}
                            {application.fullName}
                          </p>
                        </div>
                        <span className={`seller-review-status ${application.status}`}>
                          {application.status}
                        </span>
                      </header>
                      <div className="seller-review-details">
                        <p><strong>Applicant</strong><span>{application.fullName}</span></p>
                        <p><strong>Email</strong><a href={`mailto:${application.email}`}>{application.email}</a></p>
                        <p><strong>Phone</strong><span>{application.phone}</span></p>
                        <p className="seller-review-wide">
                          <strong>Business location</strong><span>{application.meetupLocation}</span>
                        </p>
                        <p className="seller-review-wide">
                          <strong>Products and business</strong>
                          <span>{application.businessDescription}</span>
                        </p>
                        {application.reviewNote && (
                          <p className="seller-review-wide">
                            <strong>Review note</strong><span>{application.reviewNote}</span>
                          </p>
                        )}
                      </div>
                      {application.status === 'pending' && (
                        <footer>
                          <IonButton
                            className="seller-review-approve"
                            disabled={reviewingSellerApplicationId !== ''}
                            onClick={() =>
                              void reviewSellerApplication(application, 'approved')
                            }
                          >
                            Approve seller
                          </IonButton>
                          <IonButton
                            fill="outline"
                            color="danger"
                            disabled={reviewingSellerApplicationId !== ''}
                            onClick={() =>
                              void reviewSellerApplication(application, 'rejected')
                            }
                          >
                            Decline request
                          </IonButton>
                        </footer>
                      )}
                    </article>
                  ))
                )}
              </section>
            )}

            {page === 'products' && (
              <section className="admin-table-card">
                <div className="admin-table-toolbar">
                  <label className="admin-search">
                    <IonIcon icon={searchOutline} />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search product, category, or seller..."
                    />
                  </label>
                  <span>{filteredProducts.length} product(s)</span>
                </div>

                {loading ? (
                  <div className="admin-table-loading">
                    <IonSpinner name="crescent" color="success" />
                    <span>Loading marketplace products...</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="admin-empty">
                    <IonIcon icon={cubeOutline} />
                    <h2>{products.length ? 'No matching products' : 'No products found'}</h2>
                    <p>
                      {products.length
                        ? 'Try another search term.'
                        : 'Products posted by users will appear here.'}
                    </p>
                  </div>
                ) : (
                  <div className="admin-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Seller</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Stock</th>
                          <th>Status</th>
                          <th>Posted</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((product) => (
                          <tr key={product.id}>
                            <td>
                              <div className="admin-product-cell">
                                {product.imageUrl ? (
                                  <img src={product.imageUrl} alt="" />
                                ) : (
                                  <span className="admin-product-image-placeholder">
                                    <IonIcon icon={cubeOutline} />
                                  </span>
                                )}
                                <span>
                                  <strong>{product.name}</strong>
                                  <small>{product.description || 'No description'}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <span>{product.sellerName}</span>
                              <small className="admin-product-email">{product.sellerEmail || product.sellerId}</small>
                            </td>
                            <td>{product.category}</td>
                            <td>₱{product.price.toLocaleString()}</td>
                            <td>{product.stock}</td>
                            <td>
                              <span className={`admin-status ${product.status === 'active' ? 'active' : 'deactivated'}`}>
                                {product.status}
                              </span>
                            </td>
                            <td>
                              {product.createdAt
                                ? product.createdAt.toDate().toLocaleDateString()
                                : '—'}
                            </td>
                            <td className="admin-actions">
                              <button
                                type="button"
                                onClick={() => setEditingProduct({ ...product })}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() =>
                                  void setManagedProductStatus(
                                    product,
                                    product.status === 'removed' ? 'active' : 'removed',
                                  )
                                }
                              >
                                {product.status === 'removed' ? 'Restore' : 'Remove'}
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => void deleteManagedProduct(product)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {page === 'orders' && (
              <section className="admin-table-card">
                <div className="admin-table-toolbar admin-orders-toolbar">
                  <label className="admin-search">
                    <IonIcon icon={searchOutline} />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search order, product, buyer, or seller..."
                    />
                  </label>
                  <label className="admin-order-filter">
                    <span>Status</span>
                    <select
                      value={orderStatusFilter}
                      onChange={(event) => setOrderStatusFilter(event.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {Object.entries(orderStatusLabels).map(([status, label]) => (
                        <option value={status} key={status}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <span>{filteredOrders.length} order(s)</span>
                </div>

                {loading ? (
                  <div className="admin-table-loading">
                    <IonSpinner name="crescent" color="success" />
                    <span>Loading marketplace orders...</span>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="admin-empty">
                    <IonIcon icon={receiptOutline} />
                    <h2>{orders.length ? 'No matching orders' : 'No orders found'}</h2>
                    <p>
                      {orders.length
                        ? 'Try another search term or status filter.'
                        : 'Orders placed in the marketplace will appear here.'}
                    </p>
                  </div>
                ) : (
                  <div className="admin-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Product</th>
                          <th>Buyer</th>
                          <th>Seller</th>
                          <th>Qty</th>
                          <th>Total</th>
                          <th>Fulfillment</th>
                          <th>Placed</th>
                          <th>Status / Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((order) => {
                          const availableTransitions = orderStatusTransitions[order.status];
                          const selectedStatus = orderStatusDrafts[order.id] ?? '';
                          return (
                            <tr key={order.id}>
                              <td title={order.id}>{order.id.slice(0, 8)}</td>
                              <td>
                                <strong>{order.productName}</strong>
                                {order.orderNotes && (
                                  <small className="admin-order-subtext" title={order.orderNotes}>
                                    Note: {order.orderNotes}
                                  </small>
                                )}
                              </td>
                              <td>
                                <span>{order.buyerName}</span>
                                <small className="admin-order-subtext">
                                  {order.buyerEmail || order.contactNumber || '—'}
                                </small>
                              </td>
                              <td title={order.sellerId}>{order.sellerName}</td>
                              <td>{order.quantity}</td>
                              <td>₱{order.total.toLocaleString()}</td>
                              <td>
                                {order.deliveryMethod === 'meetup' ||
                                order.deliveryMethod === 'meetup_pickup'
                                  ? 'Meet-up'
                                  : 'Pickup'}
                                {order.buyerMeetupLocation && (
                                  <small className="admin-order-subtext" title={order.buyerMeetupLocation}>
                                    {order.buyerMeetupLocation}
                                  </small>
                                )}
                              </td>
                              <td>
                                {order.createdAt
                                  ? order.createdAt.toDate().toLocaleDateString()
                                  : '—'}
                              </td>
                              <td>
                                <div className="admin-order-actions">
                                  <span className={`admin-status ${order.status}`}>
                                    {orderStatusLabels[order.status]}
                                  </span>
                                  {availableTransitions.length > 0 && (
                                    <div className="admin-order-status-update">
                                      <select
                                        aria-label={`Update status for order ${order.id.slice(0, 8)}`}
                                        value={selectedStatus}
                                        disabled={savingOrderId === order.id}
                                        onChange={(event) =>
                                          setOrderStatusDrafts((current) => ({
                                            ...current,
                                            [order.id]: event.target.value as OrderStatus | '',
                                          }))
                                        }
                                      >
                                        <option value="">Update status</option>
                                        {availableTransitions.map((status) => (
                                          <option value={status} key={status}>
                                            {orderStatusLabels[status]}
                                          </option>
                                        ))}
                                      </select>
                                      {selectedStatus && (
                                        <button
                                          type="button"
                                          disabled={savingOrderId === order.id}
                                          onClick={() =>
                                            void updateManagedOrderStatus(order, selectedStatus)
                                          }
                                        >
                                          {savingOrderId === order.id ? 'Saving…' : 'Save'}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {page === 'categories' && (
              <section className="admin-categories-layout">
                <form className="admin-form-card admin-category-form" onSubmit={(event) => void saveCategory(event)}>
                  <div className="admin-form-heading">
                    <IonIcon icon={editingCategory ? createOutline : addOutline} />
                    <div>
                      <h2>{editingCategory ? 'Rename category' : 'Add a category'}</h2>
                      <p>
                        {editingCategory
                          ? 'Product listings using this category will be updated too.'
                          : 'New categories will be available when sellers list products.'}
                      </p>
                    </div>
                  </div>
                  <label>
                    Category name
                    <input
                      required
                      minLength={2}
                      maxLength={60}
                      value={editingCategory?.name ?? newCategoryName}
                      onChange={(event) =>
                        editingCategory
                          ? setEditingCategory({ ...editingCategory, name: event.target.value })
                          : setNewCategoryName(event.target.value)
                      }
                      placeholder="e.g. Seeds & seedlings"
                    />
                  </label>
                  <div className="admin-category-form-actions">
                    <IonButton type="submit" disabled={savingCategory || loading}>
                      {savingCategory
                        ? 'Saving…'
                        : editingCategory
                          ? 'Save category'
                          : 'Add category'}
                    </IonButton>
                    {editingCategory && (
                      <IonButton
                        type="button"
                        fill="outline"
                        disabled={savingCategory}
                        onClick={() => setEditingCategory(null)}
                      >
                        Cancel
                      </IonButton>
                    )}
                  </div>
                </form>

                <section className="admin-table-card admin-category-list">
                  <div className="admin-table-toolbar">
                    <strong>{categories.length} category(ies)</strong>
                  </div>
                  {loading ? (
                    <div className="admin-table-loading">
                      <IonSpinner name="crescent" color="success" />
                      <span>Loading product categories...</span>
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="admin-empty">
                      <IonIcon icon={pricetagOutline} />
                      <h2>No categories yet</h2>
                      <p>Add a category to make it available in product listings.</p>
                    </div>
                  ) : (
                    <div className="admin-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Products</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.map((category) => (
                            <tr key={category.id}>
                              <td>{category.name}</td>
                              <td>{category.productCount}</td>
                              <td className="admin-actions">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setError('');
                                    setEditingCategory({ ...category });
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  disabled={category.productCount > 0}
                                  title={
                                    category.productCount > 0
                                      ? 'Rename or update products before deleting this category.'
                                      : 'Delete category'
                                  }
                                  onClick={() => void deleteCategory(category)}
                                >
                                  <IonIcon icon={trashOutline} />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </section>
            )}

            {page === 'settings' && (
              <section className="admin-settings-grid">
                <form className="admin-form-card" onSubmit={saveAdminProfile}>
                  <div className="admin-form-heading">
                    <IonIcon icon={personCircleOutline} />
                    <div>
                      <h2>Account information</h2>
                      <p>{auth.currentUser?.email}</p>
                    </div>
                  </div>
                  <label>
                    Full name
                    <input
                      required
                      maxLength={100}
                      value={profile.fullName}
                      onChange={(event) =>
                        setProfile({ ...profile, fullName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      maxLength={30}
                      value={profile.phone}
                      onChange={(event) =>
                        setProfile({ ...profile, phone: event.target.value })
                      }
                    />
                  </label>
                  <IonButton type="submit">Save profile</IonButton>
                </form>

                <form className="admin-form-card" onSubmit={changeAdminPassword}>
                  <div className="admin-form-heading">
                    <IonIcon icon={settingsOutline} />
                    <div>
                      <h2>Change password</h2>
                      <p>Use at least 6 characters.</p>
                    </div>
                  </div>
                  <label>
                    New password
                    <input
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </label>
                  <label>
                    Confirm new password
                    <input
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </label>
                  <IonButton type="submit">Update password</IonButton>
                </form>
              </section>
            )}
          </main>
        </div>

        {editingUser && (
          <div className="admin-modal-backdrop" role="presentation">
            <form
              className="admin-edit-modal"
              onSubmit={(event) => void saveUser(event)}
              aria-labelledby="edit-user-title"
            >
              <h2 id="edit-user-title">Edit user profile</h2>
              <p className="admin-edit-email">{editingUser.email}</p>
              <label>
                Full name
                <input
                  required
                  maxLength={100}
                  value={editingUser.fullName}
                  onChange={(event) =>
                    setEditingUser({
                      ...editingUser,
                      fullName: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Phone
                <input
                  maxLength={30}
                  value={editingUser.phone}
                  onChange={(event) =>
                    setEditingUser({
                      ...editingUser,
                      phone: event.target.value,
                    })
                  }
                />
              </label>
              <div className="admin-modal-actions">
                <IonButton
                  type="button"
                  fill="outline"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </IonButton>
                <IonButton type="submit">Save changes</IonButton>
              </div>
            </form>
          </div>
        )}
        {editingProduct && (
          <div className="admin-modal-backdrop" role="presentation">
            <form
              className="admin-edit-modal admin-product-edit-modal"
              onSubmit={(event) => void saveManagedProduct(event)}
              aria-labelledby="edit-product-title"
            >
              <h2 id="edit-product-title">Edit product listing</h2>
              <p className="admin-edit-email">
                Seller: {editingProduct.sellerName} ({editingProduct.sellerEmail || editingProduct.sellerId})
              </p>
              <label>
                Product name
                <input
                  required
                  maxLength={100}
                  value={editingProduct.name}
                  onChange={(event) =>
                    setEditingProduct({ ...editingProduct, name: event.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  maxLength={1000}
                  value={editingProduct.description}
                  onChange={(event) =>
                    setEditingProduct({ ...editingProduct, description: event.target.value })
                  }
                />
              </label>
              <div className="admin-product-edit-row">
                <label>
                  Category
                  <input
                    required
                    maxLength={60}
                    value={editingProduct.category}
                    onChange={(event) =>
                      setEditingProduct({ ...editingProduct, category: event.target.value })
                    }
                  />
                </label>
                <label>
                  Price (₱)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editingProduct.price}
                    onChange={(event) =>
                      setEditingProduct({
                        ...editingProduct,
                        price: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Stock
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={editingProduct.stock}
                    onChange={(event) =>
                      setEditingProduct({
                        ...editingProduct,
                        stock: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Listing status
                <select
                  value={editingProduct.status}
                  onChange={(event) =>
                    setEditingProduct({
                      ...editingProduct,
                      status: event.target.value,
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="removed">Removed from marketplace</option>
                </select>
              </label>
              <div className="admin-modal-actions">
                <IonButton
                  type="button"
                  fill="outline"
                  onClick={() => setEditingProduct(null)}
                >
                  Cancel
                </IonButton>
                <IonButton type="submit">Save changes</IonButton>
              </div>
            </form>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default AdminPanel;
