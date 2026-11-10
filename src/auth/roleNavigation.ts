export const isMarketplaceCustomer = (role: unknown): boolean =>
  role === 'user' || role === 'consumer';

export const getRoleDestination = (
  role: unknown,
): '/admin' | '/marketplace' | '/dashboard' => {
  if (role === 'admin') {
    return '/admin';
  }

  return isMarketplaceCustomer(role) ? '/marketplace' : '/dashboard';
};
